package UpdateCuti

import (
	"context"
	common "hrportal_backend/common/domain"
	commoninfra "hrportal_backend/common/infrastructure"
	"hrportal_backend/modules/leave/domain"
	reportInfra "hrportal_backend/modules/report/infrastructure"
	"time"

	validation "github.com/go-ozzo/ozzo-validation/v4"
	"gorm.io/gorm"
)

type UpdateCutiCommand struct {
	ID             uint    `json:"id"`
	NamaPemohon    string  `json:"nama_pemohon"`
	Unit           string  `json:"unit"`
	Fakultas       string  `json:"fakultas"`
	Prodi          string  `json:"prodi"`
	JenisCutiID    uint    `json:"jenis_cuti_id"`
	TanggalMulai   string  `json:"tanggal_mulai"`
	TanggalSelesai string  `json:"tanggal_selesai"`
	JumlahHari     int     `json:"jumlah_hari"`
	Alasan         string  `json:"alasan"`
	FileLampiran   *string `json:"file_lampiran"`
	Status         string  `json:"status"`
	CatatanAtasan  *string `json:"catatan_atasan"`
	IsSdm          bool    `json:"isSdm"`
}

func (c UpdateCutiCommand) Validate() error {
	return validation.ValidateStruct(&c,
		validation.Field(&c.ID, validation.Required),
	)
}

type UpdateCutiCommandHandler struct {
	leaveRepo domain.ILeaveRepository
}

func NewUpdateCutiCommandHandler(leaveRepo domain.ILeaveRepository) *UpdateCutiCommandHandler {
	return &UpdateCutiCommandHandler{leaveRepo: leaveRepo}
}

func (h *UpdateCutiCommandHandler) Handle(ctx context.Context, cmd *UpdateCutiCommand) (common.ResultValue[*domain.Cuti], error) {
	cuti, err := h.leaveRepo.FindByID(ctx, cmd.ID)
	if err != nil {
		return common.FailureValue[*domain.Cuti](common.FailureError("Cuti.NotFound", "Cuti tidak ditemukan")), nil
	}

	now := time.Now()
	if cmd.JenisCutiID != 0 {
		cuti.JenisCutiID = cmd.JenisCutiID
	}
	if cmd.TanggalMulai != "" {
		cuti.TanggalMulai = common.FormatDateOnly(cmd.TanggalMulai)
	}
	if cmd.TanggalSelesai != "" {
		cuti.TanggalSelesai = common.FormatDateOnly(cmd.TanggalSelesai)
	}
	if cmd.JumlahHari > 0 {
		cuti.JumlahHari = cmd.JumlahHari
	}
	if cmd.Alasan != "" {
		cuti.Alasan = cmd.Alasan
	}
	if cmd.FileLampiran != nil {
		cuti.FileLampiran = cmd.FileLampiran
	}
	if cmd.Status != "" {
		cuti.Status = cmd.Status
	}
	if cmd.CatatanAtasan != nil {
		cuti.CatatanAtasan = cmd.CatatanAtasan
	}
	cuti.TanggalMulai = common.FormatDateOnly(cuti.TanggalMulai)
	cuti.TanggalSelesai = common.FormatDateOnly(cuti.TanggalSelesai)
	cuti.UpdatedAt = &now

	var db *gorm.DB
	if repo := reportInfra.GetReportRepository(); repo != nil {
		db = repo.GetDB()
	}

	ctxTx := ctx
	var tx *gorm.DB
	if db != nil {
		tx = db.Begin()
		if tx != nil && tx.Error == nil {
			defer func() {
				if r := recover(); r != nil {
					tx.Rollback()
				}
			}()
			ctxTx = context.WithValue(ctx, commoninfra.TxKey, tx)
		} else {
			tx = nil
		}
	}

	if err := h.leaveRepo.UpdateCuti(ctxTx, cuti); err != nil {
		if tx != nil {
			tx.Rollback()
		}
		return common.FailureValue[*domain.Cuti](common.FailureError("Cuti.UpdateFailed", err.Error())), nil
	}

	if tx != nil {
		if err := tx.Commit().Error; err != nil {
			return common.FailureValue[*domain.Cuti](common.FailureError("Cuti.CommitFailed", err.Error())), nil
		}
	}

	return common.SuccessValue(cuti), nil
}

func init() {
	commoninfra.RegisterValidation(func(cmd UpdateCutiCommand) error {
		return cmd.Validate()
	}, "Leave.UpdateCuti.Validation")
}
