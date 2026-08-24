import { useState, useEffect } from 'react';
import api from '../services/api';

/** Footer/statik sayfa içeriğini (Hakkımızda, Yasal sayfalar, vb.) admin'den yönetilen kaynaktan çeker. */
export function useStaticPage(slug) {
  const [page, setPage] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | notfound

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setPage(null);
    api.get(`/static-pages/${slug}`)
      .then(({ data }) => { if (!cancelled) { setPage(data.page); setStatus('ready'); } })
      .catch(() => { if (!cancelled) setStatus('notfound'); });
    return () => { cancelled = true; };
  }, [slug]);

  return { page, status };
}
