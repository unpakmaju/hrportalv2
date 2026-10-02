package presentation

import (
	"fmt"
	"path/filepath"
	"time"

	common "hrportal_backend/common/domain"
	"hrportal_backend/common/infrastructure"
	commonpresentation "hrportal_backend/common/presentation"
	"hrportal_backend/modules/report/application/CalculateReport"
	"hrportal_backend/modules/report/application/GetAllLaporanAbsen"
	"hrportal_backend/modules/report/application/GetSummaryReport"
	"hrportal_backend/modules/report/application/StreamLaporanAbsen"
	"hrportal_backend/modules/report/domain"
	reportInfra "hrportal_backend/modules/report/infrastructure"

	"github.com/gofiber/fiber/v2"
	"github.com/mehdihadeli/go-mediatr"
)

func registerReportRoutes(group fiber.Router) {

	group.Get("/summary", func(c *fiber.Ctx) error {
		nidn := c.Query("nidn")
		if nidn == "" {
			nidn = c.FormValue("nidn")
		}
		nip := c.Query("nip")
		if nip == "" {
			nip = c.FormValue("nip")
		}

		periodeTypeStr := c.Query("periode_type", "CALENDAR")
		periodeKey := c.Query("periode_key")
		if periodeKey == "" {
			periodeKey = time.Now().Format("2006-01")
		}

		query := &GetSummaryReport.GetSummaryReportQuery{
			Nip:         nip,
			Nidn:        nidn,
			PeriodeType: domain.PeriodeType(periodeTypeStr),
			PeriodeKey:  periodeKey,
		}

		res, err := mediatr.Send[*GetSummaryReport.GetSummaryReportQuery, common.ResultValue[*domain.RekapLaporanBulanan]](c.UserContext(), query)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}

		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}

		return c.JSON(res.Value)
	})

	group.Get("/all", func(c *fiber.Ctx) error {
		nidn := c.Query("nidn")
		nip := c.Query("nip")

		query := &GetAllLaporanAbsen.GetAllLaporanAbsenQuery{
			TanggalMulai: c.Query("tanggal_mulai"),
			TanggalAkhir: c.Query("tanggal_akhir"),
			Nidn:         nidn,
			Nip:          nip,
		}

		res, err := mediatr.Send[*GetAllLaporanAbsen.GetAllLaporanAbsenQuery, common.ResultValue[map[string]interface{}]](c.UserContext(), query)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}

		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}

		return c.JSON(res.Value)
	})

	// SSE Endpoint
	group.Get("/stream", func(c *fiber.Ctx) error {
		nidn := c.Query("nidn")
		nip := c.Query("nip")

		query := &StreamLaporanAbsen.StreamLaporanAbsenQuery{
			TanggalMulai: c.Query("tanggal_mulai"),
			TanggalAkhir: c.Query("tanggal_akhir"),
			Nip:          nip,
			Nidn:         nidn,
			UserType:     c.Query("type"),
		}

		res, err := mediatr.Send[*StreamLaporanAbsen.StreamLaporanAbsenQuery, common.ResultValue[[]domain.FlatRecordItem]](c.UserContext(), query)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}

		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}

		pagedData := common.NewPaged(res.Value, int64(len(res.Value)), 1, len(res.Value))
		sseAdapter := &commonpresentation.SSEAdapter[domain.FlatRecordItem]{}

		return sseAdapter.Send(c, pagedData)
	})

	// API Endpoint for calculation of report v1 & v2 (Bypasses JWT/RBAC middleware via path matching)
	group.Get("/recalculate", func(c *fiber.Ctx) error {
		command := CalculateReport.CalculateReportCommand{}

		res, err := mediatr.Send[*CalculateReport.CalculateReportCommand, common.ResultValue[map[string]interface{}]](c.UserContext(), &command)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}

		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}

		return c.JSON(res.Value)
	})

	// 1. Request Background Export Job (Hangfire Concept: UUIDv4 + Queue)
	group.Get("/export/request", func(c *fiber.Ctx) error {
		tglMulai := c.Query("tanggal_mulai")
		tglAkhir := c.Query("tanggal_akhir")
		if tglMulai == "" {
			tglMulai = time.Now().Format("2006-01") + "-01"
		}
		if tglAkhir == "" {
			tglAkhir = time.Now().Format("2006-01-02")
		}

		worker := reportInfra.GetExportWorker()
		if worker == nil {
			return c.Status(500).JSON(fiber.Map{"error": "Export worker not initialized"})
		}

		job, err := worker.CreateJob(c.UserContext(), tglMulai, tglAkhir)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}

		return c.JSON(fiber.Map{
			"task_id":  job.TaskID,
			"status":   job.Status,
			"message":  "Task export dimasukkan ke antrean background",
			"progress": job.Progress,
		})
	})

	// 2. Poll Status of Export Task
	group.Get("/export/status/:taskId", func(c *fiber.Ctx) error {
		taskId := c.Params("taskId")
		worker := reportInfra.GetExportWorker()
		if worker == nil {
			return c.Status(500).JSON(fiber.Map{"error": "Export worker not initialized"})
		}

		job, err := worker.GetJobStatus(c.UserContext(), taskId)
		if err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Task export tidak ditemukan"})
		}

		return c.JSON(fiber.Map{
			"task_id":       job.TaskID,
			"status":        job.Status,
			"progress":      job.Progress,
			"file_path":     job.FilePath,
			"download_url":  "/api/laporan/export/download/" + job.TaskID,
			"error_message": job.ErrorMessage,
		})
	})

	// 3. Download Generated Excel/CSV File
	group.Get("/export/download/:taskId", func(c *fiber.Ctx) error {
		taskId := c.Params("taskId")
		worker := reportInfra.GetExportWorker()
		if worker == nil {
			return c.Status(500).SendString("Export worker not initialized")
		}

		job, err := worker.GetJobStatus(c.UserContext(), taskId)
		if err != nil || job.Status != "completed" || job.FilePath == "" {
			return c.Status(404).SendString("File export belum siap atau gagal diproses.")
		}

		c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filepath.Base(job.FilePath)))
		c.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		return c.SendFile(job.FilePath)
	})
}

func ModuleReport(app *fiber.App) {
	groups := []string{"/api/v2/laporan", "/api/laporan", "/api/v2/report", "/api/report"}
	for _, path := range groups {
		g := app.Group(path, commonpresentation.JWTMiddleware(), commonpresentation.RBACMiddleware())
		registerReportRoutes(g)
	}
}
