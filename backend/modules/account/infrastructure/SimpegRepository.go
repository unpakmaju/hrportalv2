package infrastructure

import (
	"context"
	"errors"
	"strings"

	"hrportal_backend/common/helper"
	"hrportal_backend/modules/account/domain"

	"gorm.io/gorm"
)

type SimpegRepository struct {
	dbSimpeg    *gorm.DB // connects to unpak_simpeg (contains table `pengguna`)
	dbSimpegNew *gorm.DB // connects to unpak_newsimpeg (contains tables `pegawais`, `pegawai_pekerjaans`, `master_units`)
}

func NewSimpegRepository(dbSimpeg *gorm.DB, dbSimpegNew *gorm.DB) *SimpegRepository {
	return &SimpegRepository{
		dbSimpeg:    dbSimpeg,
		dbSimpegNew: dbSimpegNew,
	}
}

func (r *SimpegRepository) Authenticate(ctx context.Context, username, password string) (*domain.AuthResult, error) {
	if r == nil {
		return nil, errors.New("database SIMPEG connection not available")
	}

	// 1. Target dbSimpeg (unpak_simpeg) for table `pengguna`
	dbAuth := r.dbSimpeg
	if dbAuth == nil {
		dbAuth = r.dbSimpegNew
	}
	if dbAuth == nil {
		return nil, errors.New("database SIMPEG connection not available")
	}

	rawUsername := strings.TrimSpace(username)
	rawPassword := strings.TrimSpace(password)

	var pengguna struct {
		ID       int    `gorm:"column:id"`
		Username string `gorm:"column:username"`
		Level    string `gorm:"column:level"`
		Status   string `gorm:"column:status"`
	}

	errUser := dbAuth.WithContext(ctx).Debug().Table("pengguna").
		Where("username = ? AND (password = SHA1(?) OR password = MD5(?) OR password = ?) AND LOWER(level) IN ('dosen', 'pegawai') AND UPPER(status) = 'AKTIF'",
			rawUsername, rawPassword, rawPassword, rawPassword).
		First(&pengguna).Error

	if errUser != nil || pengguna.ID == 0 {
		return nil, errors.New("invalid credentials, level, or status in SIMPEG")
	}

	// 2. Target dbSimpegNew (unpak_newsimpeg) for table `pegawais` (NIP only search)
	dbNew := r.dbSimpegNew
	if dbNew == nil {
		dbNew = r.dbSimpeg
	}

	type NewSimpegPegawai struct {
		Nip  *string `gorm:"column:nip"`
		Nidn *string `gorm:"column:nidn"`
		Nama *string `gorm:"column:nama"`
	}

	var nsPeg NewSimpegPegawai
	if dbNew != nil {
		_ = dbNew.WithContext(ctx).Debug().
			Table("pegawais p").
			Select("p.nip, null as nidn, p.nama").
			Where("p.nip = ? OR p.id = ?", rawUsername, rawUsername).
			First(&nsPeg).Error
	}

	realNip := rawUsername
	if helper.StringValue(nsPeg.Nip) != "" {
		realNip = helper.StringValue(nsPeg.Nip)
	}
	cleanNip := strings.TrimSpace(realNip)

	realNidn := ""
	if helper.StringValue(nsPeg.Nidn) != "" {
		realNidn = helper.StringValue(nsPeg.Nidn)
	}

	realName := ""
	if helper.StringValue(nsPeg.Nama) != "" && helper.StringValue(nsPeg.Nama) != rawUsername && helper.StringValue(nsPeg.Nama) != cleanNip {
		realName = helper.StringValue(nsPeg.Nama)
	}
	if realName == "" {
		realName = rawUsername
	}

	return &domain.AuthResult{
		Sid:    rawUsername,
		Source: "simpeg",
		Name:   realName,
		Nip:    realNip,
		Nidn:   realNidn,
	}, nil
}

func (r *SimpegRepository) GetInfo(ctx context.Context, sid string) (*domain.UserInfo, error) {
	if r == nil {
		return nil, errors.New("database SIMPEG connection not available")
	}

	// Target dbSimpegNew (unpak_newsimpeg) for pegawais x pegawai_pekerjaans x master_units
	dbNew := r.dbSimpegNew
	if dbNew == nil {
		dbNew = r.dbSimpeg
	}
	if dbNew == nil {
		return nil, errors.New("database SIMPEG connection not available")
	}

	cleanSid := strings.TrimSpace(sid)

	type NewSimpegDetail struct {
		Nip      *string `gorm:"column:nip"`
		Nidn     *string `gorm:"column:nidn"`
		Nama     *string `gorm:"column:nama"`
		Email    *string `gorm:"column:email"`
		NamaUnit *string `gorm:"column:nama_unit"`
	}

	var nsDetail NewSimpegDetail
	errNS := dbNew.WithContext(ctx).Debug().
		Table("pegawais p").
		Select("p.nip, null as nidn, p.nama, p.email, u.nama_unit").
		Joins("LEFT JOIN pegawai_pekerjaans pp ON pp.pegawai_id = p.id").
		Joins("LEFT JOIN master_units u ON u.kode_unit = pp.kode_unit").
		Where("p.nip = ?", cleanSid).
		First(&nsDetail).Error

	if errNS != nil {
		return nil, errNS
	}

	realNip := helper.StringValue(nsDetail.Nip)
	if realNip == "" {
		realNip = cleanSid
	}
	realNidn := helper.StringValue(nsDetail.Nidn)
	realName := helper.StringValue(nsDetail.Nama)
	if realName == "" {
		realName = cleanSid
	}
	realEmail := helper.StringValue(nsDetail.Email)
	unitKerja := helper.StringValue(nsDetail.NamaUnit)

	level := "tendik"
	if realNidn != "" {
		level = "dosen"
	}

	return &domain.UserInfo{
		Sid:          cleanSid,
		Source:       "simpeg",
		Fakultas:     "",
		Prodi:        "",
		KodeFakultas: "",
		KodeProdi:    "",
		Unit:         unitKerja,
		Level:        level,
		Name:         realName,
		Email:        realEmail,
		Nip:          realNip,
		Nidn:         realNidn,
	}, nil
}
