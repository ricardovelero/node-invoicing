import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("item index includes active archived toggles and item actions", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "items", "index.njk"),
    "utf8",
  );

  assert.match(template, /from "components\/sort-indicator\.njk" import sortIndicator/);
  assert.match(template, /from "components\/confirm-dialog\.njk" import confirmDialog/);
  assert.match(template, /href="{{ archivedItemsHref }}"/);
  assert.match(template, /href="{{ activeItemsHref }}"/);
  assert.match(template, /t\('items\.actions\.archived'\)/);
  assert.match(template, /t\('items\.archivedTitle'\)/);
  assert.match(template, /href="\/items\/new"/);
  assert.match(template, /for item in items/);
  assert.match(template, /item\.unitPriceCents \| money\(item\.currency, currentLocale\)/);
  assert.match(template, /item\.taxRateLabel/);
  assert.match(template, /class="btn-icon" href="\/items\/{{ item\.id }}\/edit"/);
  assert.match(template, /aria-label="{{ t\('items\.actions\.edit'\) }}"/);
  assert.match(template, /action="\/items\/{{ item\.id }}\/archive"/);
  assert.match(template, /aria-label="{{ t\('items\.actions\.archive'\) }}"/);
  assert.match(template, /action="\/items\/{{ item\.id }}\/restore"/);
  assert.match(template, /aria-label="{{ t\('items\.actions\.restore'\) }}"/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
  assert.match(template, /data-dialog-open="delete-item-dialog-{{ item\.id }}"/);
  assert.match(template, /confirmDialog\(/);
  assert.match(template, /'delete-item-dialog-' ~ item\.id/);
  assert.match(template, /t\('items\.dialogs\.delete\.title'\)/);
  assert.match(template, /t\('items\.dialogs\.delete\.description', { name: item\.name }\)/);
  assert.match(template, /'\/items\/' ~ item\.id ~ '\/delete'/);
});

test("item index renders query-driven filter controls", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "items", "index.njk"),
    "utf8",
  );

  assert.match(template, /<form[^>]+method="get"[^>]+action="\/items"/);
  assert.match(template, /name="q" value="{{ filters\.q }}"/);
  assert.match(template, /name="archived"/);
  assert.match(template, /for option in archivedOptions/);
  assert.match(template, /name="limit"/);
  assert.match(template, /for option in limitOptions/);
  assert.match(template, /name="sort" value="{{ filters\.sort }}"/);
  assert.match(template, /name="direction" value="{{ filters\.direction }}"/);
});

test("item index renders safe sortable column links and pagination links", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "items", "index.njk"),
    "utf8",
  );

  assert.match(template, /href="{{ sortLinks\.name\.href }}"/);
  assert.match(template, /href="{{ sortLinks\.unitPriceCents\.href }}"/);
  assert.match(template, /href="{{ sortLinks\.taxRateBps\.href }}"/);
  assert.match(template, /href="{{ sortLinks\.createdAt\.href }}"/);
  assert.match(template, /sortIndicator\(sortLinks\.createdAt\)/);
  assert.doesNotMatch(template, /sortLinks\.description/);
  assert.match(template, /for pageLink in pagination\.pages/);
  assert.match(template, /href="{{ pagination\.previousHref }}"/);
  assert.match(template, /href="{{ pagination\.nextHref }}"/);
});

test("item index renders presenter empty state", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "items", "index.njk"),
    "utf8",
  );

  assert.match(template, /{{ emptyMessage }}/);
});

test("item index uses namespaced translations for representative text", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "items", "index.njk"),
    "utf8",
  );

  assert.match(template, /t\('items\.section'\)/);
  assert.match(template, /t\('items\.filters\.search'\)/);
  assert.match(template, /t\('items\.table\.unitPrice'\)/);
  assert.match(template, /t\('common\.pagination\.pageStatus'/);
  assert.match(template, /item\.createdAt \| date\(currentLocale\)/);
});
