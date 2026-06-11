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
      /selectField\('legalForm'[^\n]*data-withholding-legal-form/,
    );
    assert.match(settingsTemplate, /data-withholding-enable-row/);
    assert.match(
      settingsTemplate,
      /id="withholdingEnabled"[^>]*data-withholding-enabled/,
    );
    assert.match(settingsTemplate, /data-withholding-rate-fields/);
    assert.match(
      settingsTemplate,
      /selectField\('defaultWithholdingRateType'[^\n]*data-withholding-rate-type/,
    );
    assert.match(settingsTemplate, /<div[^>]*data-withholding-custom-rate>/);
    assert.match(
      settingsTemplate,
      /field\('defaultWithholdingRate'[^\n]*data-withholding-rate-input/,
    );
  });

  test('builds the withholding rate options from config', () => {
    assert.match(
      settingsTemplate,
      /selectField\('defaultWithholdingRateType', t\('settings\.fields\.defaultWithholdingRate'\), withholdingRateTypeOptions/,
    );
    assert.doesNotMatch(settingsTemplate, /withholdingRateOptions\.concat/);
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
    assert.doesNotMatch(settingsTemplate, /components\/country-select\.njk/);
    assert.match(
      settingsTemplate,
      /selectField\('countryCode', t\('settings\.fields\.countryCode'\), countryOptions, value=values\.countryCode, error=errors\.countryCode, required=true\)/,
    );
    assert.doesNotMatch(settingsTemplate, /name="country"/);
    assert.doesNotMatch(settingsTemplate, /id="country"/);
  });

  test('receives select options from the controller', () => {
    assert.doesNotMatch(settingsTemplate, /{% set currencyOptions/);
    assert.doesNotMatch(settingsTemplate, /{% set legalFormOptions/);
    assert.doesNotMatch(settingsTemplate, /{% set withholdingRateTypeOptions/);
    assert.match(
      settingsTemplate,
      /selectField\('currency', t\('settings\.fields\.defaultCurrency'\), currencyOptions/,
    );
    assert.match(
      settingsTemplate,
      /selectField\('legalForm', t\('settings\.fields\.legalForm'\), legalFormOptions/,
    );
  });
});
