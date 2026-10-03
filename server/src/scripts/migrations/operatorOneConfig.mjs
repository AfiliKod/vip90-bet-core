/**
 * create-operator-one.mjs için yapılandırma çözümleyici (saf, testlenebilir).
 *
 * Öncelik: CLI argümanı > ortam değişkeni > varsayılan.
 *   --callback-url=<url>   | OPERATOR_ONE_WALLET_CALLBACK_URL
 *       Wallet callback adresi (game-host'un çağırdığı ana site). Varsayılan:
 *       http://localhost:<PORT>/api/inhouse-provider/callback
 *   --allowed-ips=a,b,c    | OPERATOR_ONE_ALLOWED_IPS
 *       Provider API'sine erişebilecek IP'ler. Varsayılan: 127.0.0.1,::1
 *       (game-host aynı makinede). Docker/uzak game-host için o ana makinenin
 *       ya da Docker ağ geçidinin IP'sini ekleyin.
 *   --api-base=<url>       | OPERATOR_ONE_API_BASE
 *       STDOUT'a basılan INHOUSE_PROVIDER_API_BASE değeri. Varsayılan:
 *       http://localhost:<PORT>
 */
function argValue(argv, name) {
  const prefix = `--${name}=`;
  const hit = argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : undefined;
}

function splitList(v) {
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

export function resolveOperatorOneConfig({ argv = [], env = process.env } = {}) {
  const port = env.PORT || 3001;
  const callbackUrl = argValue(argv, 'callback-url') || env.OPERATOR_ONE_WALLET_CALLBACK_URL
    || `http://localhost:${port}/api/inhouse-provider/callback`;
  const ipsRaw = argValue(argv, 'allowed-ips') || env.OPERATOR_ONE_ALLOWED_IPS;
  const allowedIPs = ipsRaw && splitList(ipsRaw).length ? splitList(ipsRaw) : ['127.0.0.1', '::1'];
  const apiBase = argValue(argv, 'api-base') || env.OPERATOR_ONE_API_BASE || `http://localhost:${port}`;
  const gameHostUrl = env.GAME_HOST_URL || 'http://localhost:5174';
  return {
    walletCallbackUrl: callbackUrl,
    allowedIPs,
    apiBase,
    allowedOrigins: splitList(gameHostUrl),
  };
}
