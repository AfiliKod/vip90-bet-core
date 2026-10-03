// client/src/hooks/useMyPermissions.js
//
// Oturumdaki admin'in kendi izinleri (GET /admin/me/permissions).
// UI'ın "buna yetkisi var mı?" kararını almak için gerekir — örneğin kullanıcı
// sayfasındaki rol atama düğmesi yalnız admin:roles:write olanlarda görünmeli.
//
// Tek bir `user.role === 'admin'` kontrolü YETMEZ: roller farklı yetkiler
// veriyor (support yalnız destek+kyc, finance finans vb.). Sunucu tarafı da
// aynı kümeyi kullanır (userHasPermission), yani istemci kararı yalnızca
// görsel bir kolaylık — gerçek koruma sunucuda.

import { useEffect, useState } from 'react';
import api from '../services/api';

export function useMyPermissions() {
  const [permissions, setPermissions] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/admin/me/permissions')
      .then(({ data }) => {
        if (cancelled) return;
        setPermissions(Array.isArray(data?.permissions) ? data.permissions : []);
      })
      .catch(() => { /* 403/404 → yetkisiz; boş liste = hiçbir şey gösterilmez */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  return {
    permissions,
    loaded,
    can: (key) => permissions.includes(key),
  };
}