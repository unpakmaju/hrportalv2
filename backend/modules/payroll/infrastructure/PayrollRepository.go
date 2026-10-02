package infrastructure

import (
	"context"
	"errors"
	"strings"

	"hrportal_backend/modules/payroll/domain"

	"gorm.io/gorm"
)

type PayrollRepository struct {
	db       *gorm.DB
	dbSimpeg *gorm.DB
}

func NewPayrollRepository(db *gorm.DB, dbSimpeg *gorm.DB) domain.IPayrollRepository {
	return &PayrollRepository{
		db:       db,
		dbSimpeg: dbSimpeg,
	}
}

func (r *PayrollRepository) GetSlipGaji(ctx context.Context, tahunStr string, bulanNum int, bulanStr string, namaBulanStr string, nip string) (*domain.SlipGaji, error) {
	targetDB := r.db
	if r.dbSimpeg != nil {
		targetDB = r.dbSimpeg
	}

	var slipGaji domain.SlipGaji
	err := targetDB.WithContext(ctx).Table("payroll_publishb").Debug().
		Where("tahun = ?", tahunStr).
		Where("(bulan = ? OR bulan = ? OR bulan = ?)", bulanNum, bulanStr, namaBulanStr).
		Where("(TRIM(nip) = ? OR nip = ?)", nip, nip).
		First(&slipGaji).Error

	// Jika data tidak ditemukan, kueri ke e_pribadi berdasarkan nidn untuk mendapatkan NIP lalu kueri ulang ke payroll_publishb
	if err != nil && errors.Is(err, gorm.ErrRecordNotFound) {
		var resolvedNip string

		// Kueri e_pribadi berdasarkan nidn atau nip
		errEP := targetDB.WithContext(ctx).Table("e_pribadi").Debug().
			Select("nip").
			Where("nidn = ? OR nip = ?", nip, nip).
			Scan(&resolvedNip).Error

		if errEP != nil || strings.TrimSpace(resolvedNip) == "" {
			// Fallback ke pegawais jika tabel e_pribadi berbeda
			_ = targetDB.WithContext(ctx).Table("pegawais").Debug().
				Select("nip").
				Where("nidn = ? OR nip = ?", nip, nip).
				Scan(&resolvedNip).Error
		}

		resolvedNip = strings.TrimSpace(resolvedNip)
		if resolvedNip != "" && resolvedNip != nip {
			// Kueri ulang ke payroll_publishb menggunakan NIP hasil pencarian dari e_pribadi
			err = targetDB.WithContext(ctx).Table("payroll_publishb").Debug().
				Where("tahun = ?", tahunStr).
				Where("(bulan = ? OR bulan = ? OR bulan = ?)", bulanNum, bulanStr, namaBulanStr).
				Where("(TRIM(nip) = ? OR nip = ?)", resolvedNip, resolvedNip).
				First(&slipGaji).Error
		}
	}

	if err != nil {
		return nil, err
	}

	if namaBulanStr != "" {
		slipGaji.Bulan = namaBulanStr
	}

	return &slipGaji, nil
}
