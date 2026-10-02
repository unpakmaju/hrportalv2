package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/joho/godotenv"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Profile represents resolved employee identity data from SIMPEG & SIMAK
type Profile struct {
	Nip      string
	Nidn     string
	Nama     string
	Unit     string
	Fakultas string
	Prodi    string
	Found    bool
	Source   string
}

// TableRecord represents a generic record from cuti, izin, or sppd
type TableRecord struct {
	ID          uint   `gorm:"column:id"`
	Nip         string `gorm:"column:nip"`
	Nidn        string `gorm:"column:nidn"`
	NamaPemohon string `gorm:"column:nama_pemohon"`
	Unit        string `gorm:"column:unit"`
	Fakultas    string `gorm:"column:fakultas"`
	Prodi       string `gorm:"column:prodi"`
}

type TableSummary struct {
	TotalScanned int
	Changed      int
	Unchanged    int
	Unresolved   int
	Errors       int
}

var (
	profileCache   = make(map[string]*Profile)
	profileCacheMu sync.RWMutex
)

func main() {
	var (
		flagDryRun bool
		flagApply  bool
		flagTable  string
		flagLimit  int
		flagEnv    string
		flagHelp   bool
	)

	flag.BoolVar(&flagDryRun, "dry-run", true, "Run in simulation mode without updating the database (default: true)")
	flag.BoolVar(&flagApply, "apply", false, "Apply fixes directly to the database (equivalent to --dry-run=false)")
	flag.StringVar(&flagTable, "table", "all", "Target table: 'cuti', 'izin', 'sppd', or 'all'")
	flag.IntVar(&flagLimit, "limit", 0, "Limit number of records to process per table (0 = unlimited)")
	flag.StringVar(&flagEnv, "env", "", "Path to .env file (optional)")
	flag.BoolVar(&flagHelp, "help", false, "Show help usage")
	flag.BoolVar(&flagHelp, "h", false, "Show help usage")

	flag.Parse()

	if flagHelp {
		printUsage()
		return
	}

	// If --apply is explicitly specified, turn off dry-run
	isDryRun := flagDryRun
	if flagApply {
		isDryRun = false
	}
	// Check if user explicitly provided --dry-run=false
	for _, arg := range os.Args[1:] {
		if arg == "--dry-run=false" || arg == "-dry-run=false" {
			isDryRun = false
		}
	}

	printBanner(isDryRun, flagTable, flagLimit)

	// 1. Load environment variables
	loadEnv(flagEnv)

	// 2. Connect to databases
	ctx := context.Background()
	dbHRPortal := connectDB("DB_HRPORTAL")
	if dbHRPortal == nil {
		log.Fatalf("[FATAL] Could not connect to HRPortal database (check DB_HRPORTAL in .env). Exiting.")
	}

	dbSimpegNew := connectDB("DB_SIMPEG_NEW")
	dbSimak := connectDB("DB_SIMAK")
	dbSimpeg := connectDB("DB_SIMPEG")

	resolver := NewProfileResolver(dbHRPortal, dbSimpegNew, dbSimak, dbSimpeg)

	// 3. Process tables
	tablesToRun := []string{}
	switch strings.ToLower(strings.TrimSpace(flagTable)) {
	case "all":
		tablesToRun = []string{"cuti", "izin", "sppd"}
	case "cuti":
		tablesToRun = []string{"cuti"}
	case "izin":
		tablesToRun = []string{"izin"}
	case "sppd":
		tablesToRun = []string{"sppd"}
	default:
		log.Fatalf("[ERROR] Invalid table '%s'. Valid options are: cuti, izin, sppd, all", flagTable)
	}

	summaries := make(map[string]TableSummary)

	for _, tableName := range tablesToRun {
		fmt.Printf("\n=======================================================\n")
		fmt.Printf(" Processing Table: %s\n", strings.ToUpper(tableName))
		fmt.Printf("=======================================================\n")

		summary := processTable(ctx, dbHRPortal, resolver, tableName, isDryRun, flagLimit)
		summaries[tableName] = summary
	}

	// 4. Print final execution report
	printFinalReport(summaries, isDryRun)
}

func printUsage() {
	fmt.Println(`
Usage:
  go run ./cmd/fix_pemohon_data [flags]

Flags:
  --dry-run      Preview changes without modifying the database (default: true)
  --apply        Execute database updates (overrides --dry-run to false)
  --table        Specify table to process: 'cuti', 'izin', 'sppd', or 'all' (default: 'all')
  --limit        Limit number of records to process (default: 0 = unlimited)
  --env          Custom path to .env file
  -h, --help     Show this help message

Examples:
  # 1. Preview changes across all tables (Dry-Run mode)
  go run ./cmd/fix_pemohon_data --dry-run

  # 2. Apply updates to all tables
  go run ./cmd/fix_pemohon_data --apply

  # 3. Preview only the 'cuti' table with a limit of 10 rows
  go run ./cmd/fix_pemohon_data --table=cuti --limit=10 --dry-run

  # 4. Apply updates only to the 'izin' table
  go run ./cmd/fix_pemohon_data --table=izin --apply
`)
}

func printBanner(isDryRun bool, table string, limit int) {
	fmt.Println("=======================================================")
	fmt.Println("  HRPortal Applicant Data Fix CLI Tool")
	fmt.Println("  Fixing: nama_pemohon, unit, fakultas, prodi")
	fmt.Println("=======================================================")
	if isDryRun {
		fmt.Println("  MODE   : [DRY-RUN] Simulation mode (NO database writes)")
	} else {
		fmt.Println("  MODE   : [APPLY] LIVE EXECUTION (Updating database)")
	}
	fmt.Printf("  TABLE  : %s\n", table)
	if limit > 0 {
		fmt.Printf("  LIMIT  : %d records\n", limit)
	} else {
		fmt.Println("  LIMIT  : Unlimited")
	}
	fmt.Println("=======================================================")
}

func loadEnv(customPath string) {
	paths := []string{}
	if customPath != "" {
		paths = append(paths, customPath)
	}
	paths = append(paths,
		".env",
		"backend/.env",
		"../.env",
		"../../.env",
	)

	loaded := false
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			if err := godotenv.Load(p); err == nil {
				log.Printf("[INFO] Loaded environment from: %s", p)
				loaded = true
				break
			}
		}
	}
	if !loaded {
		log.Println("[WARN] No .env file loaded from default paths. Using existing system environment.")
	}
}

func connectDB(envVar string) *gorm.DB {
	envDSN := strings.TrimSpace(os.Getenv(envVar))
	if envDSN == "" {
		log.Printf("[WARN] %s is not defined in environment.", envVar)
		return nil
	}

	dsnWithTimeout := envDSN
	if !strings.Contains(dsnWithTimeout, "timeout=") {
		if strings.Contains(dsnWithTimeout, "?") {
			dsnWithTimeout += "&timeout=5s"
		} else {
			dsnWithTimeout += "?timeout=5s"
		}
	}

	db, err := gorm.Open(mysql.Open(dsnWithTimeout), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		log.Printf("[WARN] Failed to open %s: %v", envVar, err)
		return nil
	}

	sqlDB, errSql := db.DB()
	if errSql != nil {
		log.Printf("[WARN] Failed to get sql.DB for %s: %v", envVar, errSql)
		return nil
	}

	sqlDB.SetMaxOpenConns(20)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(10 * time.Minute)

	if errPing := sqlDB.Ping(); errPing != nil {
		log.Printf("[WARN] Ping failed for %s: %v", envVar, errPing)
		return nil
	}

	log.Printf("[OK] Connected %s (DSN: %s)", envVar, maskDSN(dsnWithTimeout))
	return db
}

func maskDSN(dsn string) string {
	parts := strings.Split(dsn, "@")
	if len(parts) > 1 {
		return "[hidden]@" + parts[len(parts)-1]
	}
	return dsn
}

type ProfileResolver struct {
	dbHRPortal  *gorm.DB
	dbSimpegNew *gorm.DB
	dbSimak     *gorm.DB
	dbSimpeg    *gorm.DB
}

func NewProfileResolver(dbHRPortal, dbSimpegNew, dbSimak, dbSimpeg *gorm.DB) *ProfileResolver {
	return &ProfileResolver{
		dbHRPortal:  dbHRPortal,
		dbSimpegNew: dbSimpegNew,
		dbSimak:     dbSimak,
		dbSimpeg:    dbSimpeg,
	}
}

func (r *ProfileResolver) Resolve(ctx context.Context, nip, nidn string) *Profile {
	cleanNip := strings.TrimSpace(nip)
	cleanNidn := strings.TrimSpace(nidn)

	if cleanNip == "" && cleanNidn == "" {
		return &Profile{Found: false}
	}

	cacheKey := fmt.Sprintf("%s|%s", cleanNip, cleanNidn)

	profileCacheMu.RLock()
	if cached, ok := profileCache[cacheKey]; ok {
		profileCacheMu.RUnlock()
		return cached
	}
	profileCacheMu.RUnlock()

	profile := &Profile{
		Nip:   cleanNip,
		Nidn:  cleanNidn,
		Found: false,
	}

	// 1. Query SIMPEG NEW (unpak_newsimpeg)
	r.lookupSimpegNew(ctx, profile)

	// 2. Query SIMAK (unpak_simak) for Lecturer Details (Fakultas, Prodi, Nama_Dosen)
	r.lookupSimak(ctx, profile)

	// 3. Fallback to SIMPEG Legacy (unpak_simpeg) if still not found
	if !profile.Found {
		r.lookupSimpegLegacy(ctx, profile)
	}

	// If unit is still empty but fakultas was found, use fakultas as unit
	if profile.Unit == "" && profile.Fakultas != "" {
		profile.Unit = profile.Fakultas
	}

	// Store in cache
	profileCacheMu.Lock()
	profileCache[cacheKey] = profile
	if cleanNip != "" {
		profileCache[fmt.Sprintf("%s|", cleanNip)] = profile
	}
	if cleanNidn != "" {
		profileCache[fmt.Sprintf("|%s", cleanNidn)] = profile
	}
	profileCacheMu.Unlock()

	return profile
}

func (r *ProfileResolver) lookupSimpegNew(ctx context.Context, profile *Profile) {
	db := r.dbSimpegNew
	tableName := "pegawais p"
	ppTable := "pegawai_pekerjaans pp"
	uTable := "master_units u"

	if db == nil && r.dbHRPortal != nil {
		db = r.dbHRPortal
		tableName = "unpak_newsimpeg.pegawais p"
		ppTable = "unpak_newsimpeg.pegawai_pekerjaans pp"
		uTable = "unpak_newsimpeg.master_units u"
	}

	if db == nil {
		return
	}

	type simpegResult struct {
		ID       string  `gorm:"column:id"`
		Nip      *string `gorm:"column:nip"`
		NidnNitk *string `gorm:"column:nidn_nitk"`
		Nama     *string `gorm:"column:nama"`
		NamaUnit *string `gorm:"column:nama_unit"`
	}

	var results []simpegResult
	keys := []string{}
	if profile.Nip != "" {
		keys = append(keys, profile.Nip)
	}
	if profile.Nidn != "" {
		keys = append(keys, profile.Nidn)
	}

	if len(keys) == 0 {
		return
	}

	err := db.WithContext(ctx).Table(tableName).
		Select("p.id, p.nip, p.nidn_nitk, p.nama, u.nama_unit").
		Joins("LEFT JOIN "+ppTable+" ON pp.pegawai_id = p.id AND pp.deleted_at IS NULL").
		Joins("LEFT JOIN "+uTable+" ON u.kode_unit = pp.kode_unit").
		Where("TRIM(p.nip) IN (?) OR TRIM(p.nidn_nitk) IN (?)", keys, keys).
		Order("p.id, (pp.status_berlaku = 'BERLAKU') DESC, (pp.status = 'AKTIF') DESC, pp.created_at DESC").
		Scan(&results).Error

	if err != nil || len(results) == 0 {
		// Fallback without joins if tables/schema differ
		_ = db.WithContext(ctx).Table(tableName).
			Select("p.id, p.nip, p.nidn_nitk, p.nama, '' as nama_unit").
			Where("TRIM(p.nip) IN (?) OR TRIM(p.nidn_nitk) IN (?)", keys, keys).
			Scan(&results).Error
	}

	if len(results) > 0 {
		res := results[0]
		profile.Found = true
		profile.Source = "simpeg_new"
		if res.Nama != nil && strings.TrimSpace(*res.Nama) != "" {
			profile.Nama = strings.TrimSpace(*res.Nama)
		}
		if res.NamaUnit != nil && strings.TrimSpace(*res.NamaUnit) != "" {
			profile.Unit = strings.TrimSpace(*res.NamaUnit)
		}
		if res.Nip != nil && strings.TrimSpace(*res.Nip) != "" {
			profile.Nip = strings.TrimSpace(*res.Nip)
		}
		if res.NidnNitk != nil && strings.TrimSpace(*res.NidnNitk) != "" {
			profile.Nidn = strings.TrimSpace(*res.NidnNitk)
		}
	}
}

func (r *ProfileResolver) lookupSimak(ctx context.Context, profile *Profile) {
	db := r.dbSimak
	dosenTable := "m_dosen"
	fakTable := "m_fakultas"
	prodiTable := "m_program_studi"

	if db == nil && r.dbHRPortal != nil {
		db = r.dbHRPortal
		dosenTable = "unpak_simak.m_dosen"
		fakTable = "unpak_simak.m_fakultas"
		prodiTable = "unpak_simak.m_program_studi"
	}

	if db == nil {
		return
	}

	type simakDosen struct {
		Nidn         string  `gorm:"column:NIDN"`
		NamaDosen    string  `gorm:"column:Nama_Dosen"`
		NamaFakultas *string `gorm:"column:nama_fakultas"`
		NamaProdi    *string `gorm:"column:nama_prodi"`
	}

	keys := []string{}
	if profile.Nidn != "" {
		keys = append(keys, profile.Nidn)
	}
	if profile.Nip != "" {
		keys = append(keys, profile.Nip)
	}

	if len(keys) == 0 {
		return
	}

	var dosens []simakDosen
	err := db.WithContext(ctx).Table(dosenTable).
		Select("m_dosen.NIDN, m_dosen.Nama_Dosen, m_fakultas.nama_fakultas, m_program_studi.nama_prodi").
		Joins("LEFT JOIN "+fakTable+" ON m_fakultas.kode_fakultas = m_dosen.kode_fak").
		Joins("LEFT JOIN "+prodiTable+" ON m_program_studi.kode_prodi = m_dosen.kode_prodi").
		Where("TRIM(m_dosen.NIDN) IN (?)", keys).
		Scan(&dosens).Error

	if err == nil && len(dosens) > 0 {
		dosen := dosens[0]
		profile.Found = true
		if profile.Source == "" {
			profile.Source = "simak"
		} else {
			profile.Source += "+simak"
		}

		if profile.Nama == "" && strings.TrimSpace(dosen.NamaDosen) != "" {
			profile.Nama = strings.TrimSpace(dosen.NamaDosen)
		}
		if dosen.NamaFakultas != nil && strings.TrimSpace(*dosen.NamaFakultas) != "" {
			profile.Fakultas = strings.TrimSpace(*dosen.NamaFakultas)
		}
		if dosen.NamaProdi != nil && strings.TrimSpace(*dosen.NamaProdi) != "" {
			profile.Prodi = strings.TrimSpace(*dosen.NamaProdi)
		}
		if profile.Nidn == "" && strings.TrimSpace(dosen.Nidn) != "" {
			profile.Nidn = strings.TrimSpace(dosen.Nidn)
		}
	}
}

func (r *ProfileResolver) lookupSimpegLegacy(ctx context.Context, profile *Profile) {
	db := r.dbSimpeg
	if db == nil && r.dbHRPortal != nil {
		db = r.dbHRPortal
	}
	if db == nil {
		return
	}

	type legacyUser struct {
		Username string `gorm:"column:username"`
		Level    string `gorm:"column:level"`
	}

	keys := []string{}
	if profile.Nip != "" {
		keys = append(keys, profile.Nip)
	}
	if profile.Nidn != "" {
		keys = append(keys, profile.Nidn)
	}

	if len(keys) == 0 {
		return
	}

	var users []legacyUser
	_ = db.WithContext(ctx).Table("unpak_simpeg.pengguna").
		Select("username, level").
		Where("username IN (?)", keys).
		Scan(&users).Error

	if len(users) > 0 {
		profile.Found = true
		profile.Source = "simpeg_legacy"
	}
}

func processTable(ctx context.Context, db *gorm.DB, resolver *ProfileResolver, tableName string, isDryRun bool, limit int) TableSummary {
	var summary TableSummary

	query := db.WithContext(ctx).Table(tableName).
		Select("id, nip, nidn, nama_pemohon, unit, fakultas, prodi").
		Where("nip != '' OR nidn != ''").
		Order("id ASC")

	if limit > 0 {
		query = query.Limit(limit)
	}

	var records []TableRecord
	if err := query.Scan(&records).Error; err != nil {
		log.Printf("[ERROR] Failed to query table %s: %v", tableName, err)
		summary.Errors++
		return summary
	}

	summary.TotalScanned = len(records)
	log.Printf("Found %d records to inspect in table '%s'.", len(records), tableName)

	for _, rec := range records {
		profile := resolver.Resolve(ctx, rec.Nip, rec.Nidn)

		if !profile.Found {
			summary.Unresolved++
			log.Printf("[SKIPPED] [%s #%d] Profile NOT FOUND for NIP: '%s' | NIDN: '%s' (Existing Nama: '%s')",
				tableName, rec.ID, rec.Nip, rec.Nidn, rec.NamaPemohon)
			continue
		}

		cleanRecNama := strings.TrimSpace(rec.NamaPemohon)
		cleanProfileNama := strings.TrimSpace(profile.Nama)

		// Name changed by an atasan overwrite?
		nameWasOverwritten := cleanProfileNama != "" && !strings.EqualFold(cleanRecNama, cleanProfileNama)

		targetNama := rec.NamaPemohon
		if cleanProfileNama != "" {
			targetNama = profile.Nama
		}

		targetUnit := rec.Unit
		if nameWasOverwritten && profile.Unit != "" {
			targetUnit = profile.Unit
		} else if rec.Unit == "" && profile.Unit != "" {
			targetUnit = profile.Unit
		}

		targetFakultas := rec.Fakultas
		targetProdi := rec.Prodi

		if strings.Contains(profile.Source, "simak") && profile.Fakultas != "" {
			// Dosen: SIMAK has the authoritative faculty & prodi
			targetFakultas = profile.Fakultas
			targetProdi = profile.Prodi

			// If faculty was corrupted, or name was overwritten, or unit is empty, restore unit from SIMPEG
			if profile.Unit != "" && (nameWasOverwritten || rec.Unit == "" || strings.TrimSpace(rec.Fakultas) != strings.TrimSpace(profile.Fakultas)) {
				targetUnit = profile.Unit
			}
		} else if nameWasOverwritten && !strings.Contains(profile.Source, "simak") {
			// Tendik whose record was overwritten by an atasan:
			// Reset faculty and prodi which were erroneously taken from the atasan
			targetFakultas = ""
			targetProdi = ""
		}

		// Check for differences
		hasDiff := false
		var diffLines []string

		if strings.TrimSpace(rec.NamaPemohon) != strings.TrimSpace(targetNama) {
			hasDiff = true
			diffLines = append(diffLines, fmt.Sprintf("    nama_pemohon : '%s' -> '%s'", rec.NamaPemohon, targetNama))
		}
		if strings.TrimSpace(rec.Unit) != strings.TrimSpace(targetUnit) {
			hasDiff = true
			diffLines = append(diffLines, fmt.Sprintf("    unit         : '%s' -> '%s'", rec.Unit, targetUnit))
		}
		if strings.TrimSpace(rec.Fakultas) != strings.TrimSpace(targetFakultas) {
			hasDiff = true
			diffLines = append(diffLines, fmt.Sprintf("    fakultas     : '%s' -> '%s'", rec.Fakultas, targetFakultas))
		}
		if strings.TrimSpace(rec.Prodi) != strings.TrimSpace(targetProdi) {
			hasDiff = true
			diffLines = append(diffLines, fmt.Sprintf("    prodi        : '%s' -> '%s'", rec.Prodi, targetProdi))
		}

		if !hasDiff {
			summary.Unchanged++
			continue
		}

		summary.Changed++
		actionLabel := "[SIMULASI / PREVIEW]"
		if !isDryRun {
			actionLabel = "[DATA DIUPDATE]"
		}

		displayNip := rec.Nip
		if displayNip == "" {
			displayNip = "-"
		}
		displayNidn := rec.Nidn
		if displayNidn == "" {
			displayNidn = "-"
		}

		fmt.Printf("\n---------------------------------------------------------------------------------------------------------\n")
		fmt.Printf("%s [%s #%d] NIP: %s | NIDN: %s | Sumber: %s\n",
			actionLabel, strings.ToUpper(tableName), rec.ID, displayNip, displayNidn, profile.Source)
		fmt.Printf("---------------------------------------------------------------------------------------------------------\n")
		fmt.Printf("  %-14s | %-40s -> %s\n", "KOLOM", "SEBELUM (Database)", "SESUDAH (Rekomendasi SIMPEG/SIMAK)")
		fmt.Printf("  ---------------|------------------------------------------|--------------------------------------------\n")

		if strings.TrimSpace(rec.NamaPemohon) != strings.TrimSpace(targetNama) {
			fmt.Printf("  %-14s | %-40s -> '%s'\n", "nama_pemohon", "'"+rec.NamaPemohon+"'", targetNama)
		}
		if strings.TrimSpace(rec.Unit) != strings.TrimSpace(targetUnit) {
			fmt.Printf("  %-14s | %-40s -> '%s'\n", "unit", "'"+rec.Unit+"'", targetUnit)
		}
		if strings.TrimSpace(rec.Fakultas) != strings.TrimSpace(targetFakultas) {
			fmt.Printf("  %-14s | %-40s -> '%s'\n", "fakultas", "'"+rec.Fakultas+"'", targetFakultas)
		}
		if strings.TrimSpace(rec.Prodi) != strings.TrimSpace(targetProdi) {
			fmt.Printf("  %-14s | %-40s -> '%s'\n", "prodi", "'"+rec.Prodi+"'", targetProdi)
		}
		fmt.Printf("---------------------------------------------------------------------------------------------------------\n")

		// Execute update if live mode
		if !isDryRun {
			updateData := map[string]interface{}{
				"nama_pemohon": targetNama,
				"unit":         targetUnit,
				"fakultas":     targetFakultas,
				"prodi":        targetProdi,
			}

			errUpdate := db.WithContext(ctx).Table(tableName).
				Where("id = ?", rec.ID).
				Updates(updateData).Error

			if errUpdate != nil {
				log.Printf("[ERROR] Failed to update %s ID %d: %v", tableName, rec.ID, errUpdate)
				summary.Errors++
			}
		}
	}

	return summary
}

func printFinalReport(summaries map[string]TableSummary, isDryRun bool) {
	fmt.Printf("\n=======================================================\n")
	fmt.Printf("                   FINAL EXECUTION SUMMARY             \n")
	fmt.Printf("=======================================================\n")
	if isDryRun {
		fmt.Println("  STATUS : DRY-RUN COMPLETE (Simulation only, 0 rows modified)")
		fmt.Println("  NOTE   : To apply these fixes, re-run with: --apply")
	} else {
		fmt.Println("  STATUS : APPLY COMPLETE (Database successfully updated)")
	}
	fmt.Printf("-------------------------------------------------------\n")
	fmt.Printf("%-10s | %-8s | %-10s | %-10s | %-10s\n",
		"Table", "Scanned", "Modified", "Unchanged", "Unresolved")
	fmt.Printf("-------------------------------------------------------\n")

	totalScanned := 0
	totalModified := 0
	totalUnchanged := 0
	totalUnresolved := 0

	for tbl, s := range summaries {
		fmt.Printf("%-10s | %-8d | %-10d | %-10d | %-10d\n",
			tbl, s.TotalScanned, s.Changed, s.Unchanged, s.Unresolved)
		totalScanned += s.TotalScanned
		totalModified += s.Changed
		totalUnchanged += s.Unchanged
		totalUnresolved += s.Unresolved
	}
	fmt.Printf("-------------------------------------------------------\n")
	fmt.Printf("%-10s | %-8d | %-10d | %-10d | %-10d\n",
		"TOTAL", totalScanned, totalModified, totalUnchanged, totalUnresolved)
	fmt.Printf("=======================================================\n\n")
}
