package infrastructure

import (
	"context"
	"crypto/md5"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"strings"

	"hrportal_backend/common/helper"
	"hrportal_backend/modules/account/domain"

	"gorm.io/gorm"
)

type SimakRepository struct {
	dbSimak     *gorm.DB
	dbSimpeg    *gorm.DB
	dbSimpegNew *gorm.DB
}

func NewSimakRepository(dbSimak *gorm.DB, dbSimpeg *gorm.DB, dbSimpegNew *gorm.DB) domain.ISimakRepository {
	return &SimakRepository{dbSimak: dbSimak, dbSimpeg: dbSimpeg, dbSimpegNew: dbSimpegNew}
}

func (r *SimakRepository) Authenticate(ctx context.Context, username, password string) (*domain.AuthResult, error) {
	if r == nil || r.dbSimak == nil {
		return nil, errors.New("database SIMAK connection not available")
	}

	rawUsername := strings.TrimSpace(username)
	rawPassword := strings.TrimSpace(password)

	var userSimak []struct {
		Userid string `gorm:"column:userid"`
		Aktif  string `gorm:"column:aktif"`
	}

	_ = r.dbSimak.WithContext(ctx).Debug().Table("user").
		Where("username = ? AND (password = SHA1(MD5(?)) OR password = SHA1(?) OR password = MD5(?) OR password = ?)",
			rawUsername, rawPassword, rawPassword, rawPassword, rawPassword).
		Find(&userSimak)

	if len(userSimak) == 0 {
		hash1 := r.hashSimak(rawPassword)
		_ = r.dbSimak.WithContext(ctx).Debug().Table("user").
			Where("username = ? AND password = ?", rawUsername, hash1).
			Find(&userSimak)
	}

	if len(userSimak) == 0 {
		return nil, errors.New("invalid credentials in SIMAK")
	}
	if len(userSimak) > 1 {
		return nil, errors.New("akun " + rawUsername + " lebih dari 1")
	}

	var validUser *struct {
		Userid string `gorm:"column:userid"`
		Aktif  string `gorm:"column:aktif"`
	}

	for _, u := range userSimak {
		if strings.EqualFold(strings.TrimSpace(u.Aktif), "Y") {
			validUser = &u
			break
		}
	}

	if validUser == nil {
		return nil, errors.New("SIMAK account is inactive")
	}

	var dosen struct {
		Nidn      string `gorm:"column:NIDN"`
		NamaDosen string `gorm:"column:Nama_Dosen"`
	}

	errDosen := r.dbSimak.WithContext(ctx).Debug().Table("m_dosen").
		Where("NIDN = ?", validUser.Userid).
		First(&dosen).Error

	if errDosen != nil {
		return nil, errors.New("dosen profile not found in SIMAK")
	}

	return &domain.AuthResult{
		Sid:    dosen.Nidn,
		Source: "simak",
		Name:   dosen.NamaDosen,
		Nidn:   dosen.Nidn,
	}, nil
}

func (r *SimakRepository) GetInfo(ctx context.Context, sid string) (*domain.UserInfo, error) {
	if r == nil || r.dbSimak == nil {
		return nil, errors.New("database SIMAK connection not available")
	}

	var dosen struct {
		Nidn         string  `gorm:"column:NIDN"`
		NamaDosen    string  `gorm:"column:Nama_Dosen"`
		KodeFakultas *string `gorm:"column:kode_fak"`
		NamaFakultas *string `gorm:"column:nama_fakultas"`
		KodeProdi    *string `gorm:"column:kode_prodi"`
		NamaProdi    *string `gorm:"column:nama_prodi"`
	}

	err := r.dbSimak.WithContext(ctx).Debug().Table("m_dosen").
		Select("m_dosen.NIDN, m_dosen.Nama_Dosen, m_dosen.kode_fak, m_fakultas.nama_fakultas, m_dosen.kode_prodi, m_program_studi.nama_prodi").
		Joins("LEFT JOIN m_fakultas ON m_fakultas.kode_fakultas = m_dosen.kode_fak").
		Joins("LEFT JOIN m_program_studi ON m_program_studi.kode_prodi = m_dosen.kode_prodi").
		Where("m_dosen.NIDN = ?", sid).
		First(&dosen).Error

	if err != nil {
		return nil, err
	}

	var simakU struct {
		Email *string `gorm:"column:email"`
	}
	_ = r.dbSimak.WithContext(ctx).Debug().Table("user").
		Where("username = ?", sid).
		First(&simakU)

	var ePribadi struct {
		Nip *string `gorm:"column:nip"`
	}
	var unitKerja string

	dbTarget := r.dbSimpegNew
	if dbTarget == nil {
		dbTarget = r.dbSimpeg
	}

	if dbTarget != nil {
		type NSInfo struct {
			Nip      *string `gorm:"column:nip"`
			NamaUnit *string `gorm:"column:nama_unit"`
		}
		var ns NSInfo
		_ = dbTarget.WithContext(ctx).Debug().
			Table("pegawais p").
			Select("p.nip, u.nama_unit").
			Joins("LEFT JOIN pegawai_pekerjaans pp ON pp.pegawai_id = p.id").
			Joins("LEFT JOIN master_units u ON u.kode_unit = pp.kode_unit").
			Where("p.nidn_nitk = ?", sid).
			First(&ns)

		if ns.Nip != nil && *ns.Nip != "" {
			ePribadi.Nip = ns.Nip
		}
		if ns.NamaUnit != nil && *ns.NamaUnit != "" {
			unitKerja = *ns.NamaUnit
		}
	}

	return &domain.UserInfo{
		Sid:          sid,
		Source:       "simak",
		Fakultas:     helper.StringValue(dosen.NamaFakultas),
		Prodi:        helper.StringValue(dosen.NamaProdi),
		KodeFakultas: helper.StringValue(dosen.KodeFakultas),
		KodeProdi:    helper.StringValue(dosen.KodeProdi),
		Unit:         unitKerja,
		Level:        "dosen",
		Name:         dosen.NamaDosen,
		Email:        helper.StringValue(simakU.Email),
		Nip:          helper.StringValue(ePribadi.Nip),
		Nidn:         helper.StringValue(&dosen.Nidn),
	}, nil
}

func (r *SimakRepository) hashSimak(password string) string {
	hMD5 := md5.Sum([]byte(password))
	strMD5 := hex.EncodeToString(hMD5[:])
	hSHA1 := sha1.Sum([]byte(strMD5))
	return hex.EncodeToString(hSHA1[:])
}
