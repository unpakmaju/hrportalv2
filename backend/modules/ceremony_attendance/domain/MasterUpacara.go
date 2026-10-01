package domain

import (
	"time"

	common "hrportal_backend/common/domain"
)

type MasterUpacara struct {
	common.Entity
	ID         uint       `gorm:"primaryKey;autoIncrement;column:id" json:"id"`
	Nama       string     `gorm:"column:nama;type:varchar(255);not null" json:"nama"`
	Tanggal    string     `gorm:"column:tanggal;type:date;index;not null" json:"tanggal"`
	JamMulai   string     `gorm:"column:jam_mulai;type:varchar(10);default:'08:00'" json:"jam_mulai"`
	JamSelesai string     `gorm:"column:jam_selesai;type:varchar(10);default:'09:00'" json:"jam_selesai"`
	Lokasi     string     `gorm:"column:lokasi;type:varchar(255);default:'Teknik / Lapangan'" json:"lokasi"`
	Deskripsi  string     `gorm:"column:deskripsi;type:text" json:"deskripsi"`
	CreatedAt  *time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt  *time.Time `gorm:"column:updated_at" json:"updated_at"`
}

func (MasterUpacara) TableName() string {
	return "master_upacara"
}
