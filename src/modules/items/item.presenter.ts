import type { getCatalogItems, searchCatalogItems } from "./item.service";
import type { ItemFormValues } from "./item.schema";

type CatalogItems = Awaited<ReturnType<typeof getCatalogItems>>;
type CatalogItem = CatalogItems[number];
type CatalogItemSearchItems = Awaited<ReturnType<typeof searchCatalogItems>>;

const centsToAmountInput = (amountCents: number) =>
  (amountCents / 100).toFixed(2);

const formatTaxRateLabel = (taxRateBps: number) =>
  `${(taxRateBps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

export const createCatalogItemRows = (items: CatalogItems) =>
  items.map((item) => ({
    ...item,
    taxRateLabel: formatTaxRateLabel(item.taxRateBps),
  }));

export const catalogItemToFormValues = (
  item: CatalogItem,
): ItemFormValues => ({
  name: item.name,
  description: item.description ?? "",
  unitPrice: centsToAmountInput(item.unitPriceCents),
  currency: item.currency,
  taxRate: String(item.taxRateBps / 100),
});

export const createCatalogItemSearchResults = (items: CatalogItemSearchItems) =>
  items.map((item) => ({
    ...item,
    unitPrice: centsToAmountInput(item.unitPriceCents),
    taxRate: String(item.taxRateBps / 100),
  }));
