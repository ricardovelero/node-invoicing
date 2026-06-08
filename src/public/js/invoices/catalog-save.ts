import { getCatalogSearchState } from './catalog-search';
import { normalizeCatalogText } from './catalog.helpers';
import type {
  CatalogItemSuggestion,
  CatalogSaveStatus,
  CatalogSearchState,
} from './catalog.types';
import { parseNumberInput } from './totals';

type CatalogSaveContext = {
  catalogSaveHideTimeouts: WeakMap<HTMLInputElement, number>;
  catalogSearchStates: WeakMap<HTMLInputElement, CatalogSearchState>;
  currencySelect: HTMLSelectElement;
  form: HTMLFormElement;
  markDirty: () => void;
  savedCatalogDescriptions: WeakMap<HTMLInputElement, string>;
};

const catalogSaveForInput = (input: HTMLInputElement) =>
  input
    .closest<HTMLElement>('[data-invoice-line]')
    ?.querySelector<HTMLElement>('[data-invoice-catalog-save]');

export const setCatalogSaveStatus = (
  input: HTMLInputElement,
  status: CatalogSaveStatus,
  context: CatalogSaveContext,
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

  const existingTimeout = context.catalogSaveHideTimeouts.get(input);

  if (existingTimeout) {
    window.clearTimeout(existingTimeout);
    context.catalogSaveHideTimeouts.delete(input);
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
      context.catalogSaveHideTimeouts.delete(input);

      if (
        context.savedCatalogDescriptions.get(input) ===
        normalizeCatalogText(input.value)
      ) {
        setCatalogSaveStatus(input, 'hidden', context);
      }
    }, 2000);

    context.catalogSaveHideTimeouts.set(input, timeout);
  }
};

const inputHasExactCatalogMatch = (
  input: HTMLInputElement,
  context: CatalogSaveContext,
) => {
  const value = normalizeCatalogText(input.value);

  if (!value) {
    return false;
  }

  return getCatalogSearchState(input, context.catalogSearchStates).items.some(
    (item) => {
      const itemName = normalizeCatalogText(item.name);
      const itemDescription = normalizeCatalogText(item.description ?? '');

      return itemName === value || itemDescription === value;
    },
  );
};

const lineHasEnteredUnitPrice = (input: HTMLInputElement) => {
  const row = input.closest<HTMLElement>('[data-invoice-line]');
  const unitPriceInput = row?.querySelector<HTMLInputElement>(
    '[data-invoice-unit-price]',
  );

  return Boolean(unitPriceInput && parseNumberInput(unitPriceInput) > 0);
};

export const updateCatalogSavePrompt = (
  input: HTMLInputElement,
  context: CatalogSaveContext,
) => {
  const value = normalizeCatalogText(input.value);

  if (!value) {
    setCatalogSaveStatus(input, 'hidden', context);
    return;
  }

  if (!lineHasEnteredUnitPrice(input)) {
    setCatalogSaveStatus(input, 'hidden', context);
    return;
  }

  if (context.savedCatalogDescriptions.get(input) === value) {
    setCatalogSaveStatus(input, 'saved', context);
    return;
  }

  setCatalogSaveStatus(
    input,
    inputHasExactCatalogMatch(input, context) ? 'hidden' : 'prompt',
    context,
  );
};

export const submitCatalogSave = async (
  row: HTMLElement,
  context: CatalogSaveContext,
) => {
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
  const csrfInput = context.form.querySelector<HTMLInputElement>(
    'input[name="_csrf"]',
  );

  if (!descriptionInput || !nameInput || !csrfInput) {
    return;
  }

  context.markDirty();
  setCatalogSaveStatus(descriptionInput, 'saving', context);

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
        currency: context.currencySelect.value,
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
      const state = getCatalogSearchState(
        descriptionInput,
        context.catalogSearchStates,
      );

      state.items = [
        payload.item,
        ...state.items.filter((item) => item.id !== payload.item?.id),
      ];
    }

    context.savedCatalogDescriptions.set(
      descriptionInput,
      normalizeCatalogText(descriptionInput.value),
    );
    setCatalogSaveStatus(descriptionInput, 'saved', context);
  } catch {
    setCatalogSaveStatus(descriptionInput, 'error', context);
  }
};
