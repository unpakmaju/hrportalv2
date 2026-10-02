package GetMasterUpacara

import (
	"context"
	common "hrportal_backend/common/domain"
	"hrportal_backend/modules/ceremony_attendance/domain"
)

type GetMasterUpacaraQuery struct {
	ID uint `json:"id"`
}

type GetMasterUpacaraQueryHandler struct {
	repo domain.IMasterUpacaraRepository
}

func NewGetMasterUpacaraQueryHandler(repo domain.IMasterUpacaraRepository) *GetMasterUpacaraQueryHandler {
	return &GetMasterUpacaraQueryHandler{repo: repo}
}

func (h *GetMasterUpacaraQueryHandler) Handle(ctx context.Context, query *GetMasterUpacaraQuery) (common.ResultValue[*domain.MasterUpacara], error) {
	item, err := h.repo.GetByID(ctx, query.ID)
	if err != nil || item == nil {
		return common.FailureValue[*domain.MasterUpacara](domain.MasterUpacaraNotFound()), nil
	}

	if len(item.Tanggal) > 10 {
		item.Tanggal = item.Tanggal[:10]
	}

	return common.SuccessValue(item), nil
}
