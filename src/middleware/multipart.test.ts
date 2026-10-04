import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { parseMultipartForm, type UploadedFile } from './multipart';

const startServer = async () => {
  const app = express();

  app.use(express.urlencoded({ extended: false }));
  app.use(parseMultipartForm);
  app.post('/', (req, res) => {
    const file = req.body.certificate as UploadedFile | undefined;

    res.json({
      csrf: req.body._csrf,
      file: file && { name: file.name, text: file.data.toString('utf8') },
    });
  });

  const server = app.listen(0);

  await new Promise((resolve) => server.once('listening', resolve));

  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` };
};

test('parseMultipartForm exposes text fields and files on req.body', async () => {
  const { server, url } = await startServer();

  try {
    const form = new FormData();

    form.set('_csrf', 'token');
    form.set('certificate', new Blob(['p12 bytes']), 'cert.p12');

    const multipart = await (await fetch(url, { method: 'POST', body: form })).json();
    const urlencoded = await (await fetch(url, {
      method: 'POST',
      body: new URLSearchParams({ _csrf: 'plain' }),
    })).json();
    const oversized = new FormData();

    oversized.set('certificate', new Blob([Buffer.alloc(200 * 1024)]), 'big.p12');

    assert.deepEqual(multipart, {
      csrf: 'token',
      file: { name: 'cert.p12', text: 'p12 bytes' },
    });
    assert.deepEqual(urlencoded, { csrf: 'plain' });
    assert.equal((await fetch(url, { method: 'POST', body: oversized })).status, 413);
  } finally {
    server.close();
  }
});
