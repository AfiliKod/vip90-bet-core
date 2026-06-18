const KEY = 'bz_broken_games';

export function markGameBroken(id) {
  const list = JSON.parse(localStorage.getItem(KEY) || '[]');
  if (!list.includes(id)) localStorage.setItem(KEY, JSON.stringify([...list, id]));
}

export function getBrokenGames() {
  return JSON.parse(localStorage.getItem(KEY) || '[]');
}
