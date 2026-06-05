import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const source = readFileSync(
  path.join(process.cwd(), "src", "public", "js", "unsaved-changes.ts"),
  "utf8",
);

test("unsaved changes guard uses the native beforeunload dialog", () => {
  assert.match(source, /export const setupUnsavedChangesGuards/);
  assert.match(source, /data-unsaved-changes-guard/);
  assert.match(source, /addEventListener\('beforeunload'/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /event\.returnValue = ''/);
});

test("unsaved changes guard tracks dirty and submitting form states", () => {
  assert.match(source, /addEventListener\('input'/);
  assert.match(source, /addEventListener\('change'/);
  assert.match(source, /addEventListener\('submit'/);
  assert.match(source, /event\.defaultPrevented/);
  assert.match(source, /unsavedChangesDirty/);
  assert.match(source, /unsavedChangesSubmitting/);
});
