package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

var jwtSecret = []byte("secret")

type NotificationModel struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	NotificationID string    `gorm:"type:varchar(100);index" json:"notification_id"`
	TargetNip      string    `gorm:"type:varchar(50);index" json:"target_nip"`
	TargetNidn     string    `gorm:"type:varchar(50);index" json:"target_nidn"`
	Title          string    `gorm:"type:varchar(255)" json:"title"`
	Body           string    `gorm:"type:text" json:"body"`
	Type           string    `gorm:"type:varchar(50)" json:"type"`
	Status         string    `gorm:"type:varchar(20);default:'pending';index" json:"status"`
	RetryCount     int       `gorm:"default:0" json:"retry_count"`
	ErrorMessage   string    `gorm:"type:text" json:"error_message"`
	PayloadJSON    string    `gorm:"type:text" json:"payload_json"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (NotificationModel) TableName() string {
	return "notifications"
}

func generateToken(nip string, role string) string {
	claims := jwt.MapClaims{
		"sid":    nip,
		"source": "local",
		"role":   role,
		"level":  role,
		"name":   "sdm",
		"exp":    time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	t, err := token.SignedString(jwtSecret)
	if err != nil {
		log.Fatalf("Failed to sign JWT: %v", err)
	}
	return t
}

func postForm(client *http.Client, targetUrl string, token string, data url.Values) (int, string) {
	req, err := http.NewRequest("POST", targetUrl, strings.NewReader(data.Encode()))
	if err != nil {
		return 0, err.Error()
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err.Error()
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(body)
}

func main() {
	log.Println("=== HRPORTAL BACKEND INTEGRATION & NOTIFICATION TEST ===")

	dsn := os.Getenv("DB_HRPORTAL")
	if dsn == "" {
		dsn = "root:@tcp(127.0.0.1:3306)/unpak_hrportal?charset=utf8mb4&parseTime=True&loc=Local"
	}

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// 1. Check health
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get("http://localhost:3000/health")
	if err != nil {
		log.Fatalf("API Server health check failed: %v", err)
	}
	defer resp.Body.Close()
	healthBody, _ := io.ReadAll(resp.Body)
	fmt.Printf("[HEALTH CHECK] Status: %d | Body: %s\n\n", resp.StatusCode, string(healthBody))

	token := generateToken("199001012020011001", "sdm")

	// Get current notification count before tests
	var initialNotifs []NotificationModel
	db.Find(&initialNotifs)
	fmt.Printf("[DB PRE-TEST] Existing Notifications Count: %d\n", len(initialNotifs))

	// 2. Test Attendance Check-In & Check-Out & Notify-Fail
	fmt.Println("\n--- [TEST 1: ATTENDANCE] ---")
	checkInVals := url.Values{}
	checkInVals.Set("nip", "199001012020011001")
	checkInVals.Set("nama", "Ahmad Pegawai")
	checkInVals.Set("unit", "Layanan ICT")
	checkInVals.Set("latitude", "-6.5971")
	checkInVals.Set("longitude", "106.8060")
	code, body := postForm(client, "http://localhost:3000/api/attendance/check-in", token, checkInVals)
	fmt.Printf("1.1 Check-In -> Code: %d | Body: %s\n", code, body)

	checkOutVals := url.Values{}
	checkOutVals.Set("nip", "199001012020011001")
	code, body = postForm(client, "http://localhost:3000/api/attendance/check-out", token, checkOutVals)
	fmt.Printf("1.2 Check-Out -> Code: %d | Body: %s\n", code, body)

	failVals := url.Values{}
	failVals.Set("nip", "199001012020011001")
	failVals.Set("reason", "Uji coba presensi gagal di luar lokasi")
	code, body = postForm(client, "http://localhost:3000/api/attendance/notify-fail", token, failVals)
	fmt.Printf("1.3 Notify-Fail -> Code: %d | Body: %s\n", code, body)

	// 3. Test Leave (Cuti) Submission
	fmt.Println("\n--- [TEST 2: LEAVE (CUTI)] ---")
	leaveVals := url.Values{}
	leaveVals.Set("nip", "199001012020011001")
	leaveVals.Set("nama", "Ahmad Pegawai")
	leaveVals.Set("unit", "Layanan ICT")
	leaveVals.Set("jenis_cuti_id", "1")
	leaveVals.Set("tanggal_mulai", "2026-08-20")
	leaveVals.Set("tanggal_selesai", "2026-08-22")
	leaveVals.Set("jumlah_hari", "3")
	leaveVals.Set("alasan", "Pengajuan Cuti Tahunan Uji Coba")
	leaveVals.Set("nip_atasan", "198501012010011002")
	code, body = postForm(client, "http://localhost:3000/api/leave/submit", token, leaveVals)
	fmt.Printf("2.1 Leave Submit -> Code: %d | Body: %s\n", code, body)

	// 4. Test SPPD Creation
	fmt.Println("\n--- [TEST 3: SPPD] ---")
	sppdVals := url.Values{}
	sppdVals.Set("nip", "199001012020011001")
	sppdVals.Set("nama", "Ahmad Pegawai")
	sppdVals.Set("unit", "Layanan ICT")
	sppdVals.Set("tujuan", "Bandung")
	sppdVals.Set("jenis_sppd_id", "1")
	sppdVals.Set("tanggal_berangkat", "2026-08-25")
	sppdVals.Set("tanggal_kembali", "2026-08-27")
	sppdVals.Set("keterangan", "Uji Coba SPPD Workshop IT")
	sppdVals.Set("verifikasi", "198501012010011002")
	code, body = postForm(client, "http://localhost:3000/api/sppd/create", token, sppdVals)
	fmt.Printf("3.1 SPPD Create -> Code: %d | Body: %s\n", code, body)

	// 5. Query notifications immediately to check PENDING status
	fmt.Println("\n--- [VERIFYING NOTIFICATIONS IN DB] ---")
	time.Sleep(500 * time.Millisecond)

	var notifsAfter []NotificationModel
	db.Order("id desc").Limit(10).Find(&notifsAfter)
	fmt.Println("\nNotifications in DB right after creation:")
	for _, n := range notifsAfter {
		fmt.Printf("ID: %d | Type: %s | Target: %s | Title: %s | Status: %s | Created: %s\n",
			n.ID, n.Type, n.TargetNip, n.Title, n.Status, n.CreatedAt.Format("15:04:05"))
	}

	// 6. Wait for notification background job (3s ticker) to process them
	fmt.Println("\nWaiting 5 seconds for notificationservice background job to poll & update status...")
	time.Sleep(5 * time.Second)

	var notifsFinal []NotificationModel
	db.Order("id desc").Limit(10).Find(&notifsFinal)
	fmt.Println("\nNotifications in DB after backgroundjob processing:")
	allProcessed := true
	for _, n := range notifsFinal {
		fmt.Printf("ID: %d | Type: %s | Target: %s | Title: %s | Status: %s | Updated: %s\n",
			n.ID, n.Type, n.TargetNip, n.Title, n.Status, n.UpdatedAt.Format("15:04:05"))
		if n.Status == "pending" {
			allProcessed = false
		}
	}

	if allProcessed && len(notifsFinal) > 0 {
		fmt.Println("\n>>> SUCCESS: All notifications were inserted and updated status from 'pending' by notificationservice background job! <<<")
	} else {
		fmt.Println("\n>>> WARNING: Some notifications are still pending or no notifications found. <<<")
	}
}
