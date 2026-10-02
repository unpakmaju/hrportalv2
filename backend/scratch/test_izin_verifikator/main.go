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

func getUrl(client *http.Client, targetUrl string, token string) (int, string) {
	req, err := http.NewRequest("GET", targetUrl, nil)
	if err != nil {
		return 0, err.Error()
	}
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
	log.Println("=== IZIN & VERIFIKATOR INTEGRATION TEST ===")

	client := &http.Client{Timeout: 5 * time.Second}
	pemohonToken := generateToken("4102302214", "tendik")
	verifikatorToken := generateToken("10411006520", "sdm")

	// 1. Register FCM Token for Verifikator (Aries Maesya)
	vTokenVals := url.Values{}
	vTokenVals.Set("nip", "10411006520")
	vTokenVals.Set("fcm_token", "fcm_token_verifikator_10411006520_device")
	code, body := postForm(client, "http://localhost:3000/api/account/fcm-token", verifikatorToken, vTokenVals)
	fmt.Printf("1. Register Verifikator FCM Token -> Code: %d | Body: %s\n", code, body)

	// 2. Submit Izin from Pemohon 4102302214 targeting Verifikator 10411006520
	izinVals := url.Values{}
	izinVals.Set("nip", "4102302214")
	izinVals.Set("nama", "Pegawai Pemohon")
	izinVals.Set("id_jenis_izin", "1")
	izinVals.Set("tanggal_pengajuan", "2026-08-17")
	izinVals.Set("tujuan", "Izin keperluan keluarga mendesak")
	izinVals.Set("verifikasi", "10411006520")
	code, body = postForm(client, "http://localhost:3000/api/izin", pemohonToken, izinVals)
	fmt.Printf("2. Create Izin -> Code: %d | Body: %s\n", code, body)

	// 3. Test Verifikator fetching verification Izin list
	code, body = getUrl(client, "http://localhost:3000/api/izin?verifikasi=haxor", verifikatorToken)
	fmt.Printf("3. Verifikator Fetch Izin (/api/izin?verifikasi=haxor) -> Code: %d | Body: %s\n", code, body)

	// 4. Check DB notifications
	dsn := os.Getenv("DB_HRPORTAL")
	if dsn == "" {
		dsn = "root:@tcp(127.0.0.1:3306)/unpak_hrportal?charset=utf8mb4&parseTime=True&loc=Local"
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err == nil {
		time.Sleep(4 * time.Second)
		var notifs []struct {
			ID        uint
			TargetNip string
			Title     string
			Status    string
		}
		db.Table("notifications").Order("id desc").Limit(5).Scan(&notifs)
		fmt.Println("\nLatest Notifications in DB after 4s processing:")
		for _, n := range notifs {
			fmt.Printf("ID: %d | Target: %s | Title: %s | Status: %s\n", n.ID, n.TargetNip, n.Title, n.Status)
		}
	}
}
