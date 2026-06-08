import { shortCatalogName } from './catalog.helpers';
import {
  setCatalogSaveStatus,
  submitCatalogSave,
  updateCatalogSavePrompt,
} from './catalog-save';
import {
  getCatalogSearchState,
  hideAllCatalogSuggestions,
  hideCatalogSuggestions,
  scheduleCatalogSearch,
  selectCatalogSuggestion,
  updateCatalogActiveOption,
} from './catalog-search';
import type { CatalogSaveStatus, CatalogSearchState } from './catalog.types';
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
      const catalogSaveHideTimeouts = new WeakMap<HTMLInputElement, number>();
      const catalogSaveContext = {
        catalogSaveHideTimeouts,
        catalogSearchStates,
        currencySelect,
        form,
        markDirty: markFormDirty,
        savedCatalogDescriptions,
      };

      const setCatalogSaveStatusForForm = (
        input: HTMLInputElement,
        status: CatalogSaveStatus,
      ) => {
        setCatalogSaveStatus(input, status, catalogSaveContext);
      };

      const updateCatalogSavePromptForForm = (input: HTMLInputElement) => {
        updateCatalogSavePrompt(input, catalogSaveContext);
      };

      const submitCatalogSaveForForm = (row: HTMLElement) =>
        submitCatalogSave(row, catalogSaveContext);

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
          lineDiscountTotal,
        });
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

        if (event.target.matches('[data-invoice-catalog-input]')) {
          scheduleCatalogSearch({
            catalogSearchStates,
            input: event.target,
            updateCatalogSavePrompt: updateCatalogSavePromptForForm,
          });
          updateCatalogSavePromptForForm(event.target);
          return;
        }

        if (
          event.target.matches('[data-invoice-quantity]') ||
          event.target.matches('[data-invoice-unit-price]') ||
          event.target.matches('[data-invoice-line-discount-value]') ||
          event.target.matches('[data-invoice-tax-rate]') ||
          event.target.matches('[data-invoice-discount-value]')
        ) {
          updateTotalsForForm();

          if (event.target.matches('[data-invoice-unit-price]')) {
            const input = event.target
              .closest<HTMLElement>('[data-invoice-line]')
              ?.querySelector<HTMLInputElement>('[data-invoice-catalog-input]');

            if (input) {
              updateCatalogSavePromptForForm(input);
            }
          }
        }
      });

      form.addEventListener('keydown', (event) => {
        if (!(event.target instanceof HTMLInputElement)) {
          return;
        }

        if (event.target.matches('[data-invoice-catalog-save-name]')) {
          if (event.key === 'Enter') {
            const row = event.target.closest<HTMLElement>('[data-invoice-line]');

            event.preventDefault();

            if (row) {
              void submitCatalogSaveForForm(row);
            }
          }

          return;
        }

        if (!event.target.matches('[data-invoice-catalog-input]')) {
          return;
        }

        const state = getCatalogSearchState(event.target, catalogSearchStates);

        if (event.key === 'Escape') {
          hideCatalogSuggestions(event.target, catalogSearchStates);
          return;
        }

        if (state.items.length === 0) {
          return;
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          state.activeIndex = Math.min(
            state.activeIndex + 1,
            state.items.length - 1,
          );
          updateCatalogActiveOption(event.target, catalogSearchStates);
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          state.activeIndex = Math.max(state.activeIndex - 1, 0);
          updateCatalogActiveOption(event.target, catalogSearchStates);
          return;
        }

        if (event.key === 'Enter' && state.activeIndex >= 0) {
          event.preventDefault();
          selectCatalogSuggestion({
            catalogSearchStates,
            clearSavedCatalogDescription: (input) => {
              savedCatalogDescriptions.delete(input);
            },
            currencySelect,
            input: event.target,
            item: state.items[state.activeIndex],
            markDirty: markFormDirty,
            setCatalogSaveStatus: setCatalogSaveStatusForForm,
            updateTotals: updateTotalsForForm,
          });
        }
      });

      form.addEventListener('change', (event) => {
        if (!(event.target instanceof HTMLSelectElement)) {
          return;
        }

        if (
          event.target.matches('[data-invoice-line-discount-type]') ||
          event.target.matches('[data-invoice-discount-type]') ||
          event.target.matches('[data-invoice-currency-select]')
        ) {
          if (event.target.matches('[data-invoice-currency-select]')) {
            updateCurrencyForForm();
          }
          updateTotalsForForm();
        }
      });

      form.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) {
          return;
        }

        const catalogOption = event.target.closest<HTMLButtonElement>(
          '[data-invoice-catalog-option]',
        );

        if (catalogOption) {
          const row = catalogOption.closest<HTMLElement>('[data-invoice-line]');
          const input = row?.querySelector<HTMLInputElement>(
            '[data-invoice-catalog-input]',
          );
          const index = Number(catalogOption.dataset.invoiceCatalogOption);
          const item =
            input
              ? getCatalogSearchState(input, catalogSearchStates).items[index]
              : undefined;

          if (input && item) {
            selectCatalogSuggestion({
              catalogSearchStates,
              clearSavedCatalogDescription: (input) => {
                savedCatalogDescriptions.delete(input);
              },
              currencySelect,
              input,
              item,
              markDirty: markFormDirty,
              setCatalogSaveStatus: setCatalogSaveStatusForForm,
              updateTotals: updateTotalsForForm,
            });
          }

          return;
        }

        const addButton = event.target.closest<HTMLButtonElement>(
          '[data-invoice-add-line]',
        );

        if (addButton) {
          addLineForForm();
          return;
        }

        const saveOpenButton = event.target.closest<HTMLButtonElement>(
          '[data-invoice-catalog-save-open]',
        );

        if (saveOpenButton) {
          const row = saveOpenButton.closest<HTMLElement>('[data-invoice-line]');
          const input = row?.querySelector<HTMLInputElement>(
            '[data-invoice-catalog-input]',
          );
          const nameInput = row?.querySelector<HTMLInputElement>(
            '[data-invoice-catalog-save-name]',
          );

          if (input && nameInput) {
            nameInput.value = shortCatalogName(input.value);
            setCatalogSaveStatusForForm(input, 'form');
            markFormDirty();
            nameInput.focus();
          }

          return;
        }

        const saveSubmitButton = event.target.closest<HTMLButtonElement>(
          '[data-invoice-catalog-save-submit]',
        );

        if (saveSubmitButton) {
          const row = saveSubmitButton.closest<HTMLElement>(
            '[data-invoice-line]',
          );

          if (row) {
            void submitCatalogSaveForForm(row);
          }

          return;
        }

        const saveCancelButton = event.target.closest<HTMLButtonElement>(
          '[data-invoice-catalog-save-cancel]',
        );

        if (saveCancelButton) {
          const row = saveCancelButton.closest<HTMLElement>(
            '[data-invoice-line]',
          );
          const input = row?.querySelector<HTMLInputElement>(
            '[data-invoice-catalog-input]',
          );

          if (input) {
            updateCatalogSavePromptForForm(input);
          }

          return;
        }

        const saveRetryButton = event.target.closest<HTMLButtonElement>(
          '[data-invoice-catalog-save-retry]',
        );

        if (saveRetryButton) {
          const row = saveRetryButton.closest<HTMLElement>(
            '[data-invoice-line]',
          );

          if (row) {
            void submitCatalogSaveForForm(row);
          }

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

      form.addEventListener('focusout', (event) => {
        if (!(event.target instanceof Element)) {
          return;
        }

        const combobox = event.target.closest<HTMLElement>(
          '[data-invoice-catalog-combobox]',
        );

        if (!combobox) {
          return;
        }

        const relatedTarget = event.relatedTarget;

        if (relatedTarget instanceof Node && combobox.contains(relatedTarget)) {
          return;
        }

        const input = combobox.querySelector<HTMLInputElement>(
          '[data-invoice-catalog-input]',
        );

        if (input) {
          window.setTimeout(() => {
            if (
              document.activeElement instanceof Node &&
              combobox.contains(document.activeElement)
            ) {
              return;
            }

            hideCatalogSuggestions(input, catalogSearchStates);
          }, 100);
        }
      });

      document.addEventListener('click', (event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('[data-invoice-catalog-combobox]')
        ) {
          return;
        }

        hideAllCatalogSuggestions(form, catalogSearchStates);
      });

      form.addEventListener('submit', (event) => {
        if (!validateDateOrderForForm()) {
          event.preventDefault();
          dueDateInput.focus();
        }
      });

      updateCurrencyForForm();
      updateTotalsForForm();
    });
};
