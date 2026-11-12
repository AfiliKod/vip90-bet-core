/**
 * One quoted CSV text cell. Values starting with = + - @ (or a tab/CR) are
 * prefixed with an apostrophe so spreadsheet apps never evaluate them as
 * formulas (CSV injection); quotes are doubled.
 */
export function csvText(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** A numeric CSV cell: finite numbers only, otherwise empty. */
export function csvNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '';
}
