export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const body = { code: err.code || 'SERVER_ERROR', message: err.message || 'Sunucu hatası' };
  if (err.details) body.details = err.details;
  res.status(status).json({ error: body });
}

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kaynak bulunamadı' } });
}

export function createError(status, code, message, details) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  if (details) e.details = details;
  return e;
}
