import { shortCatalogName } from './catalog.helpers';
import {
  type CatalogSaveContext,
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

type SetupCatalogEventsOptions = {
  catalogSaveContext: CatalogSaveContext;
  catalogSearchStates: WeakMap<HTMLInputElement, CatalogSearchState>;
  currencySelect: HTMLSelectElement;
  form: HTMLFormElement;
  markDirty: () => void;
  updateTotals: () => void;
};

export const setupCatalogEvents = ({
  catalogSaveContext,
  catalogSearchStates,
  currencySelect,
  form,
  markDirty,
  updateTotals,
}: SetupCatalogEventsOptions) => {
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

    if (event.target.matches('[data-invoice-unit-price]')) {
      const input = event.target
        .closest<HTMLElement>('[data-invoice-line]')
        ?.querySelector<HTMLInputElement>('[data-invoice-catalog-input]');

      if (input) {
        updateCatalogSavePromptForForm(input);
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
          catalogSaveContext.savedCatalogDescriptions.delete(input);
        },
        currencySelect,
        input: event.target,
        item: state.items[state.activeIndex],
        markDirty,
        setCatalogSaveStatus: setCatalogSaveStatusForForm,
        updateTotals,
      });
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
            catalogSaveContext.savedCatalogDescriptions.delete(input);
          },
          currencySelect,
          input,
          item,
          markDirty,
          setCatalogSaveStatus: setCatalogSaveStatusForForm,
          updateTotals,
        });
      }

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
        markDirty();
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
        void submitCatalogSaveForForm(row);
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
        updateCatalogSavePromptForForm(input);
      }

      return;
    }

    const saveRetryButton = event.target.closest<HTMLButtonElement>(
      '[data-invoice-catalog-save-retry]',
    );

    if (saveRetryButton) {
      const row = saveRetryButton.closest<HTMLElement>('[data-invoice-line]');

      if (row) {
        void submitCatalogSaveForForm(row);
      }
    }
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
};
