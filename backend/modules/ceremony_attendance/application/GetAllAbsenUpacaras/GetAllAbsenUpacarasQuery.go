package GetAllAbsenUpacaras

import (
	"context"
	common "hrportal_backend/common/domain"
	"hrportal_backend/modules/ceremony_attendance/domain"
)

type GetAllAbsenUpacarasQuery struct {
	Nip     string `json:"nip"`
	Nidn    string `json:"nidn"`
	Tanggal string `json:"tanggal"`
}

type GetAllAbsenUpacarasQueryHandler struct {
	repo domain.ICeremonyAttendanceRepository
}

func NewGetAllAbsenUpacarasQueryHandler(repo domain.ICeremonyAttendanceRepository) *GetAllAbsenUpacarasQueryHandler {
	return &GetAllAbsenUpacarasQueryHandler{repo: repo}
}

func (h *GetAllAbsenUpacarasQueryHandler) Handle(ctx context.Context, query *GetAllAbsenUpacarasQuery) (common.ResultValue[[]domain.AbsenUpacara], error) {
	list, err := h.repo.GetAll(ctx, query.Nip, query.Nidn, query.Tanggal)
	if err != nil {
		return common.FailureValue[[]domain.AbsenUpacara](common.FailureError("CeremonyAttendance.GetAllFailed", err.Error())), nil
	}
	for i := range list {
		if len(list[i].Tanggal) > 10 {
			list[i].Tanggal = list[i].Tanggal[:10]
		}
	}

	return common.SuccessValue(list), nil
}
