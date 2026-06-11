import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

const securityTemplate = readFileSync(
  path.join(
    process.cwd(),
    'src',
    'views',
    'pages',
    'settings',
    'security.njk',
  ),
  'utf8',
);

describe('security settings form', () => {
  test('includes csrf and unsaved changes guard', () => {
    assert.match(securityTemplate, /method="post" action="\/settings\/security"/);
    assert.match(securityTemplate, /method="post" action="\/settings\/security\/password"/);
    assert.match(securityTemplate, /method="post" action="\/settings\/security\/sessions\/revoke-others"/);
    assert.match(securityTemplate, /method="post" action="\/settings\/security\/sessions\/{{ session\.id }}\/revoke"/);
    assert.match(securityTemplate, /name="_csrf" value="{{ csrfToken }}"/);
    assert.match(securityTemplate, /data-unsaved-changes-guard/);
  });

  test('renders session timeout fields with validation bounds', () => {
    assert.match(securityTemplate, /name="sessionIdleTimeoutMinutes"/);
    assert.match(securityTemplate, /name="sessionAbsoluteLifetimeDays"/);
    assert.match(securityTemplate, /min="5" max="1440"/);
    assert.match(securityTemplate, /min="1" max="90"/);
    assert.match(securityTemplate, /errors\.sessionIdleTimeoutMinutes/);
    assert.match(securityTemplate, /errors\.sessionAbsoluteLifetimeDays/);
  });

  test('renders password change fields with show hide toggles', () => {
    assert.match(securityTemplate, /passwordField\('currentPassword', 'currentPassword'/);
    assert.match(securityTemplate, /passwordField\('newPassword', 'newPassword'/);
    assert.match(securityTemplate, /passwordField\('confirmPassword', 'confirmPassword'/);
    assert.match(securityTemplate, /name="{{ name }}" type="password"/);
    assert.match(securityTemplate, /'current-password'/);
    assert.match(securityTemplate, /'new-password'/);
    assert.match(securityTemplate, /passwordErrors\.currentPassword/);
    assert.match(securityTemplate, /passwordErrors\.newPassword/);
    assert.match(securityTemplate, /passwordErrors\.confirmPassword/);
    assert.equal(securityTemplate.match(/data-password-toggle/g)?.length, 1);
    assert.match(securityTemplate, /data-eye-open/);
    assert.match(securityTemplate, /data-eye-closed/);
  });

  test('renders active session management details and actions', () => {
    assert.match(securityTemplate, /settings\.security\.activeSessions/);
    assert.match(securityTemplate, /settings\.security\.activeSessionsDescription/);
    assert.match(securityTemplate, /settings\.security\.currentSession/);
    assert.match(securityTemplate, /settings\.security\.lastSeen/);
    assert.match(securityTemplate, /settings\.security\.ipAddress/);
    assert.match(securityTemplate, /settings\.security\.expires/);
    assert.match(securityTemplate, /settings\.actions\.revokeOtherSessions/);
    assert.match(securityTemplate, /settings\.actions\.revokeSession/);
    assert.match(securityTemplate, /session\.browserDevice/);
    assert.match(securityTemplate, /session\.lastSeenAtDisplay/);
  });
});
