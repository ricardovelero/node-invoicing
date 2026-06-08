import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("app layout includes primary nav links with active states", () => {
  const layout = readFileSync(
    path.join(process.cwd(), "src", "views", "layouts", "app.njk"),
    "utf8",
  );

  assert.match(layout, /href="\/items"/);
  assert.match(layout, /currentPath\.startsWith\('\/items'\)/);
  assert.match(layout, /href="\/settings"/);
  assert.match(layout, /currentPath\.startsWith\('\/settings'\)/);
});

test("app layout uses the global translation helper", () => {
  const layout = readFileSync(
    path.join(process.cwd(), "src", "views", "layouts", "app.njk"),
    "utf8",
  );

  assert.match(layout, /<html lang="{{ currentLanguage or 'en-gb' }}">/);
  assert.match(layout, /t\('common\.navigation\.invoices'\)/);
  assert.match(layout, /t\('common\.actions\.logout'\)/);
});
