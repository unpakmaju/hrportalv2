package GetTodayMasterUpacara

import (
	"context"
	"strings"
	"time"

	common "hrportal_backend/common/domain"
	"hrportal_backend/modules/ceremony_attendance/domain"
)

type TodayMasterUpacaraDto struct {
	HasCeremony bool                  `json:"has_ceremony"`
	IsRoutine17 bool                  `json:"is_routine_17"`
	Ceremony    *domain.MasterUpacara `json:"ceremony"`
}

type GetTodayMasterUpacaraQuery struct {
	Date string `json:"date"`
}

type GetTodayMasterUpacaraQueryHandler struct {
	repo domain.IMasterUpacaraRepository
}

func NewGetTodayMasterUpacaraQueryHandler(repo domain.IMasterUpacaraRepository) *GetTodayMasterUpacaraQueryHandler {
	return &GetTodayMasterUpacaraQueryHandler{repo: repo}
}

func (h *GetTodayMasterUpacaraQueryHandler) Handle(ctx context.Context, query *GetTodayMasterUpacaraQuery) (common.ResultValue[*TodayMasterUpacaraDto], error) {
	dateStr := strings.TrimSpace(query.Date)
	if dateStr == "" {
		dateStr = time.Now().Format("2006-01-02")
	}

	item, _ := h.repo.GetByDate(ctx, dateStr)

	day := time.Now().Day()
	if t, err := time.Parse("2006-01-02", dateStr); err == nil {
		day = t.Day()
	}
	isTanggal17 := day == 17
	hasCeremony := item != nil || isTanggal17

	var ceremonyData *domain.MasterUpacara
	if item != nil {
		ceremonyData = item
	} else if isTanggal17 {
		ceremonyData = &domain.MasterUpacara{
			Nama:       "Upacara Bendera 17-an Rutin",
			Tanggal:    dateStr,
			JamMulai:   "08:00",
			JamSelesai: "09:00",
			Lokasi:     "Lapangan Utama UNPAK",
			Deskripsi:  "Upacara bendera rutin tanggal 17 setiap bulan.",
		}
	}

	if ceremonyData != nil && len(ceremonyData.Tanggal) > 10 {
		ceremonyData.Tanggal = ceremonyData.Tanggal[:10]
	}

	return common.SuccessValue(&TodayMasterUpacaraDto{
		HasCeremony: hasCeremony,
		IsRoutine17: isTanggal17,
		Ceremony:    ceremonyData,
	}), nil
}
