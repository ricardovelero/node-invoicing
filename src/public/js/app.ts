const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
});

const parseNumberInput = (input: HTMLInputElement) => {
  const value = Number(input.value);

  return Number.isFinite(value) ? value : 0;
};

const setupInvoiceForms = () => {
  document.querySelectorAll<HTMLFormElement>("[data-invoice-form]").forEach((form) => {
    const quantityInput = form.querySelector<HTMLInputElement>("[data-invoice-quantity]");
    const unitPriceInput = form.querySelector<HTMLInputElement>("[data-invoice-unit-price]");
    const total = form.querySelector<HTMLElement>("[data-invoice-total]");

    if (!quantityInput || !unitPriceInput || !total) {
      return;
    }

    const updateTotal = () => {
      total.textContent = currencyFormatter.format(
        parseNumberInput(quantityInput) * parseNumberInput(unitPriceInput),
      );
    };

    quantityInput.addEventListener("input", updateTotal);
    unitPriceInput.addEventListener("input", updateTotal);
    updateTotal();
  });
};

const setupFlashMessages = () => {
  document.querySelectorAll<HTMLElement>("[data-auto-dismiss]").forEach((element) => {
    const delay = Number(element.dataset.autoDismiss);
    const timeout = Number.isFinite(delay) ? delay : 4000;

    window.setTimeout(() => {
      element.remove();
    }, timeout);
  });
};

const getEmailValidationMessage = (input: HTMLInputElement) => {
  if (!input.value.trim()) {
    return "Enter your email address.";
  }

  if (!input.validity.valid) {
    return "Enter a valid email address.";
  }

  return "";
};

const passwordRequirementsMessage =
  "Use at least 8 characters with uppercase, lowercase and a number.";

const getPasswordValidationMessage = (input: HTMLInputElement) => {
  const value = input.value;

  if (!value) {
    return "Enter your password.";
  }

  if (
    value.length < 8 ||
    !/[a-z]/.test(value) ||
    !/[A-Z]/.test(value) ||
    !/\d/.test(value)
  ) {
    return passwordRequirementsMessage;
  }

  return "";
};

const getRequiredValidationMessage = (input: HTMLInputElement, label: string) => {
  if (!input.value.trim()) {
    return `Enter your ${label}.`;
  }

  return "";
};

const setFieldError = (
  input: HTMLInputElement,
  errorElement: HTMLElement,
  message: string,
) => {
  input.setCustomValidity(message);
  errorElement.textContent = message;
  errorElement.classList.toggle("hidden", !message);
  input.classList.toggle("border-red-500", Boolean(message));
  input.classList.toggle("border-line", !message);
};

const setupRegisterForms = () => {
  document.querySelectorAll<HTMLFormElement>("[data-register-form]").forEach((form) => {
    form.noValidate = true;

    const email = form.querySelector<HTMLInputElement>("[data-register-email]");
    const emailError = form.querySelector<HTMLElement>("[data-register-email-error]");
    const password = form.querySelector<HTMLInputElement>("[data-register-password]");
    const passwordError = form.querySelector<HTMLElement>("[data-register-password-error]");
    const organization = form.querySelector<HTMLInputElement>("[data-register-organization]");
    const organizationError = form.querySelector<HTMLElement>(
      "[data-register-organization-error]",
    );

    if (!email || !emailError || !password || !passwordError || !organization || !organizationError) {
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
      const message = getRequiredValidationMessage(organization, "organization name");

      setFieldError(organization, organizationError, message);

      return !message;
    };

    email.addEventListener("blur", validateEmail);
    email.addEventListener("input", () => {
      if (!emailError.classList.contains("hidden")) {
        validateEmail();
      }
    });
    password.addEventListener("blur", validatePassword);
    password.addEventListener("input", () => {
      if (!passwordError.classList.contains("hidden")) {
        validatePassword();
      }
    });
    organization.addEventListener("blur", validateOrganization);
    organization.addEventListener("input", () => {
      if (!organizationError.classList.contains("hidden")) {
        validateOrganization();
      }
    });

    form.addEventListener("submit", (event) => {
      const isValid = [validateEmail(), validatePassword(), validateOrganization()].every(Boolean);

      if (!isValid) {
        event.preventDefault();

        form.querySelector<HTMLInputElement>("[aria-describedby$='-error'].border-red-500")?.focus();
      }
    });
  });
};

const setupPasswordToggles = () => {
  document.querySelectorAll<HTMLButtonElement>("[data-password-toggle]").forEach((button) => {
    const field = button.parentElement?.querySelector<HTMLInputElement>("[data-password-input]");
    const eyeOpen = button.querySelector<SVGElement>("[data-eye-open]");
    const eyeClosed = button.querySelector<SVGElement>("[data-eye-closed]");

    if (!field || !eyeOpen || !eyeClosed) {
      return;
    }

    button.addEventListener("click", () => {
      const isPasswordVisible = field.type === "text";

      field.type = isPasswordVisible ? "password" : "text";
      button.setAttribute("aria-label", isPasswordVisible ? "Show password" : "Hide password");
      eyeOpen.classList.toggle("hidden", !isPasswordVisible);
      eyeClosed.classList.toggle("hidden", isPasswordVisible);
    });
  });
};

setupInvoiceForms();
setupFlashMessages();
setupRegisterForms();
setupPasswordToggles();
