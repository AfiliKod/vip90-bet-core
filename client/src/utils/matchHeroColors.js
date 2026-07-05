const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHex(value) {
  return typeof value === 'string' && HEX_RE.test(value);
}

export function buildTeamGradient(homeColor, awayColor) {
  if (!isValidHex(homeColor) || !isValidHex(awayColor)) return null;
  return `linear-gradient(120deg, ${homeColor} 0%, ${awayColor} 100%)`;
}
