import { calculateInvoiceTotals, type DiscountType } from "../../lib/money";
import { setFieldError } from "./form-errors";

const dueDateBeforeIssueDateMessage = "Due date cannot be before the issue date.";

const parseNumberInput = (input: HTMLInputElement) => {
  const value = Number(input.value);

  return Number.isFinite(value) ? value : 0;
};

const parseDiscountType = (select: HTMLSelectElement): DiscountType =>
  select.value === "percent" ? "percent" : "amount";

export const setupInvoiceForms = () => {
  document.querySelectorAll<HTMLFormElement>("[data-invoice-form]").forEach((form) => {
    const locale = form.dataset.locale || "en-GB";
    let currencyFormatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: form.dataset.currency || "EUR",
    });
    const formatCents = (amountCents: number) => currencyFormatter.format(amountCents / 100);
    const formatDiscountCents = (amountCents: number) =>
      amountCents > 0 ? `-${formatCents(amountCents)}` : formatCents(0);
    const linesContainer = form.querySelector<HTMLElement>("[data-invoice-lines]");
    const lineTemplate = form.querySelector<HTMLTemplateElement>("[data-invoice-line-template]");
    const invoiceSubtotal = form.querySelector<HTMLElement>("[data-invoice-subtotal]");
    const lineDiscountTotal = form.querySelector<HTMLElement>("[data-invoice-line-discount]");
    const invoiceDiscountTotal = form.querySelector<HTMLElement>("[data-invoice-discount]");
    const invoiceTax = form.querySelector<HTMLElement>("[data-invoice-tax]");
    const invoiceTotal = form.querySelector<HTMLElement>("[data-invoice-total]");
    const invoiceDiscountType = form.querySelector<HTMLSelectElement>(
      "[data-invoice-discount-type]",
    );
    const invoiceDiscountValue = form.querySelector<HTMLInputElement>(
      "[data-invoice-discount-value]",
    );
    const currencySelect = form.querySelector<HTMLSelectElement>("[data-invoice-currency-select]");
    const issueDateInput = form.querySelector<HTMLInputElement>("[data-invoice-issue-date]");
    const dueDateInput = form.querySelector<HTMLInputElement>("[data-invoice-due-date]");
    const dueDateError = form.querySelector<HTMLElement>("[data-invoice-due-date-error]");

    if (
      !linesContainer ||
      !lineTemplate ||
      !invoiceSubtotal ||
      !lineDiscountTotal ||
      !invoiceDiscountTotal ||
      !invoiceTax ||
      !invoiceTotal ||
      !invoiceDiscountType ||
      !invoiceDiscountValue ||
      !currencySelect ||
      !issueDateInput ||
      !dueDateInput ||
      !dueDateError
    ) {
      return;
    }

    const getRows = () =>
      Array.from(linesContainer.querySelectorAll<HTMLElement>("[data-invoice-line]"));

    const updateCurrency = () => {
      const currency = currencySelect.value || "EUR";
      form.dataset.currency = currency;
      currencyFormatter = new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
      });
      form.querySelectorAll<HTMLOptionElement>("[data-invoice-currency-option]").forEach((option) => {
        option.textContent = currency;
      });
    };

    const readLineInput = (row: HTMLElement) => {
      const quantityInput = row.querySelector<HTMLInputElement>("[data-invoice-quantity]");
      const unitPriceInput = row.querySelector<HTMLInputElement>("[data-invoice-unit-price]");
      const discountType = row.querySelector<HTMLSelectElement>("[data-invoice-line-discount-type]");
      const discountValue = row.querySelector<HTMLInputElement>(
        "[data-invoice-line-discount-value]",
      );
      const taxRate = row.querySelector<HTMLInputElement>("[data-invoice-tax-rate]");

      if (!quantityInput || !unitPriceInput || !discountType || !discountValue || !taxRate) {
        return {
          quantity: 0,
          unitPrice: 0,
          discount: { type: "amount" as const, value: 0 },
          taxRate: 0,
        };
      }

      return {
        quantity: parseNumberInput(quantityInput),
        unitPrice: parseNumberInput(unitPriceInput),
        discount: {
          type: parseDiscountType(discountType),
          value: parseNumberInput(discountValue),
        },
        taxRate: parseNumberInput(taxRate),
      };
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
      const totals = calculateInvoiceTotals(rows.map(readLineInput), {
        type: parseDiscountType(invoiceDiscountType),
        value: parseNumberInput(invoiceDiscountValue),
      });

      rows.forEach((row, index) => {
        const lineTotal = row.querySelector<HTMLElement>("[data-invoice-line-total]");

        if (lineTotal) {
          lineTotal.textContent = formatCents(totals.lines[index]?.totalCents ?? 0);
        }
      });

      invoiceSubtotal.textContent = formatCents(totals.subtotalCents);
      lineDiscountTotal.textContent = formatDiscountCents(totals.lineDiscountCents);
      invoiceDiscountTotal.textContent = formatDiscountCents(totals.discountCents);
      invoiceTax.textContent = formatCents(totals.taxCents);
      invoiceTotal.textContent = formatCents(totals.totalCents);
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
        event.target.matches("[data-invoice-unit-price]") ||
        event.target.matches("[data-invoice-line-discount-value]") ||
        event.target.matches("[data-invoice-tax-rate]") ||
        event.target.matches("[data-invoice-discount-value]")
      ) {
        updateTotals();
      }
    });

    form.addEventListener("change", (event) => {
      if (!(event.target instanceof HTMLSelectElement)) {
        return;
      }

      if (
        event.target.matches("[data-invoice-line-discount-type]") ||
        event.target.matches("[data-invoice-discount-type]") ||
        event.target.matches("[data-invoice-currency-select]")
      ) {
        if (event.target.matches("[data-invoice-currency-select]")) {
          updateCurrency();
        }
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

    updateCurrency();
    updateTotals();
  });
};

export const setupInlineEditors = () => {
  document.querySelectorAll<HTMLElement>("[data-inline-editor]").forEach((editor) => {
    const openButton = editor.querySelector<HTMLButtonElement>("[data-inline-editor-open]");
    const cancelButton = editor.querySelector<HTMLButtonElement>("[data-inline-editor-cancel]");
    const display = editor.querySelector<HTMLElement>("[data-inline-editor-display]");
    const panel = editor.querySelector<HTMLElement>("[data-inline-editor-panel]");
    const input = editor.querySelector<HTMLTextAreaElement>("[data-inline-editor-input]");

    if (!openButton || !cancelButton || !display || !panel || !input) {
      return;
    }

    const setOpen = (isOpen: boolean) => {
      display.classList.toggle("hidden", isOpen);
      panel.classList.toggle("hidden", !isOpen);
      openButton.setAttribute("aria-expanded", String(isOpen));

      if (isOpen) {
        input.focus();
      }
    };

    openButton.addEventListener("click", () => {
      setOpen(true);
    });

    cancelButton.addEventListener("click", () => {
      input.value = input.defaultValue;
      setOpen(false);
    });
  });
};
