package domain

import "hrportal_backend/common/domain"

func UpacaraNotFound() domain.Error {
	return domain.NotFoundError("CeremonyAttendance.NotFound", "ceremony attendance not found")
}

func MasterUpacaraNotFound() domain.Error {
	return domain.NotFoundError("MasterUpacara.NotFound", "jadwal upacara tidak ditemukan")
}
