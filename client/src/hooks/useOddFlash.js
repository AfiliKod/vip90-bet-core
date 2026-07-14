import { useRef, useEffect, useState } from 'react';

// Bir değer değiştiğinde yön bilgisiyle (yükseldi/düştü) kısa süreli bir "flash"
// durumu döndürür — oran güncellemelerinde görsel geri bildirim için.
// 1.2 saniye sonra otomatik olarak null'a döner.
export function useOddFlash(value) {
  const prevValue = useRef(value);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (value !== prevValue.current) {
      setFlash(value > prevValue.current ? 'up' : 'down');
      prevValue.current = value;
      const t = setTimeout(() => setFlash(null), 1200);
      return () => clearTimeout(t);
    }
  }, [value]);

  return flash;
}
