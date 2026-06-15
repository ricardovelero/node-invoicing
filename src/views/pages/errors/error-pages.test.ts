import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('not found page uses common translations for user-facing copy', () => {
  const template = readFileSync('src/views/pages/errors/not-found.njk', 'utf8');

  assert.match(template, /common\.errorPages\.notFoundTitle/);
  assert.match(template, /common\.errorPages\.notFoundMessage/);
  assert.doesNotMatch(template, />Page not found</);
  assert.doesNotMatch(template, /does not exist\./);
});

test('server error page uses common translations for the error label', () => {
  const template = readFileSync('src/views/pages/errors/server-error.njk', 'utf8');

  assert.match(template, /common\.errorPages\.errorLabel/);
  assert.doesNotMatch(template, />Error</);
});
