import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("settings form includes csrf and unsaved changes guard", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "settings", "form.njk"),
    "utf8",
  );

  assert.match(template, /action="\/settings"/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
  assert.match(template, /data-unsaved-changes-guard/);
  assert.match(template, /t\('settings\.actions\.save'\)/);
  assert.match(template, /t\('settings\.fields\.locale'\)/);
});
