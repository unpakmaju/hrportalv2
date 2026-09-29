package infrastructure

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"hrportal_backend/modules/report/domain"

	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"
)

func GenerateUUIDv4() string {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	if err != nil {
		return fmt.Sprintf("job-%d", time.Now().UnixNano())
	}
	b[6] = (b[6] & 0x0f) | 0x40 // Version 4
	b[8] = (b[8] & 0x3f) | 0x80 // Variant 10
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

type ExportWorker struct {
	db   *gorm.DB
	repo domain.IReportRepository
}

func NewExportWorker(db *gorm.DB, repo domain.IReportRepository) *ExportWorker {
	_ = os.MkdirAll("exports", 0755)
	return &ExportWorker{db: db, repo: repo}
}

func (w *ExportWorker) CreateJob(ctx context.Context, tglMulai, tglAkhir string) (*domain.ExportJob, error) {
	taskId := GenerateUUIDv4()
	job := &domain.ExportJob{
		TaskID:       taskId,
		TanggalMulai: tglMulai,
		TanggalAkhir: tglAkhir,
		Status:       "pending",
		Progress:     0,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	err := w.db.WithContext(ctx).Create(job).Error
	if err != nil {
		return nil, err
	}
	return job, nil
}

func (w *ExportWorker) GetJobStatus(ctx context.Context, taskId string) (*domain.ExportJob, error) {
	var job domain.ExportJob
	err := w.db.WithContext(ctx).Where("task_id = ?", taskId).First(&job).Error
	if err != nil {
		return nil, err
	}
	return &job, nil
}

// ProcessQueueLoop processes queued export jobs continuously (for standalone worker binary)
func (w *ExportWorker) ProcessQueueLoop() {
	log.Println("[Export Worker] Standalone Export Queue Worker active. Polling for pending jobs...")
	w.startQueueProcessor()
}

func (w *ExportWorker) startQueueProcessor() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		var pendingJob domain.ExportJob
		err := w.db.Where("status = ?", "pending").Order("created_at ASC").First(&pendingJob).Error
		if err != nil {
			continue
		}

		w.processSingleJob(&pendingJob)
	}
}

type exportEvent struct {
	Type   string
	Masuk  string
	Keluar string
	Status string
}

func getExportEventPriority(eventType, status string) int {
	statusLower := strings.ToLower(status)
	if strings.Contains(statusLower, "tolak") {
		return 0
	}
	typeLower := strings.ToLower(eventType)
	if strings.Contains(typeLower, "absen") || typeLower == "masuk" {
		return 100
	} else if strings.Contains(typeLower, "izin") || strings.Contains(typeLower, "cuti") || strings.Contains(typeLower, "sppd") {
		return 80
	} else if strings.Contains(typeLower, "upacara") {
		return 10
	}
	return 1
}

func parseCleanDate(str string) (time.Time, error) {
	if len(str) >= 10 {
		return time.Parse("2006-01-02", str[:10])
	}
	return time.Parse("2006-01-02", str)
}

func (w *ExportWorker) processSingleJob(job *domain.ExportJob) {
	log.Printf("[ExportWorker] Processing job %s (%s s/d %s)...", job.TaskID, job.TanggalMulai, job.TanggalAkhir)
	w.db.Model(job).Updates(map[string]interface{}{
		"status":   "processing",
		"progress": 10,
	})

	startDt, errP := parseCleanDate(job.TanggalMulai)
	if errP != nil {
		startDt = time.Now()
	}

	// 1. Calendar Period
	calStartStr := job.TanggalMulai
	calEndStr := job.TanggalAkhir

	// 2. Cutoff Period (15th of prev month to 15th of current month)
	prevMonth15 := time.Date(startDt.Year(), startDt.Month()-1, 15, 0, 0, 0, 0, time.UTC)
	currMonth15 := time.Date(startDt.Year(), startDt.Month(), 15, 0, 0, 0, 0, time.UTC)
	cutoffStartStr := prevMonth15.Format("2006-01-02")
	cutoffEndStr := currMonth15.Format("2006-01-02")

	excelFile := excelize.NewFile()
	sheet1Name := "Tab 01 - 31 (Kalender)"
	sheet2Name := "Tab 16 - 15 (Cutoff)"
	sheet3Name := "Presensi Upacara"

	excelFile.SetSheetName("Sheet1", sheet1Name)
	excelFile.NewSheet(sheet2Name)
	excelFile.NewSheet(sheet3Name)

	// Collect Holidays from master_libur
	holidays := make(map[string]bool)
	var holidayDates []string
	w.db.Raw("SELECT tanggal FROM master_libur").Scan(&holidayDates)
	for _, hDate := range holidayDates {
		if len(hDate) >= 10 {
			holidays[hDate[:10]] = true
		}
	}

	// Helper to populate daily matrix sheets (Sheet 1 & Sheet 2)
	populateDailySheet := func(sheetName, startDateStr, endDateStr string, progressValue int) {
		ctx := context.Background()
		dataList, err := w.repo.GetLaporanMergedParallel(ctx, startDateStr, endDateStr, "", "", "")
		if err != nil {
			log.Printf("[ExportWorker] Error fetching data for sheet %s: %v", sheetName, err)
			return
		}

		rawEventMap := make(map[string]map[string][]exportEvent)
		addEvent := func(nipVal, nidnVal, dateStr string, ev exportEvent) {
			if dateStr == "" {
				return
			}
			cleanDate := dateStr
			if len(cleanDate) >= 10 {
				cleanDate = cleanDate[:10]
			}
			if nipVal != "" {
				if rawEventMap[nipVal] == nil {
					rawEventMap[nipVal] = make(map[string][]exportEvent)
				}
				rawEventMap[nipVal][cleanDate] = append(rawEventMap[nipVal][cleanDate], ev)
			}
			if nidnVal != "" && nidnVal != nipVal {
				if rawEventMap[nidnVal] == nil {
					rawEventMap[nidnVal] = make(map[string][]exportEvent)
				}
				rawEventMap[nidnVal][cleanDate] = append(rawEventMap[nidnVal][cleanDate], ev)
			}
		}

		// 1. Absen
		type AbsenRow struct {
			Nip         sql.NullString `gorm:"column:nip"`
			Nidn        sql.NullString `gorm:"column:nidn"`
			Tanggal     sql.NullString `gorm:"column:tanggal"`
			AbsenMasuk  sql.NullString `gorm:"column:absen_masuk"`
			AbsenKeluar sql.NullString `gorm:"column:absen_keluar"`
			Note        sql.NullString `gorm:"column:note"`
		}
		var absenRows []AbsenRow
		w.db.Raw("SELECT nip, nidn, tanggal, absen_masuk, absen_keluar, note FROM absen WHERE tanggal >= ? AND tanggal <= ?", startDateStr, endDateStr).Scan(&absenRows)
		for _, r := range absenRows {
			mStr := ""
			if r.AbsenMasuk.Valid && len(r.AbsenMasuk.String) >= 16 {
				mStr = r.AbsenMasuk.String[11:16]
			}
			kStr := ""
			if r.AbsenKeluar.Valid && len(r.AbsenKeluar.String) >= 16 {
				kStr = r.AbsenKeluar.String[11:16]
			}
			addEvent(r.Nip.String, r.Nidn.String, r.Tanggal.String, exportEvent{
				Type:   "absen",
				Masuk:  mStr,
				Keluar: kStr,
				Status: r.Note.String,
			})
		}

		// 2. Izin
		type IzinRow struct {
			Nip              sql.NullString `gorm:"column:nip"`
			Nidn             sql.NullString `gorm:"column:nidn"`
			TanggalPengajuan sql.NullString `gorm:"column:tanggal_pengajuan"`
			Status           sql.NullString `gorm:"column:status"`
		}
		var izinRows []IzinRow
		w.db.Raw("SELECT nip, nidn, tanggal_pengajuan, status FROM izin WHERE LOWER(TRIM(status)) = 'terima sdm'").Scan(&izinRows)
		for _, r := range izinRows {
			addEvent(r.Nip.String, r.Nidn.String, r.TanggalPengajuan.String, exportEvent{
				Type:   "izin",
				Status: r.Status.String,
			})
		}

		// 3. Cuti
		type CutiRow struct {
			Nip          sql.NullString `gorm:"column:nip"`
			Nidn         sql.NullString `gorm:"column:nidn"`
			TanggalMulai sql.NullString `gorm:"column:tanggal_mulai"`
			TanggalAkhir sql.NullString `gorm:"column:tanggal_akhir"`
			Status       sql.NullString `gorm:"column:status"`
		}
		var cutiRows []CutiRow
		w.db.Raw("SELECT nip, nidn, tanggal_mulai, tanggal_akhir, status FROM cuti WHERE tanggal_mulai <= ? AND tanggal_akhir >= ? AND LOWER(TRIM(status)) = 'terima sdm'", endDateStr, startDateStr).Scan(&cutiRows)
		for _, r := range cutiRows {
			sDt, errS := parseCleanDate(r.TanggalMulai.String)
			eDt, errE := parseCleanDate(r.TanggalAkhir.String)
			if errS == nil && errE == nil {
				for cur := sDt; !cur.After(eDt); cur = cur.AddDate(0, 0, 1) {
					addEvent(r.Nip.String, r.Nidn.String, cur.Format("2006-01-02"), exportEvent{
						Type:   "cuti",
						Status: r.Status.String,
					})
				}
			}
		}

		// 4. SPPD & Members
		type SppdRow struct {
			ID               int            `gorm:"column:id"`
			Nip              sql.NullString `gorm:"column:nip"`
			Nidn             sql.NullString `gorm:"column:nidn"`
			TanggalBerangkat sql.NullString `gorm:"column:tanggal_berangkat"`
			TanggalKembali   sql.NullString `gorm:"column:tanggal_kembali"`
			Status           sql.NullString `gorm:"column:status"`
		}
		var sppdRows []SppdRow
		w.db.Raw("SELECT id, nip, nidn, tanggal_berangkat, tanggal_kembali, status FROM sppd WHERE tanggal_berangkat <= ? AND tanggal_kembali >= ? AND LOWER(TRIM(status)) = 'terima sdm'", endDateStr, startDateStr).Scan(&sppdRows)
		for _, r := range sppdRows {
			type Memb struct{ nip, nidn string }
			members := []Memb{}
			if r.Nip.String != "" || r.Nidn.String != "" {
				members = append(members, Memb{r.Nip.String, r.Nidn.String})
			}

			type MembRow struct {
				Nip  sql.NullString `gorm:"column:nip"`
				Nidn sql.NullString `gorm:"column:nidn"`
			}
			var membRows []MembRow
			w.db.Raw("SELECT nip, nidn FROM sppd_anggota WHERE id_sppd = ?", r.ID).Scan(&membRows)
			for _, m := range membRows {
				if m.Nip.String != "" || m.Nidn.String != "" {
					members = append(members, Memb{m.Nip.String, m.Nidn.String})
				}
			}

			sDt, errS := parseCleanDate(r.TanggalBerangkat.String)
			eDt, errE := parseCleanDate(r.TanggalKembali.String)
			if errS == nil && errE == nil {
				for _, m := range members {
					for cur := sDt; !cur.After(eDt); cur = cur.AddDate(0, 0, 1) {
						addEvent(m.nip, m.nidn, cur.Format("2006-01-02"), exportEvent{
							Type:   "sppd",
							Status: r.Status.String,
						})
					}
				}
			}
		}

		// Define Excel Styles
		borderStyle := []excelize.Border{
			{Type: "left", Color: "CCCCCC", Style: 1},
			{Type: "right", Color: "CCCCCC", Style: 1},
			{Type: "top", Color: "CCCCCC", Style: 1},
			{Type: "bottom", Color: "CCCCCC", Style: 1},
		}

		styleHeaderBlue, _ := excelFile.NewStyle(&excelize.Style{
			Fill:      excelize.Fill{Type: "pattern", Color: []string{"0047AB"}, Pattern: 1},
			Font:      &excelize.Font{Bold: true, Color: "FFFFFF", Size: 10},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
			Border:    borderStyle,
		})
		styleHeaderRed, _ := excelFile.NewStyle(&excelize.Style{
			Fill:      excelize.Fill{Type: "pattern", Color: []string{"B02A37"}, Pattern: 1},
			Font:      &excelize.Font{Bold: true, Color: "FFFFFF", Size: 10},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
			Border:    borderStyle,
		})

		styleInfoCell, _ := excelFile.NewStyle(&excelize.Style{
			Font:      &excelize.Font{Size: 10, Color: "000000"},
			Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "center"},
			Border:    borderStyle,
		})
		styleInfoCenter, _ := excelFile.NewStyle(&excelize.Style{
			Font:      &excelize.Font{Size: 10, Color: "000000"},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
			Border:    borderStyle,
		})

		styleAbsen, _ := excelFile.NewStyle(&excelize.Style{
			Fill:      excelize.Fill{Type: "pattern", Color: []string{"D1E7DD"}, Pattern: 1},
			Font:      &excelize.Font{Color: "0F5132", Size: 10, Bold: true},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
			Border:    borderStyle,
		})
		styleIzin, _ := excelFile.NewStyle(&excelize.Style{
			Fill:      excelize.Fill{Type: "pattern", Color: []string{"FFF3CD"}, Pattern: 1},
			Font:      &excelize.Font{Color: "664D03", Size: 10, Bold: true},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
			Border:    borderStyle,
		})
		styleCuti, _ := excelFile.NewStyle(&excelize.Style{
			Fill:      excelize.Fill{Type: "pattern", Color: []string{"FFE6D5"}, Pattern: 1},
			Font:      &excelize.Font{Color: "843900", Size: 10, Bold: true},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
			Border:    borderStyle,
		})
		styleSppd, _ := excelFile.NewStyle(&excelize.Style{
			Fill:      excelize.Fill{Type: "pattern", Color: []string{"E2D9F3"}, Pattern: 1},
			Font:      &excelize.Font{Color: "432874", Size: 10, Bold: true},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
			Border:    borderStyle,
		})
		styleRed, _ := excelFile.NewStyle(&excelize.Style{
			Fill:      excelize.Fill{Type: "pattern", Color: []string{"F8D7DA"}, Pattern: 1},
			Font:      &excelize.Font{Color: "842029", Size: 10},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
			Border:    borderStyle,
		})

		// Dates List
		sDt, _ := parseCleanDate(startDateStr)
		eDt, _ := parseCleanDate(endDateStr)
		if eDt.Before(sDt) {
			eDt = sDt
		}
		var dates []string
		for cur := sDt; !cur.After(eDt); cur = cur.AddDate(0, 0, 1) {
			dates = append(dates, cur.Format("2006-01-02"))
		}

		headerTitles := []string{"No", "NIP", "NIDN", "Nama Pegawai", "Unit Kerja", "Total Presensi"}
		for _, d := range dates {
			dt, _ := parseCleanDate(d)
			headerTitles = append(headerTitles, dt.Format("02/01"))
		}

		for colIdx, hTitle := range headerTitles {
			cellName, _ := excelize.CoordinatesToCellName(colIdx+1, 1)
			excelFile.SetCellValue(sheetName, cellName, hTitle)

			if colIdx >= 6 {
				dStr := dates[colIdx-6]
				dt, _ := parseCleanDate(dStr)
				if dt.Weekday() == time.Sunday || holidays[dStr] {
					excelFile.SetCellStyle(sheetName, cellName, cellName, styleHeaderRed)
				} else {
					excelFile.SetCellStyle(sheetName, cellName, cellName, styleHeaderBlue)
				}
			} else {
				excelFile.SetCellStyle(sheetName, cellName, cellName, styleHeaderBlue)
			}
		}

		for idx, emp := range dataList {
			rowNum := idx + 2
			var nipStr, nidnStr, namaStr, unitStr string

			b, _ := json.Marshal(emp.Pengguna)
			var m map[string]interface{}
			_ = json.Unmarshal(b, &m)
			if m != nil {
				nipStr, _ = m["nip"].(string)
				nidnStr, _ = m["nidn"].(string)
				namaStr, _ = m["nama"].(string)
				unitStr, _ = m["unit_kerja"].(string)
				if unitStr == "" {
					unitStr, _ = m["unit"].(string)
				}
			}

			if nipStr == "" {
				nipStr = "-"
			}
			if nidnStr == "" {
				nidnStr = "-"
			}

			empEvents := rawEventMap[nipStr]
			if len(empEvents) == 0 && nidnStr != "-" {
				empEvents = rawEventMap[nidnStr]
			}

			totalPresensi := 0
			var dateCells []string
			var cellStyles []int

			for _, d := range dates {
				dt, _ := parseCleanDate(d)
				isSunday := dt.Weekday() == time.Sunday
				isHoliday := holidays[d]

				cellText := "Alpa"
				cellStyle := styleRed
				if isSunday {
					cellText = "Minggu"
					cellStyle = styleRed
				} else if isHoliday {
					cellText = "Libur"
					cellStyle = styleRed
				}

				events := empEvents[d]
				if len(events) > 0 {
					bestPriority := 0
					bestEvent := exportEvent{}
					for _, ev := range events {
						p := getExportEventPriority(ev.Type, ev.Status)
						if p > bestPriority {
							bestPriority = p
							bestEvent = ev
						}
					}

					switch bestPriority {
					case 100:
						totalPresensi++
						cellStyle = styleAbsen
						if bestEvent.Masuk != "" {
							if bestEvent.Keluar != "" {
								cellText = fmt.Sprintf("%s - %s", bestEvent.Masuk, bestEvent.Keluar)
							} else {
								cellText = bestEvent.Masuk
							}
						} else {
							cellText = "Absen"
						}
					case 80:
						totalPresensi++
						tLower := strings.ToLower(bestEvent.Type)
						if strings.Contains(tLower, "izin") {
							cellText = "Izin"
							cellStyle = styleIzin
						} else if strings.Contains(tLower, "cuti") {
							cellText = "Cuti"
							cellStyle = styleCuti
						} else if strings.Contains(tLower, "sppd") {
							cellText = "SPPD"
							cellStyle = styleSppd
						}
					}
				}

				dateCells = append(dateCells, cellText)
				cellStyles = append(cellStyles, cellStyle)
			}

			infoValues := []string{
				fmt.Sprintf("%d", idx+1),
				nipStr,
				nidnStr,
				namaStr,
				unitStr,
				fmt.Sprintf("%d", totalPresensi),
			}

			for cIdx, val := range infoValues {
				cellName, _ := excelize.CoordinatesToCellName(cIdx+1, rowNum)
				excelFile.SetCellValue(sheetName, cellName, val)
				if cIdx == 0 || cIdx == 5 {
					excelFile.SetCellStyle(sheetName, cellName, cellName, styleInfoCenter)
				} else {
					excelFile.SetCellStyle(sheetName, cellName, cellName, styleInfoCell)
				}
			}

			for dIdx, dVal := range dateCells {
				colIdx := len(infoValues) + dIdx + 1
				cellName, _ := excelize.CoordinatesToCellName(colIdx, rowNum)
				excelFile.SetCellValue(sheetName, cellName, dVal)
				excelFile.SetCellStyle(sheetName, cellName, cellName, cellStyles[dIdx])
			}
		}

		excelFile.SetColWidth(sheetName, "A", "A", 6)
		excelFile.SetColWidth(sheetName, "B", "C", 16)
		excelFile.SetColWidth(sheetName, "D", "D", 28)
		excelFile.SetColWidth(sheetName, "E", "E", 18)
		excelFile.SetColWidth(sheetName, "F", "F", 14)

		w.db.Model(job).Update("progress", progressValue)
	}

	// Helper to populate Sheet 3 (Presensi Upacara)
	populateUpacaraSheet := func(sheetName string, year int, progressValue int) {
		yearStartStr := fmt.Sprintf("%d-01-01", year)
		yearEndStr := fmt.Sprintf("%d-12-31", year)

		ctx := context.Background()
		dataList, err := w.repo.GetLaporanMergedParallel(ctx, yearStartStr, yearEndStr, "", "", "")
		if err != nil {
			log.Printf("[ExportWorker] Error fetching data for sheet %s: %v", sheetName, err)
			return
		}

		type UpacaraRow struct {
			Nip     sql.NullString `gorm:"column:nip"`
			Nidn    sql.NullString `gorm:"column:nidn"`
			Tanggal sql.NullString `gorm:"column:tanggal"`
		}
		var upacaraRows []UpacaraRow
		w.db.Raw("SELECT nip, nidn, tanggal FROM absen_upacara WHERE tanggal >= ? AND tanggal <= ?", yearStartStr, yearEndStr).Scan(&upacaraRows)

		upacaraMap := make(map[string]map[int]int)
		addUpacara := func(nipVal, nidnVal, dateStr string) {
			if dateStr == "" {
				return
			}
			dt, errP := parseCleanDate(dateStr)
			if errP != nil {
				return
			}
			mInt := int(dt.Month())

			if nipVal != "" {
				if upacaraMap[nipVal] == nil {
					upacaraMap[nipVal] = make(map[int]int)
				}
				upacaraMap[nipVal][mInt]++
			}
			if nidnVal != "" && nidnVal != nipVal {
				if upacaraMap[nidnVal] == nil {
					upacaraMap[nidnVal] = make(map[int]int)
				}
				upacaraMap[nidnVal][mInt]++
			}
		}

		for _, r := range upacaraRows {
			addUpacara(r.Nip.String, r.Nidn.String, r.Tanggal.String)
		}

		borderStyle := []excelize.Border{
			{Type: "left", Color: "CCCCCC", Style: 1},
			{Type: "right", Color: "CCCCCC", Style: 1},
			{Type: "top", Color: "CCCCCC", Style: 1},
			{Type: "bottom", Color: "CCCCCC", Style: 1},
		}

		styleHeaderBlue, _ := excelFile.NewStyle(&excelize.Style{
			Fill:      excelize.Fill{Type: "pattern", Color: []string{"0047AB"}, Pattern: 1},
			Font:      &excelize.Font{Bold: true, Color: "FFFFFF", Size: 10},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
			Border:    borderStyle,
		})

		styleInfoCell, _ := excelFile.NewStyle(&excelize.Style{
			Font:      &excelize.Font{Size: 10, Color: "000000"},
			Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "center"},
			Border:    borderStyle,
		})
		styleInfoCenter, _ := excelFile.NewStyle(&excelize.Style{
			Font:      &excelize.Font{Size: 10, Color: "000000"},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
			Border:    borderStyle,
		})

		styleAbsen, _ := excelFile.NewStyle(&excelize.Style{
			Fill:      excelize.Fill{Type: "pattern", Color: []string{"D1E7DD"}, Pattern: 1},
			Font:      &excelize.Font{Color: "0F5132", Size: 10, Bold: true},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
			Border:    borderStyle,
		})
		styleZero, _ := excelFile.NewStyle(&excelize.Style{
			Font:      &excelize.Font{Color: "888888", Size: 10},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
			Border:    borderStyle,
		})

		monthHeaders := []string{"Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"}
		headers := []string{"No", "NIP", "NIDN", "Nama Pegawai", "Unit Kerja", "Total Upacara"}
		headers = append(headers, monthHeaders...)

		for colIdx, hTitle := range headers {
			cellName, _ := excelize.CoordinatesToCellName(colIdx+1, 1)
			excelFile.SetCellValue(sheetName, cellName, hTitle)
			excelFile.SetCellStyle(sheetName, cellName, cellName, styleHeaderBlue)
		}

		for idx, emp := range dataList {
			rowNum := idx + 2
			var nipStr, nidnStr, namaStr, unitStr string

			b, _ := json.Marshal(emp.Pengguna)
			var m map[string]interface{}
			_ = json.Unmarshal(b, &m)
			if m != nil {
				nipStr, _ = m["nip"].(string)
				nidnStr, _ = m["nidn"].(string)
				namaStr, _ = m["nama"].(string)
				unitStr, _ = m["unit_kerja"].(string)
				if unitStr == "" {
					unitStr, _ = m["unit"].(string)
				}
			}

			if nipStr == "" {
				nipStr = "-"
			}
			if nidnStr == "" {
				nidnStr = "-"
			}

			empUpacaras := upacaraMap[nipStr]
			if len(empUpacaras) == 0 && nidnStr != "-" {
				empUpacaras = upacaraMap[nidnStr]
			}

			totalUpacara := 0
			var monthVals []string
			var monthStyles []int

			for mIdx := 1; mIdx <= 12; mIdx++ {
				cnt := 0
				if empUpacaras != nil {
					cnt = empUpacaras[mIdx]
				}
				totalUpacara += cnt
				if cnt > 0 {
					monthVals = append(monthVals, fmt.Sprintf("%d", cnt))
					monthStyles = append(monthStyles, styleAbsen)
				} else {
					monthVals = append(monthVals, "0")
					monthStyles = append(monthStyles, styleZero)
				}
			}

			infoValues := []string{
				fmt.Sprintf("%d", idx+1),
				nipStr,
				nidnStr,
				namaStr,
				unitStr,
				fmt.Sprintf("%d", totalUpacara),
			}

			for cIdx, val := range infoValues {
				cellName, _ := excelize.CoordinatesToCellName(cIdx+1, rowNum)
				excelFile.SetCellValue(sheetName, cellName, val)
				if cIdx == 0 || cIdx == 5 {
					excelFile.SetCellStyle(sheetName, cellName, cellName, styleInfoCenter)
				} else {
					excelFile.SetCellStyle(sheetName, cellName, cellName, styleInfoCell)
				}
			}

			for mVIdx, mVVal := range monthVals {
				colIdx := len(infoValues) + mVIdx + 1
				cellName, _ := excelize.CoordinatesToCellName(colIdx, rowNum)
				excelFile.SetCellValue(sheetName, cellName, mVVal)
				excelFile.SetCellStyle(sheetName, cellName, cellName, monthStyles[mVIdx])
			}
		}

		excelFile.SetColWidth(sheetName, "A", "A", 6)
		excelFile.SetColWidth(sheetName, "B", "C", 16)
		excelFile.SetColWidth(sheetName, "D", "D", 28)
		excelFile.SetColWidth(sheetName, "E", "E", 18)
		excelFile.SetColWidth(sheetName, "F", "F", 14)

		w.db.Model(job).Update("progress", progressValue)
	}

	// 1. Populate Sheet 1 (Tab 01 - 31 Kalender)
	populateDailySheet(sheet1Name, calStartStr, calEndStr, 35)

	// 2. Populate Sheet 2 (Tab 15 - 15 Cutoff)
	populateDailySheet(sheet2Name, cutoffStartStr, cutoffEndStr, 70)

	// 3. Populate Sheet 3 (Presensi Upacara Tahunan)
	populateUpacaraSheet(sheet3Name, startDt.Year(), 95)

	filename := fmt.Sprintf("Laporan_Presensi_%s_%s_%s.xlsx", job.TanggalMulai, job.TanggalAkhir, job.TaskID[:8])
	outPath := filepath.Join("exports", filename)

	if err := excelFile.SaveAs(outPath); err != nil {
		log.Printf("[ExportWorker] Error saving excel job %s: %v", job.TaskID, err)
		w.db.Model(job).Updates(map[string]interface{}{
			"status":        "failed",
			"error_message": err.Error(),
		})
		return
	}

	w.db.Model(job).Updates(map[string]interface{}{
		"status":    "completed",
		"progress":  100,
		"file_path": outPath,
	})
	log.Printf("[ExportWorker] Job %s successfully completed 3-sheet styled xlsx: %s", job.TaskID, outPath)
}
