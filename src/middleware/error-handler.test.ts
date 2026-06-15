import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import type { TranslationParams } from '../lib/i18n';
import { errorHandler, notFoundHandler } from './error-handler';

type RenderedView = {
  template: string;
  data: Record<string, unknown>;
};

type MockResponse = Response & {
  statusCode?: number;
  rendered?: RenderedView;
};

const t = (key: string, params?: TranslationParams) =>
  params?.path ? `${key}:${params.path}` : key;

const createResponse = () => {
  const res = {
    statusCode: undefined as number | undefined,
    rendered: undefined as RenderedView | undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    render(template: string, data: Record<string, unknown>) {
      res.rendered = { template, data };
      return res;
    },
  };

  return res as unknown as MockResponse;
};

test('notFoundHandler renders translated not found metadata', () => {
  const req = { path: '/missing', t } as unknown as Request;
  const res = createResponse();

  (notFoundHandler as RequestHandler)(req, res, () => undefined);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.rendered, {
    template: 'pages/errors/not-found.njk',
    data: {
      title: 'common.errorPages.notFoundPageTitle',
      path: '/missing',
    },
  });
});

test('errorHandler renders translated server error metadata', () => {
  const req = {
    t,
    app: {
      get: (key: string) => (key === 'env' ? 'production' : undefined),
    },
  } as unknown as Request;
  const res = createResponse();

  (errorHandler as ErrorRequestHandler)(
    new Error('Database down'),
    req,
    res,
    () => undefined,
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.rendered, {
    template: 'pages/errors/server-error.njk',
    data: {
      title: 'common.errorPages.serverErrorPageTitle',
      message: 'common.errorPages.serverErrorFallback',
      error: undefined,
    },
  });
});
