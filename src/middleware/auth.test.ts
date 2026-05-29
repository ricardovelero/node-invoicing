import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { requireOrganizationRole } from "./auth";

const createNext = () => {
  let error: unknown;
  const next: NextFunction = (nextError?: unknown) => {
    error = nextError;
  };

  return {
    next,
    get error() {
      return error;
    },
  };
};

test("requireOrganizationRole allows configured roles", () => {
  const req = {
    auth: { role: "ADMIN" },
  } as Request;
  const next = createNext();

  requireOrganizationRole(["OWNER", "ADMIN"])(req, {} as Response, next.next);

  assert.equal(next.error, undefined);
});

test("requireOrganizationRole rejects unauthorized roles", () => {
  const req = {
    auth: { role: "MEMBER" },
  } as Request;
  const next = createNext();

  requireOrganizationRole(["OWNER", "ADMIN"])(req, {} as Response, next.next);

  const error = next.error as Error & { status?: number };

  assert.equal(error.message, "You do not have permission to edit organization settings.");
  assert.equal(error.status, 403);
});
