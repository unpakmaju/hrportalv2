package domain

import (
	"context"
)

type IMasterUpacaraRepository interface {
	Create(ctx context.Context, item *MasterUpacara) error
	Update(ctx context.Context, item *MasterUpacara) error
	Delete(ctx context.Context, id uint) error
	GetByID(ctx context.Context, id uint) (*MasterUpacara, error)
	GetByDate(ctx context.Context, date string) (*MasterUpacara, error)
	GetAll(ctx context.Context, year string, month string) ([]MasterUpacara, error)
}
