package CreateMasterUpacara

import (
	"context"
	"strings"
	"time"

	common "hrportal_backend/common/domain"
	commoninfra "hrportal_backend/common/infrastructure"
	"hrportal_backend/modules/ceremony_attendance/domain"

	validation "github.com/go-ozzo/ozzo-validation/v4"
)

type CreateMasterUpacaraCommand struct {
	Nama       string `json:"nama"`
	Tanggal    string `json:"tanggal"`
	JamMulai   string `json:"jam_mulai"`
	JamSelesai string `json:"jam_selesai"`
	Lokasi     string `json:"lokasi"`
	Deskripsi  string `json:"deskripsi"`
}

func (c CreateMasterUpacaraCommand) Validate() error {
	return validation.ValidateStruct(&c,
		validation.Field(&c.Tanggal, validation.Required),
	)
}

type CreateMasterUpacaraCommandHandler struct {
	repo domain.IMasterUpacaraRepository
}

func NewCreateMasterUpacaraCommandHandler(repo domain.IMasterUpacaraRepository) *CreateMasterUpacaraCommandHandler {
	return &CreateMasterUpacaraCommandHandler{repo: repo}
}

func (h *CreateMasterUpacaraCommandHandler) Handle(ctx context.Context, cmd *CreateMasterUpacaraCommand) (common.ResultValue[*domain.MasterUpacara], error) {
	if err := cmd.Validate(); err != nil {
		return common.FailureValue[*domain.MasterUpacara](common.FailureError("MasterUpacara.InvalidInput", err.Error())), nil
	}

	nama := strings.TrimSpace(cmd.Nama)
	if nama == "" {
		return common.FailureValue[*domain.MasterUpacara](common.FailureError("MasterUpacara.InvalidInput", "nama upacara wajib diisi")), nil
	}

	tgl := strings.TrimSpace(cmd.Tanggal)
	if len(tgl) > 10 {
		tgl = tgl[:10]
	}

	jamMulai := strings.TrimSpace(cmd.JamMulai)
	if jamMulai == "" {
		jamMulai = "08:00"
	}

	jamSelesai := strings.TrimSpace(cmd.JamSelesai)
	if jamSelesai == "" {
		jamSelesai = "09:00"
	}

	lokasi := strings.TrimSpace(cmd.Lokasi)
	if lokasi == "" {
		lokasi = "Lapangan Utama UNPAK"
	}

	now := time.Now()
	item := domain.MasterUpacara{
		Nama:       nama,
		Tanggal:    tgl,
		JamMulai:   jamMulai,
		JamSelesai: jamSelesai,
		Lokasi:     lokasi,
		Deskripsi:  strings.TrimSpace(cmd.Deskripsi),
		CreatedAt:  &now,
		UpdatedAt:  &now,
	}

	err := h.repo.Create(ctx, &item)
	if err != nil {
		return common.FailureValue[*domain.MasterUpacara](common.FailureError("MasterUpacara.CreateFailed", err.Error())), nil
	}

	return common.SuccessValue(&item), nil
}

func init() {
	commoninfra.RegisterValidation(func(cmd CreateMasterUpacaraCommand) error {
		return cmd.Validate()
	}, "CeremonyAttendance.CreateMasterUpacara.Validation")
}
