import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

const settingsTemplate = readFileSync(
  path.join(
    process.cwd(),
    'src',
    'views',
    'pages',
    'settings',
    'organization.njk',
  ),
  'utf8',
);

const countrySelectTemplate = readFileSync(
  path.join(process.cwd(), 'src', 'views', 'components', 'country-select.njk'),
  'utf8',
);

describe('organization settings form', () => {
  test('includes csrf and unsaved changes guard', () => {
    assert.match(settingsTemplate, /action="\/settings\/organization"/);
    assert.match(settingsTemplate, /name="_csrf" value="{{ csrfToken }}"/);
    assert.match(settingsTemplate, /data-unsaved-changes-guard/);
    assert.match(settingsTemplate, /t\('settings\.actions\.save'\)/);
  });

  test('extends the shared settings layout', () => {
    assert.match(settingsTemplate, /extends "pages\/settings\/_layout\.njk"/);
  });

  test('no longer contains the locale field', () => {
    assert.doesNotMatch(settingsTemplate, /name="locale"/);
  });

  test('exposes data hooks for the custom withholding rate toggle', () => {
    assert.match(settingsTemplate, /<section[^>]*data-withholding-settings/);
    assert.match(
      settingsTemplate,
      /id="legalForm"[^>]*data-withholding-legal-form/,
    );
    assert.match(settingsTemplate, /data-withholding-enable-row/);
    assert.match(
      settingsTemplate,
      /id="withholdingEnabled"[^>]*data-withholding-enabled/,
    );
    assert.match(settingsTemplate, /data-withholding-rate-fields/);
    assert.match(
      settingsTemplate,
      /id="defaultWithholdingRateType"[^>]*data-withholding-rate-type/,
    );
    assert.match(settingsTemplate, /<div[^>]*data-withholding-custom-rate>/);
    assert.match(
      settingsTemplate,
      /id="defaultWithholdingRate"[^>]*data-withholding-rate-input/,
    );
  });

  test('renders withholding controls with server-side initial visibility that matches the JS rules', () => {
    assert.doesNotMatch(settingsTemplate, /{% if withholdingEligible %}/);
    assert.match(settingsTemplate, /data-withholding-settings>/);
    assert.match(
      settingsTemplate,
      /{% if values\.countryCode != 'ES' or values\.legalForm == 'company' %} hidden{% endif %} data-withholding-settings/,
    );
    assert.match(
      settingsTemplate,
      /{% if values\.legalForm == 'company' %} hidden{% endif %} data-withholding-enable-row/,
    );
    assert.match(
      settingsTemplate,
      /{% if not values\.withholdingEnabled %} hidden{% endif %} data-withholding-rate-fields/,
    );
    assert.match(
      settingsTemplate,
      /{% if values\.defaultWithholdingRateType != 'custom' or not values\.withholdingEnabled %} hidden{% endif %} data-withholding-custom-rate/,
    );
  });

  test('does not treat legal form other as a company for withholding visibility', () => {
    assert.doesNotMatch(
      settingsTemplate,
      /values\.legalForm == 'other'[^%]*hidden/,
    );
    assert.doesNotMatch(
      settingsTemplate,
      /values\.legalForm != 'sole_trader'[^%]*hidden/,
    );
  });

  test('uses countryCode as the only editable organization country field', () => {
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

  test('country select maps supported labels to persisted country codes', () => {
    assert.match(
      countrySelectTemplate,
      /<option value="ES"[^>]*>Spain<\/option>/,
    );
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
