package domain

import (
	"time"

	common "hrportal_backend/common/domain"
)

type Absen struct {
	common.Entity
	ID             uint       `gorm:"primaryKey;autoIncrement" json:"id"`
	Nidn           string     `gorm:"column:nidn;index" json:"nidn"`
	Nip            string     `gorm:"column:nip;index" json:"nip"`
	NamaPegawai    string     `gorm:"column:nama_pegawai" json:"nama_pegawai"`
	Unit           string     `gorm:"column:unit" json:"unit"`
	Fakultas       string     `gorm:"column:fakultas" json:"fakultas"`
	Prodi          string     `gorm:"column:prodi" json:"prodi"`
	Tanggal        string     `gorm:"column:tanggal;index" json:"tanggal"`
	AbsenMasuk     *time.Time `gorm:"column:absen_masuk" json:"absen_masuk"`
	AbsenKeluar    *time.Time `gorm:"column:absen_keluar" json:"absen_keluar"`
	CatatanTelat   *string    `gorm:"column:catatan_telat" json:"catatan_telat"`
	CatatanPulang  *string    `gorm:"column:catatan_pulang" json:"catatan_pulang"`
	Note           string     `gorm:"column:note;type:varchar(255)" json:"note"`
	OtomatisKeluar bool       `gorm:"column:otomatis_keluar" json:"otomatis_keluar"`

	// GPS (Absen Masuk) & IP
	Latitude              *float64   `gorm:"column:latitude;type:double" json:"latitude"`
	Longitude             *float64   `gorm:"column:longitude;type:double" json:"longitude"`
	IpAddress             *string    `gorm:"column:ip_address;type:varchar(100)" json:"ip_address"`
	IpKeluar              *string    `gorm:"column:ip_keluar;type:varchar(100)" json:"ip_keluar"`

	// Catatan Luar Kampus
	CatatanLuarUnpak      *string    `gorm:"column:catatan_luar_unpak;type:text" json:"catatan_luar_unpak"`
	CatatanHasilLuarUnpak *string    `gorm:"column:catatan_hasil_luar_unpak;type:text" json:"catatan_hasil_luar_unpak"`

	CreatedAt      *time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt      *time.Time `gorm:"column:updated_at" json:"updated_at"`
	IsCreated      bool       `gorm:"-" json:"is_created,omitempty"`
}

func (Absen) TableName() string {
	return "absen"
}

type KlaimAbsen struct {
	common.Entity
	ID          uint       `gorm:"primaryKey;autoIncrement" json:"id"`
	Nip         string     `gorm:"column:nip" json:"nip"`
	NamaPegawai string     `gorm:"column:nama_pegawai" json:"nama_pegawai"`
	Unit        string     `gorm:"column:unit" json:"unit"`
	Fakultas    string     `gorm:"column:fakultas" json:"fakultas"`
	Prodi       string     `gorm:"column:prodi" json:"prodi"`
	Tanggal    string     `gorm:"column:tanggal" json:"tanggal"`
	TipeKlaim  string     `gorm:"column:tipe_klaim" json:"tipe_klaim"`
	Keterangan string     `gorm:"column:keterangan" json:"keterangan"`
	Status     string     `gorm:"column:status" json:"status"`
	CreatedAt  *time.Time `gorm:"column:created_at" json:"created_at"`
}

func (KlaimAbsen) TableName() string {
	return "klaim_absen"
}
