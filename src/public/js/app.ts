const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
});

const parseNumberInput = (input: HTMLInputElement) => {
  const value = Number(input.value);

  return Number.isFinite(value) ? value : 0;
};

const dueDateBeforeIssueDateMessage = "Due date cannot be before the issue date.";

const setupInvoiceForms = () => {
  document.querySelectorAll<HTMLFormElement>("[data-invoice-form]").forEach((form) => {
    const linesContainer = form.querySelector<HTMLElement>("[data-invoice-lines]");
    const lineTemplate = form.querySelector<HTMLTemplateElement>("[data-invoice-line-template]");
    const invoiceTotal = form.querySelector<HTMLElement>("[data-invoice-total]");
    const issueDateInput = form.querySelector<HTMLInputElement>("[data-invoice-issue-date]");
    const dueDateInput = form.querySelector<HTMLInputElement>("[data-invoice-due-date]");
    const dueDateError = form.querySelector<HTMLElement>("[data-invoice-due-date-error]");

    if (
      !linesContainer ||
      !lineTemplate ||
      !invoiceTotal ||
      !issueDateInput ||
      !dueDateInput ||
      !dueDateError
    ) {
      return;
    }

    const getRows = () =>
      Array.from(linesContainer.querySelectorAll<HTMLElement>("[data-invoice-line]"));

    const calculateRowTotal = (row: HTMLElement) => {
      const quantityInput = row.querySelector<HTMLInputElement>("[data-invoice-quantity]");
      const unitPriceInput = row.querySelector<HTMLInputElement>("[data-invoice-unit-price]");
      const lineTotal = row.querySelector<HTMLElement>("[data-invoice-line-total]");

      if (!quantityInput || !unitPriceInput || !lineTotal) {
        return 0;
      }

      const total = parseNumberInput(quantityInput) * parseNumberInput(unitPriceInput);

      lineTotal.textContent = currencyFormatter.format(total);

      return total;
    };

    const updateRemoveButtons = (rows: HTMLElement[]) => {
      const canRemove = rows.length > 1;

      rows.forEach((row) => {
        const removeButton = row.querySelector<HTMLButtonElement>("[data-invoice-remove-line]");

        if (removeButton) {
          removeButton.disabled = !canRemove;
        }
      });
    };

    const updateTotals = () => {
      const rows = getRows();
      const total = rows.reduce((sum, row) => sum + calculateRowTotal(row), 0);

      invoiceTotal.textContent = currencyFormatter.format(total);
      updateRemoveButtons(rows);
    };

    const addLine = () => {
      const line = lineTemplate.content.firstElementChild?.cloneNode(true);

      if (!(line instanceof HTMLElement)) {
        return;
      }

      linesContainer.append(line);
      updateTotals();
      line.querySelector<HTMLInputElement>("[data-invoice-description]")?.focus();
    };

    const validateDateOrder = () => {
      const hasDateOrderError =
        issueDateInput.value !== "" &&
        dueDateInput.value !== "" &&
        issueDateInput.validity.valid &&
        dueDateInput.validity.valid &&
        dueDateInput.value < issueDateInput.value;
      const message = hasDateOrderError ? dueDateBeforeIssueDateMessage : "";

      setFieldError(dueDateInput, dueDateError, message);

      return !message;
    };

    issueDateInput.addEventListener("input", validateDateOrder);
    issueDateInput.addEventListener("change", validateDateOrder);
    dueDateInput.addEventListener("input", validateDateOrder);
    dueDateInput.addEventListener("change", validateDateOrder);

    form.addEventListener("input", (event) => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }

      if (
        event.target.matches("[data-invoice-quantity]") ||
        event.target.matches("[data-invoice-unit-price]")
      ) {
        updateTotals();
      }
    });

    form.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const addButton = event.target.closest<HTMLButtonElement>("[data-invoice-add-line]");

      if (addButton) {
        addLine();
        return;
      }

      const removeButton = event.target.closest<HTMLButtonElement>("[data-invoice-remove-line]");

      if (!removeButton) {
        return;
      }

      const rows = getRows();

      if (rows.length <= 1) {
        updateRemoveButtons(rows);
        return;
      }

      removeButton.closest<HTMLElement>("[data-invoice-line]")?.remove();
      updateTotals();
    });

    form.addEventListener("submit", (event) => {
      if (!validateDateOrder()) {
        event.preventDefault();
        dueDateInput.focus();
      }
    });

    updateTotals();
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
