/**
 * Yalnızca geliştirme: rrweb ile oturum kaydı (landing'deki "yaşayan site"
 * oynatması için). Üretim bundle'ına girmez — main.jsx bu dosyayı yalnızca
 * `import.meta.env.DEV` altında dinamik import eder.
 *
 * Açmak: herhangi bir sayfayı `?rrweb=1` ile aç. Mod sekme boyunca açık kalır
 * (sessionStorage). Sağ alttaki düğme kaydı başlatır / durdurur; durdurunca
 * olaylar `vip90-rrweb-<zaman>.json` olarak iner. Kapatmak: `?rrweb=0`.
 *
 * In-house oyunlar ayrı origin'den (game-host, :5174) iframe içinde açılır.
 * Kayıt başlayınca sayfadaki iframe'lere `rrweb:start` mesajı gönderilir;
 * game-host'taki dev alıcısı (game-host/src/dev/rrwebChild.js) kendi
 * kaydını başlatıp olayları rrweb'in çapraz-origin kanalıyla buraya yollar.
 */
const FLAG = 'vip90.rrweb';

const params = new URLSearchParams(location.search);
if (params.get('rrweb') === '1') sessionStorage.setItem(FLAG, '1');
if (params.get('rrweb') === '0') sessionStorage.removeItem(FLAG);

if (sessionStorage.getItem(FLAG) === '1') {
  import('rrweb').then(({ record }) => mount(record));
}

function mount(record) {
  let events = [];
  let stop = null;
  let iframeObserver = null;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('data-rrweb-ignore', '');
  // rrweb blockClass ile düğmenin kendisi kayda girmez
  btn.className = 'rr-block';
  Object.assign(btn.style, {
    position: 'fixed', right: '12px', bottom: '12px', zIndex: 2147483647,
    padding: '8px 12px', borderRadius: '999px', border: '1px solid rgba(255,255,255,.25)',
    font: '600 12px/1 system-ui, sans-serif', color: '#fff', cursor: 'pointer',
    background: 'rgba(20,20,28,.85)', backdropFilter: 'blur(6px)',
  });

  const render = () => {
    btn.textContent = stop ? `■ Durdur ve indir (${events.length})` : '● rrweb kaydı başlat';
    btn.style.background = stop ? 'rgba(220,38,38,.9)' : 'rgba(20,20,28,.85)';
  };

  const pingIframes = () => {
    document.querySelectorAll('iframe').forEach(f => {
      try { f.contentWindow?.postMessage({ type: 'rrweb:start' }, '*'); } catch { /* yok say */ }
    });
  };

  const start = () => {
    events = [];
    stop = record({
      emit(e) { events.push(e); if (events.length % 50 === 0) render(); },
      recordCrossOriginIframes: true,
      recordCanvas: true,
      sampling: { canvas: 15, mousemove: 50, scroll: 150 },
      dataURLOptions: { type: 'image/webp', quality: 0.7 },
      // Görseller kayda gömülmez: rrweb gömmek için görseli crossOrigin ile
      // yeniden ister, dış CDN'ler (oyun kapakları) CORS vermediği için görsel
      // hem sayfada hem kayıtta kayboluyordu. Oynatmada adreslerinden yüklenir.
      inlineImages: false,
      inlineStylesheet: true,
      collectFonts: true,
      blockClass: 'rr-block',
    });
    // mevcut ve sonradan açılan iframe'lere (oyun ekranı) haber ver
    pingIframes();
    iframeObserver = new MutationObserver(muts => {
      if (muts.some(m => [...m.addedNodes].some(n => n.nodeName === 'IFRAME' || n.querySelector?.('iframe')))) {
        setTimeout(pingIframes, 300);
      }
    });
    iframeObserver.observe(document.body, { childList: true, subtree: true });
    // iframe yüklenince tekrar (ilk mesaj yükleme öncesine denk gelebilir)
    document.addEventListener('load', e => { if (e.target?.nodeName === 'IFRAME') pingIframes(); }, true);
    render();
  };

  const finish = () => {
    stop?.(); stop = null;
    iframeObserver?.disconnect();
    const blob = new Blob([JSON.stringify(events)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vip90-rrweb-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    render();
  };

  btn.addEventListener('click', () => (stop ? finish() : start()));
  render();
  document.body.appendChild(btn);
}
