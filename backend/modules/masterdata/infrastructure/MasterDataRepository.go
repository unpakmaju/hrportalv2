package infrastructure

import (
	"context"
	"fmt"
	"hrportal_backend/modules/masterdata/domain"
	"strings"

	"gorm.io/gorm"
)

type MasterDataRepository struct {
	db          *gorm.DB
	dbSimak     *gorm.DB
	dbSimpeg    *gorm.DB
	dbSimpegNew *gorm.DB
}

func NewMasterDataRepository(db *gorm.DB, dbSimak *gorm.DB, dbSimpeg *gorm.DB, dbSimpegNew *gorm.DB) domain.IMasterDataRepository {
	return &MasterDataRepository{db: db, dbSimak: dbSimak, dbSimpeg: dbSimpeg, dbSimpegNew: dbSimpegNew}
}

func (r *MasterDataRepository) GetAllFakultas(ctx context.Context) ([]domain.Fakultas, error) {
	if r == nil {
		return []domain.Fakultas{}, nil
	}

	var list []domain.Fakultas
	var err error

	// Target unpak_simak.m_fakultas
	if r.dbSimak != nil {
		err = r.dbSimak.WithContext(ctx).Table("m_fakultas").Order("kode_fakultas ASC").Find(&list).Error
	}
	if (err != nil || len(list) == 0) && r.db != nil {
		err = r.db.WithContext(ctx).Table("unpak_simak.m_fakultas").Order("kode_fakultas ASC").Find(&list).Error
	}
	if err != nil {
		return []domain.Fakultas{}, err
	}

	for i := range list {
		list[i].KodeFakultas = strings.TrimSpace(list[i].KodeFakultas)
		list[i].NamaFakultas = strings.TrimSpace(list[i].NamaFakultas)
		list[i].ID = list[i].KodeFakultas
		list[i].Kode = list[i].KodeFakultas
		list[i].Nama = list[i].NamaFakultas
	}
	return list, nil
}

func mapJenjang(kodeJenjang, gelarPanjang string) string {
	switch strings.ToUpper(strings.TrimSpace(kodeJenjang)) {
	case "A":
		return "S3"
	case "B":
		return "S2"
	case "C":
		return "S1"
	case "D":
		return "D4"
	case "E":
		return "D3"
	case "F":
		return "D2"
	case "G":
		return "D1"
	case "J":
		return "Profesi"
	default:
		gp := strings.ToLower(gelarPanjang)
		if strings.Contains(gp, "doktor") {
			return "S3"
		} else if strings.Contains(gp, "magister") {
			return "S2"
		} else if strings.Contains(gp, "sarjana") {
			return "S1"
		} else if strings.Contains(gp, "ahli madya") {
			return "D3"
		}
		return strings.TrimSpace(kodeJenjang)
	}
}

func (r *MasterDataRepository) GetAllProdi(ctx context.Context) ([]domain.Prodi, error) {
	if r == nil {
		return []domain.Prodi{}, nil
	}

	var rawList []domain.Prodi
	var err error

	// Query unpak_simak.m_program_studi joined with unpak_simak.m_fakultas
	if r.dbSimak != nil {
		err = r.dbSimak.WithContext(ctx).Table("m_program_studi ps").
			Select("ps.kode_prodi, ps.kode_fak as kode_fakultas, ps.kode_jenjang, ps.nama_prodi, ps.gelar, ps.gelar_panjang, COALESCE(f.nama_fakultas, '') as nama_fakultas").
			Joins("LEFT JOIN m_fakultas f ON f.kode_fakultas = ps.kode_fak").
			Where("LOWER(ps.nama_prodi) NOT LIKE '%isi nama ps%' AND TRIM(ps.nama_prodi) != ''").
			Order("ps.kode_fak ASC, ps.kode_jenjang ASC, ps.nama_prodi ASC").
			Find(&rawList).Error
	}

	if (err != nil || len(rawList) == 0) && r.db != nil {
		err = r.db.WithContext(ctx).Table("unpak_simak.m_program_studi ps").
			Select("ps.kode_prodi, ps.kode_fak as kode_fakultas, ps.kode_jenjang, ps.nama_prodi, ps.gelar, ps.gelar_panjang, COALESCE(f.nama_fakultas, '') as nama_fakultas").
			Joins("LEFT JOIN unpak_simak.m_fakultas f ON f.kode_fakultas = ps.kode_fak").
			Where("LOWER(ps.nama_prodi) NOT LIKE '%isi nama ps%' AND TRIM(ps.nama_prodi) != ''").
			Order("ps.kode_fak ASC, ps.kode_jenjang ASC, ps.nama_prodi ASC").
			Find(&rawList).Error
	}

	if err != nil {
		return []domain.Prodi{}, err
	}

	// Lookup full fakultas/unit names from master_units if available
	unitMap := make(map[string]string)
	targetUnitDB := r.dbSimpegNew
	if targetUnitDB == nil {
		targetUnitDB = r.db
	}
	if targetUnitDB != nil {
		type UnitSimple struct {
			KodeUnit string `gorm:"column:kode_unit"`
			NamaUnit string `gorm:"column:nama_unit"`
		}
		var uList []UnitSimple
		_ = targetUnitDB.WithContext(ctx).Table("master_units").Select("kode_unit, nama_unit").Where("kode_unit != ''").Find(&uList).Error
		for _, u := range uList {
			if u.KodeUnit != "" && u.NamaUnit != "" {
				unitMap[strings.TrimSpace(u.KodeUnit)] = strings.TrimSpace(u.NamaUnit)
			}
		}
	}

	var list []domain.Prodi
	seen := make(map[string]bool)

	for i := range rawList {
		namaLower := strings.ToLower(strings.TrimSpace(rawList[i].NamaProdi))
		if strings.Contains(namaLower, "isi nama ps") || namaLower == "" {
			continue
		}

		rawList[i].KodeProdi = strings.TrimSpace(rawList[i].KodeProdi)
		rawList[i].KodeFakultas = strings.TrimSpace(rawList[i].KodeFakultas)
		rawList[i].KodeJenjang = strings.TrimSpace(rawList[i].KodeJenjang)
		rawList[i].NamaProdi = strings.TrimSpace(rawList[i].NamaProdi)
		rawList[i].Gelar = strings.TrimSpace(rawList[i].Gelar)
		rawList[i].GelarPanjang = strings.TrimSpace(rawList[i].GelarPanjang)

		if rawList[i].KodeProdi != "" {
			rawList[i].ID = rawList[i].KodeProdi
			rawList[i].Kode = rawList[i].KodeProdi
		}
		if rawList[i].KodeFakultas != "" {
			rawList[i].FakultasID = rawList[i].KodeFakultas
		}

		if unitName, ok := unitMap[rawList[i].KodeFakultas]; ok && unitName != "" {
			rawList[i].NamaFakultas = unitName
		} else {
			rawList[i].NamaFakultas = strings.TrimSpace(rawList[i].NamaFakultas)
		}

		rawList[i].Jenjang = mapJenjang(rawList[i].KodeJenjang, rawList[i].GelarPanjang)
		if rawList[i].Jenjang != "" {
			rawList[i].Nama = fmt.Sprintf("%s - %s", rawList[i].Jenjang, rawList[i].NamaProdi)
		} else {
			rawList[i].Nama = rawList[i].NamaProdi
		}

		// Deduplication check
		dedupKey := fmt.Sprintf("%s|%s|%s", strings.ToLower(rawList[i].NamaProdi), rawList[i].Jenjang, rawList[i].KodeFakultas)
		if seen[dedupKey] || (rawList[i].KodeProdi != "" && seen[rawList[i].KodeProdi]) {
			continue
		}
		seen[dedupKey] = true
		if rawList[i].KodeProdi != "" {
			seen[rawList[i].KodeProdi] = true
		}

		list = append(list, rawList[i])
	}
	return list, nil
}

func (r *MasterDataRepository) GetAllJenisCuti(ctx context.Context) ([]domain.JenisCuti, error) {
	if r == nil || r.db == nil {
		return []domain.JenisCuti{}, nil
	}
	var list []domain.JenisCuti
	err := r.db.WithContext(ctx).Find(&list).Error
	return list, err
}

func (r *MasterDataRepository) GetAllJenisIzin(ctx context.Context) ([]domain.JenisIzin, error) {
	if r == nil || r.db == nil {
		return []domain.JenisIzin{}, nil
	}
	var list []domain.JenisIzin
	err := r.db.WithContext(ctx).Find(&list).Error
	return list, err
}

func (r *MasterDataRepository) GetAllJenisSppd(ctx context.Context) ([]domain.JenisSppd, error) {
	if r == nil || r.db == nil {
		return []domain.JenisSppd{}, nil
	}
	var list []domain.JenisSppd
	err := r.db.WithContext(ctx).Find(&list).Error
	return list, err
}

func (r *MasterDataRepository) GetPeople(ctx context.Context) ([]domain.Verifikator, error) {
	if r == nil {
		return []domain.Verifikator{}, nil
	}

	var rawPeople []struct {
		Nip      string `gorm:"column:nip"`
		Nama     string `gorm:"column:nama"`
		NamaUnit string `gorm:"column:nama_unit"`
	}

	targetDB := r.dbSimpegNew
	if targetDB == nil {
		targetDB = r.db
	}

	if len(rawPeople) == 0 && targetDB != nil {
		_ = targetDB.WithContext(ctx).
			Table("pegawais").
			Select("nip, nama, '' as nama_unit").
			Where("nip IS NOT NULL AND nip != ''").
			Order("nama asc").
			// Limit(2000).
			Scan(&rawPeople).Error
	}

	var list []domain.Verifikator
	seen := make(map[string]bool)
	for _, p := range rawPeople {
		nipClean := strings.TrimSpace(p.Nip)
		namaClean := strings.TrimSpace(p.Nama)
		if nipClean == "" || namaClean == "" || seen[nipClean] {
			continue
		}
		seen[nipClean] = true
		unitStr := p.NamaUnit
		list = append(list, domain.Verifikator{
			Nip:        nipClean,
			Nama:       namaClean,
			Struktural: unitStr,
		})
	}
	return list, nil
}

func (r *MasterDataRepository) GetVerifikators(ctx context.Context, verifikatorType string) ([]domain.Verifikator, error) {
	if r == nil {
		return []domain.Verifikator{}, nil
	}

	targetDB := r.dbSimpeg
	if targetDB == nil {
		targetDB = r.db
	}
	if targetDB == nil {
		return []domain.Verifikator{}, nil
	}

	var list []domain.Verifikator

	err := targetDB.WithContext(ctx).Table("payroll_m_pegawai").
		Where("CHAR_LENGTH(nip) >= 3").
		Where("LENGTH(TRIM(struktural)) > 0").
		Order("nama asc").
		Find(&list).Error

	if err != nil {
		return []domain.Verifikator{}, err
	}

	return list, nil
}
