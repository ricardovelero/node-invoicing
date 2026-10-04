import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from './app';

test('createApp renders multipart parsing errors with their own status', async () => {
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
  }
});
