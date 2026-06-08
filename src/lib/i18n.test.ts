import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTranslator,
  defaultLocale,
  isSupportedLocale,
  loadTranslations,
  localeFromPath,
} from "./i18n";

test("loadTranslations loads common and module namespaces", () => {
  const translations = loadTranslations();
  const t = createTranslator("es-ES", translations, { environment: "test" });

  assert.equal(t("common.navigation.invoices"), "Facturas");
  assert.equal(t("invoices.title"), "Facturas");
  assert.equal(t("customers.emptyState.active"), "Aún no hay clientes.");
});

test("createTranslator interpolates values", () => {
  const t = createTranslator("en-GB", loadTranslations(), {
    environment: "test",
  });

  assert.equal(
    t("common.pagination.pageStatus", { page: 2, totalPages: 4 }),
    "Page 2 of 4",
  );
});

test("createTranslator makes missing development translations obvious", () => {
  const t = createTranslator("es-ES", loadTranslations(), {
    environment: "development",
  });

  assert.equal(t("invoices.notARealKey"), "[missing:es-ES.invoices.notARealKey]");
});

test("createTranslator falls back to the default locale outside development", () => {
  const t = createTranslator(
    "es-ES",
    {
      ...loadTranslations(),
      "es-ES": {},
    },
    { environment: "production" },
  );

  assert.equal(t("common.navigation.invoices"), "Invoices");
  assert.equal(defaultLocale, "en-GB");
});

test("locale helpers validate supported locales and path prefixes", () => {
  assert.equal(isSupportedLocale("es-ES"), true);
  assert.equal(isSupportedLocale("fr-FR"), false);
  assert.equal(localeFromPath("/en/pricing"), "en-GB");
  assert.equal(localeFromPath("/en-us/pricing"), "en-US");
  assert.equal(localeFromPath("/es/pricing"), "es-ES");
  assert.equal(localeFromPath("/pricing"), undefined);
});
