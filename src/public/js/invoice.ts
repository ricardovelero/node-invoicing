import { calculateInvoiceTotals, type DiscountType } from '../../lib/money';
import { setFieldError } from './form-errors';
import {
  clearUnsavedChangesDirty,
  markUnsavedChangesDirty,
} from './unsaved-changes';

const dueDateBeforeIssueDateMessage =
  'Due date cannot be before the issue date.';
const catalogSearchDebounceMs = 250;

type CatalogItemSuggestion = {
  id: string;
  name: string;
  description: string | null;
  unitPrice: string;
  unitPriceCents: number;
  currency: string;
  taxRate: string;
  taxRateBps: number;
};

type CatalogSearchState = {
  activeIndex: number;
  controller?: AbortController;
  items: CatalogItemSuggestion[];
  timeout?: number;
};

type CatalogSaveStatus = 'hidden' | 'prompt' | 'form' | 'saving' | 'saved' | 'error';

const parseNumberInput = (input: HTMLInputElement) => {
  const value = Number(input.value);

  return Number.isFinite(value) ? value : 0;
};

const parseDiscountType = (select: HTMLSelectElement): DiscountType =>
  select.value === 'percent' ? 'percent' : 'amount';

const normalizeCatalogText = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

const shortCatalogName = (value: string) =>
  value.trim().replace(/\s+/g, ' ').slice(0, 80).trim();

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

      const getRows = () =>
        Array.from(
          linesContainer.querySelectorAll<HTMLElement>('[data-invoice-line]'),
        );
      const catalogSearchStates = new WeakMap<
        HTMLInputElement,
        CatalogSearchState
      >();
      const savedCatalogDescriptions = new WeakMap<HTMLInputElement, string>();
      const catalogSaveHideTimeouts = new WeakMap<HTMLInputElement, number>();

      const getCatalogSearchState = (
        input: HTMLInputElement,
      ): CatalogSearchState => {
        const state = catalogSearchStates.get(input);

        if (state) {
          return state;
        }

        const nextState: CatalogSearchState = {
          activeIndex: -1,
          items: [],
        };

        catalogSearchStates.set(input, nextState);
        return nextState;
      };

      const catalogResultsForInput = (input: HTMLInputElement) =>
        input
          .closest<HTMLElement>('[data-invoice-catalog-combobox]')
          ?.querySelector<HTMLElement>('[data-invoice-catalog-results]');

      const catalogSaveForInput = (input: HTMLInputElement) =>
        input
          .closest<HTMLElement>('[data-invoice-line]')
          ?.querySelector<HTMLElement>('[data-invoice-catalog-save]');

      const setCatalogSaveStatus = (
        input: HTMLInputElement,
        status: CatalogSaveStatus,
      ) => {
        const container = catalogSaveForInput(input);
        const helper = container?.querySelector<HTMLElement>(
          '[data-invoice-catalog-save-helper]',
        );
        const saveForm = container?.querySelector<HTMLElement>(
          '[data-invoice-catalog-save-form]',
        );
        const nameInput = container?.querySelector<HTMLInputElement>(
          '[data-invoice-catalog-save-name]',
        );
        const submitButton = container?.querySelector<HTMLButtonElement>(
          '[data-invoice-catalog-save-submit]',
        );
        const cancelButton = container?.querySelector<HTMLButtonElement>(
          '[data-invoice-catalog-save-cancel]',
        );
        const success = container?.querySelector<HTMLElement>(
          '[data-invoice-catalog-save-success]',
        );
        const error = container?.querySelector<HTMLElement>(
          '[data-invoice-catalog-save-error]',
        );

        if (!container || !helper || !saveForm || !success || !error) {
          return;
        }

        const existingTimeout = catalogSaveHideTimeouts.get(input);

        if (existingTimeout) {
          window.clearTimeout(existingTimeout);
          catalogSaveHideTimeouts.delete(input);
        }

        const showForm = status === 'form' || status === 'saving';

        container.classList.toggle('hidden', status === 'hidden');
        helper.classList.toggle('hidden', status !== 'prompt');
        saveForm.classList.toggle('hidden', !showForm);
        saveForm.classList.toggle('grid', showForm);
        success.classList.toggle('hidden', status !== 'saved');
        error.classList.toggle('hidden', status !== 'error');

        if (nameInput) {
          nameInput.disabled = status === 'saving';
        }

        if (submitButton) {
          submitButton.disabled = status === 'saving';
        }

        if (cancelButton) {
          cancelButton.disabled = status === 'saving';
        }

        if (status === 'saved') {
          const timeout = window.setTimeout(() => {
            catalogSaveHideTimeouts.delete(input);

            if (
              savedCatalogDescriptions.get(input) ===
              normalizeCatalogText(input.value)
            ) {
              setCatalogSaveStatus(input, 'hidden');
            }
          }, 2000);

          catalogSaveHideTimeouts.set(input, timeout);
        }
      };

      const inputHasExactCatalogMatch = (input: HTMLInputElement) => {
        const value = normalizeCatalogText(input.value);

        if (!value) {
          return false;
        }

        return getCatalogSearchState(input).items.some((item) => {
          const itemName = normalizeCatalogText(item.name);
          const itemDescription = normalizeCatalogText(item.description ?? '');

          return itemName === value || itemDescription === value;
        });
      };

      const lineHasEnteredUnitPrice = (input: HTMLInputElement) => {
        const row = input.closest<HTMLElement>('[data-invoice-line]');
        const unitPriceInput = row?.querySelector<HTMLInputElement>(
          '[data-invoice-unit-price]',
        );

        return Boolean(unitPriceInput && parseNumberInput(unitPriceInput) > 0);
      };

      const updateCatalogSavePrompt = (input: HTMLInputElement) => {
        const value = normalizeCatalogText(input.value);

        if (!value) {
          setCatalogSaveStatus(input, 'hidden');
          return;
        }

        if (!lineHasEnteredUnitPrice(input)) {
          setCatalogSaveStatus(input, 'hidden');
          return;
        }

        if (savedCatalogDescriptions.get(input) === value) {
          setCatalogSaveStatus(input, 'saved');
          return;
        }

        setCatalogSaveStatus(
          input,
          inputHasExactCatalogMatch(input) ? 'hidden' : 'prompt',
        );
      };

      const submitCatalogSave = async (row: HTMLElement) => {
        const descriptionInput = row.querySelector<HTMLInputElement>(
          '[data-invoice-catalog-input]',
        );
        const nameInput = row.querySelector<HTMLInputElement>(
          '[data-invoice-catalog-save-name]',
        );
        const unitPriceInput = row.querySelector<HTMLInputElement>(
          '[data-invoice-unit-price]',
        );
        const taxRateInput = row.querySelector<HTMLInputElement>(
          '[data-invoice-tax-rate]',
        );
        const csrfInput = form.querySelector<HTMLInputElement>(
          'input[name="_csrf"]',
        );

        if (!descriptionInput || !nameInput || !csrfInput) {
          return;
        }

        markUnsavedChangesDirty(form);
        setCatalogSaveStatus(descriptionInput, 'saving');

        try {
          const response = await fetch('/items/inline', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              _csrf: csrfInput.value,
              name: nameInput.value,
              description: descriptionInput.value,
              unitPrice: unitPriceInput?.value ?? '0',
              currency: currencySelect.value,
              taxRate: taxRateInput?.value ?? '0',
            }),
          });

          if (!response.ok) {
            throw new Error('Error saving new item');
          }

          const payload = (await response.json()) as {
            item?: CatalogItemSuggestion;
          };

          if (payload.item) {
            const state = getCatalogSearchState(descriptionInput);

            state.items = [
              payload.item,
              ...state.items.filter((item) => item.id !== payload.item?.id),
            ];
          }

          savedCatalogDescriptions.set(
            descriptionInput,
            normalizeCatalogText(descriptionInput.value),
          );
          setCatalogSaveStatus(descriptionInput, 'saved');
        } catch {
          setCatalogSaveStatus(descriptionInput, 'error');
        }
      };

      const updateCatalogActiveOption = (input: HTMLInputElement) => {
        const state = getCatalogSearchState(input);
        const results = catalogResultsForInput(input);

        results
          ?.querySelectorAll<HTMLButtonElement>('[data-invoice-catalog-option]')
          .forEach((button, index) => {
            const isActive = index === state.activeIndex;

            // Keep visual state in CSS via [aria-selected="true"] instead of toggling design classes here.
            button.setAttribute('aria-selected', String(isActive));
          });
      };

      const hideCatalogSuggestions = (input: HTMLInputElement) => {
        const state = getCatalogSearchState(input);

        if (state.timeout) {
          window.clearTimeout(state.timeout);
          state.timeout = undefined;
        }

        state.controller?.abort();
        state.controller = undefined;
        state.items = [];
        state.activeIndex = -1;
        input.setAttribute('aria-expanded', 'false');
        const results = catalogResultsForInput(input);

        if (results) {
          results.classList.add('hidden');
          results.replaceChildren();
        }
      };

      const hideAllCatalogSuggestions = () => {
        form
          .querySelectorAll<HTMLInputElement>('[data-invoice-catalog-input]')
          .forEach((input) => {
            hideCatalogSuggestions(input);
          });
      };

      const showCatalogSuggestions = (
        input: HTMLInputElement,
        items: CatalogItemSuggestion[],
      ) => {
        const results = catalogResultsForInput(input);
        const state = getCatalogSearchState(input);

        if (!results || items.length === 0) {
          hideCatalogSuggestions(input);
          return;
        }

        state.items = items;
        state.activeIndex = 0;
        results.replaceChildren();

        items.forEach((item, index) => {
          const option = document.createElement('button');
          const label = document.createElement('span');
          const metadata = document.createElement('span');

          option.type = 'button';
          option.className = 'invoice-catalog-option';
          option.dataset.invoiceCatalogOption = String(index);
          option.setAttribute('role', 'option');
          option.setAttribute('aria-selected', 'false');

          label.className = 'invoice-catalog-option-label';
          label.textContent = item.name;
          metadata.className = 'invoice-catalog-option-meta';
          metadata.textContent = `${item.currency} ${item.unitPrice} - ${item.taxRate}% tax`;

          option.append(label, metadata);
          results.append(option);
        });

        results.classList.remove('hidden');
        input.setAttribute('aria-expanded', 'true');
        updateCatalogActiveOption(input);
      };

      const fetchCatalogSuggestions = async (
        input: HTMLInputElement,
        query: string,
      ) => {
        const state = getCatalogSearchState(input);

        state.controller?.abort();
        const controller = new AbortController();
        state.controller = controller;

        try {
          const params = new URLSearchParams({ q: query });
          const response = await fetch(`/items/search?${params.toString()}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });

          if (!response.ok) {
            hideCatalogSuggestions(input);
            return;
          }

          const payload = (await response.json()) as {
            items?: CatalogItemSuggestion[];
          };

          if (input.value.trim() !== query) {
            return;
          }

          showCatalogSuggestions(
            input,
            Array.isArray(payload.items) ? payload.items : [],
          );
          updateCatalogSavePrompt(input);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }

          hideCatalogSuggestions(input);
          updateCatalogSavePrompt(input);
        } finally {
          if (state.controller === controller) {
            state.controller = undefined;
          }
        }
      };

      const scheduleCatalogSearch = (input: HTMLInputElement) => {
        const state = getCatalogSearchState(input);
        const query = input.value.trim();

        if (state.timeout) {
          window.clearTimeout(state.timeout);
        }

        if (query.length < 2) {
          hideCatalogSuggestions(input);
          updateCatalogSavePrompt(input);
          return;
        }

        state.timeout = window.setTimeout(() => {
          state.timeout = undefined;
          void fetchCatalogSuggestions(input, query);
        }, catalogSearchDebounceMs);
      };

      const selectCatalogSuggestion = (
        input: HTMLInputElement,
        item: CatalogItemSuggestion,
      ) => {
        const row = input.closest<HTMLElement>('[data-invoice-line]');
        const unitPriceInput = row?.querySelector<HTMLInputElement>(
          '[data-invoice-unit-price]',
        );
        const taxRateInput = row?.querySelector<HTMLInputElement>(
          '[data-invoice-tax-rate]',
        );
        const lineDiscountType = row?.querySelector<HTMLSelectElement>(
          '[data-invoice-line-discount-type]',
        );
        const lineDiscountValue = row?.querySelector<HTMLInputElement>(
          '[data-invoice-line-discount-value]',
        );

        input.value = item.description?.trim() || item.name;

        if (taxRateInput) {
          taxRateInput.value = item.taxRate;
        }

        if (lineDiscountType) {
          lineDiscountType.value = 'amount';
        }

        if (lineDiscountValue) {
          lineDiscountValue.value = '0';
        }

        if (unitPriceInput) {
          if (item.currency === currencySelect.value) {
            unitPriceInput.value = item.unitPrice;
          } else {
            unitPriceInput.value = '';
            unitPriceInput.focus();
          }
        }

        hideCatalogSuggestions(input);
        savedCatalogDescriptions.delete(input);
        setCatalogSaveStatus(input, 'hidden');
        markUnsavedChangesDirty(form);
        updateTotals();
      };

      const updateCurrency = () => {
        const currency = currencySelect.value || 'EUR';
        form.dataset.currency = currency;
        currencyFormatter = new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
        });
        form
          .querySelectorAll<HTMLOptionElement>('[data-invoice-currency-option]')
          .forEach((option) => {
            option.textContent = currency;
          });
      };

      const readLineInput = (row: HTMLElement) => {
        const quantityInput = row.querySelector<HTMLInputElement>(
          '[data-invoice-quantity]',
        );
        const unitPriceInput = row.querySelector<HTMLInputElement>(
          '[data-invoice-unit-price]',
        );
        const discountType = row.querySelector<HTMLSelectElement>(
          '[data-invoice-line-discount-type]',
        );
        const discountValue = row.querySelector<HTMLInputElement>(
          '[data-invoice-line-discount-value]',
        );
        const taxRate = row.querySelector<HTMLInputElement>(
          '[data-invoice-tax-rate]',
        );

        if (
          !quantityInput ||
          !unitPriceInput ||
          !discountType ||
          !discountValue ||
          !taxRate
        ) {
          return {
            quantity: 0,
            unitPrice: 0,
            discount: { type: 'amount' as const, value: 0 },
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
          const removeButton = row.querySelector<HTMLButtonElement>(
            '[data-invoice-remove-line]',
          );

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
          const lineTotal = row.querySelector<HTMLElement>(
            '[data-invoice-line-total]',
          );

          if (lineTotal) {
            lineTotal.textContent = formatCents(
              totals.lines[index]?.totalCents ?? 0,
            );
          }
        });

        invoiceSubtotal.textContent = formatCents(totals.subtotalCents);
        lineDiscountTotal.textContent = formatDiscountCents(
          totals.lineDiscountCents,
        );
        invoiceDiscountTotal.textContent = formatDiscountCents(
          totals.discountCents,
        );
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
        markUnsavedChangesDirty(form);
        updateTotals();
        line
          .querySelector<HTMLInputElement>('[data-invoice-description]')
          ?.focus();
      };

      const validateDateOrder = () => {
        const hasDateOrderError =
          issueDateInput.value !== '' &&
          dueDateInput.value !== '' &&
          issueDateInput.validity.valid &&
          dueDateInput.validity.valid &&
          dueDateInput.value < issueDateInput.value;
        const message = hasDateOrderError ? dueDateBeforeIssueDateMessage : '';

        setFieldError(dueDateInput, dueDateError, message);

        return !message;
      };

      issueDateInput.addEventListener('input', validateDateOrder);
      issueDateInput.addEventListener('change', validateDateOrder);
      dueDateInput.addEventListener('input', validateDateOrder);
      dueDateInput.addEventListener('change', validateDateOrder);

      form.addEventListener('input', (event) => {
        if (!(event.target instanceof HTMLInputElement)) {
          return;
        }

        if (event.target.matches('[data-invoice-catalog-input]')) {
          scheduleCatalogSearch(event.target);
          updateCatalogSavePrompt(event.target);
          return;
        }

        if (
          event.target.matches('[data-invoice-quantity]') ||
          event.target.matches('[data-invoice-unit-price]') ||
          event.target.matches('[data-invoice-line-discount-value]') ||
          event.target.matches('[data-invoice-tax-rate]') ||
          event.target.matches('[data-invoice-discount-value]')
        ) {
          updateTotals();

          if (event.target.matches('[data-invoice-unit-price]')) {
            const input = event.target
              .closest<HTMLElement>('[data-invoice-line]')
              ?.querySelector<HTMLInputElement>('[data-invoice-catalog-input]');

            if (input) {
              updateCatalogSavePrompt(input);
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
              void submitCatalogSave(row);
            }
          }

          return;
        }

        if (!event.target.matches('[data-invoice-catalog-input]')) {
          return;
        }

        const state = getCatalogSearchState(event.target);

        if (event.key === 'Escape') {
          hideCatalogSuggestions(event.target);
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
          updateCatalogActiveOption(event.target);
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          state.activeIndex = Math.max(state.activeIndex - 1, 0);
          updateCatalogActiveOption(event.target);
          return;
        }

        if (event.key === 'Enter' && state.activeIndex >= 0) {
          event.preventDefault();
          selectCatalogSuggestion(event.target, state.items[state.activeIndex]);
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
            updateCurrency();
          }
          updateTotals();
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
            input ? getCatalogSearchState(input).items[index] : undefined;

          if (input && item) {
            selectCatalogSuggestion(input, item);
          }

          return;
        }

        const addButton = event.target.closest<HTMLButtonElement>(
          '[data-invoice-add-line]',
        );

        if (addButton) {
          addLine();
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
            setCatalogSaveStatus(input, 'form');
            markUnsavedChangesDirty(form);
            nameInput.focus();
          }

          return;
        }

        const saveSubmitButton = event.target.closest<HTMLButtonElement>(
          '[data-invoice-catalog-save-submit]',
        );

        if (saveSubmitButton) {
          const row = saveSubmitButton.closest<HTMLElement>('[data-invoice-line]');

          if (row) {
            void submitCatalogSave(row);
          }

          return;
        }

        const saveCancelButton = event.target.closest<HTMLButtonElement>(
          '[data-invoice-catalog-save-cancel]',
        );

        if (saveCancelButton) {
          const row = saveCancelButton.closest<HTMLElement>('[data-invoice-line]');
          const input = row?.querySelector<HTMLInputElement>(
            '[data-invoice-catalog-input]',
          );

          if (input) {
            updateCatalogSavePrompt(input);
          }

          return;
        }

        const saveRetryButton = event.target.closest<HTMLButtonElement>(
          '[data-invoice-catalog-save-retry]',
        );

        if (saveRetryButton) {
          const row = saveRetryButton.closest<HTMLElement>('[data-invoice-line]');

          if (row) {
            void submitCatalogSave(row);
          }

          return;
        }

        const removeButton = event.target.closest<HTMLButtonElement>(
          '[data-invoice-remove-line]',
        );

        if (!removeButton) {
          return;
        }

        const rows = getRows();

        if (rows.length <= 1) {
          updateRemoveButtons(rows);
          return;
        }

        removeButton.closest<HTMLElement>('[data-invoice-line]')?.remove();
        markUnsavedChangesDirty(form);
        updateTotals();
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

            hideCatalogSuggestions(input);
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

        hideAllCatalogSuggestions();
      });

      form.addEventListener('submit', (event) => {
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
  document
    .querySelectorAll<HTMLElement>('[data-inline-editor]')
    .forEach((editor) => {
      const openButton = editor.querySelector<HTMLButtonElement>(
        '[data-inline-editor-open]',
      );
      const cancelButton = editor.querySelector<HTMLButtonElement>(
        '[data-inline-editor-cancel]',
      );
      const display = editor.querySelector<HTMLElement>(
        '[data-inline-editor-display]',
      );
      const panel = editor.querySelector<HTMLElement>(
        '[data-inline-editor-panel]',
      );
      const input = editor.querySelector<HTMLTextAreaElement>(
        '[data-inline-editor-input]',
      );

      if (!openButton || !cancelButton || !display || !panel || !input) {
        return;
      }

      const setOpen = (isOpen: boolean) => {
        display.classList.toggle('hidden', isOpen);
        panel.classList.toggle('hidden', !isOpen);
        openButton.setAttribute('aria-expanded', String(isOpen));

        if (isOpen) {
          input.focus();
        }
      };

      openButton.addEventListener('click', () => {
        setOpen(true);
      });

      cancelButton.addEventListener('click', () => {
        input.value = input.defaultValue;
        clearUnsavedChangesDirty(panel.closest('form'));
        setOpen(false);
      });
    });
};
