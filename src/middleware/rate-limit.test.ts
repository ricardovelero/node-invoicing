import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { createRateLimiter } from "./rate-limit";

type MockResponse = Response & {
  body?: string;
  headers: Record<string, string>;
  statusCode?: number;
};

const createResponse = () => {
  const res: {
    body?: string;
    headers: Record<string, string>;
    statusCode?: number;
    set?: (name: string, value: string) => MockResponse;
    status?: (statusCode: number) => MockResponse;
    send?: (body: string) => MockResponse;
  } = {
    headers: {},
  };

  res.set = (name, value) => {
    res.headers[name] = value;
    return res as MockResponse;
  };
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res as MockResponse;
  };
  res.send = (body) => {
    res.body = body;
    return res as MockResponse;
  };

  return res as MockResponse;
};

const createRequest = () =>
  ({
    ip: "203.0.113.10",
    method: "POST",
    path: "/auth/login",
    socket: {},
  }) as Request;

test("createRateLimiter allows requests within the configured window", () => {
  let nextCalls = 0;
  let now = 1_000;
  const rateLimiter = createRateLimiter({
    windowMs: 1_000,
    maxRequests: 2,
    now: () => now,
  });

  rateLimiter(createRequest(), createResponse(), () => {
    nextCalls += 1;
  });
  rateLimiter(createRequest(), createResponse(), () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 2);
  now = 2_001;
  rateLimiter(createRequest(), createResponse(), () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 3);
});

test("createRateLimiter rejects requests after the limit is exceeded", () => {
  let nextCalls = 0;
  const rateLimiter = createRateLimiter({
    windowMs: 1_000,
    maxRequests: 1,
    now: () => 1_000,
  });
  const blockedResponse = createResponse();

  rateLimiter(createRequest(), createResponse(), () => {
    nextCalls += 1;
  });
  rateLimiter(createRequest(), blockedResponse, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 1);
  assert.equal(blockedResponse.statusCode, 429);
  assert.equal(blockedResponse.headers["Retry-After"], "1");
  assert.equal(
    blockedResponse.body,
    "Too many authentication attempts. Please try again later.",
  );
});
