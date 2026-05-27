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

setupInvoiceForms();
setupFlashMessages();
