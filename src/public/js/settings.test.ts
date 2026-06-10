import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const source = readFileSync(
  path.join(process.cwd(), 'src', 'public', 'js', 'settings.ts'),
  'utf8',
);

test('withholding rate controls use data hooks for the custom rate toggle', () => {
  assert.match(source, /export const setupWithholdingRateControls/);
  assert.match(source, /data-withholding-settings/);
  assert.match(source, /data-withholding-legal-form/);
  assert.match(source, /data-withholding-enable-row/);
  assert.match(source, /data-withholding-enabled/);
  assert.match(source, /data-withholding-rate-fields/);
  assert.match(source, /data-withholding-rate-type/);
  assert.match(source, /data-withholding-custom-rate/);
  assert.match(source, /data-withholding-rate-input/);
});

test('withholding controls hide the section unless the organization can use withholding', () => {
  assert.match(
    source,
    /countrySelect\.addEventListener\(['"]change['"], applyControls\)/,
  );
  assert.match(
    source,
    /legalFormSelect\.addEventListener\(['"]change['"], applyControls\)/,
  );
  assert.match(source, /const isSpain = countrySelect\.value === ['"]ES['"]/);
  assert.match(
    source,
    /const isCompany = legalFormSelect\.value === ['"]company['"]/,
  );
  assert.match(source, /const canUseWithholding = isSpain && !isCompany/);
  assert.match(source, /section\.hidden = !canUseWithholding/);
  assert.match(source, /enableRow\.hidden = !canUseWithholding/);
});

test('withholding rate controls gate the rate fields on eligibility and the enable checkbox', () => {
  assert.match(
    source,
    /enabledCheckbox\.addEventListener\(['"]change['"], applyControls\)/,
  );
  assert.match(
    source,
    /const shouldShowRateFields = canUseWithholding && enabledCheckbox\.checked/,
  );
  assert.match(source, /rateFields\.hidden = !shouldShowRateFields/);
});

test('withholding rate controls toggle custom rate visibility and sync preset rates', () => {
  assert.match(
    source,
    /rateTypeSelect\.addEventListener\(['"]change['"], applyControls\)/,
  );
  assert.match(
    source,
    /const isCustomRate = rateTypeSelect\.value === ['"]custom['"]/,
  );
  assert.match(
    source,
    /customRateField\.hidden = !shouldShowRateFields \|\| !isCustomRate/,
  );
  assert.match(source, /rateInput\.value = rateTypeSelect\.value/);
});
