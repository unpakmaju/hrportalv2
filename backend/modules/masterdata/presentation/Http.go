package presentation

import (
	"fmt"
	"strings"

	common "hrportal_backend/common/domain"
	"hrportal_backend/common/infrastructure"
	commonpresentation "hrportal_backend/common/presentation"
	query "hrportal_backend/modules/masterdata/application/GetAllMasterData"
	"hrportal_backend/modules/masterdata/domain"

	"github.com/gofiber/fiber/v2"
	"github.com/mehdihadeli/go-mediatr"
	"gorm.io/gorm"
)

type MasterUnit struct {
	ID       int64  `gorm:"primaryKey;column:id" json:"id"`
	KodeUnit string `gorm:"column:kode_unit" json:"kode_unit"`
	NamaUnit string `gorm:"column:nama_unit" json:"nama_unit"`
	Nama     string `gorm:"column:nama" json:"nama"`
	Unit     string `gorm:"column:unit" json:"unit"`
}

func (MasterUnit) TableName() string {
	return "master_units"
}

func registerMasterDataRoutes(group fiber.Router, db *gorm.DB, dbSimak *gorm.DB, dbSimpegNew *gorm.DB) {
	group.Get("/fakultas", func(c *fiber.Ctx) error {
		q := &query.GetAllFakultasQuery{}
		res, err := mediatr.Send[*query.GetAllFakultasQuery, common.ResultValue[[]domain.Fakultas]](c.UserContext(), q)
		if err == nil && res.IsSuccess {
			return c.JSON(res.Value)
		}

		// Fallback query unpak_simak.m_fakultas directly without connect_m_fakultas
		targetDB := dbSimak
		tableName := "m_fakultas"
		if targetDB == nil {
			targetDB = db
			tableName = "unpak_simak.m_fakultas"
		}
		if targetDB != nil {
			var list []domain.Fakultas
			if errFind := targetDB.Table(tableName).Order("kode_fakultas ASC").Find(&list).Error; errFind == nil && len(list) > 0 {
				for i := range list {
					list[i].KodeFakultas = strings.TrimSpace(list[i].KodeFakultas)
					list[i].NamaFakultas = strings.TrimSpace(list[i].NamaFakultas)
					list[i].ID = list[i].KodeFakultas
					list[i].Kode = list[i].KodeFakultas
					list[i].Nama = list[i].NamaFakultas
				}
				return c.JSON(list)
			}
		}

		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		return infrastructure.HandleError(c, res.Error)
	})

	group.Get("/prodi", func(c *fiber.Ctx) error {
		q := &query.GetAllProdiQuery{}
		res, err := mediatr.Send[*query.GetAllProdiQuery, common.ResultValue[[]domain.Prodi]](c.UserContext(), q)
		if err == nil && res.IsSuccess {
			seen := make(map[string]bool)
			var filtered []domain.Prodi
			for _, p := range res.Value {
				namaLower := strings.ToLower(strings.TrimSpace(p.NamaProdi))
				if strings.Contains(namaLower, "isi nama ps") || namaLower == "" {
					continue
				}
				dedupKey := fmt.Sprintf("%s|%s|%s", namaLower, p.Jenjang, p.KodeFakultas)
				if seen[dedupKey] || (p.KodeProdi != "" && seen[p.KodeProdi]) {
					continue
				}
				seen[dedupKey] = true
				if p.KodeProdi != "" {
					seen[p.KodeProdi] = true
				}
				filtered = append(filtered, p)
			}
			return c.JSON(filtered)
		}

		// Fallback direct query unpak_simak.m_program_studi without connect_r_prodi
		targetDB := dbSimak
		isCross := false
		if targetDB == nil {
			targetDB = db
			isCross = true
		}
		if targetDB != nil {
			var rawList []domain.Prodi
			var errFind error
			if !isCross {
				errFind = targetDB.Table("m_program_studi ps").
					Select("ps.kode_prodi, ps.kode_fak as kode_fakultas, ps.kode_jenjang, ps.nama_prodi, ps.gelar, ps.gelar_panjang, COALESCE(f.nama_fakultas, '') as nama_fakultas").
					Joins("LEFT JOIN m_fakultas f ON f.kode_fakultas = ps.kode_fak").
					Where("LOWER(ps.nama_prodi) NOT LIKE '%isi nama ps%' AND TRIM(ps.nama_prodi) != ''").
					Order("ps.kode_fak ASC, ps.kode_jenjang ASC, ps.nama_prodi ASC").
					Find(&rawList).Error
			}
			if (errFind != nil || len(rawList) == 0) && db != nil {
				errFind = db.Table("unpak_simak.m_program_studi ps").
					Select("ps.kode_prodi, ps.kode_fak as kode_fakultas, ps.kode_jenjang, ps.nama_prodi, ps.gelar, ps.gelar_panjang, COALESCE(f.nama_fakultas, '') as nama_fakultas").
					Joins("LEFT JOIN unpak_simak.m_fakultas f ON f.kode_fakultas = ps.kode_fak").
					Where("LOWER(ps.nama_prodi) NOT LIKE '%isi nama ps%' AND TRIM(ps.nama_prodi) != ''").
					Order("ps.kode_fak ASC, ps.kode_jenjang ASC, ps.nama_prodi ASC").
					Find(&rawList).Error
			}

			if errFind == nil && len(rawList) > 0 {
				// Lookup master_units if available
				unitMap := make(map[string]string)
				targetUnitDB := dbSimpegNew
				if targetUnitDB == nil {
					targetUnitDB = db
				}
				if targetUnitDB != nil {
					type UnitSimple struct {
						KodeUnit string `gorm:"column:kode_unit"`
						NamaUnit string `gorm:"column:nama_unit"`
					}
					var uList []UnitSimple
					_ = targetUnitDB.Table("master_units").Select("kode_unit, nama_unit").Where("kode_unit != ''").Find(&uList).Error
					for _, u := range uList {
						if u.KodeUnit != "" && u.NamaUnit != "" {
							unitMap[strings.TrimSpace(u.KodeUnit)] = strings.TrimSpace(u.NamaUnit)
						}
					}
				}

				var list []domain.Prodi
				seen := make(map[string]bool)

				for i := range rawList {
					p := rawList[i]
					namaProdiTrim := strings.TrimSpace(p.NamaProdi)
					if strings.Contains(strings.ToLower(namaProdiTrim), "isi nama ps") || namaProdiTrim == "" {
						continue
					}

					p.KodeProdi = strings.TrimSpace(p.KodeProdi)
					p.KodeFakultas = strings.TrimSpace(p.KodeFakultas)
					p.KodeJenjang = strings.TrimSpace(p.KodeJenjang)
					p.NamaProdi = namaProdiTrim
					p.Gelar = strings.TrimSpace(p.Gelar)
					p.GelarPanjang = strings.TrimSpace(p.GelarPanjang)

					if unitName, ok := unitMap[p.KodeFakultas]; ok && unitName != "" {
						p.NamaFakultas = unitName
					} else {
						p.NamaFakultas = strings.TrimSpace(p.NamaFakultas)
					}

					// Map Jenjang
					var j string
					switch strings.ToUpper(p.KodeJenjang) {
					case "A":
						j = "S3"
					case "B":
						j = "S2"
					case "C":
						j = "S1"
					case "D":
						j = "D4"
					case "E":
						j = "D3"
					case "F":
						j = "D2"
					case "G":
						j = "D1"
					case "J":
						j = "Profesi"
					default:
						gp := strings.ToLower(p.GelarPanjang)
						if strings.Contains(gp, "doktor") {
							j = "S3"
						} else if strings.Contains(gp, "magister") {
							j = "S2"
						} else if strings.Contains(gp, "sarjana") {
							j = "S1"
						} else if strings.Contains(gp, "ahli madya") {
							j = "D3"
						} else {
							j = p.KodeJenjang
						}
					}
					p.Jenjang = j

					if p.Jenjang != "" {
						p.Nama = fmt.Sprintf("%s - %s", p.Jenjang, p.NamaProdi)
					} else {
						p.Nama = p.NamaProdi
					}
					p.ID = p.KodeProdi
					p.Kode = p.KodeProdi
					p.FakultasID = p.KodeFakultas

					// Deduplication check
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
				return c.JSON(list)
			}
		}

		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		return infrastructure.HandleError(c, res.Error)
	})

	// GET /unit fetching data from unpak_newsimpeg.master_units database
	group.Get("/unit", func(c *fiber.Ctx) error {
		targetDB := db
		if dbSimpegNew != nil {
			targetDB = dbSimpegNew
		}

		var units []MasterUnit
		err := targetDB.Table("master_units").Find(&units).Error
		if err != nil || len(units) == 0 {
			return c.JSON(units)
		}

		for i := range units {
			if units[i].NamaUnit == "" {
				units[i].NamaUnit = units[i].Nama
			}
			if units[i].Nama == "" {
				units[i].Nama = units[i].NamaUnit
			}
			if units[i].Unit == "" {
				units[i].Unit = units[i].NamaUnit
			}
		}

		return c.JSON(units)
	})

	group.Get("/jenis-cuti", func(c *fiber.Ctx) error {
		q := &query.GetAllJenisCutiQuery{}
		res, err := mediatr.Send[*query.GetAllJenisCutiQuery, common.ResultValue[[]domain.JenisCuti]](c.UserContext(), q)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}
		return c.JSON(res.Value)
	})

	group.Get("/jenis-izin", func(c *fiber.Ctx) error {
		q := &query.GetAllJenisIzinQuery{}
		res, err := mediatr.Send[*query.GetAllJenisIzinQuery, common.ResultValue[[]domain.JenisIzin]](c.UserContext(), q)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}
		return c.JSON(res.Value)
	})

	group.Get("/jenis-sppd", func(c *fiber.Ctx) error {
		q := &query.GetAllJenisSppdQuery{}
		res, err := mediatr.Send[*query.GetAllJenisSppdQuery, common.ResultValue[[]domain.JenisSppd]](c.UserContext(), q)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}
		return c.JSON(res.Value)
	})

	group.Get("/verifikator", func(c *fiber.Ctx) error {
		q := &query.GetAllVerifikatorQuery{}
		res, err := mediatr.Send[*query.GetAllVerifikatorQuery, common.ResultValue[[]domain.Verifikator]](c.UserContext(), q)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}
		return c.JSON(res.Value)
	})

	// group.Get("/atasan", func(c *fiber.Ctx) error {
	// 	q := &query.GetAllVerifikatorQuery{}
	// 	res, err := mediatr.Send[*query.GetAllVerifikatorQuery, common.ResultValue[[]domain.Verifikator]](c.UserContext(), q)
	// 	if err != nil {
	// 		return infrastructure.HandleError(c, err)
	// 	}
	// 	if !res.IsSuccess {
	// 		return infrastructure.HandleError(c, res.Error)
	// 	}
	// 	return c.JSON(res.Value)
	// })

	group.Get("/people", func(c *fiber.Ctx) error {
		q := &query.GetAllPeopleQuery{}
		res, err := mediatr.Send[*query.GetAllPeopleQuery, common.ResultValue[[]domain.Verifikator]](c.UserContext(), q)
		if err != nil {
			return infrastructure.HandleError(c, err)
		}
		if !res.IsSuccess {
			return infrastructure.HandleError(c, res.Error)
		}
		return c.JSON(res.Value)
	})
}

func ModuleMasterData(app *fiber.App, db *gorm.DB, dbSimak *gorm.DB, dbSimpegNew *gorm.DB) {
	groupV2 := app.Group("/api/v2/masterdata", commonpresentation.JWTMiddleware(), commonpresentation.RBACMiddleware())
	registerMasterDataRoutes(groupV2, db, dbSimak, dbSimpegNew)

	groupV1 := app.Group("/api/masterdata", commonpresentation.JWTMiddleware(), commonpresentation.RBACMiddleware())
	registerMasterDataRoutes(groupV1, db, dbSimak, dbSimpegNew)
}
