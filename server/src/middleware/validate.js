export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Geçersiz veri', details: result.error.flatten() } });
    }
    req.validated = result.data;
    next();
  };
}
