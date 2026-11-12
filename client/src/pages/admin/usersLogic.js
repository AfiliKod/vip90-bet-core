/**
 * Kullanıcılar sayfasının saf mantığı: güncelleme sonrası seçili kullanıcı.
 * `search=<username>&limit=1` "ahmet" için "ahmet1907" döndürebildiğinden
 * seçili kullanıcı asla ilk arama sonucundan alınmaz.
 */

/** PATCH yanıtındaki kullanıcıyı (liste alanlarını koruyarak) seçili kullanıcıyla birleştirir. */
export function mergeUpdatedUser(selected, updated) {
  if (!updated || !selected || String(updated._id) !== String(selected._id)) return null;
  return { ...selected, ...updated };
}

/** Arama sonuçlarından seçili kullanıcıyı `_id` ile (yoksa tam kullanıcı adıyla) bulur. */
export function findSelectedInResults(users, selected) {
  const list = users || [];
  return list.find(u => String(u._id) === String(selected._id))
    || list.find(u => u.username === selected.username)
    || null;
}
