/**
 * K2 — Kurulum sihirbazı sayfası. Tek dosya, bağımlılıksız HTML:
 * client build'i olmadan (ilk açılışta henüz build yokken bile) çalışır.
 *
 * İki dil (2026-10-08): varsayılan İngilizce; tarayıcı dili Türkçeyse Türkçe.
 * `?lang=en|tr` ve sağ üstteki düğme seçimi değiştirir. Metinler aşağıdaki
 * `I18N` nesnesinde; form alan adları ve API sözleşmesi dilden bağımsızdır.
 */
export const INSTALL_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VIP90.bet — Setup</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: system-ui, sans-serif; background:#0b1220; color:#e2e8f0;
         display:flex; justify-content:center; padding:40px 16px; margin:0; }
  main { width:100%; max-width:520px; }
  header { display:flex; justify-content:space-between; align-items:center; gap:12px; }
  h1 { font-size:1.4rem; } .durum { margin:12px 0 24px; font-size:.95rem; }
  label { display:block; margin:14px 0 6px; font-size:.9rem; color:#94a3b8; }
  input { width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px;
          border:1px solid #334155; background:#111a2c; color:#e2e8f0; font-size:1rem; }
  button { margin-top:22px; width:100%; padding:12px; border:0; border-radius:8px;
           background:#00d4ff; color:#04202a; font-weight:700; font-size:1rem; cursor:pointer; }
  button:disabled { opacity:.5; cursor:not-allowed; }
  .lang { display:flex; gap:4px; }
  .lang button { margin:0; width:auto; padding:6px 10px; font-size:.8rem;
                 background:#111a2c; color:#94a3b8; border:1px solid #334155; }
  .lang button[aria-pressed="true"] { background:#00d4ff; color:#04202a; border-color:#00d4ff; }
  .hata { color:#f87171; margin-top:12px; white-space:pre-wrap; }
  pre { background:#111a2c; border:1px solid #334155; border-radius:8px;
        padding:14px; overflow:auto; font-size:.85rem; }
  .tamam { color:#4ade80; }
  select { width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px;
           border:1px solid #334155; background:#111a2c; color:#e2e8f0; font-size:1rem; }
  label.kutu { display:flex; gap:8px; align-items:center; color:#e2e8f0; }
  label.kutu input { width:auto; }
</style>
</head>
<body>
<main>
  <header>
    <h1 data-i18n="title">VIP90.bet Setup Wizard</h1>
    <div class="lang" role="group" aria-label="Language">
      <button type="button" data-lang="en" aria-pressed="true">EN</button>
      <button type="button" data-lang="tr" aria-pressed="false">TR</button>
    </div>
  </header>
  <p class="durum" id="durum" data-i18n="checking">Checking status…</p>
  <form id="form" hidden>
    <label for="siteName" data-i18n="siteName">Site name</label>
    <input id="siteName" name="siteName" required maxlength="60">

    <label for="currency" data-i18n="currency">Currency</label>
    <select id="currency" name="currency" required>
      <option value="TRY" data-i18n="currencyTRY">TRY — Turkish lira</option>
      <option value="USD" data-i18n="currencyUSD">USD — US dollar</option>
      <option value="EUR" data-i18n="currencyEUR">EUR — Euro</option>
    </select>

    <label for="adminUsername" data-i18n="adminUsername">Admin username</label>
    <input id="adminUsername" name="adminUsername" required minlength="3" maxlength="30">

    <label for="adminEmail" data-i18n="adminEmail">Admin email</label>
    <input id="adminEmail" name="adminEmail" type="email" required>

    <label for="adminPassword" data-i18n="adminPassword">Admin password (at least 8 characters)</label>
    <input id="adminPassword" name="adminPassword" type="password" required minlength="8">

    <label for="deployMode" data-i18n="deployMode">Installation type</label>
    <select id="deployMode" name="deployMode">
      <option value="docker" data-i18n="deployDocker">Docker Compose (MongoDB runs in Compose)</option>
      <option value="manual" data-i18n="deployManual">Without Docker (I have my own MongoDB)</option>
    </select>
    <div id="mongoBox" hidden>
      <label for="mongoUri" data-i18n="mongoUri">MongoDB connection string (must be a replica set)</label>
      <input id="mongoUri" name="mongoUri" placeholder="mongodb://host:27017/betzone?replicaSet=rs0">
    </div>

    <label for="clientUrl" data-i18n="clientUrl">Site address (this address is used if left empty)</label>
    <input id="clientUrl" name="clientUrl" placeholder="https://example.com">

    <label class="kutu"><input type="checkbox" name="enableCrypto"> <span data-i18n="enableCrypto">Enable the crypto payment module from the start (default: off)</span></label>
    <label class="kutu"><input type="checkbox" name="enableKyc"> <span data-i18n="enableKyc">Enable the KYC identity verification module from the start (default: off)</span></label>

    <button type="submit" id="kaydet" data-i18n="submit">Complete Setup</button>
    <p class="hata" id="hata"></p>
  </form>
  <div id="sonuc" hidden>
    <p class="tamam" data-i18n-html="done">✔ Setup complete. Save the content below as
       <code>server/.env</code> on the server and restart the application:</p>
    <pre id="envOut"></pre>
    <button type="button" id="kopyala" data-i18n="copy">Copy to Clipboard</button>
  </div>
</main>
<script>
(async () => {
  const I18N = {
    en: {
      pageTitle: 'VIP90.bet — Setup',
      title: 'VIP90.bet Setup Wizard',
      checking: 'Checking status…',
      siteName: 'Site name',
      currency: 'Currency',
      currencyTRY: 'TRY — Turkish lira',
      currencyUSD: 'USD — US dollar',
      currencyEUR: 'EUR — Euro',
      adminUsername: 'Admin username',
      adminEmail: 'Admin email',
      adminPassword: 'Admin password (at least 8 characters)',
      deployMode: 'Installation type',
      deployDocker: 'Docker Compose (MongoDB runs in Compose)',
      deployManual: 'Without Docker (I have my own MongoDB)',
      mongoUri: 'MongoDB connection string (must be a replica set)',
      clientUrl: 'Site address (this address is used if left empty)',
      enableCrypto: 'Enable the crypto payment module from the start (default: off)',
      enableKyc: 'Enable the KYC identity verification module from the start (default: off)',
      submit: 'Complete Setup',
      done: '✔ Setup complete. Save the content below as <code>server/.env</code> on the server and restart the application:',
      copy: 'Copy to Clipboard',
      copied: 'Copied',
      dbDown: '✗ Cannot reach the database. Check that MongoDB is running and that MONGODB_URI is correct.',
      installed: '<span class="tamam">✔ This system is already installed.</span> For security reasons, the existing admin account must be removed before the wizard can run again.',
      ready: '✓ Database connected — fill in the setup details.',
      statusFailed: '✗ Could not get the status — reload the page.',
      invalidFields: 'Please check these fields: ',
      failed: 'Setup failed',
      requestFailed: 'Request failed — check the connection.',
      fieldNames: { siteName: 'Site name', currency: 'Currency', adminUsername: 'Admin username', adminEmail: 'Admin email', adminPassword: 'Admin password', mongoUri: 'MongoDB connection string' },
    },
    tr: {
      pageTitle: 'VIP90.bet — Kurulum',
      title: 'VIP90.bet Kurulum Sihirbazı',
      checking: 'Durum kontrol ediliyor…',
      siteName: 'Site adı',
      currency: 'Para birimi',
      currencyTRY: 'TRY — Türk Lirası',
      currencyUSD: 'USD — ABD Doları',
      currencyEUR: 'EUR — Euro',
      adminUsername: 'Yönetici kullanıcı adı',
      adminEmail: 'Yönetici e-posta',
      adminPassword: 'Yönetici parola (en az 8 karakter)',
      deployMode: 'Kurulum türü',
      deployDocker: 'Docker compose (MongoDB compose içinde)',
      deployManual: "Docker dışı (kendi MongoDB'm var)",
      mongoUri: 'MongoDB bağlantı adresi (replica set olmalı)',
      clientUrl: 'Site adresi (boş bırakılırsa bu adres kullanılır)',
      enableCrypto: 'Kripto ödeme modülü başlangıçta AÇIK olsun (varsayılan: kapalı)',
      enableKyc: 'KYC kimlik doğrulama modülü başlangıçta AÇIK olsun (varsayılan: kapalı)',
      submit: 'Kurulumu Tamamla',
      done: '✔ Kurulum tamamlandı. Aşağıdaki içeriği sunucudaki <code>server/.env</code> dosyasına kaydedin ve uygulamayı yeniden başlatın:',
      copy: 'Panoya Kopyala',
      copied: 'Kopyalandı',
      dbDown: '✗ Veritabanına ulaşılamıyor. MongoDB servisinin ayakta olduğunu ve MONGODB_URI değerinin doğru olduğunu doğrulayın.',
      installed: '<span class="tamam">✔ Bu sistem zaten kurulmuş.</span> Kurulumu yeniden çalıştırmak için güvenlik nedeniyle önce mevcut yönetici hesabının kaldırılması gerekir.',
      ready: '✓ Veritabanı bağlı — kurulum bilgilerini doldurun.',
      statusFailed: '✗ Durum bilgisi alınamadı — sayfayı yenileyin.',
      invalidFields: 'Şu alanları kontrol edin: ',
      failed: 'Kurulum başarısız',
      requestFailed: 'İstek başarısız — bağlantıyı kontrol edin.',
      fieldNames: { siteName: 'Site adı', currency: 'Para birimi', adminUsername: 'Yönetici kullanıcı adı', adminEmail: 'Yönetici e-posta', adminPassword: 'Yönetici parola', mongoUri: 'MongoDB bağlantı adresi' },
    },
  };

  function pickLang() {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'tr') return q;
    return (navigator.language || '').toLowerCase().startsWith('tr') ? 'tr' : 'en';
  }
  let lang = pickLang();
  const t = (k) => I18N[lang][k];
  let statusKey = 'checking';   // durum satırının son anahtarı (dil değişince yeniden çizilir)

  function renderStatus() {
    const el = document.getElementById('durum');
    if (!statusKey) { el.textContent = ''; return; }
    if (statusKey === 'installed') el.innerHTML = t('installed');
    else el.textContent = t(statusKey);
  }
  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t('pageTitle');
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    renderStatus();
  }
  document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
    lang = b.dataset.lang;
    applyLang();
  }));
  applyLang();

  const form = document.getElementById('form');
  try {
    const s = await (await fetch('/install/api/status')).json();
    if (!s.dbConnected) { statusKey = 'dbDown'; renderStatus(); return; }
    if (!s.needsInstall) { statusKey = 'installed'; renderStatus(); return; }
    statusKey = 'ready'; renderStatus();
    form.hidden = false;
  } catch {
    statusKey = 'statusFailed'; renderStatus();
    return;
  }

  document.getElementById('deployMode').addEventListener('change', (e) => {
    document.getElementById('mongoBox').hidden = e.target.value !== 'manual';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('kaydet');
    const hata = document.getElementById('hata');
    hata.textContent = '';
    btn.disabled = true;
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      const r = await fetch('/install/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 409) { form.hidden = true; statusKey = 'installed'; renderStatus(); return; }
        hata.textContent = data.fields
          ? t('invalidFields') + data.fields.map(f => t('fieldNames')[f] || f).join(', ')
          : (data.error || t('failed'));
        return;
      }
      form.hidden = true;
      statusKey = null; renderStatus();
      document.getElementById('envOut').textContent = data.envContent;
      document.getElementById('sonuc').hidden = false;
    } catch {
      hata.textContent = t('requestFailed');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('kopyala').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(document.getElementById('envOut').textContent);
      e.target.textContent = t('copied');
      setTimeout(() => { e.target.textContent = t('copy'); }, 1500);
    } catch { /* panoya erişim yoksa kullanıcı metni elle seçer */ }
  });
})();
</script>
</body>
</html>`;
