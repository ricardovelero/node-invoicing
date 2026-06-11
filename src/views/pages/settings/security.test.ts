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
});
