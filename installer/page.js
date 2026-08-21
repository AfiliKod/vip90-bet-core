/**
 * K2 — Kurulum sihirbazı sayfası. Tek dosya, bağımlılıksız HTML:
 * client build'i olmadan (ilk açılışta henüz build yokken bile) çalışır.
 */
export const INSTALL_PAGE_HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VIP90.bet — Kurulum</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: system-ui, sans-serif; background:#0b1220; color:#e2e8f0;
         display:flex; justify-content:center; padding:40px 16px; margin:0; }
  main { width:100%; max-width:520px; }
  h1 { font-size:1.4rem; } .durum { margin:12px 0 24px; font-size:.95rem; }
  label { display:block; margin:14px 0 6px; font-size:.9rem; color:#94a3b8; }
  input { width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px;
          border:1px solid #334155; background:#111a2c; color:#e2e8f0; font-size:1rem; }
  button { margin-top:22px; width:100%; padding:12px; border:0; border-radius:8px;
           background:#00d4ff; color:#04202a; font-weight:700; font-size:1rem; cursor:pointer; }
  button:disabled { opacity:.5; cursor:not-allowed; }
  .hata { color:#f87171; margin-top:12px; white-space:pre-wrap; }
  pre { background:#111a2c; border:1px solid #334155; border-radius:8px;
        padding:14px; overflow:auto; font-size:.85rem; }
  .tamam { color:#4ade80; }
</style>
</head>
<body>
<main>
  <h1>VIP90.bet Kurulum Sihirbazı</h1>
  <p class="durum" id="durum">Durum kontrol ediliyor…</p>
  <form id="form" hidden>
    <label for="siteName">Site adı</label>
    <input id="siteName" name="siteName" required maxlength="60">

    <label for="currency">Para birimi (ör. TRY, USD)</label>
    <input id="currency" name="currency" required pattern="[A-Za-z]{3,8}">

    <label for="adminUsername">Yönetici kullanıcı adı</label>
    <input id="adminUsername" name="adminUsername" required minlength="3" maxlength="30">

    <label for="adminEmail">Yönetici e-posta</label>
    <input id="adminEmail" name="adminEmail" type="email" required>

    <label for="adminPassword">Yönetici parola (en az 8 karakter)</label>
    <input id="adminPassword" name="adminPassword" type="password" required minlength="8">

    <button type="submit" id="kaydet">Kurulumu Tamamla</button>
    <p class="hata" id="hata"></p>
  </form>
  <div id="sonuc" hidden>
    <p class="tamam">✔ Kurulum tamamlandı. Aşağıdaki içeriği sunucudaki
       <code>server/.env</code> dosyasına kaydedin ve uygulamayı yeniden başlatın:</p>
    <pre id="envOut"></pre>
    <button type="button" id="kopyala">Panoya Kopyala</button>
  </div>
</main>
<script>
(async () => {
  const durumEl = document.getElementById('durum');
  const form = document.getElementById('form');
  try {
    const s = await (await fetch('/install/api/status')).json();
    if (!s.dbConnected) {
      durumEl.textContent = '✗ Veritabanına ulaşılamıyor. MongoDB servisinin ayakta olduğunu ve MONGODB_URI değerinin doğru olduğunu doğrulayın.';
      return;
    }
    if (!s.needsInstall) {
      durumEl.innerHTML = '<span class="tamam">✔ Bu sistem zaten kurulmuş.</span> Kurulumu yeniden çalıştırmak için güvenlik nedeniyle önce mevcut yönetici hesabının kaldırılması gerekir.';
      return;
    }
    durumEl.textContent = '✓ Veritabanı bağlı — kurulum bilgilerini doldurun.';
    form.hidden = false;
  } catch {
    durumEl.textContent = '✗ Durum bilgisi alınamadı — sayfayı yenileyin.';
    return;
  }

  document.getElementById('form').addEventListener('submit', async (e) => {
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
        hata.textContent = data.fields ? 'Geçersiz alanlar: ' + data.fields.join(', ') : (data.error || 'Kurulum başarısız');
        return;
      }
      form.hidden = true;
      durumEl.textContent = '';
      document.getElementById('envOut').textContent = data.envContent;
      document.getElementById('sonuc').hidden = false;
    } catch {
      hata.textContent = 'İstek başarısız — bağlantıyı kontrol edin.';
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('kopyala').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('envOut').textContent);
  });
})();
</script>
</body>
</html>`;
