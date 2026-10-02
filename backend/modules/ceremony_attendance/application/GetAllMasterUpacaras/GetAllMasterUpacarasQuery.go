package GetAllMasterUpacaras

import (
	"context"
	common "hrportal_backend/common/domain"
	"hrportal_backend/modules/ceremony_attendance/domain"
)

type GetAllMasterUpacarasQuery struct {
	Year  string `json:"year"`
	Month string `json:"month"`
}

type GetAllMasterUpacarasQueryHandler struct {
	repo domain.IMasterUpacaraRepository
}

func NewGetAllMasterUpacarasQueryHandler(repo domain.IMasterUpacaraRepository) *GetAllMasterUpacarasQueryHandler {
	return &GetAllMasterUpacarasQueryHandler{repo: repo}
}

func (h *GetAllMasterUpacarasQueryHandler) Handle(ctx context.Context, query *GetAllMasterUpacarasQuery) (common.ResultValue[[]domain.MasterUpacara], error) {
	list, err := h.repo.GetAll(ctx, query.Year, query.Month)
	if err != nil {
		return common.FailureValue[[]domain.MasterUpacara](common.FailureError("MasterUpacara.GetAllFailed", err.Error())), nil
	}

	for i := range list {
		if len(list[i].Tanggal) > 10 {
			list[i].Tanggal = list[i].Tanggal[:10]
		}
	}

	return common.SuccessValue(list), nil
}
