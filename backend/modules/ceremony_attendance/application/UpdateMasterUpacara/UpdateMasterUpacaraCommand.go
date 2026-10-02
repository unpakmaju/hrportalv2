package UpdateMasterUpacara

import (
	"context"
	"strings"
	"time"

	common "hrportal_backend/common/domain"
	commoninfra "hrportal_backend/common/infrastructure"
	"hrportal_backend/modules/ceremony_attendance/domain"

	validation "github.com/go-ozzo/ozzo-validation/v4"
)

type UpdateMasterUpacaraCommand struct {
	ID         uint   `json:"id"`
	Nama       string `json:"nama"`
	Tanggal    string `json:"tanggal"`
	JamMulai   string `json:"jam_mulai"`
	JamSelesai string `json:"jam_selesai"`
	Lokasi     string `json:"lokasi"`
	Deskripsi  string `json:"deskripsi"`
}

func (c UpdateMasterUpacaraCommand) Validate() error {
	return validation.ValidateStruct(&c,
		validation.Field(&c.ID, validation.Required),
	)
}

type UpdateMasterUpacaraCommandHandler struct {
	repo domain.IMasterUpacaraRepository
}

func NewUpdateMasterUpacaraCommandHandler(repo domain.IMasterUpacaraRepository) *UpdateMasterUpacaraCommandHandler {
	return &UpdateMasterUpacaraCommandHandler{repo: repo}
}

func (h *UpdateMasterUpacaraCommandHandler) Handle(ctx context.Context, cmd *UpdateMasterUpacaraCommand) (common.ResultValue[*domain.MasterUpacara], error) {
	if err := cmd.Validate(); err != nil {
		return common.FailureValue[*domain.MasterUpacara](common.FailureError("MasterUpacara.InvalidInput", err.Error())), nil
	}

	item, err := h.repo.GetByID(ctx, cmd.ID)
	if err != nil || item == nil {
		return common.FailureValue[*domain.MasterUpacara](domain.MasterUpacaraNotFound()), nil
	}

	nama := strings.TrimSpace(cmd.Nama)
	if nama != "" {
		item.Nama = nama
	}

	if cmd.Tanggal != "" {
		tgl := strings.TrimSpace(cmd.Tanggal)
		if len(tgl) > 10 {
			tgl = tgl[:10]
		}
		item.Tanggal = tgl
	}

	if cmd.JamMulai != "" {
		item.JamMulai = strings.TrimSpace(cmd.JamMulai)
	}
	if cmd.JamSelesai != "" {
		item.JamSelesai = strings.TrimSpace(cmd.JamSelesai)
	}
	if cmd.Lokasi != "" {
		item.Lokasi = strings.TrimSpace(cmd.Lokasi)
	}
	if cmd.Deskripsi != "" {
		item.Deskripsi = strings.TrimSpace(cmd.Deskripsi)
	}

	now := time.Now()
	item.UpdatedAt = &now

	if err := h.repo.Update(ctx, item); err != nil {
		return common.FailureValue[*domain.MasterUpacara](common.FailureError("MasterUpacara.UpdateFailed", err.Error())), nil
	}

	return common.SuccessValue(item), nil
}

func init() {
	commoninfra.RegisterValidation(func(cmd UpdateMasterUpacaraCommand) error {
		return cmd.Validate()
	}, "CeremonyAttendance.UpdateMasterUpacara.Validation")
}
