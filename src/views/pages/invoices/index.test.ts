import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("invoice index links invoice numbers to detail pages", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "invoices", "index.njk"),
    "utf8",
  );

  assert.match(template, /href="\/invoices\/{{ invoice\.id }}"/);
});

test("invoice index renders status badges from presenter rows", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "invoices", "index.njk"),
    "utf8",
  );

  assert.match(template, /from "components\/badge\.njk" import badge/);
  assert.match(template, /for invoice in invoiceRows/);
  assert.match(template, /invoice\.customerName/);
  assert.match(template, /for statusBadge in invoice\.statusBadges/);
  assert.match(
    template,
    /badge\(t\(statusBadge\.labelKey\) if statusBadge\.labelKey else statusBadge\.label, statusBadge\.variant\)/,
  );
  assert.doesNotMatch(template, /invoice\.status }}<\/td>/);
});

test("invoice index renders query-driven filter controls", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "invoices", "index.njk"),
    "utf8",
  );

  assert.match(template, /<form[^>]+method="get"[^>]+action="\/invoices"/);
  assert.match(template, /name="q" value="{{ filters\.q }}"/);
  assert.match(template, /name="status"/);
  assert.match(template, /for option in statusOptions/);
  assert.match(template, /name="limit"/);
  assert.match(template, /for option in limitOptions/);
  assert.match(template, /name="sort" value="{{ filters\.sort }}"/);
  assert.match(template, /name="direction" value="{{ filters\.direction }}"/);
});

test("invoice index renders safe sortable column links and pagination links", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "invoices", "index.njk"),
    "utf8",
  );

  assert.match(template, /href="{{ sortLinks\.number\.href }}"/);
  assert.match(template, /href="{{ sortLinks\.issueDate\.href }}"/);
  assert.match(template, /href="{{ sortLinks\.dueDate\.href }}"/);
  assert.match(template, /href="{{ sortLinks\.status\.href }}"/);
  assert.match(template, /href="{{ sortLinks\.totalCents\.href }}"/);
  assert.match(template, /href="{{ sortLinks\.createdAt\.href }}"/);
  assert.doesNotMatch(template, /sortLinks\.customer/);
  assert.match(template, /for pageLink in pagination\.pages/);
  assert.match(template, /href="{{ pagination\.previousHref }}"/);
  assert.match(template, /href="{{ pagination\.nextHref }}"/);
});

test("invoice index uses chevrons instead of text labels for sort direction", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "invoices", "index.njk"),
    "utf8",
  );

  assert.match(template, /from "components\/sort-indicator\.njk" import sortIndicator/);
  assert.match(template, /sortIndicator\(sortLinks\.createdAt\)/);
  assert.doesNotMatch(template, /text-xs uppercase/);
});

test("invoice index renders issue and created dates plus presenter empty state", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "invoices", "index.njk"),
    "utf8",
  );

  assert.match(template, /{{ invoice\.issueDate \| date\(currentLocale\) }}/);
  assert.match(template, /{{ invoice\.createdAt \| date\(currentLocale\) }}/);
  assert.match(template, /{{ emptyMessage }}/);
});

test("invoice index uses namespaced translations for representative text", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "invoices", "index.njk"),
    "utf8",
  );

  assert.match(template, /t\('invoices\.title'\)/);
  assert.match(template, /t\('invoices\.actions\.new'\)/);
  assert.match(template, /t\('common\.actions\.apply'\)/);
  assert.match(template, /t\('common\.pagination\.pageStatus'/);
});
