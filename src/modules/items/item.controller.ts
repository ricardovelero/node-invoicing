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
  deleteCatalogItemRecord,
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

  return res.render("pages/items/index.njk", itemIndexView(items, req.t));
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
      error: req.t("items.errors.saveFailed"),
    });
  }
};

export const renderNewItem: RequestHandler = (req, res) =>
  renderItemForm(res, {
    title: req.t("items.form.newTitle"),
    heading: req.t("items.form.newTitle"),
    formAction: "/items",
    submitLabel: req.t("items.actions.create"),
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
      title: req.t("items.form.newTitle"),
      heading: req.t("items.form.newTitle"),
      formAction: "/items",
      submitLabel: req.t("items.actions.create"),
      cancelHref: "/items",
      values: normalizeItemFormValues(req.body),
      errors: formatItemFormErrors(result.error),
    });
  }

  await createCatalogItemRecord(req.auth!.organization.id, result.data);
  req.flash("success", req.t("items.flash.created"));
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
    title: req.t("items.form.editTitle"),
    heading: req.t("items.form.editTitle"),
    formAction: `/items/${item.id}/edit`,
    submitLabel: req.t("items.actions.save"),
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
      title: req.t("items.form.editTitle"),
      heading: req.t("items.form.editTitle"),
      formAction: `/items/${itemId}/edit`,
      submitLabel: req.t("items.actions.save"),
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

  req.flash("success", req.t("items.flash.updated"));
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

  req.flash("success", req.t("items.flash.archived"));
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

  req.flash("success", req.t("items.flash.restored"));
  return res.redirect("/items?archived=1");
};

export const deleteItem: RequestHandler = async (req, res) => {
  const itemId = String(req.params.itemId);
  const deleted = await deleteCatalogItemRecord(
    req.auth!.organization.id,
    itemId,
  );

  if (deleted.count === 0) {
    return res.status(404).render("pages/errors/not-found.njk", {
      title: "Not found",
      path: req.path,
    });
  }

  req.flash("success", req.t("items.flash.deleted"));
  return res.redirect("/items");
};
