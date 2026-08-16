export function notFound(req, res) {
  res.status(404).json({ error: 'Not found', requestId: req.requestId });
}

export function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';

  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'File too large';
  }

  if (res.headersSent) return next(err);

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} -> ${status}: ${message}`, err.stack || '');
  }

  res.status(status).json({ error: message, requestId: req.requestId });
}