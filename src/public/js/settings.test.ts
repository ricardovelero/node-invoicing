import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const source = readFileSync(
  path.join(process.cwd(), "src", "public", "js", "settings.ts"),
  "utf8",
);

test("withholding rate controls use data hooks for the custom rate toggle", () => {
  assert.match(source, /export const setupWithholdingRateControls/);
  assert.match(source, /data-withholding-settings/);
  assert.match(source, /data-withholding-enabled/);
  assert.match(source, /data-withholding-rate-fields/);
  assert.match(source, /data-withholding-rate-type/);
  assert.match(source, /data-withholding-custom-rate/);
  assert.match(source, /data-withholding-rate-input/);
});

test("withholding rate controls gate the rate fields on the enable checkbox", () => {
  assert.match(source, /enabledCheckbox\.addEventListener\("change", applyControls\)/);
  assert.match(source, /rateFields\.hidden = !enabledCheckbox\.checked/);
});

test("withholding rate controls toggle visibility and sync preset rates", () => {
  assert.match(source, /rateTypeSelect\.addEventListener\("change", applyControls\)/);
  assert.match(source, /customRateField\.hidden = !isCustom/);
  assert.match(source, /rateInput\.value = rateTypeSelect\.value/);
});
