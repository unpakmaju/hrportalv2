package infrastructure

import (
	"context"
	"errors"
	"strings"

	commoninfra "hrportal_backend/common/infrastructure"
	"hrportal_backend/modules/ceremony_attendance/domain"

	"gorm.io/gorm"
)

type MasterUpacaraRepository struct {
	db *gorm.DB
}

func NewMasterUpacaraRepository(db *gorm.DB) domain.IMasterUpacaraRepository {
	return &MasterUpacaraRepository{db: db}
}

func (r *MasterUpacaraRepository) Create(ctx context.Context, item *domain.MasterUpacara) error {
	if r == nil || r.db == nil {
		return nil
	}
	return commoninfra.GetTx(ctx, r.db).Create(item).Error
}

func (r *MasterUpacaraRepository) Update(ctx context.Context, item *domain.MasterUpacara) error {
	if r == nil || r.db == nil {
		return nil
	}
	return commoninfra.GetTx(ctx, r.db).Save(item).Error
}

func (r *MasterUpacaraRepository) Delete(ctx context.Context, id uint) error {
	if r == nil || r.db == nil {
		return nil
	}
	return commoninfra.GetTx(ctx, r.db).Delete(&domain.MasterUpacara{}, id).Error
}

func (r *MasterUpacaraRepository) GetByID(ctx context.Context, id uint) (*domain.MasterUpacara, error) {
	if r == nil || r.db == nil {
		return nil, nil
	}
	var item domain.MasterUpacara
	err := r.db.WithContext(ctx).First(&item, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &item, nil
}

func (r *MasterUpacaraRepository) GetByDate(ctx context.Context, date string) (*domain.MasterUpacara, error) {
	if r == nil || r.db == nil {
		return nil, nil
	}
	var item domain.MasterUpacara
	date = strings.TrimSpace(date)
	if len(date) > 10 {
		date = date[:10]
	}
	err := r.db.WithContext(ctx).Where("DATE(tanggal) = DATE(?) OR tanggal = ?", date, date).First(&item).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &item, nil
}

func (r *MasterUpacaraRepository) GetAll(ctx context.Context, year string, month string) ([]domain.MasterUpacara, error) {
	if r == nil || r.db == nil {
		return []domain.MasterUpacara{}, nil
	}
	var list []domain.MasterUpacara
	query := r.db.WithContext(ctx).Order("tanggal DESC")

	year = strings.TrimSpace(year)
	month = strings.TrimSpace(month)

	if year != "" && month != "" {
		if len(month) == 1 {
			month = "0" + month
		}
		query = query.Where("tanggal LIKE ?", year+"-"+month+"-%")
	} else if year != "" {
		query = query.Where("tanggal LIKE ?", year+"-%")
	}

	err := query.Find(&list).Error
	if err != nil {
		return nil, err
	}
	return list, nil
}
