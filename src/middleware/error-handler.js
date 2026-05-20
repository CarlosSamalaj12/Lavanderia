function createError(status, message, details) {
  const err = new Error(message || 'Error interno del servidor');
  err.status = status || 500;
  if (details !== undefined) err.details = details;
  return err;
}

function notFoundHandler(req, res, next) {
  next(createError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const payload = {
    success: false,
    message: err.message || 'Error interno del servidor'
  };

  if (err.details !== undefined) {
    payload.details = err.details;
  }

  if (process.env.NODE_ENV !== 'production' && err.stack) {
    payload.stack = err.stack;
  }

  if (status >= 500) {
    console.error('[API ERROR]', {
      method: req.method,
      path: req.originalUrl,
      status,
      message: err.message
    });
  }

  res.status(status).json(payload);
}

module.exports = {
  createError,
  notFoundHandler,
  errorHandler
};
