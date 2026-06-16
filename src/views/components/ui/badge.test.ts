import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("badge component exposes semantic pill variants", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "components", "ui", "badge.njk"),
    "utf8",
  );

  assert.match(template, /macro badge\(label, variant = 'neutral'\)/);
  assert.match(template, /rounded-full/);
  assert.match(template, /ring-1/);
  assert.match(template, /bg-panel text-muted ring-line/);
  assert.match(template, /bg-sky-50 text-sky-700 ring-sky-200/);
  assert.match(template, /bg-emerald-50 text-emerald-700 ring-emerald-200/);
  assert.match(template, /bg-amber-50 text-amber-700 ring-amber-200/);
  assert.match(template, /bg-rose-50 text-rose-700 ring-rose-200/);
  assert.match(template, /bg-slate-100 text-slate-600 ring-slate-200/);
});
