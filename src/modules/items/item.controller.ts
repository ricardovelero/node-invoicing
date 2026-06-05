import type { RequestHandler, Response } from "express";
import {
  createItemFormValues,
  formatItemFormErrors,
  itemFormSchema,
  itemListQuerySchema,
  normalizeItemFormValues,
  supportedCurrencies,
  type ItemFormErrors,
  type ItemFormValues,
} from "./item.schema";
import {
  archiveCatalogItemRecord,
  createCatalogItemRecord,
  getCatalogItemForEdit,
  getCatalogItems,
  restoreCatalogItemRecord,
  searchCatalogItems,
  updateCatalogItemRecord,
} from "./item.service";
import {
  createCatalogItemSearchResult,
  createCatalogItemSearchResults,
  catalogItemToFormValues,
  itemIndexView,
} from "./item.presenter";

type ItemFormRenderOptions = {
  status?: number;
  title: string;
  heading?: string;
  formAction: string;
  submitLabel: string;
  cancelHref: string;
  values: ItemFormValues;
  errors: ItemFormErrors;
};

const renderItemForm = (
  res: Response,
  {
    status,
    title,
    heading = title,
    formAction,
    submitLabel,
    cancelHref,
    values,
    errors,
  }: ItemFormRenderOptions,
) => {
  const response = status ? res.status(status) : res;

  return response.render("pages/items/form.njk", {
    title,
    heading,
    formAction,
    submitLabel,
    cancelHref,
    values,
    errors,
    currencies: supportedCurrencies,
  });
};

export const listItems: RequestHandler = async (req, res) => {
  const query = itemListQuerySchema.parse(req.query);
  const items = await getCatalogItems(req.auth!.organization.id, query);

  return res.render("pages/items/index.njk", itemIndexView(items));
};

export const searchItems: RequestHandler = async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q : "";
  const items = await searchCatalogItems(req.auth!.organization.id, query);

  return res.json({
    items: createCatalogItemSearchResults(items),
  });
};

export const createInlineItem: RequestHandler = async (req, res) => {
  const result = itemFormSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(422).json({
      errors: formatItemFormErrors(result.error),
    });
  }

  try {
    const item = await createCatalogItemRecord(
      req.auth!.organization.id,
      result.data,
    );

    return res.status(201).json({
      item: createCatalogItemSearchResult(item),
    });
  } catch {
    return res.status(500).json({
      error: "Unable to save item.",
    });
  }
};

export const renderNewItem: RequestHandler = (req, res) =>
  renderItemForm(res, {
    title: "New item",
    heading: "New item",
    formAction: "/items",
    submitLabel: "Create item",
    cancelHref: "/items",
    values: createItemFormValues({
      currency: req.auth!.organization.currency,
    }),
    errors: {},
  });

export const createItem: RequestHandler = async (req, res) => {
  const result = itemFormSchema.safeParse(req.body);

  if (!result.success) {
    return renderItemForm(res, {
      status: 422,
      title: "New item",
      heading: "New item",
      formAction: "/items",
      submitLabel: "Create item",
      cancelHref: "/items",
      values: normalizeItemFormValues(req.body),
      errors: formatItemFormErrors(result.error),
    });
  }

  await createCatalogItemRecord(req.auth!.organization.id, result.data);
  req.flash("success", "Item created.");
  return res.redirect("/items");
};

export const renderEditItem: RequestHandler = async (req, res) => {
  const itemId = String(req.params.itemId);
  const item = await getCatalogItemForEdit(req.auth!.organization.id, itemId);

  if (!item) {
    return res.status(404).render("pages/errors/not-found.njk", {
      title: "Not found",
      path: req.path,
    });
  }

  return renderItemForm(res, {
    title: "Edit item",
    heading: "Edit item",
    formAction: `/items/${item.id}/edit`,
    submitLabel: "Save item",
    cancelHref: "/items",
    values: catalogItemToFormValues(item),
    errors: {},
  });
};

export const updateItem: RequestHandler = async (req, res) => {
  const itemId = String(req.params.itemId);
  const item = await getCatalogItemForEdit(req.auth!.organization.id, itemId);

  if (!item) {
    return res.status(404).render("pages/errors/not-found.njk", {
      title: "Not found",
      path: req.path,
    });
  }

  const result = itemFormSchema.safeParse(req.body);

  if (!result.success) {
    return renderItemForm(res, {
      status: 422,
      title: "Edit item",
      heading: "Edit item",
      formAction: `/items/${itemId}/edit`,
      submitLabel: "Save item",
      cancelHref: "/items",
      values: normalizeItemFormValues(req.body),
      errors: formatItemFormErrors(result.error),
    });
  }

  const updated = await updateCatalogItemRecord(
    req.auth!.organization.id,
    itemId,
    result.data,
  );

  if (updated.count === 0) {
    return res.status(404).render("pages/errors/not-found.njk", {
      title: "Not found",
      path: req.path,
    });
  }

  req.flash("success", "Item updated.");
  return res.redirect("/items");
};

export const archiveItem: RequestHandler = async (req, res) => {
  const itemId = String(req.params.itemId);
  const updated = await archiveCatalogItemRecord(
    req.auth!.organization.id,
    itemId,
  );

  if (updated.count === 0) {
    return res.status(404).render("pages/errors/not-found.njk", {
      title: "Not found",
      path: req.path,
    });
  }

  req.flash("success", "Item archived.");
  return res.redirect("/items");
};

export const restoreItem: RequestHandler = async (req, res) => {
  const itemId = String(req.params.itemId);
  const updated = await restoreCatalogItemRecord(
    req.auth!.organization.id,
    itemId,
  );

  if (updated.count === 0) {
    return res.status(404).render("pages/errors/not-found.njk", {
      title: "Not found",
      path: req.path,
    });
  }

  req.flash("success", "Item restored.");
  return res.redirect("/items?archived=1");
};
