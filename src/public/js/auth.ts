import { passwordRequirementsMessage } from '../../modules/auth/auth.schema';
import { setFieldError } from './form-errors';

const getEmailValidationMessage = (input: HTMLInputElement) => {
  if (!input.value.trim()) {
    return 'Enter your email address.';
  }

  if (!input.validity.valid) {
    return 'Enter a valid email address.';
  }

  return '';
};

const getPasswordValidationMessage = (input: HTMLInputElement) => {
  const value = input.value;

  if (!value) {
    return 'Enter your password.';
  }

  if (
    value.length < 8 ||
    !/[a-z]/.test(value) ||
    !/[A-Z]/.test(value) ||
    !/\d/.test(value)
  ) {
    return passwordRequirementsMessage;
  }

  return '';
};

const getRequiredValidationMessage = (
  input: HTMLInputElement,
  label: string,
) => {
  if (!input.value.trim()) {
    return `Enter your ${label}.`;
  }

  return '';
};

const getErrorElement = (input: HTMLInputElement) => {
  const id = input.getAttribute('aria-describedby');

  return id ? document.getElementById(id) : null;
};

const getValidationLabel = (input: HTMLInputElement) => {
  if (input.dataset.validateLabel) {
    return input.dataset.validateLabel;
  }

  const label = input.id
    ? document.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`)
    : null;

  return (label?.textContent ?? '').replace('*', '').trim().toLowerCase() || 'value';
};

const getValidationMessage = (input: HTMLInputElement) => {
  switch (input.dataset.validate) {
    case 'email':
      return getEmailValidationMessage(input);
    case 'password':
      return getPasswordValidationMessage(input);
    case 'required':
      return getRequiredValidationMessage(input, getValidationLabel(input));
    default:
      return '';
  }
};

export const setupValidatedForms = () => {
  document
    .querySelectorAll<HTMLFormElement>('[data-validate-form]')
    .forEach((form) => {
      const fields = Array.from(
        form.querySelectorAll<HTMLInputElement>('[data-validate]'),
      ).filter((input) => getErrorElement(input));

      if (!fields.length) {
        return;
      }

      form.noValidate = true;

      const validateField = (input: HTMLInputElement) => {
        const errorElement = getErrorElement(input);

        if (!errorElement) {
          return true;
        }

        const message = getValidationMessage(input);

        setFieldError(input, errorElement, message);

        return !message;
      };

      fields.forEach((input) => {
        const errorElement = getErrorElement(input);

        input.addEventListener('blur', () => validateField(input));
        input.addEventListener('input', () => {
          if (errorElement && !errorElement.classList.contains('hidden')) {
            validateField(input);
          }
        });
      });

      form.addEventListener('submit', (event) => {
        const isValid = fields
          .map((input) => validateField(input))
          .every(Boolean);

        if (!isValid) {
          event.preventDefault();

          form
            .querySelector<HTMLInputElement>(
              "[aria-describedby$='-error'].border-red-500",
            )
            ?.focus();
        }
      });
    });
};

export const setupPasswordToggles = () => {
  document
    .querySelectorAll<HTMLButtonElement>('[data-password-toggle]')
    .forEach((button) => {
      const field = button.parentElement?.querySelector<HTMLInputElement>(
        '[data-password-input]',
      );
      const eyeOpen = button.querySelector<SVGElement>('[data-eye-open]');
      const eyeClosed = button.querySelector<SVGElement>('[data-eye-closed]');

      if (!field || !eyeOpen || !eyeClosed) {
        return;
      }

      button.addEventListener('click', () => {
        const isPasswordVisible = field.type === 'text';

        field.type = isPasswordVisible ? 'password' : 'text';
        button.setAttribute(
          'aria-label',
          isPasswordVisible ? 'Show password' : 'Hide password',
        );
        eyeOpen.classList.toggle('hidden', !isPasswordVisible);
        eyeClosed.classList.toggle('hidden', isPasswordVisible);
      });
    });
};
