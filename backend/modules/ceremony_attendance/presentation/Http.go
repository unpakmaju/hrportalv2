package presentation

import (
	"strconv"
	"strings"
	"time"

	common "hrportal_backend/common/domain"
	"hrportal_backend/common/infrastructure"
	commonpresentation "hrportal_backend/common/presentation"
	"hrportal_backend/modules/ceremony_attendance/application/CreateAbsenUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/DeleteAbsenUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/GetAbsenUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/GetAllAbsenUpacaras"
	"hrportal_backend/modules/ceremony_attendance/application/UpdateAbsenUpacara"
	"hrportal_backend/modules/ceremony_attendance/domain"
	infra "hrportal_backend/modules/ceremony_attendance/infrastructure"

	"github.com/gofiber/fiber/v2"
	"github.com/mehdihadeli/go-mediatr"
	"gorm.io/gorm"
)

func registerCeremonyAttendanceRoutes(group fiber.Router) {

	group.Post("/", func(c *fiber.Ctx) error {
		var body struct {
			Nip      string `json:"nip"`
			Nidn     string `json:"nidn"`
			Nama     string `json:"nama"`
			Unit     string `json:"unit"`
			Fakultas string `json:"fakultas"`
			Prodi    string `json:"prodi"`
			Tanggal  string `json:"tanggal"`
		}
		_ = c.BodyParser(&body)

		nip := strings.TrimSpace(body.Nip)
		if nip == "" {
			nip = strings.TrimSpace(c.FormValue("nip"))
		}
		nidn := strings.TrimSpace(body.Nidn)
		if nidn == "" {
			nidn = strings.TrimSpace(c.FormValue("nidn"))
		}
		if nip == "" && nidn != "" {
			nip = nidn
		} else if nidn == "" && nip != "" {
			nidn = nip
		}

		nama := body.Nama
		if nama == "" {
			nama = c.FormValue("nama")
		}
		unit := body.Unit
		if unit == "" {
			unit = c.FormValue("unit")
		}
		fakultas := body.Fakultas
		if fakultas == "" {
			fakultas = c.FormValue("fakultas")
		}
		prodi := body.Prodi
		if prodi == "" {
			prodi = c.FormValue("prodi")
		}
		tanggal := strings.TrimSpace(body.Tanggal)
		if tanggal == "" {
			tanggal = strings.TrimSpace(c.FormValue("tanggal"))
		}
		if tanggal == "" {
			tanggal = time.Now().Format("2006-01-02")
		}

		command := CreateAbsenUpacara.CreateAbsenUpacaraCommand{
			Nip:      nip,
			Nidn:     nidn,
			Nama:     nama,
			Unit:     unit,
			Fakultas: fakultas,
			Prodi:    prodi,
			Tanggal:  tanggal,
		}

		res, err := mediatr.Send[*CreateAbsenUpacara.CreateAbsenUpacaraCommand, common.ResultValue[*domain.AbsenUpacara]](c.UserContext(), &command)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}

		return c.JSON(res.Value)
	})

	group.Put("/:id", func(c *fiber.Ctx) error {
		id, _ := strconv.Atoi(c.Params("id"))

		command := UpdateAbsenUpacara.UpdateAbsenUpacaraCommand{
			ID:      uint(id),
			Nip:     c.FormValue("nip"),
			Nidn:    c.FormValue("nidn"),
			Nama:    c.FormValue("nama"),
			Tanggal: c.FormValue("tanggal"),
		}

		res, err := mediatr.Send[*UpdateAbsenUpacara.UpdateAbsenUpacaraCommand, common.ResultValue[*domain.AbsenUpacara]](c.UserContext(), &command)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}
		return c.JSON(res.Value)
	})

	group.Delete("/:id", func(c *fiber.Ctx) error {
		id, _ := strconv.Atoi(c.Params("id"))

		command := DeleteAbsenUpacara.DeleteAbsenUpacaraCommand{
			ID: uint(id),
		}

		res, err := mediatr.Send[*DeleteAbsenUpacara.DeleteAbsenUpacaraCommand, common.ResultValue[bool]](c.UserContext(), &command)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}
		return c.JSON(fiber.Map{"success": res.Value})
	})

	group.Get("/:id", func(c *fiber.Ctx) error {
		id, _ := strconv.Atoi(c.Params("id"))

		query := GetAbsenUpacara.GetAbsenUpacaraQuery{
			ID: uint(id),
		}

		res, err := mediatr.Send[*GetAbsenUpacara.GetAbsenUpacaraQuery, common.ResultValue[*domain.AbsenUpacara]](c.UserContext(), &query)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}
		return c.JSON(res.Value)
	})

	group.Get("/", func(c *fiber.Ctx) error {
		query := GetAllAbsenUpacaras.GetAllAbsenUpacarasQuery{
			Nip:     c.FormValue("nip"),
			Nidn:    c.FormValue("nidn"),
			Tanggal: c.Query("tanggal"),
		}

		res, err := mediatr.Send[*GetAllAbsenUpacaras.GetAllAbsenUpacarasQuery, common.ResultValue[[]domain.AbsenUpacara]](c.UserContext(), &query)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}

		pagedData := common.NewPaged(res.Value, int64(len(res.Value)), 1, len(res.Value))
		sseAdapter := &commonpresentation.SSEAdapter[domain.AbsenUpacara]{}

		return sseAdapter.Send(c, pagedData)
	})
}

func registerMasterUpacaraRoutes(group fiber.Router, repo domain.IMasterUpacaraRepository) {
	// GET /today - cek apakah ada jadwal upacara hari ini
	group.Get("/today", func(c *fiber.Ctx) error {
		todayStr := time.Now().Format("2006-01-02")
		item, _ := repo.GetByDate(c.UserContext(), todayStr)
		isTanggal17 := time.Now().Day() == 17

		hasCeremony := item != nil || isTanggal17

		var ceremonyData *domain.MasterUpacara
		if item != nil {
			ceremonyData = item
		} else if isTanggal17 {
			ceremonyData = &domain.MasterUpacara{
				Nama:       "Upacara Bendera 17-an Rutin",
				Tanggal:    todayStr,
				JamMulai:   "08:00",
				JamSelesai: "09:00",
				Lokasi:     "Lapangan Utama UNPAK / Fakultas Teknik",
				Deskripsi:  "Upacara bendera rutin tanggal 17 setiap bulan.",
			}
		}

		if ceremonyData != nil && len(ceremonyData.Tanggal) > 10 {
			ceremonyData.Tanggal = ceremonyData.Tanggal[:10]
		}

		return c.JSON(fiber.Map{
			"has_ceremony": hasCeremony,
			"is_routine_17": isTanggal17,
			"ceremony":     ceremonyData,
		})
	})

	// GET / - List master upacara dengan filter tahun dan bulan
	group.Get("/", func(c *fiber.Ctx) error {
		year := c.Query("tahun")
		if year == "" {
			year = c.Query("year")
		}
		month := c.Query("bulan")
		if month == "" {
			month = c.Query("month")
		}

		list, err := repo.GetAll(c.UserContext(), year, month)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}

		for i := range list {
			if len(list[i].Tanggal) > 10 {
				list[i].Tanggal = list[i].Tanggal[:10]
			}
		}

		return c.JSON(list)
	})

	// GET /:id - Detail jadwal upacara
	group.Get("/:id", func(c *fiber.Ctx) error {
		id, _ := strconv.Atoi(c.Params("id"))
		item, err := repo.GetByID(c.UserContext(), uint(id))
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if item == nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Jadwal upacara tidak ditemukan"})
		}
		if len(item.Tanggal) > 10 {
			item.Tanggal = item.Tanggal[:10]
		}
		return c.JSON(item)
	})

	// POST / - Tambah jadwal master upacara
	group.Post("/", func(c *fiber.Ctx) error {
		var req struct {
			Nama       string `json:"nama"`
			Tanggal    string `json:"tanggal"`
			JamMulai   string `json:"jam_mulai"`
			JamSelesai string `json:"jam_selesai"`
			Lokasi     string `json:"lokasi"`
			Deskripsi  string `json:"deskripsi"`
		}
		_ = c.BodyParser(&req)

		if req.Nama == "" {
			req.Nama = c.FormValue("nama")
		}
		if req.Tanggal == "" {
			req.Tanggal = c.FormValue("tanggal")
		}
		if req.JamMulai == "" {
			req.JamMulai = c.FormValue("jam_mulai")
		}
		if req.JamSelesai == "" {
			req.JamSelesai = c.FormValue("jam_selesai")
		}
		if req.Lokasi == "" {
			req.Lokasi = c.FormValue("lokasi")
		}
		if req.Deskripsi == "" {
			req.Deskripsi = c.FormValue("deskripsi")
		}

		if strings.TrimSpace(req.Nama) == "" || strings.TrimSpace(req.Tanggal) == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Nama upacara dan tanggal wajib diisi",
			})
		}

		if req.JamMulai == "" {
			req.JamMulai = "08:00"
		}
		if req.JamSelesai == "" {
			req.JamSelesai = "09:00"
		}
		if req.Lokasi == "" {
			req.Lokasi = "Teknik / Lapangan"
		}

		now := time.Now()
		tgl := strings.TrimSpace(req.Tanggal)
		if len(tgl) > 10 {
			tgl = tgl[:10]
		}
		item := domain.MasterUpacara{
			Nama:       strings.TrimSpace(req.Nama),
			Tanggal:    tgl,
			JamMulai:   strings.TrimSpace(req.JamMulai),
			JamSelesai: strings.TrimSpace(req.JamSelesai),
			Lokasi:     strings.TrimSpace(req.Lokasi),
			Deskripsi:  strings.TrimSpace(req.Deskripsi),
			CreatedAt:  &now,
			UpdatedAt:  &now,
		}

		err := repo.Create(c.UserContext(), &item)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}

		return c.Status(fiber.StatusCreated).JSON(item)
	})

	// PUT /:id - Edit jadwal master upacara
	group.Put("/:id", func(c *fiber.Ctx) error {
		id, _ := strconv.Atoi(c.Params("id"))
		item, err := repo.GetByID(c.UserContext(), uint(id))
		if err != nil || item == nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Jadwal upacara tidak ditemukan"})
		}

		var req struct {
			Nama       string `json:"nama"`
			Tanggal    string `json:"tanggal"`
			JamMulai   string `json:"jam_mulai"`
			JamSelesai string `json:"jam_selesai"`
			Lokasi     string `json:"lokasi"`
			Deskripsi  string `json:"deskripsi"`
		}
		_ = c.BodyParser(&req)

		if req.Nama != "" {
			item.Nama = strings.TrimSpace(req.Nama)
		}
		if req.Tanggal != "" {
			tgl := strings.TrimSpace(req.Tanggal)
			if len(tgl) > 10 {
				tgl = tgl[:10]
			}
			item.Tanggal = tgl
		}
		if req.JamMulai != "" {
			item.JamMulai = strings.TrimSpace(req.JamMulai)
		}
		if req.JamSelesai != "" {
			item.JamSelesai = strings.TrimSpace(req.JamSelesai)
		}
		if req.Lokasi != "" {
			item.Lokasi = strings.TrimSpace(req.Lokasi)
		}
		if req.Deskripsi != "" {
			item.Deskripsi = strings.TrimSpace(req.Deskripsi)
		}
		now := time.Now()
		item.UpdatedAt = &now

		err = repo.Update(c.UserContext(), item)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}

		return c.JSON(item)
	})

	// DELETE /:id - Hapus jadwal master upacara
	group.Delete("/:id", func(c *fiber.Ctx) error {
		id, _ := strconv.Atoi(c.Params("id"))
		err := repo.Delete(c.UserContext(), uint(id))
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		return c.JSON(fiber.Map{"success": true})
	})
}

func ModuleCeremonyAttendance(app *fiber.App, db *gorm.DB) {
	groupV2 := app.Group("/api/v2/ceremony-attendance", commonpresentation.JWTMiddleware(), commonpresentation.RBACMiddleware())
	registerCeremonyAttendanceRoutes(groupV2)

	groupV1 := app.Group("/api/ceremony-attendance", commonpresentation.JWTMiddleware(), commonpresentation.RBACMiddleware())
	registerCeremonyAttendanceRoutes(groupV1)

	// Master Upacara CRUD Routes
	masterRepo := infra.NewMasterUpacaraRepository(db)
	masterGroupV2 := app.Group("/api/v2/master-upacara", commonpresentation.JWTMiddleware(), commonpresentation.RBACMiddleware())
	registerMasterUpacaraRoutes(masterGroupV2, masterRepo)

	masterGroupV1 := app.Group("/api/master-upacara", commonpresentation.JWTMiddleware(), commonpresentation.RBACMiddleware())
	registerMasterUpacaraRoutes(masterGroupV1, masterRepo)
}

