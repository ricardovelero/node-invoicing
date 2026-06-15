import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

const overviewTemplate = readFileSync(
  path.join(process.cwd(), 'src', 'views', 'pages', 'settings', 'index.njk'),
  'utf8',
);

describe('settings overview', () => {
  test('links to profile instead of the legacy general section', () => {
    assert.match(overviewTemplate, /\['profile', 'organization'/);
    assert.match(overviewTemplate, /href="\/settings\/{{ key }}"/);
    assert.doesNotMatch(overviewTemplate, /'general'/);
  });
});
