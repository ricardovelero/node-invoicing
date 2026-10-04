import express, { type RequestHandler } from 'express';

export type UploadedFile = {
  name: string;
  type: string;
  data: Buffer;
};

// Uploads are small (certificate files are a few KB), so bodies are buffered.
const readMultipartBody = express.raw({ type: 'multipart/form-data', limit: '100kb' });

// Parses multipart/form-data into req.body: text fields as strings and files as
// UploadedFile. It runs before CSRF protection so the _csrf field is available.
export const parseMultipartForm: RequestHandler = (req, res, next) => {
  if (!req.is('multipart/form-data')) {
    return next();
  }

  readMultipartBody(req, res, async (error?: unknown) => {
    if (error) {
      return next(error);
    }

    try {
      const form = await new Response(new Uint8Array(req.body as Buffer), {
        headers: { 'content-type': req.headers['content-type'] ?? '' },
      }).formData();
      const body: Record<string, string | UploadedFile> = {};

      for (const [name, value] of form) {
        body[name] = typeof value === 'string'
          ? value
          : { name: value.name, type: value.type, data: Buffer.from(await value.arrayBuffer()) };
      }

      req.body = body;
      next();
    } catch {
      next(Object.assign(new Error('Invalid multipart form data.'), { status: 400 }));
    }
  });
};
