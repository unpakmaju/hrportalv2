package infrastructure

import (
	"fmt"
	"strings"
	"testing"

	"hrportal_backend/modules/masterdata/domain"
)

func TestMapJenjang(t *testing.T) {
	testCases := []struct {
		kodeJenjang  string
		gelarPanjang string
		expected     string
	}{
		{"A", "", "S3"},
		{"B", "", "S2"},
		{"C", "", "S1"},
		{"D", "", "D4"},
		{"E", "", "D3"},
		{"F", "", "D2"},
		{"G", "", "D1"},
		{"J", "", "Profesi"},
		{"", "Doktor Ilmu Manajemen", "S3"},
		{"", "Magister Hukum", "S2"},
		{"", "Sarjana Hukum", "S1"},
		{"", "Ahli Madya Akuntansi", "D3"},
		{"-", "-", "-"},
	}

	for _, tc := range testCases {
		res := mapJenjang(tc.kodeJenjang, tc.gelarPanjang)
		if res != tc.expected {
			t.Errorf("mapJenjang(%q, %q) = %q; expected %q", tc.kodeJenjang, tc.gelarPanjang, res, tc.expected)
		}
	}
}

func TestProdiFormattingAndDeduplication(t *testing.T) {
	rawList := []domain.Prodi{
		{
			KodeProdi:    "74201",
			NamaProdi:    "ILMU HUKUM",
			KodeFakultas: "01",
			NamaFakultas: "HUKUM",
			KodeJenjang:  "C",
			GelarPanjang: "Sarjana Hukum",
		},
		{
			KodeProdi:    "74201", // Duplicate kode_prodi
			NamaProdi:    "ILMU HUKUM",
			KodeFakultas: "01",
			NamaFakultas: "HUKUM",
			KodeJenjang:  "C",
			GelarPanjang: "Sarjana Hukum",
		},
		{
			KodeProdi:    "74101",
			NamaProdi:    "ILMU HUKUM",
			KodeFakultas: "07",
			NamaFakultas: "PASCASARJANA",
			KodeJenjang:  "B",
			GelarPanjang: "Magister Hukum",
		},
	}

	seen := make(map[string]bool)
	var list []domain.Prodi

	for i := range rawList {
		p := rawList[i]
		p.Jenjang = mapJenjang(p.KodeJenjang, p.GelarPanjang)
		if p.Jenjang != "" {
			p.Nama = fmt.Sprintf("%s - %s", p.Jenjang, p.NamaProdi)
		} else {
			p.Nama = p.NamaProdi
		}

		dedupKey := fmt.Sprintf("%s|%s|%s", strings.ToLower(p.NamaProdi), p.Jenjang, p.KodeFakultas)
		if seen[dedupKey] || (p.KodeProdi != "" && seen[p.KodeProdi]) {
			continue
		}
		seen[dedupKey] = true
		if p.KodeProdi != "" {
			seen[p.KodeProdi] = true
		}

		list = append(list, p)
	}

	if len(list) != 2 {
		t.Fatalf("Expected 2 deduplicated prodi items, got %d", len(list))
	}

	if list[0].Nama != "S1 - ILMU HUKUM" || list[0].NamaFakultas != "HUKUM" {
		t.Errorf("Unexpected prodi 0: %+v", list[0])
	}

	if list[1].Nama != "S2 - ILMU HUKUM" || list[1].NamaFakultas != "PASCASARJANA" {
		t.Errorf("Unexpected prodi 1: %+v", list[1])
	}
}
