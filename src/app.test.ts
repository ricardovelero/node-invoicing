import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from './app';
import { prisma } from './db/prisma';

test('createApp renders multipart parsing errors with their own status', async () => {
  // New sessions are saved on every response; there is no database in tests.
  const sessionMock = prisma.session as unknown as Record<string, unknown>;
  const originalUpsert = sessionMock.upsert;

  sessionMock.upsert = async () => ({});

  const server = createApp().listen(0);

  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/settings/verifactu/certificate`,
      {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=missing' },
        body: 'not a multipart body',
      },
    );
    const body = await response.text();

    assert.equal(response.status, 400);
    assert.doesNotMatch(body, /TypeError/);
    assert.match(body, /Invalid multipart form data/);
  } finally {
    server.close();
    sessionMock.upsert = originalUpsert;
  }
});
