package infrastructure

import (
	common "hrportal_backend/common/domain"
	"hrportal_backend/modules/report/application/CalculateReport"
	"hrportal_backend/modules/report/application/GetAllLaporanAbsen"
	"hrportal_backend/modules/report/application/GetSummaryReport"
	"hrportal_backend/modules/report/application/StreamLaporanAbsen"
	"hrportal_backend/modules/report/domain"

	"github.com/mehdihadeli/go-mediatr"
	"gorm.io/gorm"
)

var globalReportRepo domain.IReportRepository
var globalExportWorker *ExportWorker

func GetReportRepository() domain.IReportRepository {
	return globalReportRepo
}

func GetExportWorker() *ExportWorker {
	return globalExportWorker
}

func RegisterModuleReport(db *gorm.DB, extraDBs ...*gorm.DB) error {
	// Auto migrate rekap_laporan_bulanan table to ensure new columns (like total_libur) exist
	// if err := db.AutoMigrate(&domain.RekapLaporanBulanan{}); err != nil {
	// 	return err
	// }

	var simpegNewDB *gorm.DB
	var simakDB *gorm.DB
	if len(extraDBs) > 0 {
		simpegNewDB = extraDBs[0]
	}
	if len(extraDBs) > 1 {
		simakDB = extraDBs[1]
	}

	repo := NewReportRepository(db, simpegNewDB, simakDB)
	globalReportRepo = repo
	globalExportWorker = NewExportWorker(db, repo)

	allLaporanHandler := GetAllLaporanAbsen.NewGetAllLaporanAbsenQueryHandler(repo)
	err := mediatr.RegisterRequestHandler[*GetAllLaporanAbsen.GetAllLaporanAbsenQuery, common.ResultValue[map[string]interface{}]](allLaporanHandler)
	if err != nil {
		return err
	}

	summaryHandler := GetSummaryReport.NewGetSummaryReportQueryHandler(repo)
	err = mediatr.RegisterRequestHandler[*GetSummaryReport.GetSummaryReportQuery, common.ResultValue[*domain.RekapLaporanBulanan]](summaryHandler)
	if err != nil {
		return err
	}

	streamHandler := StreamLaporanAbsen.NewStreamLaporanAbsenQueryHandler(repo)
	err = mediatr.RegisterRequestHandler[*StreamLaporanAbsen.StreamLaporanAbsenQuery, common.ResultValue[[]domain.FlatRecordItem]](streamHandler)
	if err != nil {
		return err
	}

	calculateHandler := CalculateReport.NewCalculateReportCommandHandler(repo)
	err = mediatr.RegisterRequestHandler[*CalculateReport.CalculateReportCommand, common.ResultValue[map[string]interface{}]](calculateHandler)
	if err != nil {
		return err
	}

	return nil
}
