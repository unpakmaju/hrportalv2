package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/websocket/v2"
	"github.com/joho/godotenv"
	"github.com/mehdihadeli/go-mediatr"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	commonhelper "hrportal_backend/common/helper"
	commoninfra "hrportal_backend/common/infrastructure"
	commonpresentation "hrportal_backend/common/presentation"

	accountInfrastructure "hrportal_backend/modules/account/infrastructure"
	accountPresentation "hrportal_backend/modules/account/presentation"
	attendanceInfrastructure "hrportal_backend/modules/attendance/infrastructure"
	attendancePresentation "hrportal_backend/modules/attendance/presentation"

	leaveInfrastructure "hrportal_backend/modules/leave/infrastructure"
	leavePresentation "hrportal_backend/modules/leave/presentation"

	masterdataInfrastructure "hrportal_backend/modules/masterdata/infrastructure"
	masterdataPresentation "hrportal_backend/modules/masterdata/presentation"

	reportInfrastructure "hrportal_backend/modules/report/infrastructure"
	reportPresentation "hrportal_backend/modules/report/presentation"

	sppdInfrastructure "hrportal_backend/modules/sppd/infrastructure"
	sppdPresentation "hrportal_backend/modules/sppd/presentation"

	izinInfrastructure "hrportal_backend/modules/izin/infrastructure"
	izinPresentation "hrportal_backend/modules/izin/presentation"

	ceremonyAttendanceInfrastructure "hrportal_backend/modules/ceremony_attendance/infrastructure"
	ceremonyAttendancePresentation "hrportal_backend/modules/ceremony_attendance/presentation"

	calendarInfrastructure "hrportal_backend/modules/calendar/infrastructure"
	calendarPresentation "hrportal_backend/modules/calendar/presentation"

	holidayInfrastructure "hrportal_backend/modules/holiday/infrastructure"
	holidayPresentation "hrportal_backend/modules/holiday/presentation"

	notificationDomain "hrportal_backend/modules/notification/domain"
	notificationInfrastructure "hrportal_backend/modules/notification/infrastructure"
	notificationPresentation "hrportal_backend/modules/notification/presentation"
	payrollInfrastructure "hrportal_backend/modules/payroll/infrastructure"
	payrollPresentation "hrportal_backend/modules/payroll/presentation"
	storagePresentation "hrportal_backend/modules/storage/presentation"
)

var startupErrors []fiber.Map

func mustStart(name string, fn func() error) {
	if err := fn(); err != nil {
		startupErrors = append(startupErrors, fiber.Map{
			"module": name,
			"error":  err.Error(),
		})
	}
}

var (
	dbMain   *gorm.DB
	onceMain sync.Once
)

func NewMySQLDB(envVar, defaultDSN string) (*gorm.DB, error) {
	dsn := os.Getenv(envVar)
	if dsn == "" {
		dsn = defaultDSN
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Printf("gagal konek database %s: %v", envVar, err)
		return nil, err
	}
	log.Printf("berhasil koneksi database %s", envVar)

	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetMaxIdleConns(100)
	sqlDB.SetConnMaxLifetime(10 * time.Minute)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)

	return db, nil
}

func tryConnectDB(envVar string, dbName string) (*gorm.DB, error) {
	candidates := []string{}
	if envDSN := os.Getenv(envVar); envDSN != "" {
		dsnWithTimeout := envDSN
		if !strings.Contains(dsnWithTimeout, "timeout=") {
			if strings.Contains(dsnWithTimeout, "?") {
				dsnWithTimeout += "&timeout=2s"
			} else {
				dsnWithTimeout += "?timeout=2s"
			}
		}
		candidates = append(candidates, dsnWithTimeout)
	}
	candidates = append(candidates,
		fmt.Sprintf("root:@tcp(127.0.0.1:3306)/%s?charset=utf8mb4&parseTime=True&loc=Local&timeout=2s", dbName),
		fmt.Sprintf("root:password@tcp(127.0.0.1:3306)/%s?charset=utf8mb4&parseTime=True&loc=Local&timeout=2s", dbName),
		fmt.Sprintf("root:root@tcp(127.0.0.1:3306)/%s?charset=utf8mb4&parseTime=True&loc=Local&timeout=2s", dbName),
	)

	var lastErr error
	for _, dsn := range candidates {
		db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
			Logger: logger.Default.LogMode(logger.Silent),
		})
		if err == nil && db != nil {
			sqlDB, errSql := db.DB()
			if errSql == nil {
				sqlDB.SetMaxOpenConns(100)
				sqlDB.SetMaxIdleConns(100)
				sqlDB.SetConnMaxLifetime(10 * time.Minute)
				sqlDB.SetConnMaxIdleTime(5 * time.Minute)
				if errPing := sqlDB.Ping(); errPing == nil {
					db.Logger = logger.Default.LogMode(logger.Warn)
					log.Printf("Successfully connected %s using DSN: %s", envVar, dsn)
					return db, nil
				} else {
					lastErr = errPing
				}
			}
		} else if err != nil {
			lastErr = err
		}
	}
	return nil, lastErr
}

func isDBConnected(dbs ...*gorm.DB) bool {
	if len(dbs) == 0 {
		return false
	}
	for _, db := range dbs {
		if db == nil {
			return false
		}
		sqlDB, err := db.DB()
		if err != nil || sqlDB.Ping() != nil {
			return false
		}
	}
	return true
}

func main() {
	_ = godotenv.Load()

	cfg := commonpresentation.DefaultHeaderSecurityConfig()
	cfg.ResolveAndCheck = false

	app := fiber.New(fiber.Config{
		ReadBufferSize: 16 * 1024,
		ReadTimeout:    120 * time.Second,
		WriteTimeout:   120 * time.Second,
		IdleTimeout:    120 * time.Second,
	})

	app.Use(recover.New())

	isCors := os.Getenv("ALLOW_CORS")
	origins := os.Getenv("ALLOWED_ORIGINS")
	_ = isCors

	app.Use(cors.New(cors.Config{
		AllowOriginsFunc: func(origin string) bool {
			if origin == "" {
				return true
			}
			if origins != "" {
				allowed := strings.Split(origins, ",")
				for _, o := range allowed {
					if strings.TrimSpace(o) == origin {
						return true
					}
				}
			}
			return true
		},
		AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, X-Active-Role, X-Role, X-Requested-With, X-Custom-Header",
		AllowCredentials: true,
	}))

	app.Use(helmet.New(helmet.Config{
		XSSProtection:             "1; mode=block",
		ContentTypeNosniff:        "nosniff",
		XFrameOptions:             "SAMEORIGIN",
		ReferrerPolicy:            "no-referrer",
		CrossOriginResourcePolicy: "cross-origin",
	}))

	app.Use(commonpresentation.LoggerMiddleware)
	app.Use(commonpresentation.HeaderSecurityMiddleware(cfg))

	mediatr.RegisterRequestPipelineBehaviors(NewValidationBehavior())

	var (
		db          *gorm.DB
		dbSimak     *gorm.DB
		dbSimpeg    *gorm.DB
		dbSimpegNew *gorm.DB
	)
	mustStart("Database", func() error {
		var err error
		db, err = tryConnectDB("DB_HRPORTAL", "unpak_hrportal")
		if err == nil && db != nil {
			_ = db.AutoMigrate(&notificationDomain.NotificationModel{}, &notificationDomain.FcmTokenModel{})
		} else {
			log.Printf("[DATABASE ERROR] Failed to connect to MySQL database! err: %v", err)
		}
		return err
	})

	if db == nil {
		log.Printf("[WARNING] MySQL Database is not connected or nil. Endpoints requiring DB will return errors.")
	}

	mustStart("Database SIMAK", func() error {
		dbSimak, _ = tryConnectDB("DB_SIMAK", "unpak_simak")
		return nil
	})

	mustStart("Database SIMPEG (Legacy unpak_simpeg)", func() error {
		dbSimpeg, _ = tryConnectDB("DB_SIMPEG", "unpak_simpeg")
		return nil
	})

	mustStart("Database SIMPEG NEW (unpak_newsimpeg)", func() error {
		dbSimpegNew, _ = tryConnectDB("DB_SIMPEG_NEW", "unpak_newsimpeg")
		return nil
	})

	mustStart("Report Module", func() error {
		return reportInfrastructure.RegisterModuleReport(db, dbSimpegNew, dbSimak)
	})

	mustStart("Attendance Module", func() error {
		return attendanceInfrastructure.RegisterModuleAttendance(db)
	})

	mustStart("Leave Module", func() error {
		return leaveInfrastructure.RegisterModuleLeave(db)
	})

	mustStart("Sppd Module", func() error {
		return sppdInfrastructure.RegisterModuleSppd(db)
	})

	mustStart("Izin Module", func() error {
		return izinInfrastructure.RegisterModuleIzin(db)
	})

	mustStart("CeremonyAttendance Module", func() error {
		return ceremonyAttendanceInfrastructure.RegisterModuleCeremonyAttendance(db)
	})

	mustStart("Calendar Module", func() error {
		return calendarInfrastructure.RegisterModuleCalendar(db)
	})

	mustStart("Holiday Module", func() error {
		return holidayInfrastructure.RegisterModuleHoliday(db)
	})

	mustStart("Account Module", func() error {
		return accountInfrastructure.RegisterModuleAccount(db, dbSimak, dbSimpeg, dbSimpegNew)
	})

	mustStart("MasterData Module", func() error {
		return masterdataInfrastructure.RegisterModuleMasterData(db, dbSimak, dbSimpeg, dbSimpegNew)
	})

	mustStart("Notification Module", func() error {
		return notificationInfrastructure.RegisterModuleNotification(db)
	})

	mustStart("Payroll Module", func() error {
		return payrollInfrastructure.RegisterModulePayroll(db, dbSimpeg)
	})

	if len(startupErrors) > 0 {
		log.Printf("Startup warnings/errors encountered: %v", startupErrors)
	}

	accountPresentation.ModuleAccount(app)
	attendancePresentation.ModuleAttendance(app)
	leavePresentation.ModuleLeave(app)
	masterdataPresentation.ModuleMasterData(app, db, dbSimpegNew)
	sppdPresentation.ModuleSppd(app)
	izinPresentation.ModuleIzin(app)
	ceremonyAttendancePresentation.ModuleCeremonyAttendance(app)
	calendarPresentation.ModuleCalendar(app)
	reportPresentation.ModuleReport(app)
	holidayPresentation.ModuleHoliday(app, db)
	notificationPresentation.ModuleNotification(app)
	payrollPresentation.ModulePayroll(app)
	storagePresentation.ModuleStorage(app)

	// WebSocket Real-time Feed for SDM Dashboard (Live Izin, Cuti, SPPD updates)
	app.Get("/ws/sdm", websocket.New(func(c *websocket.Conn) {
		// Menunggu hingga semua koneksi DB terhubung dan aktif
		for !isDBConnected(db) {
			log.Println("[WebSocket /ws/sdm] Menunggu koneksi database terhubung...")
			if err := c.WriteMessage(websocket.PingMessage, nil); err != nil {
				// Keluar jika client menutup koneksi WebSocket saat menunggu
				return
			}
			time.Sleep(1 * time.Second)
		}

		commonhelper.GlobalSdmWsHub.Register(c)
		defer commonhelper.GlobalSdmWsHub.Unregister(c)

		for {
			_, _, err := c.ReadMessage()
			if err != nil {
				break
			}
		}
	}))

	// Note: Background Jobs (SDM Auto-Verify, Holiday Sync, Export Worker) are separated into standalone binaries in /cmd
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "service": "Unpak HRPortal Backend API"})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	log.Printf("Server HRPortal Backend running on port :%s", port)
	app.Listen(":" + port)
}

type ValidationBehavior struct{}

func NewValidationBehavior() *ValidationBehavior {
	return &ValidationBehavior{}
}

func (b *ValidationBehavior) Handle(
	ctx context.Context,
	request interface{},
	next mediatr.RequestHandlerFunc,
) (interface{}, error) {
	if err := commoninfra.Validate(request); err != nil {
		return nil, err
	}
	return next(ctx)
}
