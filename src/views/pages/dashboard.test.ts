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

  assert.match(template, /Total Invoiced This Month/);
  assert.match(template, /Paid This Month/);
  assert.match(template, /Outstanding Balance/);
  assert.match(template, /Overdue Amount/);
});

test("dashboard renders quick action shortcuts", () => {
  const template = readDashboardTemplate();

  assert.match(template, /for action in quickActions/);
  assert.match(template, /href="{{ action\.href }}"/);
  assert.match(template, /{{ action\.label }}/);
  assert.match(template, /\/invoices\/new/);
});

test("dashboard attention sections render invoice badges", () => {
  const template = readDashboardTemplate();

  assert.match(template, /from "components\/badge\.njk" import badge/);
  assert.match(template, /for section in attentionSections/);
  assert.match(template, /for invoice in section\.rows/);
  assert.match(template, /invoice\.customerName/);
  assert.match(template, /for statusBadge in invoice\.statusBadges/);
  assert.match(template, /badge\(statusBadge\.label, statusBadge\.variant\)/);
  assert.doesNotMatch(template, /{{ invoice\.status }}/);
});

test("dashboard monthly visual uses lightweight invoiced and paid bars", () => {
  const template = readDashboardTemplate();

  assert.match(template, /for month in monthlySeries/);
  assert.match(template, /Invoiced vs Paid/);
  assert.match(template, /month\.invoicedBarWidth/);
  assert.match(template, /month\.paidBarWidth/);
  assert.doesNotMatch(template, /chart\.js/i);
});

test("dashboard renders recent activity", () => {
  const template = readDashboardTemplate();

  assert.match(template, /Recent Activity/);
  assert.match(template, /for activity in recentActivity/);
  assert.match(template, /activity\.label/);
  assert.match(template, /activity\.invoiceNumber/);
  assert.match(template, /activity\.occurredAt \| date/);
});
