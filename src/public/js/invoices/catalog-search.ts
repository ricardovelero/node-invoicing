import type {
  CatalogItemSuggestion,
  CatalogSaveStatus,
  CatalogSearchState,
} from './catalog.types';

export const catalogSearchDebounceMs = 250;

type CatalogSearchStates = WeakMap<HTMLInputElement, CatalogSearchState>;

type FetchCatalogSuggestionsOptions = {
  catalogSearchStates: CatalogSearchStates;
  input: HTMLInputElement;
  query: string;
  updateCatalogSavePrompt: (input: HTMLInputElement) => void;
};

type ScheduleCatalogSearchOptions = Omit<
  FetchCatalogSuggestionsOptions,
  'query'
>;

type SelectCatalogSuggestionOptions = {
  catalogSearchStates: CatalogSearchStates;
  clearSavedCatalogDescription: (input: HTMLInputElement) => void;
  currencySelect: HTMLSelectElement;
  input: HTMLInputElement;
  item: CatalogItemSuggestion;
  markDirty: () => void;
  setCatalogSaveStatus: (
    input: HTMLInputElement,
    status: CatalogSaveStatus,
  ) => void;
  updateTotals: () => void;
};

export const getCatalogSearchState = (
  input: HTMLInputElement,
  catalogSearchStates: CatalogSearchStates,
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

export const updateCatalogActiveOption = (
  input: HTMLInputElement,
  catalogSearchStates: CatalogSearchStates,
) => {
  const state = getCatalogSearchState(input, catalogSearchStates);
  const results = catalogResultsForInput(input);

  results
    ?.querySelectorAll<HTMLButtonElement>('[data-invoice-catalog-option]')
    .forEach((button, index) => {
      const isActive = index === state.activeIndex;

      // Keep visual state in CSS via [aria-selected="true"] instead of toggling design classes here.
      button.setAttribute('aria-selected', String(isActive));
    });
};

export const hideCatalogSuggestions = (
  input: HTMLInputElement,
  catalogSearchStates: CatalogSearchStates,
) => {
  const state = getCatalogSearchState(input, catalogSearchStates);

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

export const hideAllCatalogSuggestions = (
  form: HTMLFormElement,
  catalogSearchStates: CatalogSearchStates,
) => {
  form
    .querySelectorAll<HTMLInputElement>('[data-invoice-catalog-input]')
    .forEach((input) => {
      hideCatalogSuggestions(input, catalogSearchStates);
    });
};

export const showCatalogSuggestions = (
  input: HTMLInputElement,
  items: CatalogItemSuggestion[],
  catalogSearchStates: CatalogSearchStates,
) => {
  const results = catalogResultsForInput(input);
  const state = getCatalogSearchState(input, catalogSearchStates);

  if (!results || items.length === 0) {
    hideCatalogSuggestions(input, catalogSearchStates);
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
  updateCatalogActiveOption(input, catalogSearchStates);
};

export const fetchCatalogSuggestions = async ({
  catalogSearchStates,
  input,
  query,
  updateCatalogSavePrompt,
}: FetchCatalogSuggestionsOptions) => {
  const state = getCatalogSearchState(input, catalogSearchStates);

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
      hideCatalogSuggestions(input, catalogSearchStates);
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
      catalogSearchStates,
    );
    updateCatalogSavePrompt(input);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return;
    }

    hideCatalogSuggestions(input, catalogSearchStates);
    updateCatalogSavePrompt(input);
  } finally {
    if (state.controller === controller) {
      state.controller = undefined;
    }
  }
};

export const scheduleCatalogSearch = ({
  catalogSearchStates,
  input,
  updateCatalogSavePrompt,
}: ScheduleCatalogSearchOptions) => {
  const state = getCatalogSearchState(input, catalogSearchStates);
  const query = input.value.trim();

  if (state.timeout) {
    window.clearTimeout(state.timeout);
  }

  if (query.length < 2) {
    hideCatalogSuggestions(input, catalogSearchStates);
    updateCatalogSavePrompt(input);
    return;
  }

  state.timeout = window.setTimeout(() => {
    state.timeout = undefined;
    void fetchCatalogSuggestions({
      catalogSearchStates,
      input,
      query,
      updateCatalogSavePrompt,
    });
  }, catalogSearchDebounceMs);
};

export const selectCatalogSuggestion = ({
  catalogSearchStates,
  clearSavedCatalogDescription,
  currencySelect,
  input,
  item,
  markDirty,
  setCatalogSaveStatus,
  updateTotals,
}: SelectCatalogSuggestionOptions) => {
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

  hideCatalogSuggestions(input, catalogSearchStates);
  clearSavedCatalogDescription(input);
  setCatalogSaveStatus(input, 'hidden');
  markDirty();
  updateTotals();
};
