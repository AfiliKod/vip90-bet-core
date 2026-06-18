export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  res.status(status).json({ error: { code: err.code || 'SERVER_ERROR', message: err.message || 'Sunucu hatası' } });
}

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kaynak bulunamadı' } });
}

export function createError(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}
