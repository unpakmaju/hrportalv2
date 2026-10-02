package DeleteMasterUpacara

import (
	"context"

	common "hrportal_backend/common/domain"
	commoninfra "hrportal_backend/common/infrastructure"
	"hrportal_backend/modules/ceremony_attendance/domain"

	validation "github.com/go-ozzo/ozzo-validation/v4"
)

type DeleteMasterUpacaraCommand struct {
	ID uint `json:"id"`
}

func (c DeleteMasterUpacaraCommand) Validate() error {
	return validation.ValidateStruct(&c,
		validation.Field(&c.ID, validation.Required),
	)
}

type DeleteMasterUpacaraCommandHandler struct {
	repo domain.IMasterUpacaraRepository
}

func NewDeleteMasterUpacaraCommandHandler(repo domain.IMasterUpacaraRepository) *DeleteMasterUpacaraCommandHandler {
	return &DeleteMasterUpacaraCommandHandler{repo: repo}
}

func (h *DeleteMasterUpacaraCommandHandler) Handle(ctx context.Context, cmd *DeleteMasterUpacaraCommand) (common.ResultValue[bool], error) {
	if err := cmd.Validate(); err != nil {
		return common.FailureValue[bool](common.FailureError("MasterUpacara.InvalidInput", err.Error())), nil
	}

	item, err := h.repo.GetByID(ctx, cmd.ID)
	if err != nil || item == nil {
		return common.FailureValue[bool](domain.MasterUpacaraNotFound()), nil
	}

	if err := h.repo.Delete(ctx, cmd.ID); err != nil {
		return common.FailureValue[bool](common.FailureError("MasterUpacara.DeleteFailed", err.Error())), nil
	}

	return common.SuccessValue(true), nil
}

func init() {
	commoninfra.RegisterValidation(func(cmd DeleteMasterUpacaraCommand) error {
		return cmd.Validate()
	}, "CeremonyAttendance.DeleteMasterUpacara.Validation")
}
