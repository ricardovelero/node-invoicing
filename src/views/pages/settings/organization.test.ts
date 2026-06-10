import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

const settingsTemplate = readFileSync(
  path.join(process.cwd(), "src", "views", "pages", "settings", "organization.njk"),
  "utf8",
);

const countrySelectTemplate = readFileSync(
  path.join(process.cwd(), "src", "views", "components", "country-select.njk"),
  "utf8",
);

describe("organization settings form", () => {
  test("includes csrf and unsaved changes guard", () => {
    assert.match(settingsTemplate, /action="\/settings\/organization"/);
    assert.match(settingsTemplate, /name="_csrf" value="{{ csrfToken }}"/);
    assert.match(settingsTemplate, /data-unsaved-changes-guard/);
    assert.match(settingsTemplate, /t\('settings\.actions\.save'\)/);
  });

  test("extends the shared settings layout", () => {
    assert.match(settingsTemplate, /extends "pages\/settings\/_layout\.njk"/);
  });

  test("no longer contains the locale field", () => {
    assert.doesNotMatch(settingsTemplate, /name="locale"/);
  });

  test("uses countryCode as the only editable organization country field", () => {
    assert.match(
      settingsTemplate,
      /from "components\/country-select\.njk" import countrySelect/,
    );
    assert.match(
      settingsTemplate,
      /countrySelect\('countryCode', 'countryCode', values\.countryCode, true\)/,
    );
    assert.doesNotMatch(settingsTemplate, /name="country"/);
    assert.doesNotMatch(settingsTemplate, /id="country"/);
  });

  test("country select maps supported labels to persisted country codes", () => {
    assert.match(countrySelectTemplate, /<option value="ES"[^>]*>Spain<\/option>/);
    assert.match(
      countrySelectTemplate,
      /<option value="GB"[^>]*>United Kingdom<\/option>/,
    );
    assert.match(
      countrySelectTemplate,
      /<option value="US"[^>]*>United States of America<\/option>/,
    );
  });
});
