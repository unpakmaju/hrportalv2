package infrastructure

import (
	common "hrportal_backend/common/domain"
	"hrportal_backend/modules/ceremony_attendance/application/CreateAbsenUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/CreateMasterUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/DeleteAbsenUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/DeleteMasterUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/GetAbsenUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/GetAllAbsenUpacaras"
	"hrportal_backend/modules/ceremony_attendance/application/GetAllMasterUpacaras"
	"hrportal_backend/modules/ceremony_attendance/application/GetMasterUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/GetTodayMasterUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/UpdateAbsenUpacara"
	"hrportal_backend/modules/ceremony_attendance/application/UpdateMasterUpacara"
	"hrportal_backend/modules/ceremony_attendance/domain"

	"github.com/mehdihadeli/go-mediatr"
	"gorm.io/gorm"
)

func RegisterModuleCeremonyAttendance(db *gorm.DB) error {
	repo := NewCeremonyAttendanceRepository(db)
	masterRepo := NewMasterUpacaraRepository(db)

	err := mediatr.RegisterRequestHandler[*CreateAbsenUpacara.CreateAbsenUpacaraCommand, common.ResultValue[*domain.AbsenUpacara]](
		CreateAbsenUpacara.NewCreateAbsenUpacaraCommandHandler(repo),
	)
	if err != nil {
		return err
	}

	err = mediatr.RegisterRequestHandler[*UpdateAbsenUpacara.UpdateAbsenUpacaraCommand, common.ResultValue[*domain.AbsenUpacara]](
		UpdateAbsenUpacara.NewUpdateAbsenUpacaraCommandHandler(repo),
	)
	if err != nil {
		return err
	}

	err = mediatr.RegisterRequestHandler[*DeleteAbsenUpacara.DeleteAbsenUpacaraCommand, common.ResultValue[bool]](
		DeleteAbsenUpacara.NewDeleteAbsenUpacaraCommandHandler(repo),
	)
	if err != nil {
		return err
	}

	err = mediatr.RegisterRequestHandler[*GetAbsenUpacara.GetAbsenUpacaraQuery, common.ResultValue[*domain.AbsenUpacara]](
		GetAbsenUpacara.NewGetAbsenUpacaraQueryHandler(repo),
	)
	if err != nil {
		return err
	}

	err = mediatr.RegisterRequestHandler[*GetAllAbsenUpacaras.GetAllAbsenUpacarasQuery, common.ResultValue[[]domain.AbsenUpacara]](
		GetAllAbsenUpacaras.NewGetAllAbsenUpacarasQueryHandler(repo),
	)
	if err != nil {
		return err
	}

	// Master Upacara CQRS Handlers
	err = mediatr.RegisterRequestHandler[*CreateMasterUpacara.CreateMasterUpacaraCommand, common.ResultValue[*domain.MasterUpacara]](
		CreateMasterUpacara.NewCreateMasterUpacaraCommandHandler(masterRepo),
	)
	if err != nil {
		return err
	}

	err = mediatr.RegisterRequestHandler[*UpdateMasterUpacara.UpdateMasterUpacaraCommand, common.ResultValue[*domain.MasterUpacara]](
		UpdateMasterUpacara.NewUpdateMasterUpacaraCommandHandler(masterRepo),
	)
	if err != nil {
		return err
	}

	err = mediatr.RegisterRequestHandler[*DeleteMasterUpacara.DeleteMasterUpacaraCommand, common.ResultValue[bool]](
		DeleteMasterUpacara.NewDeleteMasterUpacaraCommandHandler(masterRepo),
	)
	if err != nil {
		return err
	}

	err = mediatr.RegisterRequestHandler[*GetMasterUpacara.GetMasterUpacaraQuery, common.ResultValue[*domain.MasterUpacara]](
		GetMasterUpacara.NewGetMasterUpacaraQueryHandler(masterRepo),
	)
	if err != nil {
		return err
	}

	err = mediatr.RegisterRequestHandler[*GetAllMasterUpacaras.GetAllMasterUpacarasQuery, common.ResultValue[[]domain.MasterUpacara]](
		GetAllMasterUpacaras.NewGetAllMasterUpacarasQueryHandler(masterRepo),
	)
	if err != nil {
		return err
	}

	err = mediatr.RegisterRequestHandler[*GetTodayMasterUpacara.GetTodayMasterUpacaraQuery, common.ResultValue[*GetTodayMasterUpacara.TodayMasterUpacaraDto]](
		GetTodayMasterUpacara.NewGetTodayMasterUpacaraQueryHandler(masterRepo),
	)
	if err != nil {
		return err
	}

	return nil
}
