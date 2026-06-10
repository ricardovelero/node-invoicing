import { setupCatalogEvents } from './catalog-events';
import type { CatalogSearchState } from './catalog.types';
import { validateDateOrder } from './dates';
import { addLine, getRows, updateRemoveButtons } from './lines';
import { updateCurrency, updateTotals } from './totals';
import { markUnsavedChangesDirty } from '../unsaved-changes';

export const setupInvoiceForms = () => {
  document
    .querySelectorAll<HTMLFormElement>('[data-invoice-form]')
    .forEach((form) => {
      const locale = form.dataset.locale || 'en-GB';
      let currencyFormatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: form.dataset.currency || 'EUR',
      });
      const formatCents = (amountCents: number) =>
        currencyFormatter.format(amountCents / 100);
      const formatDiscountCents = (amountCents: number) =>
        amountCents > 0 ? `-${formatCents(amountCents)}` : formatCents(0);
      const linesContainer = form.querySelector<HTMLElement>(
        '[data-invoice-lines]',
      );
      const lineTemplate = form.querySelector<HTMLTemplateElement>(
        '[data-invoice-line-template]',
      );
      const invoiceSubtotal = form.querySelector<HTMLElement>(
        '[data-invoice-subtotal]',
      );
      const lineDiscountTotal = form.querySelector<HTMLElement>(
        '[data-invoice-line-discount]',
      );
      const invoiceDiscountTotal = form.querySelector<HTMLElement>(
        '[data-invoice-discount]',
      );
      const invoiceTax = form.querySelector<HTMLElement>('[data-invoice-tax]');
      const invoiceTotal = form.querySelector<HTMLElement>(
        '[data-invoice-total]',
      );
      const invoiceWithholding = form.querySelector<HTMLElement>(
        '[data-invoice-withholding]',
      );
      const invoiceWithholdingLabel = form.querySelector<HTMLElement>(
        '[data-invoice-withholding-label]',
      );
      const invoiceWithholdingRow = form.querySelector<HTMLElement>(
        '[data-invoice-withholding-row]',
      );
      const invoiceWithholdingToggle = form.querySelector<HTMLInputElement>(
        '[data-invoice-apply-withholding]',
      );
      const invoiceWithholdingRate = form.querySelector<HTMLInputElement>(
        '[data-invoice-withholding-rate]',
      );
      const invoiceWithholdingRatePanel = form.querySelector<HTMLElement>(
        '[data-invoice-withholding-rate-panel]',
      );
      const invoiceWithholdingRateType = form.querySelector<HTMLSelectElement>(
        '[data-invoice-withholding-rate-type]',
      );
      const invoiceDiscountType = form.querySelector<HTMLSelectElement>(
        '[data-invoice-discount-type]',
      );
      const invoiceDiscountValue = form.querySelector<HTMLInputElement>(
        '[data-invoice-discount-value]',
      );
      const currencySelect = form.querySelector<HTMLSelectElement>(
        '[data-invoice-currency-select]',
      );
      const issueDateInput = form.querySelector<HTMLInputElement>(
        '[data-invoice-issue-date]',
      );
      const dueDateInput = form.querySelector<HTMLInputElement>(
        '[data-invoice-due-date]',
      );
      const dueDateError = form.querySelector<HTMLElement>(
        '[data-invoice-due-date-error]',
      );

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

      const getRowsForForm = () => getRows(linesContainer);
      const markFormDirty = () => {
        markUnsavedChangesDirty(form);
      };
      const catalogSearchStates = new WeakMap<
        HTMLInputElement,
        CatalogSearchState
      >();
      const savedCatalogDescriptions = new WeakMap<HTMLInputElement, string>();
      const linkedCatalogItemIds = new WeakMap<HTMLInputElement, string>();
      const catalogSaveHideTimeouts = new WeakMap<HTMLInputElement, number>();
      const catalogSaveContext = {
        catalogSaveHideTimeouts,
        catalogSearchStates,
        currencySelect,
        form,
        linkedCatalogItemIds,
        markDirty: markFormDirty,
        savedCatalogDescriptions,
      };

      const updateCurrencyForForm = () => {
        currencyFormatter = updateCurrency({
          currencySelect,
          form,
          locale,
        });
      };

      const updateTotalsForForm = () => {
        updateTotals({
          formatCents,
          formatDiscountCents,
          getRows: getRowsForForm,
          invoiceDiscountTotal,
          invoiceDiscountType,
          invoiceDiscountValue,
          invoiceSubtotal,
          invoiceTax,
          invoiceTotal,
          invoiceWithholding,
          invoiceWithholdingLabel,
          invoiceWithholdingRate,
          invoiceWithholdingRow,
          invoiceWithholdingToggle,
          lineDiscountTotal,
        });
      };

      const updateWithholdingVisibility = () => {
        const isApplied = invoiceWithholdingToggle?.checked === true;
        invoiceWithholdingRatePanel?.classList.toggle('hidden', !isApplied);
        if (!isApplied) {
          invoiceWithholdingRow?.classList.add('hidden');
        }
      };

      const syncStandardWithholdingRate = () => {
        if (!invoiceWithholdingRate || !invoiceWithholdingRateType) {
          return;
        }

        if (invoiceWithholdingRateType.value === '15') {
          invoiceWithholdingRate.value = '15';
        }

        if (invoiceWithholdingRateType.value === '7') {
          invoiceWithholdingRate.value = '7';
        }
      };

      const addLineForForm = () => {
        addLine({
          lineTemplate,
          linesContainer,
          markDirty: markFormDirty,
          updateTotals: updateTotalsForForm,
        });
      };

      const validateDateOrderForForm = () =>
        validateDateOrder({
          dueDateError,
          dueDateInput,
          issueDateInput,
        });

      issueDateInput.addEventListener('input', validateDateOrderForForm);
      issueDateInput.addEventListener('change', validateDateOrderForForm);
      dueDateInput.addEventListener('input', validateDateOrderForForm);
      dueDateInput.addEventListener('change', validateDateOrderForForm);

      form.addEventListener('input', (event) => {
        if (!(event.target instanceof HTMLInputElement)) {
          return;
        }

        if (
          event.target.matches('[data-invoice-quantity]') ||
          event.target.matches('[data-invoice-unit-price]') ||
          event.target.matches('[data-invoice-line-discount-value]') ||
          event.target.matches('[data-invoice-tax-rate]') ||
          event.target.matches('[data-invoice-discount-value]') ||
          event.target.matches('[data-invoice-withholding-rate]')
        ) {
          updateTotalsForForm();
        }

        if (event.target.matches('[data-invoice-apply-withholding]')) {
          updateWithholdingVisibility();
          updateTotalsForForm();
        }
      });

      form.addEventListener('change', (event) => {
        if (!(event.target instanceof HTMLSelectElement)) {
          return;
        }

        if (
          event.target.matches('[data-invoice-line-discount-type]') ||
          event.target.matches('[data-invoice-discount-type]') ||
          event.target.matches('[data-invoice-currency-select]') ||
          event.target.matches('[data-invoice-withholding-rate-type]')
        ) {
          if (event.target.matches('[data-invoice-currency-select]')) {
            updateCurrencyForForm();
          }
          if (event.target.matches('[data-invoice-withholding-rate-type]')) {
            syncStandardWithholdingRate();
          }
          updateTotalsForForm();
        }
      });

      form.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) {
          return;
        }

        const addButton = event.target.closest<HTMLButtonElement>(
          '[data-invoice-add-line]',
        );

        if (addButton) {
          addLineForForm();
          return;
        }

        const removeButton = event.target.closest<HTMLButtonElement>(
          '[data-invoice-remove-line]',
        );

        if (!removeButton) {
          return;
        }

        const rows = getRowsForForm();

        if (rows.length <= 1) {
          updateRemoveButtons(rows);
          return;
        }

        removeButton.closest<HTMLElement>('[data-invoice-line]')?.remove();
        markFormDirty();
        updateTotalsForForm();
      });

      setupCatalogEvents({
        catalogSaveContext,
        catalogSearchStates,
        currencySelect,
        form,
        markDirty: markFormDirty,
        updateTotals: updateTotalsForForm,
      });

      form.addEventListener('submit', (event) => {
        if (!validateDateOrderForForm()) {
          event.preventDefault();
          dueDateInput.focus();
        }
      });

      updateCurrencyForForm();
      updateWithholdingVisibility();
      syncStandardWithholdingRate();
      updateTotalsForForm();
    });
};
