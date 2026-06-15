import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

const organizationsTemplate = readFileSync(
  path.join(
    process.cwd(),
    "src",
    "views",
    "pages",
    "settings",
    "organizations.njk",
  ),
  "utf8",
);

describe("organizations settings page", () => {
  test("extends the shared settings layout", () => {
    assert.match(organizationsTemplate, /extends "pages\/settings\/_layout\.njk"/);
  });

  test("renders current organization and memberships", () => {
    assert.match(organizationsTemplate, /currentOrganization\.name/);
    assert.match(organizationsTemplate, /for membership in memberships/);
    assert.match(organizationsTemplate, /membership\.organizationName/);
    assert.match(organizationsTemplate, /settings\.organizationRoles\.'/);
    assert.match(organizationsTemplate, /membership\.role/);
    assert.match(organizationsTemplate, /membership\.isCurrent/);
    assert.match(organizationsTemplate, /settings\.organizations\.currentBadge/);
  });

  test("uses csrf-protected switch forms", () => {
    assert.match(
      organizationsTemplate,
      /method="post" action="\/settings\/organizations\/switch"/,
    );
    assert.match(organizationsTemplate, /name="_csrf" value="{{ csrfToken }}"/);
    assert.match(
      organizationsTemplate,
      /name="organizationId" value="{{ membership\.organizationId }}"/,
    );
    assert.match(organizationsTemplate, /name="returnTo" value="\/settings\/organizations"/);
    assert.match(organizationsTemplate, /settings\.actions\.switchOrganization/);
  });

  test("renders the create organization form", () => {
    assert.match(organizationsTemplate, /method="post" action="\/settings\/organizations"/);
    assert.match(organizationsTemplate, /field\('name', t\('settings\.fields\.organizationName'\)/);
    assert.match(organizationsTemplate, /value=values\.name or ''/);
    assert.match(organizationsTemplate, /error=errors\.name/);
    assert.match(organizationsTemplate, /settings\.actions\.createOrganization/);
  });
});
