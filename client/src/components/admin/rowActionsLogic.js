/** RowActions saf mantığı (DOM'suz; node --test ile test edilir). */

const GAP = 4;
const MARGIN = 8;

/**
 * Menüyü tetikleyici butona göre `position: fixed` konumlandırır.
 * Varsayılan: butonun altında, sağ kenar hizalı (sola açılır).
 * Alta sığmazsa yukarı; sola sığmazsa sağa kayar; her durumda viewport içinde kalır.
 */
export function computeMenuPosition(anchor, menu, viewport) {
  let left = anchor.right - menu.width;
  if (left < MARGIN) left = Math.min(anchor.left, viewport.width - menu.width - MARGIN);
  left = Math.max(MARGIN, Math.min(left, viewport.width - menu.width - MARGIN));

  const spaceBelow = viewport.height - anchor.bottom - GAP - MARGIN;
  const spaceAbove = anchor.top - GAP - MARGIN;
  const openUp = menu.height > spaceBelow && spaceAbove > spaceBelow;
  let top = openUp ? anchor.top - GAP - menu.height : anchor.bottom + GAP;
  top = Math.max(MARGIN, Math.min(top, viewport.height - menu.height - MARGIN));
  return { top, left, openUp };
}

/** Görünür ve devre dışı olmayan öğelerin indeksleri. */
export function enabledIndexes(items) {
  return items.reduce((acc, it, i) => (it.disabled ? acc : [...acc, i]), []);
}

/** Ok/Home/End tuşuna göre odaklanacak sonraki öğe indeksi (devre dışılar atlanır). */
export function nextFocusIndex(items, current, key) {
  const idx = enabledIndexes(items);
  if (idx.length === 0) return -1;
  if (key === 'Home') return idx[0];
  if (key === 'End') return idx[idx.length - 1];
  const pos = idx.indexOf(current);
  if (key === 'ArrowDown') return idx[pos < 0 ? 0 : (pos + 1) % idx.length];
  if (key === 'ArrowUp') return idx[pos < 0 ? idx.length - 1 : (pos - 1 + idx.length) % idx.length];
  return current;
}

export const TONE_CLASS = {
  danger: 'text-danger hover:bg-danger/10 focus:bg-danger/10',
  success: 'text-success hover:bg-success/10 focus:bg-success/10',
  default: 'text-text-1 hover:bg-bg-hover focus:bg-bg-hover',
};

export function toneClass(tone) {
  return TONE_CLASS[tone] || TONE_CLASS.default;
}

/** Tıklama: devre dışıysa çağrılmaz. Dönen değer: handler çağrıldı mı. */
export function runItem(item) {
  if (!item || item.disabled || typeof item.onClick !== 'function') return false;
  item.onClick();
  return true;
}
