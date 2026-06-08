import type { CatalogItem } from '@prisma/client';
import type { Translate } from '../../lib/i18n';
import {
  itemListLimits,
  itemListSortableColumns,
  type ItemFormValues,
  type ItemListDirection,
  type ItemListQuery,
  type ItemListSort,
} from './item.schema';
import type { getCatalogItems, searchCatalogItems } from './item.service';

type CatalogItemList = Awaited<ReturnType<typeof getCatalogItems>>;
type CatalogItems = CatalogItemList['items'];
type CatalogItemSearchItems = Awaited<ReturnType<typeof searchCatalogItems>>;
type CatalogItemSearchResultSource = {
  id: string;
  name: string;
  description: string | null;
  unitPriceCents: number;
  currency: string;
  taxRateBps: number;
};

const centsToAmountInput = (amountCents: number) =>
  (amountCents / 100).toFixed(2);

const formatTaxRateLabel = (taxRateBps: number) =>
  `${(taxRateBps / 100).toFixed(2).replace(/\.?0+$/, '')}%`;

const createCatalogItemRows = (items: CatalogItems) =>
  items.map((item) => ({
    ...item,
    taxRateLabel: formatTaxRateLabel(item.taxRateBps),
  }));

const itemListSortLabels: Record<ItemListSort, string> = {
  name: 'Name',
  unitPriceCents: 'Unit price',
  taxRateBps: 'Tax rate',
  createdAt: 'Created',
};

const archivedToQueryValue = (archived: ItemListQuery['archived']) =>
  archived === 'archived' ? '1' : '';

const createItemListUrl = (
  query: ItemListQuery,
  overrides: Partial<ItemListQuery> = {},
) => {
  const nextQuery = { ...query, ...overrides };
  const params = new URLSearchParams();

  params.set('page', String(nextQuery.page));
  params.set('limit', String(nextQuery.limit));

  if (nextQuery.q) {
    params.set('q', nextQuery.q);
  }

  if (nextQuery.archived === 'archived') {
    params.set('archived', '1');
  }

  params.set('sort', nextQuery.sort);
  params.set('direction', nextQuery.direction);

  return `/items?${params.toString()}`;
};

const nextSortDirection = (
  query: ItemListQuery,
  sort: ItemListSort,
): ItemListDirection =>
  query.sort === sort && query.direction === 'asc' ? 'desc' : 'asc';

const createSortLinks = (query: ItemListQuery) =>
  Object.fromEntries(
    itemListSortableColumns.map((sort) => {
      const direction = nextSortDirection(query, sort);

      return [
        sort,
        {
          label: itemListSortLabels[sort],
          href: createItemListUrl(query, {
            page: 1,
            sort,
            direction,
          }),
          isCurrent: query.sort === sort,
          direction: query.sort === sort ? query.direction : null,
          nextDirection: direction,
        },
      ];
    }),
  ) as Record<
    ItemListSort,
    {
      label: string;
      href: string;
      isCurrent: boolean;
      direction: ItemListDirection | null;
      nextDirection: ItemListDirection;
    }
  >;

const createPaginationPages = (query: ItemListQuery, totalPages: number) => {
  const start = Math.max(1, query.page - 2);
  const end = Math.min(totalPages, query.page + 2);

  return Array.from({ length: end - start + 1 }, (_, index) => {
    const page = start + index;

    return {
      page,
      href: createItemListUrl(query, { page }),
      isCurrent: page === query.page,
    };
  });
};

export const itemIndexView = (itemList: CatalogItemList, t?: Translate) => {
  const showingArchived = itemList.query.archived === 'archived';
  const hasSearchFilter = Boolean(itemList.query.q);
  const hasRows = itemList.items.length > 0;
  const emptyMessage =
    hasRows ? ''
    : itemList.totalCount > 0 ? t?.('items.emptyState.page') ?? 'No items on this page.'
    : hasSearchFilter ? t?.('items.emptyState.filtered') ?? 'No catalog items match these filters.'
    : showingArchived ? t?.('items.emptyState.archived') ?? 'No archived items.'
    : t?.('items.emptyState.empty') ?? 'No items yet.';

  return {
    title:
      showingArchived
        ? t?.('items.archivedTitle') ?? 'Archived items'
        : t?.('items.title') ?? 'Items',
    items: createCatalogItemRows(itemList.items),
    showingArchived,
    filters: {
      q: itemList.query.q,
      archived: archivedToQueryValue(itemList.query.archived),
      limit: itemList.query.limit,
      sort: itemList.query.sort,
      direction: itemList.query.direction,
    },
    archivedOptions: [
      {
        value: '',
        label: t?.('items.actions.active') ?? 'Active items',
        selected: !showingArchived,
      },
      {
        value: '1',
        label: t?.('items.actions.archived') ?? 'Archived items',
        selected: showingArchived,
      },
    ],
    limitOptions: itemListLimits.map((limit) => ({
      value: String(limit),
      label: String(limit),
      selected: limit === itemList.query.limit,
    })),
    sortLinks: createSortLinks(itemList.query),
    activeItemsHref: createItemListUrl(itemList.query, {
      page: 1,
      archived: 'active',
    }),
    archivedItemsHref: createItemListUrl(itemList.query, {
      page: 1,
      archived: 'archived',
    }),
    pagination: {
      ...itemList.pagination,
      totalCount: itemList.totalCount,
      pages: createPaginationPages(
        itemList.query,
        itemList.pagination.totalPages,
      ),
      previousHref:
        itemList.pagination.previousPage ?
          createItemListUrl(itemList.query, {
            page: itemList.pagination.previousPage,
          })
        : null,
      nextHref:
        itemList.pagination.nextPage ?
          createItemListUrl(itemList.query, {
            page: itemList.pagination.nextPage,
          })
        : null,
    },
    hasActiveFilters: hasSearchFilter || showingArchived,
    emptyMessage,
  };
};

export const catalogItemToFormValues = (item: CatalogItem): ItemFormValues => ({
  name: item.name,
  description: item.description ?? '',
  unitPrice: centsToAmountInput(item.unitPriceCents),
  currency: item.currency,
  taxRate: String(item.taxRateBps / 100),
});

export const createCatalogItemSearchResult = (
  item: CatalogItemSearchResultSource,
) => ({
  id: item.id,
  name: item.name,
  description: item.description,
  unitPriceCents: item.unitPriceCents,
  unitPrice: centsToAmountInput(item.unitPriceCents),
  currency: item.currency,
  taxRateBps: item.taxRateBps,
  taxRate: String(item.taxRateBps / 100),
});

export const createCatalogItemSearchResults = (items: CatalogItemSearchItems) =>
  items.map((item) => createCatalogItemSearchResult(item));
