package CheckOut

import (
	"context"
	"strconv"
	"strings"
	"time"

	common "hrportal_backend/common/domain"
	"hrportal_backend/common/helper"
	"hrportal_backend/common/infrastructure"
	"hrportal_backend/modules/attendance/domain"
	"hrportal_backend/modules/notification/application/CreateNotification"

	validation "github.com/go-ozzo/ozzo-validation/v4"
	"github.com/mehdihadeli/go-mediatr"
)

type CheckOutCommand struct {
	Nip                   string `json:"nip"`
	Nidn                  string `json:"nidn"`
	Note                  string `json:"catatan_pulang"`
	IpAddress             string `json:"ip_address"`
	CatatanHasilLuarUnpak string `json:"catatan_hasil_luar_unpak"`
}

func (c CheckOutCommand) Validate() error {
	return validation.ValidateStruct(&c)
}

type CheckOutCommandHandler struct {
	attendanceRepo domain.IAttendanceRepository
}

func NewCheckOutCommandHandler(attendanceRepo domain.IAttendanceRepository) *CheckOutCommandHandler {
	return &CheckOutCommandHandler{attendanceRepo: attendanceRepo}
}

func resolveTargetDate(ctx context.Context, repo domain.IAttendanceRepository, nip, nidn string) string {
	now := time.Now()
	todayStr := now.Format("2006-01-02")

	if now.Hour() < 5 {
		yesterdayStr := now.AddDate(0, 0, -1).Format("2006-01-02")
		yesterdayRec, _ := repo.FindByNipAndTanggal(ctx, nip, nidn, yesterdayStr)
		if yesterdayRec != nil && yesterdayRec.AbsenMasuk != nil {
			return yesterdayStr
		}
	}

	return todayStr
}

func (h *CheckOutCommandHandler) Handle(ctx context.Context, cmd *CheckOutCommand) (common.ResultValue[*domain.Absen], error) {
	targetDate := resolveTargetDate(ctx, h.attendanceRepo, cmd.Nip, cmd.Nidn)
	existing, _ := h.attendanceRepo.FindByNipAndTanggal(ctx, cmd.Nip, cmd.Nidn, targetDate)

	// Fallback for night shift check-out if targetDate was today but user checked in yesterday or vice versa
	if existing == nil && time.Now().Hour() < 5 {
		todayStr := time.Now().Format("2006-01-02")
		existing, _ = h.attendanceRepo.FindByNipAndTanggal(ctx, cmd.Nip, cmd.Nidn, todayStr)
	}

	if existing == nil {
		return common.FailureValue[*domain.Absen](domain.AttendanceNotFound()), nil
	}

	now := time.Now()
	isFirstCheckOut := existing.AbsenKeluar == nil
	existing.AbsenKeluar = &now
	existing.UpdatedAt = &now
	existing.IsCreated = isFirstCheckOut
	if cmd.Note != "" {
		existing.CatatanPulang = helper.StrPtr(cmd.Note)
	}


	if trimmedIp := strings.TrimSpace(cmd.IpAddress); trimmedIp != "" {
		existing.IpKeluar = &trimmedIp
		if existing.IpAddress == nil {
			existing.IpAddress = &trimmedIp
		}
	}
	if trimmedHasil := strings.TrimSpace(cmd.CatatanHasilLuarUnpak); trimmedHasil != "" {
		existing.CatatanHasilLuarUnpak = &trimmedHasil
	}

	if err := h.attendanceRepo.UpdateAbsen(ctx, existing); err != nil {
		return common.FailureValue[*domain.Absen](domain.AttendanceNotFound()), err
	}

	targetNips := []string{}
	if existing.Nip != "" {
		targetNips = append(targetNips, existing.Nip)
	}
	if existing.Nidn != "" && existing.Nidn != existing.Nip {
		targetNips = append(targetNips, existing.Nidn)
	}
	if len(targetNips) > 0 {
		_, _ = mediatr.Send[*CreateNotification.CreateNotificationCommand, common.ResultValue[bool]](ctx, &CreateNotification.CreateNotificationCommand{
			TargetNips: targetNips,
			Title:      "Presensi Keluar Berhasil",
			Body:       "Sistem sudah mencatat absen keluar Anda",
			Type:       "attendance",
			Payload:    map[string]string{"type": "check-out", "id": strconv.Itoa(int(existing.ID))},
		})
	}

	return common.SuccessValue(existing), nil
}

func init() {
	infrastructure.RegisterValidation(func(cmd CheckOutCommand) error {
		return cmd.Validate()
	}, "Attendance.CheckOut.Validation")
}
