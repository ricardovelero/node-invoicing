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

export const setupRegisterForms = () => {
  document
    .querySelectorAll<HTMLFormElement>('[data-register-form]')
    .forEach((form) => {
      form.noValidate = true;

      const email = form.querySelector<HTMLInputElement>(
        '[data-register-email]',
      );
      const emailError = form.querySelector<HTMLElement>(
        '[data-register-email-error]',
      );
      const password = form.querySelector<HTMLInputElement>(
        '[data-register-password]',
      );
      const passwordError = form.querySelector<HTMLElement>(
        '[data-register-password-error]',
      );
      const organization = form.querySelector<HTMLInputElement>(
        '[data-register-organization]',
      );
      const organizationError = form.querySelector<HTMLElement>(
        '[data-register-organization-error]',
      );

      if (
        !email ||
        !emailError ||
        !password ||
        !passwordError ||
        !organization ||
        !organizationError
      ) {
        return;
      }

      const validateEmail = () => {
        const message = getEmailValidationMessage(email);

        setFieldError(email, emailError, message);

        return !message;
      };

      const validatePassword = () => {
        const message = getPasswordValidationMessage(password);

        setFieldError(password, passwordError, message);

        return !message;
      };

      const validateOrganization = () => {
        const message = getRequiredValidationMessage(
          organization,
          'organization name',
        );

        setFieldError(organization, organizationError, message);

        return !message;
      };

      email.addEventListener('blur', validateEmail);
      email.addEventListener('input', () => {
        if (!emailError.classList.contains('hidden')) {
          validateEmail();
        }
      });
      password.addEventListener('blur', validatePassword);
      password.addEventListener('input', () => {
        if (!passwordError.classList.contains('hidden')) {
          validatePassword();
        }
      });
      organization.addEventListener('blur', validateOrganization);
      organization.addEventListener('input', () => {
        if (!organizationError.classList.contains('hidden')) {
          validateOrganization();
        }
      });

      form.addEventListener('submit', (event) => {
        const isValid = [
          validateEmail(),
          validatePassword(),
          validateOrganization(),
        ].every(Boolean);

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
