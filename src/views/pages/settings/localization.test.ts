import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

const localizationTemplate = readFileSync(
  path.join(process.cwd(), "src", "views", "pages", "settings", "localization.njk"),
  "utf8",
);

describe("localization settings form", () => {
  test("includes csrf and unsaved changes guard", () => {
    assert.match(localizationTemplate, /action="\/settings\/localization"/);
    assert.match(localizationTemplate, /name="_csrf" value="{{ csrfToken }}"/);
    assert.match(localizationTemplate, /data-unsaved-changes-guard/);
    assert.match(localizationTemplate, /t\('settings\.actions\.save'\)/);
  });

  test("extends the shared settings layout", () => {
    assert.match(localizationTemplate, /extends "pages\/settings\/_layout\.njk"/);
  });

  test("contains the locale field with error display", () => {
    assert.match(localizationTemplate, /from "components\/ui\/label-field\.njk" import labelField/);
    assert.match(localizationTemplate, /from "components\/ui\/select-field\.njk" import selectField/);
    assert.match(localizationTemplate, /t\('settings\.fields\.locale'\)/);
    assert.match(localizationTemplate, /selectField\('locale', localeOptions/);
    assert.match(localizationTemplate, /error=errors\.locale/);
  });
});
