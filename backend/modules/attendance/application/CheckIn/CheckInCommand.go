package CheckIn

import (
	"context"
	"errors"
	"strings"
	"time"

	common "hrportal_backend/common/domain"
	commoninfra "hrportal_backend/common/infrastructure"
	"hrportal_backend/modules/attendance/domain"
	reportInfra "hrportal_backend/modules/report/infrastructure"

	validation "github.com/go-ozzo/ozzo-validation/v4"
	"gorm.io/gorm"
)

type CheckInCommand struct {
	Nip              string  `json:"nip"`
	Nidn             string  `json:"nidn"`
	NamaPegawai      string  `json:"nama_pegawai"`
	Unit             string  `json:"unit"`
	Fakultas         string  `json:"fakultas"`
	Prodi            string  `json:"prodi"`
	Latitude         float64 `json:"latitude"`
	Longitude        float64 `json:"longitude"`
	IpAddress        string  `json:"ip_address"`
	CatatanLuarUnpak string  `json:"catatan_luar_unpak"`
	Note             string  `json:"note"`
}

func (c CheckInCommand) Validate() error {
	if strings.TrimSpace(c.Nip) == "" && strings.TrimSpace(c.Nidn) == "" {
		return validation.Errors{
			"nip": errors.New("nip or nidn is required"),
		}
	}
	return nil
}

type CheckInCommandHandler struct {
	attendanceRepo domain.IAttendanceRepository
}

func NewCheckInCommandHandler(repo domain.IAttendanceRepository) *CheckInCommandHandler {
	return &CheckInCommandHandler{attendanceRepo: repo}
}

// resolveTargetDate determines attendance date considering night shift rules:
// Case 1 (Under 05:00 AM): If yesterday has check-in, target yesterday. Else, target today.
// Case 2 (>= 05:00 AM): Normal shift, target today.
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

func (h *CheckInCommandHandler) Handle(ctx context.Context, cmd *CheckInCommand) (common.ResultValue[*domain.Absen], error) {
	targetDate := resolveTargetDate(ctx, h.attendanceRepo, cmd.Nip, cmd.Nidn)
	existing, _ := h.attendanceRepo.FindByNipAndTanggal(ctx, cmd.Nip, cmd.Nidn, targetDate)
	if existing != nil && existing.AbsenMasuk != nil {
		return common.FailureValue[*domain.Absen](domain.AlreadyCheckedIn()), nil
	}

	now := time.Now()
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

	var latPtr, lonPtr *float64
	if cmd.Latitude != 0 {
		latPtr = &cmd.Latitude
	}
	if cmd.Longitude != 0 {
		lonPtr = &cmd.Longitude
	}
	var ipPtr *string
	if strings.TrimSpace(cmd.IpAddress) != "" {
		trimmed := strings.TrimSpace(cmd.IpAddress)
		ipPtr = &trimmed
	}
	var luarPtr *string
	if strings.TrimSpace(cmd.CatatanLuarUnpak) != "" {
		trimmed := strings.TrimSpace(cmd.CatatanLuarUnpak)
		luarPtr = &trimmed
	}

	if existing == nil {
		absen := &domain.Absen{
			Nip:              cmd.Nip,
			Nidn:             cmd.Nidn,
			NamaPegawai:      cmd.NamaPegawai,
			Unit:             cmd.Unit,
			Fakultas:         cmd.Fakultas,
			Prodi:            cmd.Prodi,
			Tanggal:          targetDate,
			AbsenMasuk:       &now,
			CatatanTelat:     &cmd.Note,
			Latitude:         latPtr,
			Longitude:        lonPtr,
			IpAddress:        ipPtr,
			CatatanLuarUnpak: luarPtr,
			OtomatisKeluar:   false,
			CreatedAt:        &now,
			UpdatedAt:        &now,
			IsCreated:        true,
		}
		if err := h.attendanceRepo.CreateAbsen(ctxTx, absen); err != nil {
			if tx != nil {
				tx.Rollback()
			}
			return common.FailureValue[*domain.Absen](domain.AttendanceNotFound()), err
		}
		if tx != nil {
			if err := tx.Commit().Error; err != nil {
				return common.FailureValue[*domain.Absen](domain.AttendanceNotFound()), err
			}
		}
		return common.SuccessValue(absen), nil
	}

	existing.AbsenMasuk = &now
	existing.CatatanTelat = &cmd.Note
	if latPtr != nil {
		existing.Latitude = latPtr
	}
	if lonPtr != nil {
		existing.Longitude = lonPtr
	}
	if ipPtr != nil {
		existing.IpAddress = ipPtr
	}
	if luarPtr != nil {
		existing.CatatanLuarUnpak = luarPtr
	}
	existing.UpdatedAt = &now
	existing.IsCreated = false
	if err := h.attendanceRepo.UpdateAbsen(ctxTx, existing); err != nil {
		if tx != nil {
			tx.Rollback()
		}
		return common.FailureValue[*domain.Absen](domain.AttendanceNotFound()), err
	}
	if tx != nil {
		if err := tx.Commit().Error; err != nil {
			return common.FailureValue[*domain.Absen](domain.AttendanceNotFound()), err
		}
	}
	return common.SuccessValue(existing), nil
}

func init() {
	commoninfra.RegisterValidation(func(cmd CheckInCommand) error {
		return cmd.Validate()
	}, "Attendance.CheckIn.Validation")
}
