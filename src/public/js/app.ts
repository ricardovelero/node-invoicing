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

const setupRegisterForms = () => {
  document.querySelectorAll<HTMLFormElement>("[data-register-form]").forEach((form) => {
    const email = form.querySelector<HTMLInputElement>("[data-register-email]");
    const emailError = form.querySelector<HTMLElement>("[data-register-email-error]");

    if (!email || !emailError) {
      return;
    }

    const validateEmail = () => {
      const message = getEmailValidationMessage(email);

      email.setCustomValidity(message);
      emailError.textContent = message;
      emailError.classList.toggle("hidden", !message);
      email.classList.toggle("border-red-500", Boolean(message));

      return !message;
    };

    email.addEventListener("blur", validateEmail);
    email.addEventListener("input", () => {
      if (!emailError.classList.contains("hidden")) {
        validateEmail();
      }
    });

    form.addEventListener("submit", (event) => {
      validateEmail();

      if (!form.checkValidity()) {
        event.preventDefault();
        form.reportValidity();
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
