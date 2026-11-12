// client/src/hooks/useDemoFlags.js
//
// Effective demo flags (GET /admin/demo-flags -> { bots, fakeWinners,
// instantDeposit, data }). Starts as NO_DEMO_FLAGS and stays there on any
// error, so demo entries fail closed (hidden). The server still answers 404
// to disabled demo routes; this only hides UI entries.

import { useEffect, useState } from 'react';
import api from '../services/api';
import { NO_DEMO_FLAGS } from '../utils/demoFlags.js';

export function useDemoFlags() {
  const [flags, setFlags] = useState(NO_DEMO_FLAGS);

  useEffect(() => {
    let cancelled = false;
    api.get('/admin/demo-flags')
      .then(({ data }) => {
        if (cancelled || !data || typeof data !== 'object') return;
        setFlags({
          bots: data.bots === true,
          fakeWinners: data.fakeWinners === true,
          instantDeposit: data.instantDeposit === true,
          data: data.data === true,
        });
      })
      .catch(() => { /* fail closed: keep NO_DEMO_FLAGS */ });
    return () => { cancelled = true; };
  }, []);

  return flags;
}

export default useDemoFlags;
