export type CatalogItemSuggestion = {
  id: string;
  name: string;
  description: string | null;
  unitPrice: string;
  unitPriceCents: number;
  currency: string;
  taxRate: string;
  taxRateBps: number;
};

export type CatalogSearchState = {
  activeIndex: number;
  controller?: AbortController;
  items: CatalogItemSuggestion[];
  timeout?: number;
};

export type CatalogSaveStatus =
  | 'hidden'
  | 'prompt'
  | 'form'
  | 'saving'
  | 'saved'
  | 'error';
