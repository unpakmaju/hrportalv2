package presentation

import (
	"strconv"

	common "hrportal_backend/common/domain"
	"hrportal_backend/common/infrastructure"
	commonpresentation "hrportal_backend/common/presentation"
	"hrportal_backend/modules/ceremony_attendance/application/CreateAbsenUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/CreateMasterUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/DeleteAbsenUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/DeleteMasterUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/GetAbsenUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/GetAllAbsenUpacaras"
	"hrportal_backend/modules/ceremony_attendance/application/GetAllMasterUpacaras"
	"hrportal_backend/modules/ceremony_attendance/application/GetMasterUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/GetTodayMasterUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/UpdateAbsenUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/UpdateMasterUpacara"
	"hrportal_backend/modules/ceremony_attendance/domain"

	"github.com/gofiber/fiber/v2"
	"github.com/mehdihadeli/go-mediatr"
	"gorm.io/gorm"
)

func registerCeremonyAttendanceRoutes(group fiber.Router) {

	group.Post("/", func(c *fiber.Ctx) error {
		command := CreateAbsenUpacara.CreateAbsenUpacaraCommand{
			Nip:      c.FormValue("nip"),
			Nidn:     c.FormValue("nidn"),
			Nama:     c.FormValue("nama"),
			Tanggal:  c.FormValue("tanggal"),
			Unit:     c.FormValue("unit"),
			Fakultas: c.FormValue("fakultas"),
			Prodi:    c.FormValue("prodi"),
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
		nip := c.FormValue("nip")
		if nip == "" {
			nip = c.Query("nip")
		}
		nidn := c.FormValue("nidn")
		if nidn == "" {
			nidn = c.Query("nidn")
		}
		tanggal := c.FormValue("tanggal")
		if tanggal == "" {
			tanggal = c.Query("tanggal")
		}

		query := GetAllAbsenUpacaras.GetAllAbsenUpacarasQuery{
			Nip:     nip,
			Nidn:    nidn,
			Tanggal: tanggal,
		}

		res, err := mediatr.Send[*GetAllAbsenUpacaras.GetAllAbsenUpacarasQuery, common.ResultValue[[]domain.AbsenUpacara]](c.UserContext(), &query)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}

		for i := range res.Value {
			if len(res.Value[i].Tanggal) > 10 {
				res.Value[i].Tanggal = res.Value[i].Tanggal[:10]
			}
		}

		pagedData := common.NewPaged(res.Value, int64(len(res.Value)), 1, len(res.Value))
		sseAdapter := &commonpresentation.SSEAdapter[domain.AbsenUpacara]{}

		return sseAdapter.Send(c, pagedData)
	})
}

func registerMasterUpacaraRoutes(group fiber.Router) {
	// GET /today - cek apakah ada jadwal upacara hari ini (CQRS Query)
	group.Get("/today", func(c *fiber.Ctx) error {
		query := GetTodayMasterUpacara.GetTodayMasterUpacaraQuery{
			Date: c.Query("date"),
		}

		res, err := mediatr.Send[*GetTodayMasterUpacara.GetTodayMasterUpacaraQuery, common.ResultValue[*GetTodayMasterUpacara.TodayMasterUpacaraDto]](c.UserContext(), &query)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}

		return c.JSON(res.Value)
	})

	// GET / - List master upacara dengan filter tahun dan bulan (CQRS Query)
	group.Get("/", func(c *fiber.Ctx) error {
		year := c.Query("tahun")
		if year == "" {
			year = c.Query("year")
		}
		month := c.Query("bulan")
		if month == "" {
			month = c.Query("month")
		}

		query := GetAllMasterUpacaras.GetAllMasterUpacarasQuery{
			Year:  year,
			Month: month,
		}

		res, err := mediatr.Send[*GetAllMasterUpacaras.GetAllMasterUpacarasQuery, common.ResultValue[[]domain.MasterUpacara]](c.UserContext(), &query)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}

		return c.JSON(res.Value)
	})

	// GET /:id - Detail jadwal upacara (CQRS Query)
	group.Get("/:id", func(c *fiber.Ctx) error {
		id, _ := strconv.Atoi(c.Params("id"))

		query := GetMasterUpacara.GetMasterUpacaraQuery{
			ID: uint(id),
		}

		res, err := mediatr.Send[*GetMasterUpacara.GetMasterUpacaraQuery, common.ResultValue[*domain.MasterUpacara]](c.UserContext(), &query)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}

		return c.JSON(res.Value)
	})

	// POST / - Tambah jadwal master upacara (CQRS Command)
	group.Post("/", func(c *fiber.Ctx) error {
		nama := c.FormValue("event")
		command := CreateMasterUpacara.CreateMasterUpacaraCommand{
			Nama:       nama,
			Tanggal:    c.FormValue("tanggal"),
			JamMulai:   c.FormValue("jam_mulai"),
			JamSelesai: c.FormValue("jam_selesai"),
			Lokasi:     c.FormValue("lokasi"),
			Deskripsi:  c.FormValue("deskripsi"),
		}

		if command.Nama == "" && command.Tanggal == "" {
			_ = c.BodyParser(&command)
		}

		res, err := mediatr.Send[*CreateMasterUpacara.CreateMasterUpacaraCommand, common.ResultValue[*domain.MasterUpacara]](c.UserContext(), &command)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}

		return c.Status(fiber.StatusCreated).JSON(res.Value)
	})

	// PUT /:id - Edit jadwal master upacara (CQRS Command)
	group.Put("/:id", func(c *fiber.Ctx) error {
		id, _ := strconv.Atoi(c.Params("id"))
		nama := c.FormValue("event")
		command := UpdateMasterUpacara.UpdateMasterUpacaraCommand{
			ID:         uint(id),
			Nama:       nama,
			Tanggal:    c.FormValue("tanggal"),
			JamMulai:   c.FormValue("jam_mulai"),
			JamSelesai: c.FormValue("jam_selesai"),
			Lokasi:     c.FormValue("lokasi"),
			Deskripsi:  c.FormValue("deskripsi"),
		}

		if command.Nama == "" && command.Tanggal == "" {
			_ = c.BodyParser(&command)
			command.ID = uint(id)
		}

		res, err := mediatr.Send[*UpdateMasterUpacara.UpdateMasterUpacaraCommand, common.ResultValue[*domain.MasterUpacara]](c.UserContext(), &command)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}

		return c.JSON(res.Value)
	})

	// DELETE /:id - Hapus jadwal master upacara (CQRS Command)
	group.Delete("/:id", func(c *fiber.Ctx) error {
		id, _ := strconv.Atoi(c.Params("id"))

		command := DeleteMasterUpacara.DeleteMasterUpacaraCommand{
			ID: uint(id),
		}

		res, err := mediatr.Send[*DeleteMasterUpacara.DeleteMasterUpacaraCommand, common.ResultValue[bool]](c.UserContext(), &command)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}

		return c.JSON(fiber.Map{"success": res.Value})
	})
}

func ModuleCeremonyAttendance(app *fiber.App, db *gorm.DB) {
	groupV2 := app.Group("/api/v2/ceremony-attendance", commonpresentation.JWTMiddleware(), commonpresentation.RBACMiddleware())
	registerCeremonyAttendanceRoutes(groupV2)

	groupV1 := app.Group("/api/ceremony-attendance", commonpresentation.JWTMiddleware(), commonpresentation.RBACMiddleware())
	registerCeremonyAttendanceRoutes(groupV1)

	// Master Upacara CRUD Routes (CQRS & Mediatr)
	masterGroupV2 := app.Group("/api/v2/master-upacara", commonpresentation.JWTMiddleware(), commonpresentation.RBACMiddleware())
	registerMasterUpacaraRoutes(masterGroupV2)

	masterGroupV1 := app.Group("/api/master-upacara", commonpresentation.JWTMiddleware(), commonpresentation.RBACMiddleware())
	registerMasterUpacaraRoutes(masterGroupV1)
}
