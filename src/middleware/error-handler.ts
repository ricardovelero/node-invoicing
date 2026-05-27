import type { ErrorRequestHandler, RequestHandler } from "express";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).render("pages/errors/not-found.njk", {
    title: "Not found",
    path: req.path,
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status = Number(err.status || err.statusCode || 500);

  res.status(status).render("pages/errors/server-error.njk", {
    title: "Server error",
    message: status === 500 ? "Something went wrong." : err.message,
    error: req.app.get("env") === "development" ? err : undefined,
  });
};
