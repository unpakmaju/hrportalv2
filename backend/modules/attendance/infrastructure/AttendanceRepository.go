package infrastructure

import (
	"context"

	commoninfra "hrportal_backend/common/infrastructure"
	"hrportal_backend/modules/attendance/domain"

	"gorm.io/gorm"
)

type AttendanceRepository struct {
	db *gorm.DB
}

func NewAttendanceRepository(db *gorm.DB) domain.IAttendanceRepository {
	return &AttendanceRepository{db: db}
}

func (r *AttendanceRepository) FindByNipAndTanggal(ctx context.Context, nip string, nidn string, tanggal string) (*domain.Absen, error) {
	if r == nil || r.db == nil {
		return nil, nil
	}
	var absen domain.Absen
	err := r.db.WithContext(ctx).Debug().
		Where("(nip = ? OR nidn = ? ) AND tanggal = ?", nip, nidn, tanggal).
		First(&absen).Error
	if err != nil {
		return nil, err
	}
	return &absen, nil
}

func (r *AttendanceRepository) CreateAbsen(ctx context.Context, absen *domain.Absen) error {
	if r == nil || r.db == nil {
		return nil
	}
	return commoninfra.GetTx(ctx, r.db).Create(absen).Error
}

func (r *AttendanceRepository) UpdateAbsen(ctx context.Context, absen *domain.Absen) error {
	if r == nil || r.db == nil {
		return nil
	}
	return commoninfra.GetTx(ctx, r.db).Save(absen).Error
}

func (r *AttendanceRepository) GetHistoryByNip(ctx context.Context, nip string, nidn string, tanggal_mulai *string, tanggal_akhir *string) ([]domain.Absen, error) {
	if r == nil || r.db == nil {
		return []domain.Absen{}, nil
	}
	var items []domain.Absen

	query := r.db.WithContext(ctx).Model(&domain.Absen{})

	if nip != "" && nidn != "" {
		query = query.Where("(nip = ? OR nidn = ?)", nip, nidn)
	} else if nip != "" {
		query = query.Where("(nip = ?)", nip)
	} else if nidn != "" {
		query = query.Where("(nidn = ?)", nidn)
	}

	if tanggal_mulai != nil && *tanggal_mulai != "" && tanggal_akhir != nil && *tanggal_akhir != "" {
		query = query.Where("tanggal between ? and ?", *tanggal_mulai, *tanggal_akhir)
	}

	err := query.Order("tanggal desc").Find(&items).Error
	if err != nil {
		return nil, err
	}
	return items, nil
}

func (r *AttendanceRepository) CreateKlaim(ctx context.Context, klaim *domain.KlaimAbsen) error {
	if r == nil || r.db == nil {
		return nil
	}
	return commoninfra.GetTx(ctx, r.db).Create(klaim).Error
}

func (r *AttendanceRepository) FindByNipAndTanggalUpacara(ctx context.Context, nip string, nidn string, tanggal string) (*domain.AbsenUpacara, error) {
	if r == nil || r.db == nil {
		return nil, nil
	}
	var upacara domain.AbsenUpacara
	err := r.db.WithContext(ctx).Debug().
		Where("(nip = ? OR nidn = ? ) AND tanggal = ?", nip, nidn, tanggal).
		First(&upacara).Error
	if err != nil {
		return nil, err
	}
	return &upacara, nil
}

func (r *AttendanceRepository) CreateAbsenUpacara(ctx context.Context, upacara *domain.AbsenUpacara) error {
	if r == nil || r.db == nil {
		return nil
	}
	return commoninfra.GetTx(ctx, r.db).Create(upacara).Error
}

func (r *AttendanceRepository) DeleteEmptyAbsen(ctx context.Context) (int64, error) {
	if r == nil || r.db == nil {
		return 0, nil
	}
	res := r.db.WithContext(ctx).Debug().
		Where("absen_masuk IS NULL OR TRIM(absen_masuk) = '' OR absen_masuk = '0000-00-00 00:00:00'").
		Delete(&domain.Absen{})
	return res.RowsAffected, res.Error
}
