import type { ErrorRequestHandler } from "express";
import { HttpError } from "../utils/httpError.js";

export const errorMiddleware: ErrorRequestHandler = (err, req, res, _next) => {
  const status = err instanceof HttpError ? err.status : 500;
  const payload = {
    error: err instanceof HttpError ? err.message : "Internal Server Error",
    details: err instanceof HttpError ? err.details : undefined,
  };
  if (status >= 500) console.error(err);
  res.status(status).json(payload);
};
