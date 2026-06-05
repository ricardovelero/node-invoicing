import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("sort indicator component renders accessible chevrons for active sort direction", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "components", "sort-indicator.njk"),
    "utf8",
  );

  assert.match(template, /macro sortIndicator\(sortLink\)/);
  assert.match(template, /aria-label="Sorted {{ sortLink\.direction }}"/);
  assert.match(template, /sortLink\.direction == 'asc'/);
  assert.match(template, /M5 12\.5L10 7\.5L15 12\.5/);
  assert.match(template, /M5 7\.5L10 12\.5L15 7\.5/);
  assert.doesNotMatch(template, /text-xs uppercase/);
});
