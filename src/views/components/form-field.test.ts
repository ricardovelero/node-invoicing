import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const template = readFileSync(
  "src/views/components/form-field.njk",
  "utf8",
);

test("form-field defines the field and passwordField macros", () => {
  assert.match(template, /{% macro field\(/);
  assert.match(template, /{% macro passwordField\(/);
});

test("field macro renders the enhanced error pattern", () => {
  assert.match(template, /resolvedErrorId = name ~ '-error'/);
  assert.match(template, /aria-describedby="{{ resolvedDescribedBy }}"/);
  assert.match(template, /'border-red-500' if error else 'border-line'/);
  assert.match(template, /id="{{ resolvedErrorId }}"/);
  assert.match(template, /'hidden' if not error/);
});

test("field macro supports a data-validate opt-in and attrs passthrough", () => {
  assert.match(template, /data-validate="{{ validate }}"/);
  assert.match(template, /{{ attrs \| safe }}/);
});

test("field macros can preserve custom aria and error rendering", () => {
  assert.match(template, /describedBy='__default__'/);
  assert.match(template, /renderHiddenError=true/);
  assert.match(template, /errorAttrs=''/);
  assert.match(template, /requiredLabel=false/);
  assert.match(template, /requiredMarkerAriaHidden=false/);
});

test("passwordField keeps the show/hide toggle and strong-password fallback", () => {
  assert.match(template, /data-password-toggle/);
  assert.match(template, /data-password-input/);
  assert.match(template, /pattern="\(\?=\.\*\[a-z\]\)/);
});
