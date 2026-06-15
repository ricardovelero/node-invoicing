import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

const profileTemplate = readFileSync(
  path.join(process.cwd(), 'src', 'views', 'pages', 'settings', 'profile.njk'),
  'utf8',
);

describe('profile settings page', () => {
  test('extends the shared settings layout', () => {
    assert.match(profileTemplate, /extends "pages\/settings\/_layout\.njk"/);
  });

  test('renders a csrf-protected profile form', () => {
    assert.match(profileTemplate, /method="post" action="\/settings\/profile"/);
    assert.match(profileTemplate, /name="_csrf" value="{{ csrfToken }}"/);
    assert.match(profileTemplate, /data-unsaved-changes-guard/);
  });

  test('renders translated personal profile fields', () => {
    assert.match(profileTemplate, /settings\.fields\.fullName/);
    assert.match(profileTemplate, /settings\.fields\.email/);
    assert.match(profileTemplate, /settings\.fields\.timeZone/);
    assert.match(profileTemplate, /settings\.help\.emailReadOnly/);
    assert.match(profileTemplate, /settings\.help\.timeZone/);
    assert.match(profileTemplate, /attrs='readonly'/);
  });

  test('uses the shared select macro for time zones', () => {
    assert.match(
      profileTemplate,
      /from "components\/form-field\.njk" import field, selectField/,
    );
    assert.match(
      profileTemplate,
      /selectField\('timeZone', t\('settings\.fields\.timeZone'\), timeZoneOptions/,
    );
  });

  test('uses translated actions with cancel returning to profile', () => {
    assert.match(profileTemplate, /href="\/settings\/profile"/);
    assert.match(profileTemplate, /common\.actions\.cancel/);
    assert.match(profileTemplate, /settings\.actions\.saveChanges/);
  });
});
