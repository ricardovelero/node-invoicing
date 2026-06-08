import { setFieldError } from '../form-errors';

export const dueDateBeforeIssueDateMessage =
  'Due date cannot be before the issue date.';

type ValidateDateOrderOptions = {
  dueDateError: HTMLElement;
  dueDateInput: HTMLInputElement;
  issueDateInput: HTMLInputElement;
};

export const validateDateOrder = ({
  dueDateError,
  dueDateInput,
  issueDateInput,
}: ValidateDateOrderOptions) => {
  const hasDateOrderError =
    issueDateInput.value !== '' &&
    dueDateInput.value !== '' &&
    issueDateInput.validity.valid &&
    dueDateInput.validity.valid &&
    dueDateInput.value < issueDateInput.value;
  const message = hasDateOrderError ? dueDateBeforeIssueDateMessage : '';

  setFieldError(dueDateInput, dueDateError, message);

  return !message;
};
