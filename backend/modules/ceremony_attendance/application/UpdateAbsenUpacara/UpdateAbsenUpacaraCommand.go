package UpdateAbsenUpacara

import (
	"context"
	"time"

	common "hrportal_backend/common/domain"
	commoninfra "hrportal_backend/common/infrastructure"
	"hrportal_backend/modules/ceremony_attendance/domain"

	validation "github.com/go-ozzo/ozzo-validation/v4"
)

type UpdateAbsenUpacaraCommand struct {
	ID       uint   `json:"id"`
	Nip      string `json:"nip"`
	Nidn     string `json:"nidn"`
	Nama     string `json:"nama"`
	Unit     string `json:"unit"`
	Fakultas string `json:"fakultas"`
	Prodi    string `json:"prodi"`
	Tanggal  string `json:"tanggal"`
}

func (c UpdateAbsenUpacaraCommand) Validate() error {
	return validation.ValidateStruct(&c,
		validation.Field(&c.ID, validation.Required),
		validation.Field(&c.Tanggal, validation.Required),
	)
}

type UpdateAbsenUpacaraCommandHandler struct {
	repo domain.ICeremonyAttendanceRepository
}

func NewUpdateAbsenUpacaraCommandHandler(repo domain.ICeremonyAttendanceRepository) *UpdateAbsenUpacaraCommandHandler {
	return &UpdateAbsenUpacaraCommandHandler{repo: repo}
}

func (h *UpdateAbsenUpacaraCommandHandler) Handle(ctx context.Context, cmd *UpdateAbsenUpacaraCommand) (common.ResultValue[*domain.AbsenUpacara], error) {
	if err := cmd.Validate(); err != nil {
		return common.FailureValue[*domain.AbsenUpacara](common.FailureError("CeremonyAttendance.InvalidInput", err.Error())), nil
	}

	upacara, err := h.repo.GetByID(ctx, cmd.ID)
	if err != nil {
		return common.FailureValue[*domain.AbsenUpacara](domain.UpacaraNotFound()), nil
	}

	now := time.Now()
	upacara.Nama = cmd.Nama
	upacara.Nip = cmd.Nip
	upacara.Nidn = cmd.Nidn
	upacara.Tanggal = cmd.Tanggal
	upacara.UpdatedAt = &now

	if err := h.repo.Update(ctx, upacara); err != nil {
		return common.FailureValue[*domain.AbsenUpacara](common.FailureError("CeremonyAttendance.UpdateFailed", err.Error())), nil
	}

	return common.SuccessValue(upacara), nil
}

func init() {
	commoninfra.RegisterValidation(func(cmd UpdateAbsenUpacaraCommand) error {
		return cmd.Validate()
	}, "CeremonyAttendance.UpdateAbsenUpacara.Validation")
}
