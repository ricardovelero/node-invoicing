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
const newOrganizationTemplate = readFileSync(
  path.join(
    process.cwd(),
    'src',
    'views',
    'pages',
    'settings',
    'organization-new.njk',
  ),
  'utf8',
);
const formPartial = readFileSync(
  path.join(
    process.cwd(),
    'src',
    'views',
    'pages',
    'settings',
    '_organization-form.njk',
  ),
  'utf8',
);

describe('organization settings form', () => {
  test('includes csrf and unsaved changes guard', () => {
    assert.match(formPartial, /action="{{ formAction }}"/);
    assert.match(formPartial, /name="_csrf" value="{{ csrfToken }}"/);
    assert.match(formPartial, /data-unsaved-changes-guard/);
    assert.match(formPartial, /{{ submitLabel }}/);
  });

  test('extends the shared settings layout', () => {
    assert.match(settingsTemplate, /extends "pages\/settings\/_layout\.njk"/);
    assert.match(newOrganizationTemplate, /extends "pages\/settings\/_layout\.njk"/);
    assert.match(settingsTemplate, /include "pages\/settings\/_organization-form\.njk"/);
    assert.match(
      newOrganizationTemplate,
      /include "pages\/settings\/_organization-form\.njk"/,
    );
  });

  test('no longer contains the locale field', () => {
    assert.doesNotMatch(formPartial, /name="locale"/);
  });

  test('exposes data hooks for the custom withholding rate toggle', () => {
    assert.match(formPartial, /<section[^>]*data-withholding-settings/);
    assert.match(
      formPartial,
      /selectField\('legalForm', legalFormOptions[^\n]*data-withholding-legal-form/,
    );
    assert.match(formPartial, /data-withholding-enable-row/);
    assert.match(
      formPartial,
      /checkboxField\('withholdingEnabled'[^\n]*data-withholding-enabled/,
    );
    assert.match(formPartial, /data-withholding-rate-fields/);
    assert.match(
      formPartial,
      /selectField\('defaultWithholdingRateType', withholdingRateTypeOptions[^\n]*data-withholding-rate-type/,
    );
    assert.match(formPartial, /<div[^>]*data-withholding-custom-rate>/);
    assert.match(
      formPartial,
      /inputField\('defaultWithholdingRate'[^\n]*data-withholding-rate-input/,
    );
  });

  test('builds the withholding rate options from config', () => {
    assert.match(
      formPartial,
      /selectField\('defaultWithholdingRateType', withholdingRateTypeOptions/,
    );
    assert.doesNotMatch(formPartial, /withholdingRateOptions\.concat/);
  });

  test('renders withholding controls with server-side initial visibility that matches the JS rules', () => {
    assert.doesNotMatch(formPartial, /{% if withholdingEligible %}/);
    assert.match(formPartial, /data-withholding-settings>/);
    assert.match(
      formPartial,
      /{% if values\.countryCode != 'ES' or values\.legalForm == 'company' %} hidden{% endif %} data-withholding-settings/,
    );
    assert.match(
      formPartial,
      /{% if values\.legalForm == 'company' %} hidden{% endif %} data-withholding-enable-row/,
    );
    assert.match(
      formPartial,
      /{% if not values\.withholdingEnabled %} hidden{% endif %} data-withholding-rate-fields/,
    );
    assert.match(
      formPartial,
      /{% if values\.defaultWithholdingRateType != 'custom' or not values\.withholdingEnabled %} hidden{% endif %} data-withholding-custom-rate/,
    );
  });

  test('does not treat legal form other as a company for withholding visibility', () => {
    assert.doesNotMatch(
      formPartial,
      /values\.legalForm == 'other'[^%]*hidden/,
    );
    assert.doesNotMatch(
      formPartial,
      /values\.legalForm != 'sole_trader'[^%]*hidden/,
    );
  });

  test('uses countryCode as the only editable organization country field', () => {
    assert.doesNotMatch(formPartial, /components\/country-select\.njk/);
    assert.match(
      formPartial,
      /selectField\('countryCode', countryOptions, value=values\.countryCode, error=errors\.countryCode, required=true\)/,
    );
    assert.doesNotMatch(formPartial, /name="country"/);
    assert.doesNotMatch(formPartial, /id="country"/);
  });

  test('receives select options from the controller', () => {
    assert.doesNotMatch(formPartial, /{% set currencyOptions/);
    assert.doesNotMatch(formPartial, /{% set legalFormOptions/);
    assert.doesNotMatch(formPartial, /{% set withholdingRateTypeOptions/);
    assert.match(
      formPartial,
      /selectField\('currency', currencyOptions/,
    );
    assert.match(
      formPartial,
      /selectField\('legalForm', legalFormOptions/,
    );
  });

  test('new organization page uses the shared form with cancel handled by controller data', () => {
    assert.match(newOrganizationTemplate, /heading/);
    assert.match(formPartial, /href="{{ cancelHref }}"/);
    assert.match(formPartial, /action="{{ formAction }}"/);
  });
});
