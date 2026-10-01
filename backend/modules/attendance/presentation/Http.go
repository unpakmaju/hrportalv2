package presentation

import (
	"context"
	"strconv"
	"strings"
	"time"

	common "hrportal_backend/common/domain"
	"hrportal_backend/common/helper"
	"hrportal_backend/common/infrastructure"
	commonpresentation "hrportal_backend/common/presentation"
	"hrportal_backend/modules/attendance/application/CheckIn"
	"hrportal_backend/modules/attendance/application/CheckOut"
	"hrportal_backend/modules/attendance/application/DeleteEmptyAttendance"
	"hrportal_backend/modules/attendance/application/GetAttendanceHistory"
	"hrportal_backend/modules/attendance/domain"
	"hrportal_backend/modules/notification/application/CreateNotification"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/mehdihadeli/go-mediatr"
)

func ModuleAttendance(app *fiber.App) {
	// WebSocket Endpoint for Real-time Attendance Stream (Initial State Snapshot + Live Broadcast Delta)
	app.Get("/ws/attendance", websocket.New(func(c *websocket.Conn) {
		nip := c.Query("nip")
		nidn := c.Query("nidn")
		if nip == "" && nidn == "" {
			return
		}

		GlobalAttendanceWsHub.RegisterUser(nip, nidn, c)
		defer GlobalAttendanceWsHub.UnregisterUser(nip, nidn)

		// Send initial state snapshot for active shift
		query := &GetAttendanceHistory.GetAttendanceHistoryQuery{
			Nip:  nip,
			Nidn: nidn,
		}
		res, err := mediatr.Send[*GetAttendanceHistory.GetAttendanceHistoryQuery, common.ResultValue[[]domain.Absen]](context.Background(), query)
		if err == nil && res.IsSuccess && len(res.Value) > 0 {
			now := time.Now()
			todayStr := now.Format("2006-01-02")
			yesterdayStr := now.AddDate(0, 0, -1).Format("2006-01-02")
			var selectedRecord *domain.Absen

			for i := range res.Value {
				if res.Value[i].Tanggal == todayStr {
					selectedRecord = &res.Value[i]
					break
				}
				if now.Hour() < 5 && res.Value[i].Tanggal == yesterdayStr && res.Value[i].AbsenMasuk != nil {
					selectedRecord = &res.Value[i]
					break
				}
			}

			if selectedRecord != nil {
				masukStr := ""
				if selectedRecord.AbsenMasuk != nil {
					masukStr = selectedRecord.AbsenMasuk.Format("2006-01-02 15:04:05")
				}
				keluarStr := ""
				if selectedRecord.AbsenKeluar != nil {
					keluarStr = selectedRecord.AbsenKeluar.Format("2006-01-02 15:04:05")
				}

				_ = c.WriteJSON(RealtimeAttendancePayload{
					Type:        "initial_state",
					Nip:         nip,
					Nidn:        nidn,
					Tanggal:     selectedRecord.Tanggal,
					AbsenMasuk:  masukStr,
					AbsenKeluar: keluarStr,
				})
			} else {
				_ = c.WriteJSON(RealtimeAttendancePayload{
					Type:        "initial_state",
					Nip:         nip,
					Nidn:        nidn,
					Tanggal:     todayStr,
					AbsenMasuk:  "",
					AbsenKeluar: "",
				})
			}
		}

		// Keep connection alive & handle incoming WebSocket actions (check_in, check_out, refresh)
		for {
			var msg struct {
				Action    string  `json:"action"`
				Nip       string  `json:"nip"`
				Nidn      string  `json:"nidn"`
				Nama      string  `json:"nama"`
				Unit      string  `json:"unit"`
				Fakultas  string  `json:"fakultas"`
				Prodi     string  `json:"prodi"`
				Latitude  float64 `json:"latitude"`
				Longitude float64 `json:"longitude"`
				Note      string  `json:"note"`
			}

			err := c.ReadJSON(&msg)
			if err != nil {
				break
			}

			if msg.Nip == "" {
				msg.Nip = nip
			}
			if msg.Nidn == "" {
				msg.Nidn = nidn
			}

			switch msg.Action {
			case "check_in":
				cmd := CheckIn.CheckInCommand{
					Nip:         msg.Nip,
					Nidn:        msg.Nidn,
					NamaPegawai: msg.Nama,
					Unit:        msg.Unit,
					Fakultas:    msg.Fakultas,
					Prodi:       msg.Prodi,
					Latitude:    msg.Latitude,
					Longitude:   msg.Longitude,
					Note:        msg.Note,
				}
				res, err := mediatr.Send[*CheckIn.CheckInCommand, common.ResultValue[*domain.Absen]](context.Background(), &cmd)
				if err == nil && res.IsSuccess && res.Value != nil {
					masukStr := ""
					if res.Value.AbsenMasuk != nil {
						masukStr = res.Value.AbsenMasuk.In(time.Local).Format("2006-01-02 15:04:05")
					}
					keluarStr := ""
					if res.Value.AbsenKeluar != nil {
						keluarStr = res.Value.AbsenKeluar.In(time.Local).Format("2006-01-02 15:04:05")
					}

					GlobalAttendanceWsHub.BroadcastToUser(msg.Nip, msg.Nidn, RealtimeAttendancePayload{
						Type:        "check_in",
						Nip:         msg.Nip,
						Nidn:        msg.Nidn,
						Tanggal:     res.Value.Tanggal,
						AbsenMasuk:  masukStr,
						AbsenKeluar: keluarStr,
					})
				}
			case "check_out":
				cmd := CheckOut.CheckOutCommand{
					Nip:  msg.Nip,
					Nidn: msg.Nidn,
				}
				res, err := mediatr.Send[*CheckOut.CheckOutCommand, common.ResultValue[*domain.Absen]](context.Background(), &cmd)
				if err == nil && res.IsSuccess && res.Value != nil {
					masukStr := ""
					if res.Value.AbsenMasuk != nil {
						masukStr = res.Value.AbsenMasuk.In(time.Local).Format("2006-01-02 15:04:05")
					}
					keluarStr := ""
					if res.Value.AbsenKeluar != nil {
						keluarStr = res.Value.AbsenKeluar.In(time.Local).Format("2006-01-02 15:04:05")
					}

					GlobalAttendanceWsHub.BroadcastToUser(msg.Nip, msg.Nidn, RealtimeAttendancePayload{
						Type:        "check_out",
						Nip:         msg.Nip,
						Nidn:        msg.Nidn,
						Tanggal:     res.Value.Tanggal,
						AbsenMasuk:  masukStr,
						AbsenKeluar: keluarStr,
					})
				}
			}
		}
	}))

	registerAttendanceRoutes := func(group fiber.Router) {

		group.Post("/check-in", func(c *fiber.Ctx) error {
			var body struct {
				Nip              string  `json:"nip"`
				Nidn             string  `json:"nidn"`
				Nama             string  `json:"nama"`
				NamaPegawai      string  `json:"nama_pegawai"`
				Unit             string  `json:"unit"`
				Fakultas         string  `json:"fakultas"`
				Prodi            string  `json:"prodi"`
				Latitude         float64 `json:"latitude"`
				Longitude        float64 `json:"longitude"`
				IpAddress        string  `json:"ip_address"`
				Ip               string  `json:"ip"`
				CatatanTelat     string  `json:"catatan_telat"`
				CatatanLuarUnpak string  `json:"catatan_luar_unpak"`
				Note             string  `json:"note"`
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

			nama := body.NamaPegawai
			if nama == "" {
				nama = body.Nama
			}
			if nama == "" {
				nama = c.FormValue("nama")
			}

			lat := body.Latitude
			if lat == 0 {
				lat, _ = strconv.ParseFloat(c.FormValue("latitude"), 64)
			}
			lon := body.Longitude
			if lon == 0 {
				lon, _ = strconv.ParseFloat(c.FormValue("longitude"), 64)
			}

			ip := body.IpAddress
			if ip == "" {
				ip = body.Ip
			}
			if ip == "" {
				ip = c.FormValue("ip_address")
				if ip == "" {
					ip = c.FormValue("ip")
				}
			}
			if ip == "" {
				ip = c.IP()
			}

			catatanLuar := body.CatatanLuarUnpak
			if catatanLuar == "" {
				catatanLuar = c.FormValue("catatan_luar_unpak")
			}

			note := body.Note
			if note == "" {
				note = body.CatatanTelat
			}
			if note == "" {
				note = c.FormValue("note")
			}
			if note == "" {
				note = c.FormValue("catatan_telat")
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

			command := CheckIn.CheckInCommand{
				Nip:              nip,
				Nidn:             nidn,
				NamaPegawai:      nama,
				Unit:             unit,
				Fakultas:         fakultas,
				Prodi:            prodi,
				Latitude:         lat,
				Longitude:        lon,
				IpAddress:        ip,
				CatatanLuarUnpak: catatanLuar,
				Note:             note,
			}

			res, err := mediatr.Send[*CheckIn.CheckInCommand, common.ResultValue[*domain.Absen]](c.UserContext(), &command)
			if err != nil {
				return infrastructure.HandleError(c, err)
			}

			if !res.IsSuccess {
				return infrastructure.HandleError(c, res.Error)
			}

			// Trigger FCM Notification & WebSocket Broadcast for Check-In Success (Only when CREATED, not updated)
			if res.Value != nil && res.Value.IsCreated {
				absenData := res.Value
				masukStr := ""
				if absenData.AbsenMasuk != nil {
					masukStr = absenData.AbsenMasuk.Format("2006-01-02 15:04:05")
				}
				GlobalAttendanceWsHub.BroadcastToUser(absenData.Nip, absenData.Nidn, RealtimeAttendancePayload{
					Type:       "check_in",
					Nip:        absenData.Nip,
					Nidn:       absenData.Nidn,
					Tanggal:    absenData.Tanggal,
					AbsenMasuk: masukStr,
				})
			}

			return c.JSON(res.Value)
		})

		group.Post("/check-out", func(c *fiber.Ctx) error {
			var body struct {
				Nip                   string `json:"nip"`
				Nidn                  string `json:"nidn"`
				CatatanPulang         string `json:"catatan_pulang"`
				Note                  string `json:"note"`
				IpAddress             string `json:"ip_address"`
				Ip                    string `json:"ip"`
				CatatanHasilLuarUnpak string `json:"catatan_hasil_luar_unpak"`
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

			note := body.CatatanPulang
			if note == "" {
				note = body.Note
			}
			if note == "" {
				note = c.FormValue("catatan_pulang")
			}
			if note == "" {
				note = c.FormValue("note")
			}

			ip := body.IpAddress
			if ip == "" {
				ip = body.Ip
			}
			if ip == "" {
				ip = c.FormValue("ip_address")
				if ip == "" {
					ip = c.FormValue("ip")
				}
			}
			if ip == "" {
				ip = c.IP()
			}

			catatanHasil := body.CatatanHasilLuarUnpak
			if catatanHasil == "" {
				catatanHasil = c.FormValue("catatan_hasil_luar_unpak")
			}

			command := CheckOut.CheckOutCommand{
				Nip:                   nip,
				Nidn:                  nidn,
				Note:                  note,
				IpAddress:             ip,
				CatatanHasilLuarUnpak: catatanHasil,
			}

			res, err := mediatr.Send[*CheckOut.CheckOutCommand, common.ResultValue[*domain.Absen]](c.UserContext(), &command)
			if err != nil {
				return infrastructure.HandleError(c, err)
			}

			if !res.IsSuccess {
				return infrastructure.HandleError(c, res.Error)
			}

			// Trigger FCM Notification & WebSocket Broadcast for Check-Out Success (Only when CREATED, not updated)
			if res.Value != nil && res.Value.IsCreated {
				absenData := res.Value
				keluarStr := ""
				if absenData.AbsenKeluar != nil {
					keluarStr = absenData.AbsenKeluar.Format("2006-01-02 15:04:05")
				}
				GlobalAttendanceWsHub.BroadcastToUser(absenData.Nip, absenData.Nidn, RealtimeAttendancePayload{
					Type:        "check_out",
					Nip:         absenData.Nip,
					Nidn:        absenData.Nidn,
					Tanggal:     absenData.Tanggal,
					AbsenKeluar: keluarStr,
				})
			}

			return c.JSON(res.Value)
		})

		group.Post("/notify-fail", func(c *fiber.Ctx) error {
			nip := c.FormValue("nip")
			reason := c.FormValue("reason")
			if reason == "" {
				reason = "sistem gagal melakukan absensi otomatis karena anda berada di luar radius kampus / tidak terkoneksi jaringan, butuh presensi manual"
			}

			if nip != "" {
				_, _ = mediatr.Send[*CreateNotification.CreateNotificationCommand, common.ResultValue[bool]](c.UserContext(), &CreateNotification.CreateNotificationCommand{
					TargetNips: []string{nip},
					Title:      "Presensi Otomatis Gagal",
					Body:       reason,
					Type:       "attendance_fail",
					Payload:    map[string]string{"type": "fail"},
				})
				return c.JSON(fiber.Map{"status": "ok", "message": "Notification command dispatched"})
			}
			return c.Status(400).JSON(fiber.Map{"error": "Missing nip"})
		})

		group.Get("/history", func(c *fiber.Ctx) error {
			nidn := c.FormValue("nidn")
			if nidn == "" {
				nidn = c.Query("nidn")
			}
			nip := c.FormValue("nip")
			if nip == "" {
				nip = c.Query("nip")
			}
			query := &GetAttendanceHistory.GetAttendanceHistoryQuery{
				Nidn:         nidn,
				Nip:          nip,
				TanggalMulai: helper.StrPtr(c.Query("tanggal_mulai")),
				TanggalAkhir: helper.StrPtr(c.Query("tanggal_akhir")),
			}

			res, err := mediatr.Send[*GetAttendanceHistory.GetAttendanceHistoryQuery, common.ResultValue[[]domain.Absen]](c.UserContext(), query)
			if err != nil {
				return infrastructure.HandleError(c, err)
			}

			if !res.IsSuccess {
				return infrastructure.HandleError(c, res.Error)
			}

			return c.JSON(res.Value)
		})

		group.Delete("/empty-masuk", func(c *fiber.Ctx) error {
			command := DeleteEmptyAttendance.DeleteEmptyAttendanceCommand{}

			res, err := mediatr.Send[*DeleteEmptyAttendance.DeleteEmptyAttendanceCommand, common.ResultValue[int64]](c.UserContext(), &command)
			if err != nil {
				return infrastructure.HandleError(c, err)
			}

			if !res.IsSuccess {
				return infrastructure.HandleError(c, res.Error)
			}

			return c.JSON(fiber.Map{
				"status":        "success",
				"message":       "Data absen dengan absen_masuk kosong berhasil dihapus",
				"deleted_count": res.Value,
			})
		})
	}

	groupV2 := app.Group("/api/v2/attendance", commonpresentation.JWTMiddleware(), commonpresentation.RBACMiddleware())
	registerAttendanceRoutes(groupV2)

	groupV1 := app.Group("/api/attendance", commonpresentation.JWTMiddleware(), commonpresentation.RBACMiddleware())
	registerAttendanceRoutes(groupV1)
}
