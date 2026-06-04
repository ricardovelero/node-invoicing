import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("item index includes active archived toggles and item actions", () => {
  const template = readFileSync(
    path.join(process.cwd(), "src", "views", "pages", "items", "index.njk"),
    "utf8",
  );

  assert.match(template, /href="\/items\?archived=1"/);
  assert.match(template, /href="\/items"/);
  assert.match(template, /Archived items/);
  assert.match(template, /href="\/items\/new"/);
  assert.match(template, /for item in items/);
  assert.match(template, /item\.unitPriceCents \| money\(item\.currency, currentOrganization\.locale\)/);
  assert.match(template, /item\.taxRateLabel/);
  assert.match(template, /action="\/items\/{{ item\.id }}\/archive"/);
  assert.match(template, /action="\/items\/{{ item\.id }}\/restore"/);
  assert.match(template, /name="_csrf" value="{{ csrfToken }}"/);
});
