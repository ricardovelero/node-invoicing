import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).render('pages/errors/not-found.njk', {
    title: req.t('common.errorPages.notFoundPageTitle'),
    path: req.path,
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status = Number(err.status || err.statusCode || 500);

  res.status(status).render('pages/errors/server-error.njk', {
    title: req.t('common.errorPages.serverErrorPageTitle'),
    message:
      status === 500
        ? req.t('common.errorPages.serverErrorFallback')
        : err.message,
    error: req.app.get('env') === 'development' ? err : undefined,
  });
};
