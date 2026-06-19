import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const readDashboardTemplate = () =>
  readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "dashboard.njk"),
    "utf8",
  );

test("dashboard renders practical KPI labels", () => {
  const template = readDashboardTemplate();

  assert.match(template, /t\('dashboard\.kpis\.totalInvoicedThisMonth'\)/);
  assert.match(template, /t\('dashboard\.kpis\.paidThisMonth'\)/);
  assert.match(template, /t\('dashboard\.kpis\.outstandingBalance'\)/);
  assert.match(template, /t\('dashboard\.kpis\.overdueAmount'\)/);
});

test("dashboard renders quick action shortcuts", () => {
  const template = readDashboardTemplate();

  assert.match(template, /for action in quickActions/);
  assert.match(template, /href="{{ action\.href }}"/);
  assert.match(template, /t\(action\.labelKey\)/);
  assert.match(template, /t\(action\.descriptionKey, action\.descriptionParams\)/);
  assert.match(template, /\/invoices\/new/);
});

test("dashboard attention sections render invoice badges", () => {
  const template = readDashboardTemplate();

  assert.match(template, /from "components\/ui\/badge\.njk" import badge/);
  assert.match(template, /for section in attentionSections/);
  assert.match(template, /t\(section\.titleKey\) }} \({{ section\.count }}\)/);
  assert.match(template, /for invoice in section\.rows/);
  assert.match(template, /invoice\.customerName/);
  assert.match(template, /for statusBadge in invoice\.statusBadges/);
  assert.match(
    template,
    /badge\(t\(statusBadge\.labelKey\) if statusBadge\.labelKey else statusBadge\.label, statusBadge\.variant\)/,
  );
  assert.doesNotMatch(template, /{{ invoice\.status }}/);
  assert.doesNotMatch(template, /statusCards/);
});

test("dashboard monthly visual uses lightweight invoiced and paid bars", () => {
  const template = readDashboardTemplate();

  assert.match(template, /for month in monthlySeries/);
  assert.match(template, /t\('dashboard\.monthly\.title'\)/);
  assert.match(template, /month\.invoicedBarWidth/);
  assert.match(template, /month\.paidBarWidth/);
  assert.doesNotMatch(template, /chart\.js/i);
});

test("dashboard renders recent activity", () => {
  const template = readDashboardTemplate();

  assert.match(template, /t\('dashboard\.activity\.title'\)/);
  assert.match(template, /for activity in recentActivity/);
  assert.match(template, /dashboard\.activity\.types\.' \+ activity\.type/);
  assert.match(template, /activity\.invoiceNumber/);
  assert.match(template, /activity\.occurredAt \| date\(currentLocale\)/);
});
