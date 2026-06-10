import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

const navTemplate = readFileSync(
  path.join(process.cwd(), "src", "views", "pages", "settings", "_settings-nav.njk"),
  "utf8",
);

describe("settings nav", () => {
  test("uses semantic navigation markup with a translated label", () => {
    assert.match(navTemplate, /<nav aria-label="{{ t\('settings\.nav\.label'\) }}"/);
  });

  test("links to every settings section", () => {
    for (const section of [
      "general",
      "organization",
      "localization",
      "security",
      "organizations",
    ]) {
      assert.match(navTemplate, new RegExp(`href: "/settings/${section}"`));
    }
  });

  test("highlights the active tab from activeSettingsPage", () => {
    assert.match(
      navTemplate,
      /'border-action text-ink' if activeSettingsPage == tab\.key/,
    );
    assert.match(
      navTemplate,
      /{% if activeSettingsPage == tab\.key %}aria-current="page"{% endif %}/,
    );
  });
});
