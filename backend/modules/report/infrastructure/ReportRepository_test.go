package infrastructure

import (
	"fmt"
	"strings"
	"testing"
	"time"

	accountDomain "hrportal_backend/modules/account/domain"
	"hrportal_backend/modules/report/domain"
)

func TestDateParsingAndRecordDeduplication(t *testing.T) {
	parseDate := func(dStr string) (time.Time, error) {
		clean := strings.TrimSpace(dStr)
		if idx := strings.Index(clean, "T"); idx != -1 {
			clean = clean[:idx]
		}
		if idx := strings.Index(clean, " "); idx != -1 {
			clean = clean[:idx]
		}
		return time.Parse("2006-01-02", clean)
	}

	testDates := []string{
		"2026-08-01",
		"2026-08-01 00:00:00",
		"2026-08-01T15:04:05Z",
		" 2026-08-01 ",
	}

	for _, d := range testDates {
		parsed, err := parseDate(d)
		if err != nil {
			t.Fatalf("Failed to parse date %q: %v", d, err)
		}
		if parsed.Format("2006-01-02") != "2026-08-01" {
			t.Fatalf("Expected 2026-08-01 for input %q, got %s", d, parsed.Format("2006-01-02"))
		}
	}

	// Test addRecord and deduplication
	recordsByNip := make(map[string][]domain.RecordItem)
	recordsByNidn := make(map[string][]domain.RecordItem)

	addRecord := func(nipVal, nidnVal string, rec domain.RecordItem) {
		cNip := strings.TrimSpace(nipVal)
		cNidn := strings.TrimSpace(nidnVal)
		if cNip != "" {
			recordsByNip[cNip] = append(recordsByNip[cNip], rec)
		}
		if cNidn != "" {
			recordsByNidn[cNidn] = append(recordsByNidn[cNidn], rec)
		}
	}

	item1 := domain.RecordItem{ID: 1, Tanggal: "2026-08-01", Type: "absen"}
	addRecord(" 2110722511 ", "", item1)

	item2 := domain.RecordItem{ID: 2, Tanggal: "2026-08-02", Type: "izin"}
	addRecord("2110722511", "2110722511", item2)

	p := accountDomain.Pegawai{
		Nip:  "2110722511",
		Nidn: "2110722511",
	}

	var recs []domain.RecordItem
	seenRecID := make(map[string]bool)

	collectRecs := func(items []domain.RecordItem) {
		for _, item := range items {
			recKey := fmt.Sprintf("%s-%d-%s", item.Type, item.ID, item.Tanggal)
			if !seenRecID[recKey] {
				seenRecID[recKey] = true
				recs = append(recs, item)
			}
		}
	}

	cleanNip := strings.TrimSpace(p.Nip)
	cleanNidn := strings.TrimSpace(p.Nidn)
	if cleanNip != "" {
		collectRecs(recordsByNip[cleanNip])
	}
	if cleanNidn != "" {
		collectRecs(recordsByNidn[cleanNidn])
	}

	if len(recs) != 2 {
		t.Fatalf("Expected 2 deduplicated records, got %d", len(recs))
	}
}

func TestIdentifierMatchingAndCrossRecordRetrieval(t *testing.T) {
	// Scenario: Lecturer attendance has nip="4102009109" and nidn=""
	// In SIMPEG, this number is in nidn_nitk or nuptk
	empMap := make(map[string]accountDomain.Pegawai)
	uEmpty := ""
	empMap["4102009109"] = accountDomain.Pegawai{
		Nip:       "4102009109",
		Nidn:      "",
		Nama:      "",
		UnitKerja: &uEmpty,
		Unit:      &uEmpty,
		Fakultas:  &uEmpty,
		Prodi:     &uEmpty,
	}

	// Simulated detail from unpak_newsimpeg / unpak_simak
	namaSimpeg := "Dr. Dosen Teladan, M.Hum."
	unitSimpeg := "FAKULTAS HUKUM"
	prodiSimpeg := "Ilmu Hukum"
	nidnSimpeg := "4102009109"
	nuptkSimpeg := "4102009109"
	idSimpeg := "c0e1f5c4-9d7c-11ef-ae17-047c1663ec84"

	detail := simpegDetail{
		ID:           idSimpeg,
		Nip:          nil,
		Nidn:         &nidnSimpeg,
		Nuptk:        &nuptkSimpeg,
		Nama:         &namaSimpeg,
		NamaUnit:     &unitSimpeg,
		NamaFakultas: &unitSimpeg,
		NamaProdi:    &prodiSimpeg,
	}

	detailByIdentifier := make(map[string]simpegDetail)
	registerDetail := func(d simpegDetail) {
		if d.Nip != nil && strings.TrimSpace(*d.Nip) != "" {
			detailByIdentifier[strings.TrimSpace(*d.Nip)] = d
		}
		if d.Nidn != nil && strings.TrimSpace(*d.Nidn) != "" {
			detailByIdentifier[strings.TrimSpace(*d.Nidn)] = d
		}
		if d.Nuptk != nil && strings.TrimSpace(*d.Nuptk) != "" {
			detailByIdentifier[strings.TrimSpace(*d.Nuptk)] = d
		}
		if d.ID != "" {
			detailByIdentifier[d.ID] = d
		}
	}
	registerDetail(detail)

	// Verify detailByIdentifier contains the key
	if _, ok := detailByIdentifier["4102009109"]; !ok {
		t.Fatalf("Expected 4102009109 in detailByIdentifier")
	}

	// Perform enrichment simulation
	for k, emp := range empMap {
		cleanNip := strings.TrimSpace(emp.Nip)
		cleanNidn := strings.TrimSpace(emp.Nidn)
		cleanKey := strings.TrimSpace(k)

		var matched simpegDetail
		var found bool

		if cleanNip != "" {
			if d, ok := detailByIdentifier[cleanNip]; ok {
				matched = d
				found = true
			}
		}
		if !found && cleanNidn != "" {
			if d, ok := detailByIdentifier[cleanNidn]; ok {
				matched = d
				found = true
			}
		}
		if !found && cleanKey != "" {
			if d, ok := detailByIdentifier[cleanKey]; ok {
				matched = d
				found = true
			}
		}

		if found {
			if matched.Nidn != nil && strings.TrimSpace(*matched.Nidn) != "" {
				emp.Nidn = strings.TrimSpace(*matched.Nidn)
			}
			if matched.Nip != nil && strings.TrimSpace(*matched.Nip) != "" {
				emp.Nip = strings.TrimSpace(*matched.Nip)
			} else if emp.Nip == emp.Nidn || (matched.Nuptk != nil && emp.Nip == strings.TrimSpace(*matched.Nuptk)) {
				emp.Nip = ""
			}
			if matched.Nama != nil && strings.TrimSpace(*matched.Nama) != "" {
				emp.Nama = strings.TrimSpace(*matched.Nama)
			}
			if (emp.UnitKerja == nil || *emp.UnitKerja == "") && matched.NamaUnit != nil && *matched.NamaUnit != "" {
				uStr := strings.TrimSpace(*matched.NamaUnit)
				emp.UnitKerja = &uStr
				emp.Unit = &uStr
			}
			if (emp.Fakultas == nil || *emp.Fakultas == "") && matched.NamaFakultas != nil && *matched.NamaFakultas != "" {
				fStr := strings.TrimSpace(*matched.NamaFakultas)
				emp.Fakultas = &fStr
			}
			if (emp.Prodi == nil || *emp.Prodi == "") && matched.NamaProdi != nil && *matched.NamaProdi != "" {
				pStr := strings.TrimSpace(*matched.NamaProdi)
				emp.Prodi = &pStr
			}
			if (emp.Fakultas == nil || *emp.Fakultas == "") && emp.UnitKerja != nil && strings.HasPrefix(strings.ToUpper(*emp.UnitKerja), "FAKULTAS") {
				emp.Fakultas = emp.UnitKerja
			}
			empMap[k] = emp
		}
	}

	enriched := empMap["4102009109"]
	if enriched.Nama != namaSimpeg {
		t.Fatalf("Expected Nama %q, got %q", namaSimpeg, enriched.Nama)
	}
	if enriched.Nidn != "4102009109" {
		t.Fatalf("Expected Nidn 4102009109, got %q", enriched.Nidn)
	}
	if enriched.UnitKerja == nil || *enriched.UnitKerja != unitSimpeg {
		t.Fatalf("Expected UnitKerja %q, got %v", unitSimpeg, enriched.UnitKerja)
	}
	if enriched.Fakultas == nil || *enriched.Fakultas != unitSimpeg {
		t.Fatalf("Expected Fakultas %q, got %v", unitSimpeg, enriched.Fakultas)
	}
	if enriched.Prodi == nil || *enriched.Prodi != prodiSimpeg {
		t.Fatalf("Expected Prodi %q, got %v", prodiSimpeg, enriched.Prodi)
	}

	// Now verify records retrieval:
	// Attendance record was recorded under nip="4102009109", nidn=""
	recordsByNip := make(map[string][]domain.RecordItem)
	recordsByNidn := make(map[string][]domain.RecordItem)
	recordsByNip["4102009109"] = []domain.RecordItem{
		{ID: 1434780, Tanggal: "2026-08-17", Type: "absen"},
		{ID: 1438364, Tanggal: "2026-08-19", Type: "absen"},
	}

	var recs []domain.RecordItem
	seenRecID := make(map[string]bool)
	collectRecs := func(items []domain.RecordItem) {
		for _, item := range items {
			recKey := fmt.Sprintf("%s-%d-%s", item.Type, item.ID, item.Tanggal)
			if !seenRecID[recKey] {
				seenRecID[recKey] = true
				recs = append(recs, item)
			}
		}
	}

	cleanNip := strings.TrimSpace(enriched.Nip)
	cleanNidn := strings.TrimSpace(enriched.Nidn)
	cleanKey := "4102009109"

	if cleanNip != "" {
		collectRecs(recordsByNip[cleanNip])
		collectRecs(recordsByNidn[cleanNip])
	}
	if cleanNidn != "" {
		collectRecs(recordsByNip[cleanNidn])
		collectRecs(recordsByNidn[cleanNidn])
	}
	if cleanKey != "" && cleanKey != cleanNip && cleanKey != cleanNidn {
		collectRecs(recordsByNip[cleanKey])
		collectRecs(recordsByNidn[cleanKey])
	}

	if len(recs) != 2 {
		t.Fatalf("Expected 2 records collected, got %d", len(recs))
	}
}
