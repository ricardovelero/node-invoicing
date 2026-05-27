import { setFieldError } from "./form-errors";

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
});

const dueDateBeforeIssueDateMessage = "Due date cannot be before the issue date.";

const parseNumberInput = (input: HTMLInputElement) => {
  const value = Number(input.value);

  return Number.isFinite(value) ? value : 0;
};

export const setupInvoiceForms = () => {
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
