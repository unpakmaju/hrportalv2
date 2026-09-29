package infrastructure

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	accountDomain "hrportal_backend/modules/account/domain"
	attendanceDomain "hrportal_backend/modules/attendance/domain"
	permissionDomain "hrportal_backend/modules/izin/domain"
	leaveDomain "hrportal_backend/modules/leave/domain"
	"hrportal_backend/modules/report/domain"
	sppdDomain "hrportal_backend/modules/sppd/domain"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type ReportRepository struct {
	db          *gorm.DB
	dbSimpegNew *gorm.DB
	dbSimak     *gorm.DB
}

func NewReportRepository(db *gorm.DB, extraDBs ...*gorm.DB) domain.IReportRepository {
	var simpegNewDB *gorm.DB
	var simakDB *gorm.DB
	if len(extraDBs) > 0 {
		simpegNewDB = extraDBs[0]
	}
	if len(extraDBs) > 1 {
		simakDB = extraDBs[1]
	}
	return &ReportRepository{
		db:          db,
		dbSimpegNew: simpegNewDB,
		dbSimak:     simakDB,
	}
}

func (r *ReportRepository) GetDB() *gorm.DB {
	if r == nil {
		return nil
	}
	return r.db
}

type simpegDetail struct {
	ID           string  `gorm:"column:id"`
	Nip          *string `gorm:"column:nip"`
	Nidn         *string `gorm:"column:nidn_nitk"`
	Nuptk        *string `gorm:"column:nuptk"`
	Nama         *string `gorm:"column:nama"`
	Email        *string `gorm:"column:email"`
	NamaUnit     *string `gorm:"column:nama_unit"`
	NamaFakultas *string `gorm:"column:nama_fakultas"`
	NamaProdi    *string `gorm:"column:nama_prodi"`
}

func (r *ReportRepository) enrichPegawaiFromSimpeg(ctx context.Context, empMap map[string]accountDomain.Pegawai, requestedNip, requestedNidn string) {
	if r == nil || (r.db == nil && r.dbSimpegNew == nil && r.dbSimak == nil) {
		return
	}

	lookupKeysMap := make(map[string]bool)
	for k, p := range empMap {
		cleanK := strings.TrimSpace(k)
		if cleanK != "" {
			lookupKeysMap[cleanK] = true
		}
		cleanNip := strings.TrimSpace(p.Nip)
		cleanNidn := strings.TrimSpace(p.Nidn)
		if cleanNip != "" {
			lookupKeysMap[cleanNip] = true
		}
		if cleanNidn != "" {
			lookupKeysMap[cleanNidn] = true
		}
	}
	if reqNip := strings.TrimSpace(requestedNip); reqNip != "" {
		lookupKeysMap[reqNip] = true
	}
	if reqNidn := strings.TrimSpace(requestedNidn); reqNidn != "" {
		lookupKeysMap[reqNidn] = true
	}

	if len(lookupKeysMap) == 0 {
		return
	}

	var keys []string
	for k := range lookupKeysMap {
		keys = append(keys, k)
	}

	var details []simpegDetail
	dbSimpeg := r.dbSimpegNew
	tableName := "pegawais p"
	ppTable := "pegawai_pekerjaans pp"
	uTable := "master_units u"

	if dbSimpeg == nil && r.db != nil {
		dbSimpeg = r.db
		tableName = "unpak_newsimpeg.pegawais p"
		ppTable = "unpak_newsimpeg.pegawai_pekerjaans pp"
		uTable = "unpak_newsimpeg.master_units u"
	}

	// 1. Target unpak_newsimpeg.pegawais
	if dbSimpeg != nil {
		err := dbSimpeg.WithContext(ctx).
			Table(tableName).
			Select("p.id, p.nip, p.nidn_nitk, p.nuptk, p.nama, p.email, u.nama_unit").
			Joins("LEFT JOIN "+ppTable+" ON pp.pegawai_id = p.id AND pp.deleted_at IS NULL").
			Joins("LEFT JOIN "+uTable+" ON u.kode_unit = pp.kode_unit").
			Where("TRIM(p.nip) IN (?) OR TRIM(p.nidn_nitk) IN (?) OR TRIM(p.nuptk) IN (?)", keys, keys, keys).
			Order("p.id, (pp.status_berlaku = 'BERLAKU') DESC, (pp.status = 'AKTIF') DESC, pp.created_at DESC").
			Scan(&details).Error

		if err != nil || len(details) == 0 {
			_ = dbSimpeg.WithContext(ctx).
				Table(tableName).
				Select("p.id, p.nip, p.nidn_nitk, p.nuptk, p.nama, p.email, '' as nama_unit").
				Where("TRIM(p.nip) IN (?) OR TRIM(p.nidn_nitk) IN (?) OR TRIM(p.nuptk) IN (?)", keys, keys, keys).
				Scan(&details).Error
		}
	}

	// 2. Target unpak_simak.m_dosen
	type dosenDetail struct {
		Nidn         string  `gorm:"column:NIDN"`
		NamaDosen    string  `gorm:"column:Nama_Dosen"`
		NamaFakultas *string `gorm:"column:nama_fakultas"`
		NamaProdi    *string `gorm:"column:nama_prodi"`
	}
	var dosens []dosenDetail
	simakDB := r.dbSimak
	dosenTable := "m_dosen"
	fakTable := "m_fakultas"
	prodiTable := "m_program_studi"

	if simakDB == nil && r.db != nil {
		simakDB = r.db
		dosenTable = "unpak_simak.m_dosen"
		fakTable = "unpak_simak.m_fakultas"
		prodiTable = "unpak_simak.m_program_studi"
	}

	simakKeysMap := make(map[string]bool)
	for _, k := range keys {
		simakKeysMap[k] = true
	}
	for _, d := range details {
		if d.Nidn != nil && strings.TrimSpace(*d.Nidn) != "" {
			simakKeysMap[strings.TrimSpace(*d.Nidn)] = true
		}
		if d.Nip != nil && strings.TrimSpace(*d.Nip) != "" {
			simakKeysMap[strings.TrimSpace(*d.Nip)] = true
		}
	}
	var simakKeys []string
	for k := range simakKeysMap {
		simakKeys = append(simakKeys, k)
	}

	if simakDB != nil && len(simakKeys) > 0 {
		_ = simakDB.WithContext(ctx).Table(dosenTable).
			Select("m_dosen.NIDN, m_dosen.Nama_Dosen, m_fakultas.nama_fakultas, m_program_studi.nama_prodi").
			Joins("LEFT JOIN "+fakTable+" ON m_fakultas.kode_fakultas = m_dosen.kode_fak").
			Joins("LEFT JOIN "+prodiTable+" ON m_program_studi.kode_prodi = m_dosen.kode_prodi").
			Where("TRIM(m_dosen.NIDN) IN (?)", simakKeys).
			Scan(&dosens).Error
	}

	dosenByNidn := make(map[string]dosenDetail)
	for _, dos := range dosens {
		cleanNidn := strings.TrimSpace(dos.Nidn)
		if cleanNidn != "" {
			dosenByNidn[cleanNidn] = dos
		}
	}

	// Build SIMPEG detail index
	detailByIdentifier := make(map[string]simpegDetail)
	registerDetail := func(d simpegDetail) {
		regKey := func(k string) {
			k = strings.TrimSpace(k)
			if k == "" {
				return
			}
			if existing, exists := detailByIdentifier[k]; !exists {
				detailByIdentifier[k] = d
			} else {
				if (existing.Nama == nil || *existing.Nama == "") && d.Nama != nil && *d.Nama != "" {
					existing.Nama = d.Nama
				}
				if (existing.NamaUnit == nil || *existing.NamaUnit == "") && d.NamaUnit != nil && *d.NamaUnit != "" {
					existing.NamaUnit = d.NamaUnit
				}
				if (existing.Email == nil || *existing.Email == "") && d.Email != nil && *d.Email != "" {
					existing.Email = d.Email
				}
				if (existing.Nip == nil || *existing.Nip == "") && d.Nip != nil && *d.Nip != "" {
					existing.Nip = d.Nip
				}
				if (existing.Nidn == nil || *existing.Nidn == "") && d.Nidn != nil && *d.Nidn != "" {
					existing.Nidn = d.Nidn
				}
				if (existing.Nuptk == nil || *existing.Nuptk == "") && d.Nuptk != nil && *d.Nuptk != "" {
					existing.Nuptk = d.Nuptk
				}
				detailByIdentifier[k] = existing
			}
		}

		if d.Nip != nil {
			regKey(*d.Nip)
		}
		if d.Nidn != nil {
			regKey(*d.Nidn)
		}
		if d.Nuptk != nil {
			regKey(*d.Nuptk)
		}
		if d.ID != "" {
			regKey(d.ID)
		}
	}

	for _, d := range details {
		registerDetail(d)
	}

	emptyStr := ""
	// Update empMap with matched details
	for k, emp := range empMap {
		cleanNip := strings.TrimSpace(emp.Nip)
		cleanNidn := strings.TrimSpace(emp.Nidn)
		cleanKey := strings.TrimSpace(k)

		var matched simpegDetail
		var foundSimpeg bool

		if cleanNip != "" {
			if d, ok := detailByIdentifier[cleanNip]; ok {
				matched = d
				foundSimpeg = true
			}
		}
		if !foundSimpeg && cleanNidn != "" {
			if d, ok := detailByIdentifier[cleanNidn]; ok {
				matched = d
				foundSimpeg = true
			}
		}
		if !foundSimpeg && cleanKey != "" {
			if d, ok := detailByIdentifier[cleanKey]; ok {
				matched = d
				foundSimpeg = true
			}
		}

		if foundSimpeg {
			if matched.Nidn != nil {
				emp.Nidn = strings.TrimSpace(*matched.Nidn)
			} else {
				emp.Nidn = ""
			}
			if matched.Nip != nil && strings.TrimSpace(*matched.Nip) != "" {
				emp.Nip = strings.TrimSpace(*matched.Nip)
			}
			if matched.Nama != nil && strings.TrimSpace(*matched.Nama) != "" {
				emp.Nama = strings.TrimSpace(*matched.Nama)
			}
			if (emp.Email == nil || *emp.Email == "") && matched.Email != nil && *matched.Email != "" {
				emp.Email = matched.Email
			}
			if matched.NamaUnit != nil && strings.TrimSpace(*matched.NamaUnit) != "" {
				uStr := strings.TrimSpace(*matched.NamaUnit)
				emp.UnitKerja = &uStr
				emp.Unit = &uStr
			}
		}

		// Check SIMAK dosen for Fakultas & Prodi
		var matchedDosen dosenDetail
		var foundDosen bool
		for _, cKey := range []string{strings.TrimSpace(emp.Nidn), strings.TrimSpace(emp.Nip), cleanNidn, cleanNip, cleanKey} {
			if cKey != "" {
				if dos, ok := dosenByNidn[cKey]; ok {
					matchedDosen = dos
					foundDosen = true
					break
				}
			}
		}

		if foundDosen {
			if emp.Nama == "" && strings.TrimSpace(matchedDosen.NamaDosen) != "" {
				emp.Nama = strings.TrimSpace(matchedDosen.NamaDosen)
			}
			if matchedDosen.NamaFakultas != nil && strings.TrimSpace(*matchedDosen.NamaFakultas) != "" {
				fStr := strings.TrimSpace(*matchedDosen.NamaFakultas)
				emp.Fakultas = &fStr
			} else {
				emp.Fakultas = &emptyStr
			}
			if matchedDosen.NamaProdi != nil && strings.TrimSpace(*matchedDosen.NamaProdi) != "" {
				pStr := strings.TrimSpace(*matchedDosen.NamaProdi)
				emp.Prodi = &pStr
			} else {
				emp.Prodi = &emptyStr
			}
			// If unit is still empty (dosen only in SIMAK), fallback to fakultas
			if (emp.UnitKerja == nil || *emp.UnitKerja == "") && emp.Fakultas != nil && *emp.Fakultas != "" {
				emp.UnitKerja = emp.Fakultas
				emp.Unit = emp.Fakultas
			}
		} else {
			// Tendik or dosen not in SIMAK: Fakultas & Prodi MUST be empty
			emp.Fakultas = &emptyStr
			emp.Prodi = &emptyStr
		}

		empMap[k] = emp
	}

	// If requested nip/nidn was passed but not present in empMap, add it from details
	addRequested := func(reqKey string) {
		reqKey = strings.TrimSpace(reqKey)
		if reqKey == "" {
			return
		}
		if _, exists := empMap[reqKey]; exists {
			return
		}
		var nidnStr, nipStr, namaStr string
		var uStr *string
		var email *string
		if d, ok := detailByIdentifier[reqKey]; ok {
			if d.Nidn != nil {
				nidnStr = strings.TrimSpace(*d.Nidn)
			}
			if d.Nip != nil {
				nipStr = strings.TrimSpace(*d.Nip)
			} else {
				nipStr = reqKey
			}
			if d.Nama != nil {
				namaStr = strings.TrimSpace(*d.Nama)
			}
			email = d.Email
			if d.NamaUnit != nil && strings.TrimSpace(*d.NamaUnit) != "" {
				s := strings.TrimSpace(*d.NamaUnit)
				uStr = &s
			}
		} else {
			nipStr = reqKey
		}

		newEmp := accountDomain.Pegawai{
			Nip:       nipStr,
			Nidn:      nidnStr,
			Nama:      namaStr,
			Email:     email,
			UnitKerja: uStr,
			Unit:      uStr,
			Fakultas:  &emptyStr,
			Prodi:     &emptyStr,
		}

		for _, ck := range []string{nidnStr, nipStr, reqKey} {
			if ck != "" {
				if dos, ok := dosenByNidn[ck]; ok {
					if newEmp.Nama == "" && strings.TrimSpace(dos.NamaDosen) != "" {
						newEmp.Nama = strings.TrimSpace(dos.NamaDosen)
					}
					if dos.NamaFakultas != nil && strings.TrimSpace(*dos.NamaFakultas) != "" {
						fStr := strings.TrimSpace(*dos.NamaFakultas)
						newEmp.Fakultas = &fStr
					}
					if dos.NamaProdi != nil && strings.TrimSpace(*dos.NamaProdi) != "" {
						pStr := strings.TrimSpace(*dos.NamaProdi)
						newEmp.Prodi = &pStr
					}
					if (newEmp.UnitKerja == nil || *newEmp.UnitKerja == "") && newEmp.Fakultas != nil && *newEmp.Fakultas != "" {
						newEmp.UnitKerja = newEmp.Fakultas
						newEmp.Unit = newEmp.Fakultas
					}
					break
				}
			}
		}
		empMap[reqKey] = newEmp
	}

	addRequested(requestedNip)
	addRequested(requestedNidn)

	// Targeted fallback: for any employee still missing a name, do targeted single lookup
	for k, emp := range empMap {
		cleanNama := strings.TrimSpace(emp.Nama)
		if cleanNama == "" || cleanNama == emp.Nip || cleanNama == emp.Nidn || cleanNama == k {
			searchTarget := strings.TrimSpace(emp.Nip)
			if searchTarget == "" {
				searchTarget = strings.TrimSpace(emp.Nidn)
			}
			if searchTarget == "" {
				searchTarget = strings.TrimSpace(k)
			}
			if searchTarget == "" {
				continue
			}

			var singleDetail simpegDetail
			if dbSimpeg != nil {
				_ = dbSimpeg.WithContext(ctx).Table(tableName).
					Select("p.id, p.nip, p.nidn_nitk, p.nuptk, p.nama, p.email, u.nama_unit").
					Joins("LEFT JOIN "+ppTable+" ON pp.pegawai_id = p.id AND pp.deleted_at IS NULL").
					Joins("LEFT JOIN "+uTable+" ON u.kode_unit = pp.kode_unit").
					Where("p.nip = ? OR p.nidn_nitk = ? OR p.nuptk = ? OR p.nip LIKE ? OR p.nidn_nitk LIKE ? OR p.nuptk LIKE ?",
						searchTarget, searchTarget, searchTarget,
						"%"+searchTarget+"%", "%"+searchTarget+"%", "%"+searchTarget+"%").
					Order("p.id, (pp.status_berlaku = 'BERLAKU') DESC, (pp.status = 'AKTIF') DESC, pp.created_at DESC").
					First(&singleDetail).Error

				if singleDetail.Nama == nil || strings.TrimSpace(*singleDetail.Nama) == "" {
					_ = dbSimpeg.WithContext(ctx).Table(tableName).
						Select("p.id, p.nip, p.nidn_nitk, p.nuptk, p.nama, p.email, '' as nama_unit").
						Where("p.nip = ? OR p.nidn_nitk = ? OR p.nuptk = ? OR p.nip LIKE ? OR p.nidn_nitk LIKE ? OR p.nuptk LIKE ?",
							searchTarget, searchTarget, searchTarget,
							"%"+searchTarget+"%", "%"+searchTarget+"%", "%"+searchTarget+"%").
						First(&singleDetail).Error
				}
			}

			// If still not found, check m_dosen
			if (singleDetail.Nama == nil || strings.TrimSpace(*singleDetail.Nama) == "") && simakDB != nil {
				var dos dosenDetail
				_ = simakDB.WithContext(ctx).Table(dosenTable).
					Select("m_dosen.NIDN, m_dosen.Nama_Dosen, m_fakultas.nama_fakultas, m_program_studi.nama_prodi").
					Joins("LEFT JOIN "+fakTable+" ON m_fakultas.kode_fakultas = m_dosen.kode_fak").
					Joins("LEFT JOIN "+prodiTable+" ON m_program_studi.kode_prodi = m_dosen.kode_prodi").
					Where("m_dosen.NIDN = ? OR m_dosen.NIDN LIKE ?", searchTarget, "%"+searchTarget+"%").
					First(&dos).Error
				if dos.NamaDosen != "" {
					namaD := strings.TrimSpace(dos.NamaDosen)
					nidnD := strings.TrimSpace(dos.Nidn)
					singleDetail.Nama = &namaD
					singleDetail.Nidn = &nidnD
					if dos.NamaFakultas != nil {
						fStr := strings.TrimSpace(*dos.NamaFakultas)
						emp.Fakultas = &fStr
					}
					if dos.NamaProdi != nil {
						pStr := strings.TrimSpace(*dos.NamaProdi)
						emp.Prodi = &pStr
					}
				}
			}

			if singleDetail.Nama != nil && strings.TrimSpace(*singleDetail.Nama) != "" {
				emp.Nama = strings.TrimSpace(*singleDetail.Nama)
				if singleDetail.Nip != nil && strings.TrimSpace(*singleDetail.Nip) != "" {
					emp.Nip = strings.TrimSpace(*singleDetail.Nip)
				}
				if singleDetail.Nidn != nil && strings.TrimSpace(*singleDetail.Nidn) != "" {
					emp.Nidn = strings.TrimSpace(*singleDetail.Nidn)
				}
				if emp.Email == nil {
					emp.Email = singleDetail.Email
				}
				if (emp.UnitKerja == nil || *emp.UnitKerja == "") && singleDetail.NamaUnit != nil && strings.TrimSpace(*singleDetail.NamaUnit) != "" {
					uStr := strings.TrimSpace(*singleDetail.NamaUnit)
					emp.UnitKerja = &uStr
					emp.Unit = &uStr
				}
				empMap[k] = emp
			}
		}
	}
}

func (r *ReportRepository) GetReportSummary(ctx context.Context, nip string, periodeType domain.PeriodeType, periodeKey string) (*domain.RekapLaporanBulanan, error) {
	targetNip := strings.TrimSpace(nip)
	if periodeKey == "" {
		periodeKey = time.Now().Format("2006-01")
	}

	if r == nil || r.db == nil {
		now := time.Now()
		return &domain.RekapLaporanBulanan{
			Nip:         targetNip,
			Nidn:        targetNip,
			PeriodeType: periodeType,
			PeriodeKey:  periodeKey,
			UpdatedAt:   &now,
		}, nil
	}

	loc := time.Local
	refDate, err := time.ParseInLocation("2006-01", periodeKey, loc)
	if err != nil {
		refDate = time.Now().In(loc)
	}

	var vStart, vEnd time.Time
	if periodeType == domain.PeriodeCutoff {
		vStart = time.Date(refDate.Year(), refDate.Month()-1, 16, 0, 0, 0, 0, loc)
		vEnd = time.Date(refDate.Year(), refDate.Month(), 15, 0, 0, 0, 0, loc)
	} else {
		vStart = time.Date(refDate.Year(), refDate.Month(), 1, 0, 0, 0, 0, loc)
		vEnd = time.Date(refDate.Year(), refDate.Month()+1, 0, 0, 0, 0, 0, loc)
	}

	startStr := vStart.Format("2006-01-02")
	endStr := vEnd.Format("2006-01-02")

	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	evalEnd := vEnd
	if evalEnd.After(today) {
		evalEnd = today
	}
	evalEndStr := evalEnd.Format("2006-01-02")

	var (
		wg                                                        sync.WaitGroup
		cMasuk, cIzin, cCuti, cSppd, cUpacara, cLibur, cWorkedOff int64
		emp                                                       accountDomain.Pegawai
	)

	wg.Add(7)

	// 1. Employee info
	go func() {
		defer wg.Done()
		if targetNip != "" && r.db != nil {
			_ = r.db.WithContext(ctx).Model(&accountDomain.Pegawai{}).
				Where("nip = ? OR nidn = ?", targetNip, targetNip).
				First(&emp).Error
		}
	}()

	// 2. Absen Masuk (active up to today) & count check-ins on off-days (Sundays & holidays)
	go func() {
		defer wg.Done()
		if r.db != nil {
			buildUserWhere(r.db.WithContext(ctx).Model(&attendanceDomain.Absen{}), targetNip, targetNip).
				Where("tanggal >= ? AND tanggal <= ? AND absen_masuk IS NOT NULL", startStr, evalEndStr).
				Count(&cMasuk)

			var dates []string
			buildUserWhere(r.db.WithContext(ctx).Model(&attendanceDomain.Absen{}), targetNip, targetNip).
				Where("tanggal >= ? AND tanggal <= ? AND absen_masuk IS NOT NULL", startStr, evalEndStr).
				Pluck("tanggal", &dates)

			for _, dStr := range dates {
				cleanDate := strings.Split(dStr, "T")[0]
				if t, err := time.Parse("2006-01-02", cleanDate); err == nil {
					isOff := t.Weekday() == time.Sunday
					if !isOff {
						var countLibur int64
						r.db.WithContext(ctx).Table("master_libur").
							Where("tanggal LIKE ? AND is_national_holiday = 1", cleanDate+"%").
							Count(&countLibur)
						if countLibur > 0 {
							isOff = true
						}
					}
					if isOff {
						cWorkedOff++
					}
				}
			}
		}
	}()

	// 3. Izin (Terima SDM) (active up to today)
	go func() {
		defer wg.Done()
		if r.db != nil {
			buildUserWhere(r.db.WithContext(ctx).Model(&permissionDomain.Izin{}), targetNip, targetNip).
				Where("tanggal_pengajuan >= ? AND tanggal_pengajuan <= ? AND LOWER(TRIM(status)) = 'terima sdm'", startStr, evalEndStr).
				Count(&cIzin)
		}
	}()

	// 4. Cuti (Terima SDM) (active up to today)
	go func() {
		defer wg.Done()
		if r.db != nil {
			buildUserWhere(r.db.WithContext(ctx).Model(&leaveDomain.Cuti{}), targetNip, targetNip).
				Where("tanggal_mulai <= ? AND tanggal_akhir >= ? AND LOWER(TRIM(status)) = 'terima sdm'", evalEndStr, startStr).
				Count(&cCuti)
		}
	}()

	// 5. SPPD + Anggota (Terima SDM) (active up to today)
	go func() {
		defer wg.Done()
		if r.db != nil {
			buildSppdUserWhere(r.db.WithContext(ctx).Model(&sppdDomain.Sppd{}), targetNip, targetNip).
				Where("tanggal_berangkat <= ? AND tanggal_kembali >= ? AND LOWER(TRIM(status)) = 'terima sdm'", evalEndStr, startStr).
				Count(&cSppd)
		}
	}()

	// 6. Absen Upacara (Full Year YYYY)
	go func() {
		defer wg.Done()
		if r.db != nil {
			yearStartStr := fmt.Sprintf("%d-01-01", refDate.Year())
			yearEndStr := fmt.Sprintf("%d-12-31", refDate.Year())
			buildUserWhere(r.db.WithContext(ctx).Model(&attendanceDomain.AbsenUpacara{}), targetNip, targetNip).
				Where("tanggal >= ? AND tanggal <= ?", yearStartStr, yearEndStr).
				Count(&cUpacara)
		}
	}()

	// 7. Master Libur (active up to today)
	go func() {
		defer wg.Done()
		if r.db != nil {
			r.db.WithContext(ctx).Table("master_libur").
				Where("tanggal >= ? AND tanggal <= ? AND is_national_holiday = 1", startStr, evalEndStr).
				Count(&cLibur)
		}
	}()

	wg.Wait()

	totalElapsedDays := 0
	sundaysCount := 0
	if !vStart.After(evalEnd) {
		for d := vStart; !d.After(evalEnd); d = d.AddDate(0, 0, 1) {
			totalElapsedDays++
			if d.Weekday() == time.Sunday {
				if d.Before(today) {
					sundaysCount++
				}
			}
		}
	}

	if periodeType == domain.PeriodeCutoff && sundaysCount == 4 {
		sundaysCount = 3
	}

	totalOffDays := sundaysCount + int(cLibur)
	elapsedWorkingDays := totalElapsedDays - totalOffDays
	if elapsedWorkingDays < 0 {
		elapsedWorkingDays = 0
	}

	regularWorkingMasuk := int(cMasuk) - int(cWorkedOff)
	if regularWorkingMasuk < 0 {
		regularWorkingMasuk = 0
	}

	totalTidakMasuk := elapsedWorkingDays - regularWorkingMasuk - int(cIzin) - int(cCuti) - int(cSppd)
	if totalTidakMasuk < 0 {
		totalTidakMasuk = 0
	}

	if targetNip != "" && (emp.Nama == "" || emp.Nama == targetNip) {
		var singleDetail simpegDetail
		findPegawaiSummary := func(db *gorm.DB, table string) error {
			return db.WithContext(ctx).Table(table).
				Select("p.id, p.nip, p.nidn_nitk, p.nuptk, p.nama, p.email, u.nama_unit").
				Joins("LEFT JOIN pegawai_pekerjaans pp ON pp.pegawai_id = p.id AND pp.deleted_at IS NULL").
				Joins("LEFT JOIN master_units u ON u.kode_unit = pp.kode_unit").
				Where("p.nip = ? OR p.nidn_nitk = ? OR p.nuptk = ? OR p.nip LIKE ? OR p.nidn_nitk LIKE ? OR p.nuptk LIKE ?",
					targetNip, targetNip, targetNip, "%"+targetNip+"%", "%"+targetNip+"%", "%"+targetNip+"%").
				Order("p.id, (pp.status_berlaku = 'BERLAKU') DESC, (pp.status = 'AKTIF') DESC, pp.created_at DESC").
				First(&singleDetail).Error
		}

		if r.dbSimpegNew != nil {
			_ = findPegawaiSummary(r.dbSimpegNew, "pegawais p")
		}
		if singleDetail.Nama == nil && r.db != nil {
			_ = findPegawaiSummary(r.db, "unpak_newsimpeg.pegawais p")
		}
		if singleDetail.Nama == nil && r.db != nil {
			_ = findPegawaiSummary(r.db, "pegawais p")
		}

		// Fallback to m_dosen
		if singleDetail.Nama == nil {
			var dos struct {
				Nidn      string `gorm:"column:NIDN"`
				NamaDosen string `gorm:"column:Nama_Dosen"`
			}
			findDosenSummary := func(db *gorm.DB, prefix string) error {
				return db.WithContext(ctx).Table(prefix+"m_dosen").
					Select("m_dosen.NIDN, m_dosen.Nama_Dosen").
					Where("m_dosen.NIDN = ? OR m_dosen.NIDN LIKE ?", targetNip, "%"+targetNip+"%").
					First(&dos).Error
			}
			if r.dbSimak != nil {
				_ = findDosenSummary(r.dbSimak, "")
			} else if r.db != nil {
				_ = findDosenSummary(r.db, "unpak_simak.")
			}
			if dos.NamaDosen != "" {
				namaD := strings.TrimSpace(dos.NamaDosen)
				singleDetail.Nama = &namaD
			}
		}

		if singleDetail.Nama != nil && strings.TrimSpace(*singleDetail.Nama) != "" {
			emp.Nama = strings.TrimSpace(*singleDetail.Nama)
			if singleDetail.Nip != nil && strings.TrimSpace(*singleDetail.Nip) != "" {
				emp.Nip = strings.TrimSpace(*singleDetail.Nip)
			}
			if singleDetail.Email != nil && strings.TrimSpace(*singleDetail.Email) != "" {
				emp.Email = singleDetail.Email
			}
			if (emp.UnitKerja == nil || *emp.UnitKerja == "") && singleDetail.NamaUnit != nil && strings.TrimSpace(*singleDetail.NamaUnit) != "" {
				uStr := strings.TrimSpace(*singleDetail.NamaUnit)
				emp.UnitKerja = &uStr
				emp.Unit = &uStr
			}
		}
	}

	namaVal := emp.Nama
	if namaVal == "" {
		namaVal = targetNip
	}
	unitVal := ""
	if emp.UnitKerja != nil && *emp.UnitKerja != "" {
		unitVal = *emp.UnitKerja
	} else if emp.Unit != nil {
		unitVal = *emp.Unit
	}
	fakultasVal := ""
	if emp.Fakultas != nil {
		fakultasVal = *emp.Fakultas
	}
	prodiVal := ""
	if emp.Prodi != nil {
		prodiVal = *emp.Prodi
	}

	rekap := &domain.RekapLaporanBulanan{
		Nip:             targetNip,
		Nidn:            targetNip,
		Nama:            namaVal,
		Unit:            unitVal,
		Fakultas:        fakultasVal,
		Prodi:           prodiVal,
		PeriodeType:     periodeType,
		PeriodeKey:      periodeKey,
		TanggalMulai:    startStr,
		TanggalAkhir:    endStr,
		TotalMasuk:      int(cMasuk),
		TotalIzin:       int(cIzin),
		TotalCuti:       int(cCuti),
		TotalSppd:       int(cSppd),
		TotalUpacara:    int(cUpacara),
		TotalLibur:      totalOffDays,
		TotalTidakMasuk: totalTidakMasuk,
		UpdatedAt:       &now,
	}

	return rekap, nil
}

func (r *ReportRepository) GetAllLaporanAbsen(ctx context.Context, tanggalMulai string, tanggalAkhir string, nip string, nidn string) (map[string]interface{}, error) {
	db := r.db
	if db == nil {
		log.Println("[ReportRepository] Error: Database connection is nil in GetAllLaporanAbsen")
		return map[string]interface{}{
			"versi_1_calendar": map[string]interface{}{"start": "", "end": "", "list_data": []domain.RekapLaporanBulanan{}},
			"versi_2_cutoff":   map[string]interface{}{"start": "", "end": "", "list_data": []domain.RekapLaporanBulanan{}},
		}, nil
	}

	now := time.Now()

	// 1. Versi 1 (Calendar Month)
	v1Start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	v1End := v1Start.AddDate(0, 1, -1)
	v1Key := v1Start.Format("2006-01")

	var rekapsV1 []domain.RekapLaporanBulanan
	q1 := db.WithContext(ctx).Model(&domain.RekapLaporanBulanan{}).
		Where("periode_type = ? AND periode_key = ?", domain.PeriodeCalendar, v1Key)
	if nip != "" {
		q1 = q1.Where("nip = ?", nip)
	}
	if nidn != "" {
		q1 = q1.Where("nidn = ?", nidn)
	}
	q1.Find(&rekapsV1)

	// 2. Versi 2 (Cutoff Period)
	v2Start := time.Date(now.Year(), now.Month()-1, 15, 0, 0, 0, 0, now.Location())
	v2End := time.Date(now.Year(), now.Month(), 15, 0, 0, 0, 0, now.Location())
	v2Key := now.Format("2006-01")

	var rekapsV2 []domain.RekapLaporanBulanan
	q2 := db.WithContext(ctx).Model(&domain.RekapLaporanBulanan{}).
		Where("periode_type = ? AND periode_key = ?", domain.PeriodeCutoff, v2Key)
	if nip != "" {
		q2 = q2.Where("nip = ?", nip)
	}
	if nidn != "" {
		q2 = q2.Where("nidn = ?", nidn)
	}
	q2.Find(&rekapsV2)

	return map[string]interface{}{
		"versi_1_calendar": map[string]interface{}{
			"start":     v1Start.Format("02 January 2006"),
			"end":       v1End.Format("02 January 2006"),
			"list_data": rekapsV1,
		},
		"versi_2_cutoff": map[string]interface{}{
			"start":     v2Start.Format("02 January 2006"),
			"end":       v2End.Format("02 January 2006"),
			"list_data": rekapsV2,
		},
	}, nil
}

func (r *ReportRepository) GetLaporanMergedParallel(ctx context.Context, tanggalMulai string, tanggalAkhir string, nip string, nidn string, userType string) ([]domain.LaporanPenggunaMerged, error) {
	db := r.db
	if db == nil {
		log.Println("[ReportRepository] Error: Database connection is nil in GetLaporanMergedParallel")
		return []domain.LaporanPenggunaMerged{}, nil
	}

	cleanFilterNip := strings.TrimSpace(nip)
	cleanFilterNidn := strings.TrimSpace(nidn)

	if tanggalMulai == "" {
		tanggalMulai = time.Now().Format("2006-01") + "-01"
	}
	if tanggalAkhir == "" {
		tanggalAkhir = time.Now().Format("2006-01-02")
	}

	var (
		wg           sync.WaitGroup
		absens       []attendanceDomain.Absen
		izins        []permissionDomain.Izin
		cutis        []leaveDomain.Cuti
		sppds        []sppdDomain.Sppd
		sppdAnggotas []sppdDomain.SppdAnggota
		upacaras     []attendanceDomain.AbsenUpacara
	)

	wg.Add(6)

	// Query 1: Absen Masuk
	go func() {
		defer wg.Done()
		if db == nil {
			return
		}
		q := db.WithContext(ctx).Model(&attendanceDomain.Absen{}).
			Where("tanggal >= ? AND tanggal <= ? AND absen_masuk IS NOT NULL", tanggalMulai, tanggalAkhir)
		if cleanFilterNip != "" && cleanFilterNidn != "" {
			q = q.Where("(nip = ? OR nidn = ?)", cleanFilterNip, cleanFilterNidn)
		} else if cleanFilterNip != "" {
			q = q.Where("nip = ?", cleanFilterNip)
		} else if cleanFilterNidn != "" {
			q = q.Where("nidn = ?", cleanFilterNidn)
		}
		q.Find(&absens)
	}()

	// Query 2: Izin
	go func() {
		defer wg.Done()
		if db == nil {
			return
		}
		q := db.WithContext(ctx).Model(&permissionDomain.Izin{}).
			Where("tanggal_pengajuan >= ? AND tanggal_pengajuan <= ? AND LOWER(TRIM(status)) = 'terima sdm'", tanggalMulai, tanggalAkhir)
		if cleanFilterNip != "" && cleanFilterNidn != "" {
			q = q.Where("(nip = ? OR nidn = ?)", cleanFilterNip, cleanFilterNidn)
		} else if cleanFilterNip != "" {
			q = q.Where("nip = ?", cleanFilterNip)
		} else if cleanFilterNidn != "" {
			q = q.Where("nidn = ?", cleanFilterNidn)
		}
		q.Find(&izins)
	}()

	// Query 3: Cuti
	go func() {
		defer wg.Done()
		if db == nil {
			return
		}
		q := db.WithContext(ctx).Model(&leaveDomain.Cuti{}).
			Where("tanggal_mulai <= ? AND tanggal_akhir >= ? AND LOWER(TRIM(status)) = 'terima sdm'", tanggalAkhir, tanggalMulai)
		if cleanFilterNip != "" && cleanFilterNidn != "" {
			q = q.Where("(nip = ? OR nidn = ?)", cleanFilterNip, cleanFilterNidn)
		} else if cleanFilterNip != "" {
			q = q.Where("nip = ?", cleanFilterNip)
		} else if cleanFilterNidn != "" {
			q = q.Where("nidn = ?", cleanFilterNidn)
		}
		q.Find(&cutis)
	}()

	// Query 4: SPPD
	go func() {
		defer wg.Done()
		if db == nil {
			return
		}
		q := db.WithContext(ctx).Model(&sppdDomain.Sppd{}).
			Where("tanggal_berangkat <= ? AND tanggal_kembali >= ? AND LOWER(TRIM(status)) = 'terima sdm'", tanggalAkhir, tanggalMulai)
		if cleanFilterNip != "" && cleanFilterNidn != "" {
			q = q.Where("(nip = ? OR nidn = ? OR id IN (SELECT id_sppd FROM sppd_anggota WHERE nip = ? OR nidn = ?))", cleanFilterNip, cleanFilterNidn, cleanFilterNip, cleanFilterNidn)
		} else if cleanFilterNip != "" {
			q = q.Where("(nip = ? OR id IN (SELECT id_sppd FROM sppd_anggota WHERE nip = ?))", cleanFilterNip, cleanFilterNip)
		} else if cleanFilterNidn != "" {
			q = q.Where("(nidn = ? OR id IN (SELECT id_sppd FROM sppd_anggota WHERE nidn = ?))", cleanFilterNidn, cleanFilterNidn)
		}
		q.Find(&sppds)
	}()

	// Query 5: SPPD Anggota
	go func() {
		defer wg.Done()
		if db == nil {
			return
		}
		qSa := db.WithContext(ctx).Model(&sppdDomain.SppdAnggota{}).
			Select("sppd_anggota.*").
			Joins("JOIN sppd ON sppd.id = sppd_anggota.id_sppd").
			Where("sppd.tanggal_berangkat <= ? AND sppd.tanggal_kembali >= ? AND LOWER(TRIM(sppd.status)) = 'terima sdm'", tanggalAkhir, tanggalMulai)
		if cleanFilterNip != "" && cleanFilterNidn != "" {
			qSa = qSa.Where("(sppd_anggota.nip = ? OR sppd_anggota.nidn = ?)", cleanFilterNip, cleanFilterNidn)
		} else if cleanFilterNip != "" {
			qSa = qSa.Where("sppd_anggota.nip = ?", cleanFilterNip)
		} else if cleanFilterNidn != "" {
			qSa = qSa.Where("sppd_anggota.nidn = ?", cleanFilterNidn)
		}
		qSa.Find(&sppdAnggotas)
	}()

	// Query 6: Absen Upacara
	go func() {
		defer wg.Done()
		if db == nil {
			return
		}
		qu := db.WithContext(ctx).Model(&attendanceDomain.AbsenUpacara{}).
			Where("tanggal >= ? AND tanggal <= ?", tanggalMulai, tanggalAkhir)
		if cleanFilterNip != "" && cleanFilterNidn != "" {
			qu = qu.Where("(nip = ? OR nidn = ?)", cleanFilterNip, cleanFilterNidn)
		} else if cleanFilterNip != "" {
			qu = qu.Where("nip = ?", cleanFilterNip)
		} else if cleanFilterNidn != "" {
			qu = qu.Where("nidn = ?", cleanFilterNidn)
		}
		qu.Find(&upacaras)
	}()

	wg.Wait()

	// Extract unique Pegawai list in-memory directly from fetched activity slices
	empMap := make(map[string]accountDomain.Pegawai)
	emptyStr := ""
	addPegawai := func(nipVal, nidnVal, namaVal, fakVal, prodiVal, unitVal string) {
		nipClean := strings.TrimSpace(nipVal)
		nidnClean := strings.TrimSpace(nidnVal)
		namaClean := strings.TrimSpace(namaVal)
		if nipClean == "" && nidnClean == "" {
			return
		}
		key := nipClean
		if key == "" {
			key = nidnClean
		}
		p, exists := empMap[key]
		if !exists {
			uStr := strings.TrimSpace(unitVal)
			empMap[key] = accountDomain.Pegawai{
				Nip:       nipClean,
				Nidn:      nidnClean,
				Nama:      namaClean,
				UnitKerja: &uStr,
				Unit:      &uStr,
				Fakultas:  &emptyStr,
				Prodi:     &emptyStr,
			}
		} else {
			if p.Nama == "" && namaClean != "" {
				p.Nama = namaClean
			}
			if p.Nidn == "" && nidnClean != "" {
				p.Nidn = nidnClean
			}
			if p.Nip == "" && nipClean != "" {
				p.Nip = nipClean
			}
			if (p.UnitKerja == nil || *p.UnitKerja == "") && strings.TrimSpace(unitVal) != "" {
				uStr := strings.TrimSpace(unitVal)
				p.UnitKerja = &uStr
				p.Unit = &uStr
			}
			empMap[key] = p
		}
	}

	for _, a := range absens {
		addPegawai(a.Nip, a.Nidn, a.NamaPegawai, a.Fakultas, a.Prodi, a.Unit)
	}
	for _, iz := range izins {
		addPegawai(iz.Nip, iz.Nidn, iz.NamaPemohon, iz.Fakultas, iz.Prodi, iz.Unit)
	}
	for _, c := range cutis {
		addPegawai(c.Nip, c.Nidn, c.NamaPemohon, c.Fakultas, c.Prodi, c.Unit)
	}
	for _, sp := range sppds {
		addPegawai(sp.Nip, sp.Nidn, sp.NamaPemohon, sp.Fakultas, sp.Prodi, sp.Unit)
	}
	for _, sa := range sppdAnggotas {
		addPegawai(sa.Nip, sa.Nidn, sa.Nama, sa.Fakultas, sa.Prodi, sa.Unit)
	}
	for _, u := range upacaras {
		addPegawai(u.Nip, u.Nidn, u.Nama, u.Fakultas, u.Prodi, u.Unit)
	}

	if cleanFilterNip != "" || cleanFilterNidn != "" {
		key := cleanFilterNip
		if key == "" {
			key = cleanFilterNidn
		}
		if _, exists := empMap[key]; !exists {
			empMap[key] = accountDomain.Pegawai{
				Nip:      cleanFilterNip,
				Nidn:     cleanFilterNidn,
				Nama:     key,
				Fakultas: &emptyStr,
				Prodi:    &emptyStr,
			}
		}
	}

	// Enrich employee info from SIMPEG (unpak_newsimpeg.pegawais)
	r.enrichPegawaiFromSimpeg(ctx, empMap, cleanFilterNip, cleanFilterNidn)

	// Map to look up members by SppdID quickly
	anggotaBySppdID := make(map[uint][]sppdDomain.SppdAnggota)
	for _, sa := range sppdAnggotas {
		anggotaBySppdID[sa.SppdID] = append(anggotaBySppdID[sa.SppdID], sa)
	}

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

	for _, a := range absens {
		var masukStr, keluarStr *string
		if a.AbsenMasuk != nil {
			s := a.AbsenMasuk.In(time.Local).Format("2006-01-02 15:04:05")
			masukStr = &s
		}
		if a.AbsenKeluar != nil {
			s := a.AbsenKeluar.In(time.Local).Format("2006-01-02 15:04:05")
			keluarStr = &s
		}
		rec := domain.RecordItem{
			ID:      a.ID,
			Tanggal: a.Tanggal,
			Type:    "absen",
			Info: map[string]interface{}{
				"masuk":  masukStr,
				"keluar": keluarStr,
			},
		}
		addRecord(a.Nip, a.Nidn, rec)
	}

	for _, iz := range izins {
		rec := domain.RecordItem{
			ID:      iz.ID,
			Tanggal: iz.TanggalPengajuan,
			Type:    "izin",
			Info: map[string]interface{}{
				"tujuan": iz.Tujuan,
			},
		}
		addRecord(iz.Nip, iz.Nidn, rec)
	}

	for _, c := range cutis {
		start, errS := parseDate(c.TanggalMulai)
		end, errE := parseDate(c.TanggalSelesai)
		if errS != nil {
			continue
		}
		if errE != nil || end.Before(start) {
			end = start
		}
		for cur := start; !cur.After(end); cur = cur.AddDate(0, 0, 1) {
			rec := domain.RecordItem{
				ID:      c.ID,
				Tanggal: cur.Format("2006-01-02"),
				Type:    "cuti",
				Info: map[string]interface{}{
					"alasan": c.Alasan,
					"status": c.Status,
				},
			}
			addRecord(c.Nip, c.Nidn, rec)
		}
	}

	for _, sp := range sppds {
		start, errS := parseDate(sp.TanggalBerangkat)
		end, errE := parseDate(sp.TanggalKembali)
		if errS != nil {
			continue
		}
		if errE != nil || end.Before(start) {
			end = start
		}
		for cur := start; !cur.After(end); cur = cur.AddDate(0, 0, 1) {
			rec := domain.RecordItem{
				ID:      sp.ID,
				Tanggal: cur.Format("2006-01-02"),
				Type:    "sppd",
				Info: map[string]interface{}{
					"maksud": sp.Keterangan,
					"tujuan": sp.Tujuan,
				},
			}
			addRecord(sp.Nip, sp.Nidn, rec)

			for _, member := range anggotaBySppdID[sp.ID] {
				addRecord(member.Nip, member.Nidn, rec)
			}
		}
	}

	for _, u := range upacaras {
		rec := domain.RecordItem{
			ID:      u.ID,
			Tanggal: u.Tanggal,
			Type:    "upacara",
			Info: map[string]interface{}{
				"tanggal": u.Tanggal,
			},
		}
		addRecord(u.Nip, u.Nidn, rec)
	}

	var results []domain.LaporanPenggunaMerged
	resultIndexByKode := make(map[string]int)

	for k, p := range empMap {
		kode := "NA"
		userTypeVal := "NA"
		cleanNidn := strings.TrimSpace(p.Nidn)
		cleanNip := strings.TrimSpace(p.Nip)
		cleanKey := strings.TrimSpace(k)

		if cleanNidn != "" {
			kode = cleanNidn
			userTypeVal = "dosen"
		} else if cleanNip != "" {
			kode = cleanNip
			userTypeVal = "pegawai"
		} else if cleanKey != "" {
			kode = cleanKey
			userTypeVal = "pegawai"
		}

		if userType != "" && !strings.EqualFold(userType, userTypeVal) {
			continue
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
		if recs == nil {
			recs = []domain.RecordItem{}
		}

		if idx, exists := resultIndexByKode[kode]; exists && kode != "NA" {
			// Merge records
			for _, rItem := range recs {
				rKey := fmt.Sprintf("%s-%d-%s", rItem.Type, rItem.ID, rItem.Tanggal)
				existingSeen := false
				for _, ex := range results[idx].Records {
					if fmt.Sprintf("%s-%d-%s", ex.Type, ex.ID, ex.Tanggal) == rKey {
						existingSeen = true
						break
					}
				}
				if !existingSeen {
					results[idx].Records = append(results[idx].Records, rItem)
				}
			}
			// Update employee info if current entry has more info
			if existingEmp, ok := results[idx].Pengguna.(accountDomain.Pegawai); ok {
				if existingEmp.Nama == "" && p.Nama != "" {
					existingEmp.Nama = p.Nama
				}
				if (existingEmp.UnitKerja == nil || *existingEmp.UnitKerja == "") && p.UnitKerja != nil && *p.UnitKerja != "" {
					existingEmp.UnitKerja = p.UnitKerja
					existingEmp.Unit = p.Unit
				}
				if (existingEmp.Fakultas == nil || *existingEmp.Fakultas == "") && p.Fakultas != nil && *p.Fakultas != "" {
					existingEmp.Fakultas = p.Fakultas
				}
				if (existingEmp.Prodi == nil || *existingEmp.Prodi == "") && p.Prodi != nil && *p.Prodi != "" {
					existingEmp.Prodi = p.Prodi
				}
				results[idx].Pengguna = existingEmp
			}
		} else {
			resultIndexByKode[kode] = len(results)
			results = append(results, domain.LaporanPenggunaMerged{
				Kode:     kode,
				Pengguna: p,
				Type:     userTypeVal,
				Records:  recs,
			})
		}
	}

	return results, nil
}

func (r *ReportRepository) GetFlatLaporanMergedParallel(ctx context.Context, tanggalMulai string, tanggalAkhir string, nip string, nidn string, userType string) ([]domain.FlatRecordItem, error) {
	merged, err := r.GetLaporanMergedParallel(ctx, tanggalMulai, tanggalAkhir, nip, nidn, userType)
	if err != nil {
		return nil, err
	}

	var flatList []domain.FlatRecordItem
	for _, m := range merged {
		for _, rec := range m.Records {
			flatList = append(flatList, domain.FlatRecordItem{
				ID:       rec.ID,
				Tanggal:  rec.Tanggal,
				Type:     rec.Type,
				Info:     rec.Info,
				Pengguna: m.Pengguna,
			})
		}
	}

	return flatList, nil
}

func (r *ReportRepository) CalculateReport(ctx context.Context) (map[string]interface{}, error) {
	// Query unique employees from local activity tables to bypass view_pegawai (connect_m_dosen, connect_e_pribadi, connect_n_pribadi queries)
	type employee struct {
		Nip      string `gorm:"column:nip"`
		Nidn     string `gorm:"column:nidn"`
		Nama     string `gorm:"column:nama"`
		Fakultas string `gorm:"column:fakultas"`
		Prodi    string `gorm:"column:prodi"`
		Unit     string `gorm:"column:unit"`
	}
	empSet := make(map[employee]bool)

	var eAbsen []employee
	r.db.WithContext(ctx).Model(&attendanceDomain.Absen{}).Select("DISTINCT nip, nidn, nama_pegawai AS nama, fakultas, prodi, unit").Find(&eAbsen)
	for _, e := range eAbsen {
		if e.Nip != "" || e.Nidn != "" {
			empSet[e] = true
		}
	}

	var eIzin []employee
	r.db.WithContext(ctx).Model(&permissionDomain.Izin{}).Where("LOWER(TRIM(status)) = 'terima sdm'").Select("DISTINCT nip, nidn, nama_pemohon AS nama, fakultas, prodi, unit").Find(&eIzin)
	for _, e := range eIzin {
		if e.Nip != "" || e.Nidn != "" {
			empSet[e] = true
		}
	}

	var eCuti []employee
	r.db.WithContext(ctx).Model(&leaveDomain.Cuti{}).Where("LOWER(TRIM(status)) = 'terima sdm'").Select("DISTINCT nip, nidn, nama_pemohon AS nama, fakultas, prodi, unit").Find(&eCuti)
	for _, e := range eCuti {
		if e.Nip != "" || e.Nidn != "" {
			empSet[e] = true
		}
	}

	var eSppd []employee
	r.db.WithContext(ctx).Model(&sppdDomain.Sppd{}).Where("LOWER(TRIM(status)) = 'terima sdm'").Select("DISTINCT nip, nidn, nama_pemohon AS nama, fakultas, prodi, unit").Find(&eSppd)
	for _, e := range eSppd {
		if e.Nip != "" || e.Nidn != "" {
			empSet[e] = true
		}
	}

	var eSppdAnggota []employee
	r.db.WithContext(ctx).Model(&sppdDomain.SppdAnggota{}).
		Joins("JOIN sppd ON sppd.id = sppd_anggota.id_sppd").
		Where("LOWER(TRIM(sppd.status)) = 'terima sdm'").
		Select("DISTINCT sppd_anggota.nip, sppd_anggota.nidn, sppd_anggota.nama, sppd_anggota.fakultas, sppd_anggota.prodi, sppd_anggota.unit").
		Find(&eSppdAnggota)
	for _, e := range eSppdAnggota {
		if e.Nip != "" || e.Nidn != "" {
			empSet[e] = true
		}
	}

	var eUpacara []employee
	r.db.WithContext(ctx).Model(&attendanceDomain.AbsenUpacara{}).Select("DISTINCT nip, nidn, nama, fakultas, prodi, unit").Find(&eUpacara)
	for _, e := range eUpacara {
		if e.Nip != "" || e.Nidn != "" {
			empSet[e] = true
		}
	}

	var pegawais []accountDomain.Pegawai
	empCalcMap := make(map[string]accountDomain.Pegawai)
	for emp := range empSet {
		nipVal := strings.TrimSpace(emp.Nip)
		nidnVal := strings.TrimSpace(emp.Nidn)
		if (nipVal == "" || nipVal == "-" || nipVal == "--") && (nidnVal == "" || nidnVal == "-" || nidnVal == "--") {
			continue
		}

		key := nipVal
		if key == "" {
			key = nidnVal
		}

		unitVal := emp.Unit
		fakultasVal := emp.Fakultas
		prodiVal := emp.Prodi

		empCalcMap[key] = accountDomain.Pegawai{
			Nip:       nipVal,
			Nidn:      nidnVal,
			Nama:      emp.Nama,
			UnitKerja: &unitVal,
			Unit:      &unitVal,
			Fakultas:  &fakultasVal,
			Prodi:     &prodiVal,
		}
	}

	r.enrichPegawaiFromSimpeg(ctx, empCalcMap, "", "")
	for _, p := range empCalcMap {
		pegawais = append(pegawais, p)
	}

	var writeMu sync.Mutex

	var months []string
	// Find distinct months across all activity tables filtered by status
	var mAbsen, mIzin, mCuti, mSppd, mUpacara []string
	qAbsen := r.db.WithContext(ctx).Model(&attendanceDomain.Absen{}).Where("absen_masuk IS NOT NULL")
	qIzin := r.db.WithContext(ctx).Model(&permissionDomain.Izin{}).Where("LOWER(TRIM(status)) = 'terima sdm'")
	qCuti := r.db.WithContext(ctx).Model(&leaveDomain.Cuti{}).Where("LOWER(TRIM(status)) = 'terima sdm'")
	qSppd := r.db.WithContext(ctx).Model(&sppdDomain.Sppd{}).Where("LOWER(TRIM(status)) = 'terima sdm'")
	qUpacara := r.db.WithContext(ctx).Model(&attendanceDomain.AbsenUpacara{})

	qAbsen.Select("DISTINCT DATE_FORMAT(tanggal, '%Y-%m')").Pluck("DISTINCT DATE_FORMAT(tanggal, '%Y-%m')", &mAbsen)
	qIzin.Select("DISTINCT DATE_FORMAT(tanggal_pengajuan, '%Y-%m')").Pluck("DISTINCT DATE_FORMAT(tanggal_pengajuan, '%Y-%m')", &mIzin)
	qCuti.Select("DISTINCT DATE_FORMAT(tanggal_mulai, '%Y-%m')").Pluck("DISTINCT DATE_FORMAT(tanggal_mulai, '%Y-%m')", &mCuti)
	qSppd.Select("DISTINCT DATE_FORMAT(tanggal_berangkat, '%Y-%m')").Pluck("DISTINCT DATE_FORMAT(tanggal_berangkat, '%Y-%m')", &mSppd)
	qUpacara.Select("DISTINCT DATE_FORMAT(tanggal, '%Y-%m')").Pluck("DISTINCT DATE_FORMAT(tanggal, '%Y-%m')", &mUpacara)

	monthSet := make(map[string]bool)
	for _, list := range [][]string{mAbsen, mIzin, mCuti, mSppd, mUpacara} {
		for _, m := range list {
			if m != "" {
				monthSet[m] = true
			}
		}
	}

	if len(monthSet) == 0 {
		monthSet[time.Now().Format("2006-01")] = true
	}

	for m := range monthSet {
		months = append(months, m)
	}

	now := time.Now()
	var totalRecordsProcessed int64

	for _, mStr := range months {
		loc := time.Local
		refDate, err := time.ParseInLocation("2006-01", mStr, loc)
		if err != nil {
			continue
		}

		// 1. Versi 1 (Calendar Month: 1st to last day)
		v1Start := time.Date(refDate.Year(), refDate.Month(), 1, 0, 0, 0, 0, loc)
		v1End := time.Date(refDate.Year(), refDate.Month()+1, 0, 0, 0, 0, 0, loc)
		v1Key := v1Start.Format("2006-01")

		// 2. Versi 2 (Cutoff Period: 16th of prev month to 15th of curr month)
		v2Start := time.Date(refDate.Year(), refDate.Month()-1, 16, 0, 0, 0, 0, loc)
		v2End := time.Date(refDate.Year(), refDate.Month(), 15, 0, 0, 0, 0, loc)
		v2Key := refDate.Format("2006-01")

		var cLiburV1, cLiburV2 int64
		r.db.WithContext(ctx).Table("master_libur").
			Where("tanggal >= ? AND tanggal <= ? AND is_national_holiday = 1", v1Start.Format("2006-01-02"), v1End.Format("2006-01-02")).
			Count(&cLiburV1)

		r.db.WithContext(ctx).Table("master_libur").
			Where("tanggal >= ? AND tanggal <= ? AND is_national_holiday = 1", v2Start.Format("2006-01-02"), v2End.Format("2006-01-02")).
			Count(&cLiburV2)

		type job struct {
			p accountDomain.Pegawai
		}
		jobs := make(chan job, len(pegawais))
		for _, p := range pegawais {
			jobs <- job{p: p}
		}
		close(jobs)

		var wgWorkers sync.WaitGroup
		numWorkers := 10 // Safe concurrent database workers
		for w := 1; w <= numWorkers; w++ {
			wgWorkers.Add(1)
			go func() {
				defer wgWorkers.Done()
				for j := range jobs {
					p := j.p
					nipVal := strings.TrimSpace(p.Nip)
					nidnVal := strings.TrimSpace(p.Nidn)
					if nipVal == "" && nidnVal == "" {
						continue
					}

					var cMasukV1, cIzinV1, cCutiV1, cSppdV1, cUpacaraV1 int64
					var cMasukV2, cIzinV2, cCutiV2, cSppdV2, cUpacaraV2 int64

					var wgCount sync.WaitGroup
					wgCount.Add(10)

					// Count V1 Calendar in parallel
					go func() {
						defer wgCount.Done()
						buildUserWhere(r.db.WithContext(ctx).Model(&attendanceDomain.Absen{}), nipVal, nidnVal).
							Where("tanggal >= ? AND tanggal <= ? AND absen_masuk IS NOT NULL", v1Start.Format("2006-01-02"), v1End.Format("2006-01-02")).
							Count(&cMasukV1)
					}()
					go func() {
						defer wgCount.Done()
						buildUserWhere(r.db.WithContext(ctx).Model(&permissionDomain.Izin{}), nipVal, nidnVal).
							Where("tanggal_pengajuan >= ? AND tanggal_pengajuan <= ? AND LOWER(TRIM(status)) = 'terima sdm'", v1Start.Format("2006-01-02"), v1End.Format("2006-01-02")).
							Count(&cIzinV1)
					}()
					go func() {
						defer wgCount.Done()
						buildUserWhere(r.db.WithContext(ctx).Model(&leaveDomain.Cuti{}), nipVal, nidnVal).
							Where("tanggal_mulai <= ? AND tanggal_akhir >= ? AND LOWER(TRIM(status)) = 'terima sdm'", v1End.Format("2006-01-02"), v1Start.Format("2006-01-02")).
							Count(&cCutiV1)
					}()
					go func() {
						defer wgCount.Done()
						buildSppdUserWhere(r.db.WithContext(ctx).Model(&sppdDomain.Sppd{}), nipVal, nidnVal).
							Where("tanggal_berangkat <= ? AND tanggal_kembali >= ? AND LOWER(TRIM(status)) = 'terima sdm'", v1End.Format("2006-01-02"), v1Start.Format("2006-01-02")).
							Count(&cSppdV1)
					}()
					go func() {
						defer wgCount.Done()
						buildUserWhere(r.db.WithContext(ctx).Model(&attendanceDomain.AbsenUpacara{}), nipVal, nidnVal).
							Where("tanggal >= ? AND tanggal <= ?", v1Start.Format("2006-01-02"), v1End.Format("2006-01-02")).
							Count(&cUpacaraV1)
					}()

					// Count V2 Cutoff in parallel
					go func() {
						defer wgCount.Done()
						buildUserWhere(r.db.WithContext(ctx).Model(&attendanceDomain.Absen{}), nipVal, nidnVal).
							Where("tanggal >= ? AND tanggal <= ? AND absen_masuk IS NOT NULL", v2Start.Format("2006-01-02"), v2End.Format("2006-01-02")).
							Count(&cMasukV2)
					}()
					go func() {
						defer wgCount.Done()
						buildUserWhere(r.db.WithContext(ctx).Model(&permissionDomain.Izin{}), nipVal, nidnVal).
							Where("tanggal_pengajuan >= ? AND tanggal_pengajuan <= ? AND LOWER(TRIM(status)) = 'terima sdm'", v2Start.Format("2006-01-02"), v2End.Format("2006-01-02")).
							Count(&cIzinV2)
					}()
					go func() {
						defer wgCount.Done()
						buildUserWhere(r.db.WithContext(ctx).Model(&leaveDomain.Cuti{}), nipVal, nidnVal).
							Where("tanggal_mulai <= ? AND tanggal_akhir >= ? AND LOWER(TRIM(status)) = 'terima sdm'", v2End.Format("2006-01-02"), v2Start.Format("2006-01-02")).
							Count(&cCutiV2)
					}()
					go func() {
						defer wgCount.Done()
						buildSppdUserWhere(r.db.WithContext(ctx).Model(&sppdDomain.Sppd{}), nipVal, nidnVal).
							Where("tanggal_berangkat <= ? AND tanggal_kembali >= ? AND LOWER(TRIM(status)) = 'terima sdm'", v2End.Format("2006-01-02"), v2Start.Format("2006-01-02")).
							Count(&cSppdV2)
					}()
					go func() {
						defer wgCount.Done()
						buildUserWhere(r.db.WithContext(ctx).Model(&attendanceDomain.AbsenUpacara{}), nipVal, nidnVal).
							Where("tanggal >= ? AND tanggal <= ?", v2Start.Format("2006-01-02"), v2End.Format("2006-01-02")).
							Count(&cUpacaraV2)
					}()

					wgCount.Wait()

					namaVal := p.Nama
					unitVal := ""
					if p.UnitKerja != nil && *p.UnitKerja != "" {
						unitVal = *p.UnitKerja
					} else if p.Unit != nil {
						unitVal = *p.Unit
					}
					fakultasVal := ""
					if p.Fakultas != nil {
						fakultasVal = *p.Fakultas
					}
					prodiVal := ""
					if p.Prodi != nil {
						prodiVal = *p.Prodi
					}

					itemV1 := domain.RekapLaporanBulanan{
						Nip:          nipVal,
						Nidn:         nidnVal,
						Nama:         namaVal,
						Unit:         unitVal,
						Fakultas:     fakultasVal,
						Prodi:        prodiVal,
						PeriodeType:  domain.PeriodeCalendar,
						PeriodeKey:   v1Key,
						TanggalMulai: v1Start.Format("2006-01-02"),
						TanggalAkhir: v1End.Format("2006-01-02"),
						TotalMasuk:   int(cMasukV1),
						TotalIzin:    int(cIzinV1),
						TotalCuti:    int(cCutiV1),
						TotalSppd:    int(cSppdV1),
						TotalUpacara: int(cUpacaraV1),
						TotalLibur:   int(cLiburV1),
						UpdatedAt:    &now,
					}
					conflictCols := []clause.Column{{Name: "nip"}, {Name: "nidn"}, {Name: "periode_type"}, {Name: "periode_key"}}

					writeMu.Lock()
					r.db.WithContext(ctx).Clauses(clause.OnConflict{
						Columns:   conflictCols,
						UpdateAll: true,
					}).Create(&itemV1)

					itemV2 := domain.RekapLaporanBulanan{
						Nip:          nipVal,
						Nidn:         nidnVal,
						Nama:         namaVal,
						Unit:         unitVal,
						Fakultas:     fakultasVal,
						Prodi:        prodiVal,
						PeriodeType:  domain.PeriodeCutoff,
						PeriodeKey:   v2Key,
						TanggalMulai: v2Start.Format("2006-01-02"),
						TanggalAkhir: v2End.Format("2006-01-02"),
						TotalMasuk:   int(cMasukV2),
						TotalIzin:    int(cIzinV2),
						TotalCuti:    int(cCutiV2),
						TotalSppd:    int(cSppdV2),
						TotalUpacara: int(cUpacaraV2),
						TotalLibur:   int(cLiburV2),
						UpdatedAt:    &now,
					}
					r.db.WithContext(ctx).Clauses(clause.OnConflict{
						Columns:   conflictCols,
						UpdateAll: true,
					}).Create(&itemV2)
					writeMu.Unlock()

					atomic.AddInt64(&totalRecordsProcessed, 2)
				}
			}()
		}
		wgWorkers.Wait()
	}

	return map[string]interface{}{
		"status":                  "success",
		"message":                 "Kalkulasi ulang laporan versi 1 dan versi 2 untuk seluruh data pegawai dan bulan telah selesai",
		"total_bulan_dikalkulasi": len(months),
		"total_pegawai":           len(pegawais),
		"total_rekap_records":     int(totalRecordsProcessed),
		"daftar_bulan":            months,
	}, nil
}

func buildUserWhere(db *gorm.DB, nip, nidn string) *gorm.DB {
	if nip != "" && nidn != "" {
		return db.Where("(nip = ? OR nidn = ?)", nip, nidn)
	} else if nip != "" {
		return db.Where("nip = ?", nip)
	} else if nidn != "" {
		return db.Where("nidn = ?", nidn)
	}
	return db.Where("1 = 0")
}

func buildSppdUserWhere(db *gorm.DB, nip, nidn string) *gorm.DB {
	if nip != "" && nidn != "" {
		return db.Where("(nip = ? OR nidn = ? OR id IN (SELECT id_sppd FROM sppd_anggota WHERE nip = ? OR nidn = ?))", nip, nidn, nip, nidn)
	} else if nip != "" {
		return db.Where("(nip = ? OR id IN (SELECT id_sppd FROM sppd_anggota WHERE nip = ?))", nip, nip)
	} else if nidn != "" {
		return db.Where("(nidn = ? OR id IN (SELECT id_sppd FROM sppd_anggota WHERE nidn = ?))", nidn, nidn)
	}
	return db.Where("1 = 0")
}
