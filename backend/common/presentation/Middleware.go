package presentation

import (
	"context"
	"errors"
	"fmt"
	"html"
	"io"
	"net"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"encoding/json"
	commoninfra "hrportal_backend/common/infrastructure"
	"log"
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/websocket/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/text/unicode/norm"
)

// =======================
// CONFIG
// =======================
var jwtSecret = []byte("secret")

type HeaderSecurityConfig struct {
	BlacklistedHeaderNames map[string]bool
	AllowDomains           []string
	MaxHeaderLen           int
	ResolveAndCheck        bool
	LookupTimeout          time.Duration
	BlockedCIDRs           []string
}

func DefaultBlacklistedHeaderNames() map[string]bool {
	names := []string{
		"x-forwarded-for", "x-forwarded-host", "forwarded", "forwarded-host",
		"x-forwarded-proto", "x-forwarded-port", "x-forwarded-scheme",
		"x-real-ip", "client-ip", "true-client-ip", "cf-connecting-ip",
		"x-remote-ip", "x-originating-ip",
		"x-original-host", "via", "x-via",
		"host", "x-host", "x-rewrite-url", "x-original-url",
		"x-request-url", "x-request-uri", "redirect", "location",
		"authorization", "proxy-authorization", "x-api-key",
		"metadata", "x-aws-ec2-metadata", "referer",
	}
	out := map[string]bool{}
	for _, v := range names {
		out[strings.ToLower(v)] = true
	}
	return out
}

func DefaultHeaderSecurityConfig() *HeaderSecurityConfig {
	domains := []string{"hrportal.unpak.ac.id", "localhost", "localhost:3000", "thunderclient.com", "10.0.2.2:3000", "10.0.2.2", "127.0.0.1", "127.0.0.1:3000", "217.216.75.192", "217.216.75.192:3000"}
	if envDomains := os.Getenv("ALLOW_DOMAINS"); envDomains != "" {
		parts := strings.Split(envDomains, ",")
		var parsed []string
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				parsed = append(parsed, p)
			}
		}
		if len(parsed) > 0 {
			domains = parsed
		}
	}

	return &HeaderSecurityConfig{
		BlacklistedHeaderNames: DefaultBlacklistedHeaderNames(),
		AllowDomains:           domains,
		MaxHeaderLen:           8192,
		ResolveAndCheck:        false,
		LookupTimeout:          1 * time.Second,
		BlockedCIDRs:           []string{},
	}
}

// =======================
// REGEX
// =======================

var (
	crlfRe      = regexp.MustCompile(`[\r\n]`)
	nullRe      = regexp.MustCompile(`\x00`)
	protoRe     = regexp.MustCompile(`(?i)^(javascript|data|vbscript|file|view-source):`)
	punyRe      = regexp.MustCompile(`(?i)xn--[a-z0-9-]+`)
	zeroWidthRe = regexp.MustCompile(`[\x{200B}\x{200C}\x{200D}\x{2060}\x{FEFF}]`)
	hostExtract = regexp.MustCompile(`(?i)(?:https?://)?([a-z0-9\.\-]+\.[a-z]{2,})(:\d+)?`)
)

type Account struct {
	UUID         string `json:"uuid"`
	SID          string `json:"sid"`
	NidnUsername string `json:"nidn_username"`
	Password     string `json:"password"`
	Level        string `json:"level"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	FakultasUnit string `json:"fakultas_unit"`

	Role         string `json:"role"`
	NIDN         string `json:"nidn"`
	NIP          string `json:"nip"`
	KodeFakultas string `json:"kode_fakultas"`
	KodeProdi    string `json:"kode_prodi"`
	Fakultas     string `json:"Fakultas"`
	Prodi        string `json:"prodi"`
	Unit         string `json:"unit"`
	Source       string `json:"source"`
}

// =======================
// MIDDLEWARE
// =======================
const logCommonTokenLabel = "common.token"
const logCommonRbac = "common.rbac"

func LoggerMiddleware(c *fiber.Ctx) error {
	start := time.Now()
	err := c.Next()
	duration := time.Since(start)

	log.Printf("[%s] %s | %d | %v", c.Method(), c.Path(), c.Response().StatusCode(), duration)
	return err
}

func HeaderSecurityMiddleware(cfg *HeaderSecurityConfig) fiber.Handler {
	if cfg == nil {
		cfg = DefaultHeaderSecurityConfig()
	}

	blocked := parseBlockedCIDRs(cfg.BlockedCIDRs)

	return func(c *fiber.Ctx) error {

		for name, vals := range c.GetReqHeaders() {
			for _, val := range vals {

				if err := validateHeaderLength(name, val, cfg); err != nil {
					return badRequest(c, err)
				}

				if err := validateControlChars(name, val); err != nil {
					return badRequest(c, err)
				}

				decoded := normalizeHeader(val)

				if err := validateProtocol(name, decoded); err != nil {
					return badRequest(c, err)
				}

				if err := validatePunycode(name, decoded); err != nil {
					return badRequest(c, err)
				}

				if err := validateZeroWidth(name, val); err != nil {
					return badRequest(c, err)
				}

				if err := validateURLDomain(decoded, cfg, blocked); err != nil {
					return badRequest(c, err)
				}

				// if err := validateHostHeader(name, decoded, cfg); err != nil {
				// 	return badRequest(c, err)
				// }
			}
		}

		if err := validateEmbeddedDomains(c, cfg); err != nil {
			return badRequest(c, err)
		}

		return c.Next()
	}
}

// =======================
// VALIDATION HELPERS
// =======================

func validateHeaderLength(name, val string, cfg *HeaderSecurityConfig) error {
	if len(val) > cfg.MaxHeaderLen {
		return commoninfra.NewResponseError("common.check[A+1]", "header too long: "+name)
	}
	return nil
}

func validateControlChars(name, val string) error {
	if crlfRe.MatchString(val) || nullRe.MatchString(val) {
		return commoninfra.NewResponseError("common.check[A+2]", "header ctrl char: "+name)
	}
	return nil
}

func normalizeHeader(val string) string {
	decoded := multiUnescape(html.UnescapeString(val), 3)
	decoded = zeroWidthRe.ReplaceAllString(decoded, "")
	return norm.NFKC.String(decoded)
}

func validateProtocol(name, decoded string) error {
	if protoRe.MatchString(decoded) {
		return commoninfra.NewResponseError("common.check[A+3]", "protocol attack: "+name)
	}
	return nil
}

func validatePunycode(name, decoded string) error {
	if punyRe.MatchString(decoded) {
		return commoninfra.NewResponseError("common.check[A+4]", "punycode forbidden: "+name)
	}
	return nil
}

func validateZeroWidth(name, val string) error {
	if zeroWidthRe.MatchString(val) {
		return commoninfra.NewResponseError("common.check[A+5]", "zero width attack: "+name)
	}
	return nil
}

func validateURLDomain(decoded string, cfg *HeaderSecurityConfig, blocked []*net.IPNet) error {
	u, err := url.Parse(decoded)
	if err != nil || u.Host == "" {
		return nil
	}

	host := u.Hostname()

	if !domainAllowed(host, cfg.AllowDomains) {
		return commoninfra.NewResponseError("common.check[A+6]", "domain not allowed: "+host)
	}

	if cfg.ResolveAndCheck {
		if err := resolveAndCheckIP(host, cfg.LookupTimeout, blocked); err != nil {
			return err
		}
	}

	return nil
}

func resolveAndCheckIP(host string, timeout time.Duration, blocked []*net.IPNet) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	ips, _ := net.DefaultResolver.LookupIP(ctx, "ip", host)

	for _, ip := range ips {
		if ipInNets(ip, blocked) {
			return commoninfra.NewResponseError("common.check[A+7]", "domain resolves to forbidden IP: "+host)
		}
	}

	return nil
}

func validateHostHeader(name, decoded string, cfg *HeaderSecurityConfig) error {
	if strings.ToLower(name) != "host" {
		return nil
	}

	if !domainAllowed(decoded, cfg.AllowDomains) {
		return commoninfra.NewResponseError("common.check[A+8]", "host header spoof: "+decoded)
	}
	return nil
}

func validateEmbeddedDomains(c *fiber.Ctx, cfg *HeaderSecurityConfig) error {

	urlHeaders := []string{
		"referer", "origin", "location", "refferer",
		"referrer", "redirect", "url", "http-url",
		"x-rewrite-url", "x-http-destinationurl",
		"x-http-host-override", "x-forwarded-host",
	}

	for _, h := range urlHeaders {
		val := c.Get(h)
		if val == "" {
			continue
		}

		decoded := normalizeHeader(val)
		hosts := extractHostsFromText(decoded)

		for _, host := range hosts {
			if !domainAllowed(host, cfg.AllowDomains) {
				return commoninfra.NewResponseError(
					"common.check[A+9]",
					"embedded domain not allowed: "+host,
				)
			}
		}
	}

	return nil
}

// =======================
// UTILITIES
// =======================

func badRequest(c *fiber.Ctx, err error) error {
	return c.Status(400).JSON(err)
}

func parseBlockedCIDRs(cidrs []string) []*net.IPNet {
	var blocked []*net.IPNet
	for _, c := range cidrs {
		_, ipnet, err := net.ParseCIDR(c)
		if err == nil {
			blocked = append(blocked, ipnet)
		}
	}
	return blocked
}

func JWTMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if strings.Contains(c.Path(), "/recalculate") {
			return c.Next()
		}
		tokenStr, err := extractBearerToken(c)
		if err != nil {
			return badRequest(c, err)
		}

		token, err := parseJWT(tokenStr)
		if err != nil {
			return badRequest(c, err)
		}

		claims, err := validateClaims(token)
		if err != nil {
			return badRequest(c, err)
		}

		err = injectRequestValues(c, claims, tokenStr)
		if err != nil {
			return badRequest(c, err)
		}

		return c.Next()
	}
}

func extractBearerToken(c *fiber.Ctx) (string, error) {
	authHeader := c.Get("Authorization")
	log.Printf("Authorization header: %s", authHeader)

	if authHeader == "" {
		log.Println("Authorization header missing")
		return "", c.Status(400).
			JSON(commoninfra.NewResponseError(logCommonRbac, "authorization header missing"))
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		log.Println("Invalid authorization header format")
		return "", c.Status(400).
			JSON(commoninfra.NewResponseError(logCommonRbac, "authorization header format must be Bearer token"))
	}

	token := parts[1]
	log.Printf("Token: %s", token)
	return token, nil
}

func parseJWT(tokenStr string) (*jwt.Token, error) {
	if tokenStr == "" || tokenStr == "undefined" || tokenStr == "null" {
		return nil, fiber.NewError(400, "token authorization header missing or empty")
	}

	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, fiber.NewError(400, "token format invalid: expected JWT with 3 segments")
	}

	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("invalid signing method")
		}
		return jwtSecret, nil
	})

	if err == nil && token.Valid {
		return token, nil
	}

	// Fallback: parse unverified for Keycloak RSA tokens (RS256/RS512)
	token, _, err = new(jwt.Parser).ParseUnverified(tokenStr, jwt.MapClaims{})
	if err != nil {
		return nil, fiber.NewError(400, "failed to parse token: "+err.Error())
	}

	return token, nil
}

func validateClaims(token *jwt.Token) (jwt.MapClaims, error) {
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fiber.NewError(400, "invalid token claims")
	}

	if exp, ok := claims["exp"].(float64); ok {
		if int64(exp) < time.Now().Unix() {
			return nil, fiber.NewError(400, "token expired")
		}
	}

	return claims, nil
}

func injectRequestValues(c *fiber.Ctx, claims jwt.MapClaims, tokenStr string) error {
	iss, _ := claims["iss"].(string)
	if strings.Contains(iss, "gerbang.unpak.ac.id") {
		// Keycloak SSO Token
		employeeId, _ := claims["employeeid"].(string)
		if employeeId == "" {
			return fiber.NewError(400, "employeeid is missing in sso token")
		}
		c.Request().PostArgs().Set("sid", employeeId)

		// Resolve source based on group or roles
		source := "simpeg" // default to tendik
		if groupRaw, ok := claims["group"].([]interface{}); ok {
			for _, g := range groupRaw {
				if gStr, ok := g.(string); ok && strings.ToLower(gStr) == "dosen" {
					source = "simak"
					break
				}
			}
		}
		c.Request().PostArgs().Set("source", source)
	} else {
		// Local Login Token
		if sid, ok := claims["sid"].(string); ok {
			c.Request().PostArgs().Set("sid", sid)
		}
		if source, ok := claims["source"].(string); ok {
			c.Request().PostArgs().Set("source", source)
		}
	}

	c.Request().PostArgs().Set("token", tokenStr)
	return nil
}

func accountFromToken(tokenStr string) *Account {
	token, err := parseJWT(tokenStr)
	if err != nil || token == nil {
		return nil
	}
	claims, err := validateClaims(token)
	if err != nil || claims == nil {
		return nil
	}

	iss, _ := claims["iss"].(string)
	sid, _ := claims["sid"].(string)
	source, _ := claims["source"].(string)
	employeeId, _ := claims["employeeid"].(string)
	name, _ := claims["name"].(string)
	level, _ := claims["level"].(string)
	role, _ := claims["role"].(string)

	isKeycloak := strings.Contains(iss, "gerbang.unpak.ac.id") || employeeId != ""

	if isKeycloak {
		if employeeId != "" {
			sid = employeeId
		}
		source = "simpeg"
		role = "tendik"
		level = "tendik"

		var allGroups []string
		extractGroups := func(val interface{}) {
			if arr, ok := val.([]interface{}); ok {
				for _, g := range arr {
					if gStr, ok := g.(string); ok {
						allGroups = append(allGroups, strings.ToLower(gStr))
					}
				}
			} else if str, ok := val.(string); ok {
				for _, part := range strings.Split(str, ",") {
					if trimmed := strings.TrimSpace(part); trimmed != "" {
						allGroups = append(allGroups, strings.ToLower(trimmed))
					}
				}
			}
		}

		if groupRaw, exists := claims["group"]; exists {
			extractGroups(groupRaw)
		}
		if groupsRaw, exists := claims["groups"]; exists {
			extractGroups(groupsRaw)
		}
		if realmAccess, ok := claims["realm_access"].(map[string]interface{}); ok {
			if rolesRaw, ok := realmAccess["roles"].([]interface{}); ok {
				for _, r := range rolesRaw {
					if rStr, ok := r.(string); ok {
						allGroups = append(allGroups, strings.ToLower(rStr))
					}
				}
			}
		}

		hasSdm := false
		hasBaum := false
		hasDosen := false
		hasTendik := false

		for _, g := range allGroups {
			lowerG := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(g, "/")))
			if lowerG == "adm_sdm" || lowerG == "inherit_adm_sdm" || lowerG == "adm_hr" {
				hasSdm = true
			} else if lowerG == "baum" || lowerG == "inherit_baum" {
				hasBaum = true
			} else if lowerG == "dosen" {
				hasDosen = true
			} else if lowerG == "tendik" || lowerG == "pegawai" {
				hasTendik = true
			}
		}

		if hasSdm {
			role = "sdm"
			level = "sdm"
			source = "simpeg"
		} else if hasBaum {
			role = "baum"
			level = "baum"
			source = "simpeg"
		} else if hasDosen {
			role = "dosen"
			level = "dosen"
			source = "simak"
		} else if hasTendik {
			role = "tendik"
			level = "tendik"
			source = "simpeg"
		} else {
			role = "unauthorized"
			level = "unauthorized"
		}
	} else {
		// Local login token: e.g. {"sid":"10","source":"local"}
		if source == "" {
			source = "local"
		}
		if role == "" {
			role = "sdm"
		}
		if level == "" {
			level = "sdm"
		}
		if name == "" {
			name = "sdm"
		}
	}

	nip := sid
	nidn := ""
	if strings.ToLower(source) == "simak" {
		nidn = sid
	}

	return &Account{
		SID:    sid,
		Source: source,
		Role:   role,
		Level:  level,
		NIP:    nip,
		NIDN:   nidn,
		Name:   name,
	}
}

func RBACMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if strings.Contains(c.Path(), "/recalculate") {
			return c.Next()
		}
		whoamiURL := os.Getenv("WHOAMI_URL")
		if whoamiURL == "" {
			whoamiURL = "https://hrportal.unpak.ac.id/api/v2/account/whoami"
		}

		whoamiv2URL := os.Getenv("WHOAMIV2_URL")
		if whoamiv2URL == "" {
			whoamiv2URL = "https://hrportal.unpak.ac.id/api/v2/account/whoamiv2"
		}

		token, err := extractBearerToken(c)
		if err != nil {
			return badRequest(c, err)
		}

		var user *Account
		jwtToken, parseErr := parseJWT(token)
		if parseErr == nil && jwtToken != nil {
			if claims, claimErr := validateClaims(jwtToken); claimErr == nil && claims != nil {
				iss, _ := claims["iss"].(string)
				if strings.Contains(iss, "gerbang.unpak.ac.id") {
					// Keycloak SSO Token: fetchWhoAmIV2 using employeeid and source
					sid, _ := claims["employeeid"].(string)
					source := "simpeg"
					if groupRaw, ok := claims["group"].([]interface{}); ok {
						for _, g := range groupRaw {
							if gStr, ok := g.(string); ok && strings.ToLower(gStr) == "dosen" {
								source = "simak"
								break
							}
						}
					}
					if sid != "" {
						user, _ = fetchWhoAmIV2(sid, source, token, whoamiv2URL, c)
					}
				} else {
					user, _ = fetchWhoAmI(token, whoamiURL, c)
				}
			}
		}

		if user == nil || (user.Role == "" && user.Level == "" && user.SID == "") {
			// Fallback decode directly from token
			user = accountFromToken(token)
		}

		if user == nil {
			return c.Status(401).
				JSON(commoninfra.NewResponseError(logCommonRbac, "Unauthenticated or invalid token"))
		}

		if user.Role == "unauthorized" {
			return c.Status(403).
				JSON(commoninfra.NewResponseError(logCommonRbac, "Akses ditolak: Akun Anda tidak memiliki group resmi di lingkungan HR Portal"))
		}

		activeRole := strings.ToLower(strings.TrimSpace(c.Get("X-Active-Role")))
		if activeRole != "" && (activeRole == "sdm" || activeRole == "baum" || activeRole == "dosen" || activeRole == "tendik") {
			user.Role = activeRole
			user.Level = activeRole
		}

		c.Request().PostArgs().Set("role", user.Role)
		c.Request().PostArgs().Set("sid", user.SID)
		c.Request().PostArgs().Set("nidn", user.NIDN)
		c.Request().PostArgs().Set("nip", user.NIP)
		c.Request().PostArgs().Set("kode_fakultas", user.KodeFakultas)
		c.Request().PostArgs().Set("kode_prodi", user.KodeProdi)
		c.Request().PostArgs().Set("fakultas", user.Fakultas)
		c.Request().PostArgs().Set("prodi", user.Prodi)
		c.Request().PostArgs().Set("unit", user.Unit)
		c.Request().PostArgs().Set("source", user.Source)
		c.Request().PostArgs().Set("nama", user.Name)

		if isAdmin(user) || isSdm(user) || isBaum(user) {
			log.Println("[RBAC] User is Admin/SDM/BAUM, access granted")
			return c.Next()
		}

		if isDosen(user) || isTendik(user) {
			log.Println("[RBAC] User is Dosen/Tendik, access granted")
			log.Println("[RBAC] Middleware passed, continue to handler")
			return c.Next()
		}

		log.Println("[RBAC] Access denied")
		return c.Status(400).
			JSON(commoninfra.NewResponseError(logCommonRbac, "Access denied"))
	}
}

// ========================
// WHOAMI CALL
// ========================

func fetchWhoAmI(token, whoamiURL string, c *fiber.Ctx) (*Account, error) {
	req, err := http.NewRequest("GET", whoamiURL, nil)
	if err != nil {
		log.Printf("[RBAC] Failed to create request: %v", err)
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{
		Timeout: 3 * time.Second,
	}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[RBAC] Failed to call whoami: %v", err)
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	log.Printf("[RBAC] Whoami response status: %d, body: %s", resp.StatusCode, string(body))

	if strings.TrimSpace(string(body)) == "null" {
		return nil, errors.New("whoami response is null")
	}

	var user Account
	if err := json.Unmarshal(body, &user); err != nil {
		log.Printf("[RBAC] Failed to parse whoami response: %v", err)
		return nil, err
	}

	if user.Role == "" && user.Level == "" && user.SID == "" {
		return nil, errors.New("whoami returned empty user struct")
	}

	log.Printf("[RBAC] Whoami user: %+v", user)
	return &user, nil
}

func fetchWhoAmIV2(sid, source, token, whoamiURL string, c *fiber.Ctx) (*Account, error) {
	if sid == "" {
		return nil, errors.New("sid is empty")
	}
	targetURL := whoamiURL
	if strings.Contains(targetURL, "?") {
		targetURL = fmt.Sprintf("%s&sid=%s&source=%s", targetURL, url.QueryEscape(sid), url.QueryEscape(source))
	} else {
		targetURL = fmt.Sprintf("%s?sid=%s&source=%s", targetURL, url.QueryEscape(sid), url.QueryEscape(source))
	}
	return fetchWhoAmI(token, targetURL, c)
}

func handleWhoAmIError(body []byte, c *fiber.Ctx) error {
	var errResp struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}

	if err := json.Unmarshal(body, &errResp); err == nil && errResp.Message != "" {
		log.Printf("[RBAC] Whoami error code: %s, message: %s", errResp.Code, errResp.Message)
		return c.Status(400).
			JSON(commoninfra.NewResponseError(errResp.Code, errResp.Message))
	}

	log.Println("[RBAC] Whoami response not JSON or invalid format")
	return c.Status(401).
		JSON(commoninfra.NewResponseError(logCommonRbac, "Invalid format response"))
}

// ========================
// VALIDATION
// ========================

func isAdmin(user *Account) bool {
	role := strings.ToLower(user.Role)
	src := strings.ToLower(user.Source)
	lvl := strings.ToLower(user.Level)

	return role == "adm_pusat" || role == "adm_hr" || role == "admin" || (lvl == "admin" && src == "local") || role == "inherit_sdm" || role == "inherit_baum"
}

func isDosen(user *Account) bool {
	role := strings.ToLower(user.Role)
	src := strings.ToLower(user.Source)
	lvl := strings.ToLower(user.Level)
	return role == "dosen" || ((src == "simak" || src == "simpeg") && lvl == "dosen")
}

func isTendik(user *Account) bool {
	role := strings.ToLower(user.Role)
	src := strings.ToLower(user.Source)
	lvl := strings.ToLower(user.Level)
	return role == "tendik" || (src == "simpeg" && lvl == "tendik")
}

func isSdm(user *Account) bool {
	role := strings.ToLower(user.Role)
	src := strings.ToLower(user.Source)
	lvl := strings.ToLower(user.Level)
	name := strings.ToLower(user.Name)
	return role == "sdm" || lvl == "sdm" || role == "adm_hr" || role == "inherit_sdm" || role == "adm_pusat" || (src == "local" && (lvl == "sdm" || user.SID == "10" || name == "sdm"))
}

func isBaum(user *Account) bool {
	role := strings.ToLower(user.Role)
	src := strings.ToLower(user.Source)
	lvl := strings.ToLower(user.Level)
	return role == "baum" || lvl == "baum" || role == "inherit_baum" || (src == "local" && lvl == "baum")
}

func WSError(conn *websocket.Conn, code string, msg string) error {

	conn.WriteJSON(map[string]interface{}{
		"code":        code,
		"description": msg,
	})

	conn.WriteControl(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(
			websocket.ClosePolicyViolation,
			msg,
		),
		time.Now().Add(time.Second),
	)

	conn.Close()
	return errors.New(msg)
}

type WSSession struct {
	Token         string
	SID           string
	User          *Account
	GrantedAccess []string
}

// =======================
// HELPERS
// =======================

func domainAllowed(host string, allow []string) bool {
	host = strings.ToLower(host)
	for _, a := range allow {
		u, err := url.Parse(a)
		var domain string
		if err == nil && u.Host != "" {
			domain = u.Hostname()
		} else {
			domain = strings.ToLower(a)
		}
		if strings.HasSuffix(host, domain) {
			return true
		}
	}
	return false
}

func extractHostsFromText(s string) []string {
	out := []string{}

	words := regexp.MustCompile(`[ \t\r\n,;]+`).Split(s, -1)

	for _, w := range words {
		if w == "" {
			continue
		}

		if strings.Contains(w, "://") {
			u, err := url.Parse(w)
			if err == nil && u.Host != "" {
				out = append(out, u.Hostname())
				continue
			}
		}

		m := hostExtract.FindStringSubmatch(w)
		if len(m) > 1 {
			out = append(out, m[1])
		}
	}

	return out
}

func multiUnescape(s string, n int) string {
	cur := s
	for i := 0; i < n; i++ {
		u, err := url.QueryUnescape(cur)
		if err != nil || u == cur {
			break
		}
		cur = u
	}
	return cur
}

func ipInNets(ip net.IP, nets []*net.IPNet) bool {
	for _, n := range nets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

func SmartCompress() fiber.Handler {
	return func(c *fiber.Ctx) error {
		ct := string(c.Response().Header.ContentType())

		if strings.Contains(ct, "text/event-stream") ||
			strings.Contains(ct, "application/x-ndjson") {
			return c.Next()
		}

		return compress.New(compress.Config{
			Level: compress.LevelBestCompression,
		})(c)
	}
}
