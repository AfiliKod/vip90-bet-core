import { Router } from 'express';
import https from 'https';
import http from 'http';
import jwt from 'jsonwebtoken';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getoddsSourceGameUrl } from '../services/oddsSourceService.js';
import { requireAuth } from '../middleware/auth.js';
import User from '../models/User.js';
import GameTask from '../models/GameTask.js';
import CasinoRound from '../models/CasinoRound.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const oddsSource_GAMES_PATH = resolve(__dirname, '../../data/oddsSource-games.json');
const oddsSource_SESSION_PATH = resolve(__dirname, '../../scripts/session.json');

function loadoddsSourceGames() {
  if (!existsSync(oddsSource_GAMES_PATH)) return [];
  try { return JSON.parse(readFileSync(oddsSource_GAMES_PATH, 'utf-8')); } catch { return []; }
}

function buildCookieStr() {
  if (!existsSync(oddsSource_SESSION_PATH)) return '';
  try {
    const raw = JSON.parse(readFileSync(oddsSource_SESSION_PATH, 'utf-8'));
    const list = Array.isArray(raw) ? raw : (raw._cookies || []);
    return list.map(c => `${c.name}=${c.value}`).join('; ');
  } catch { return ''; }
}


const r = Router();

// iframe navigation ve monitoring script fetch'i Bearer header göndermez —
// ?t= query param'ı da kabul eden hafif auth (sadece casino endpoint'leri için)
function casinoAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.query.t;
  if (!token) return res.status(401).send('Yetkisiz');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).send('Geçersiz token'); }
}

// Whitelist — sadece bu domain'lerden gelen URL'leri proxy'leriz
const ALLOWED = [
  'pragmaticplay.net',
  'bgaming-network.com',
  'cdn.bgaming-network.com',
  'wazdan.com',
  'static-cdn77.wazdan.com',
  'gamelogs.wazdan.com',
  'fugaso.com',
  'gs.fugaso.com',
  'endorphina.com',
  'endorphina.network',               // Endorphina demo CDN (demo.endorphina.network)
  'relax-gaming.com',
  'relaxgaming.com',
  'relaxg.net',                      // Relax Gaming API (stag-casino-client.api.relaxg.net)
  'd2drhksbtcqozo.cloudfront.net',  // Relax Gaming CDN
  'w5tpzfk7ugytdghuzt8y.com',       // oddsSource game launcher (aggregator)
  'progaindia.com',                  // Ninja Gaming game engine (dev-games.progaindia.com)
  'ninjagaming.com',                 // Ninja Gaming assets
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// fetchRaw sırasında set edilen session/CF cookie'leri — relay'e iletmek için domain→cookie
const proxyCookieCache = new Map();
// gameId → resolved game origin — relay'in doğru Origin/Referer header göndermesi için
const gameOriginCache = new Map();

function isAllowed(url) {
  try {
    const h = new URL(url).hostname;
    return ALLOWED.some(d => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

async function fetchRaw(url, opts = {}, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: { 'User-Agent': UA, ...(opts.headers || {}) },
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = new URL(res.headers.location, url).href;
        res.resume();
        resolve(fetchRaw(next, opts, redirects + 1));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), finalUrl: url }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ── Monitoring script — oyun HTML'ine inject edilir ───────────────────────────
function monitorScript(userId, token, initialBalance, gameId, gameTitle, provider) {
  const domains = JSON.stringify(ALLOWED);
  const balanceInit = typeof initialBalance === 'number' ? initialBalance : 0;
  return `<script>
(function(){
// ── temel değişkenler ─────────────────────────────────────────────────────
var uid=${JSON.stringify(String(userId))};
var tok=${JSON.stringify(String(token || ''))};
var AD=${domains};
var __bzBal=${JSON.stringify(balanceInit)};
var __bzH=window.location.origin;
var __bzGID=${JSON.stringify(String(gameId || ''))};
var __bzGTIT=${JSON.stringify(String(gameTitle || ''))};
var __bzGPROV=${JSON.stringify(String(provider || ''))};
// Orijinal fetch/XHR — override öncesi yakala (report() içinde direkt kullanılır)
var _f=window.fetch;
var _op=XMLHttpRequest.prototype.open,_sn=XMLHttpRequest.prototype.send;

// ── whitelist kontrolü ────────────────────────────────────────────────────
function ok(u){
  try{var h=new URL(u,location.href).hostname;return AD.some(function(d){return h===d||h.endsWith('.'+d);});}
  catch(e){return false;}
}

// ── balance overlay — oyun iframe'i içinde floating gösterge ─────────────
// Oyunun kendi canvas'ındaki bakiyenin üstüne gelecek şekilde positioned.
// Provider başına koordinat ayarı: __bzOvPos[hostname] = {bottom,left,top,right}
var __bzOvEl=null;
var __bzOvPos=(function(){
  var h=location.hostname;
  // BGaming: genellikle sol-alt HUD
  if(h.includes('bgaming'))return{bottom:'12px',left:'12px'};
  // Endorphina: sağ-üst
  if(h.includes('endorphina'))return{top:'12px',right:'12px'};
  // PP: sol-alt
  if(h.includes('pragmaticplay'))return{bottom:'12px',left:'12px'};
  // Varsayılan: sol-alt
  return{bottom:'10px',left:'10px'};
})();
function __bzOvMount(){
  if(__bzOvEl&&document.body&&document.body.contains(__bzOvEl))return;
  var el=document.createElement('div');
  el.id='__bz-bal';
  var pos='';
  if(__bzOvPos.bottom)pos+='bottom:'+__bzOvPos.bottom+';';
  if(__bzOvPos.top)pos+='top:'+__bzOvPos.top+';';
  if(__bzOvPos.left)pos+='left:'+__bzOvPos.left+';';
  if(__bzOvPos.right)pos+='right:'+__bzOvPos.right+';';
  el.style.cssText=pos+
    'position:fixed;background:rgba(0,0,0,.88);color:#c4b5fd;'+
    'font:bold 14px/1 monospace;padding:5px 11px;border-radius:20px;'+
    'z-index:2147483647;pointer-events:none;'+
    'border:1px solid rgba(167,139,250,.45);box-shadow:0 2px 8px rgba(0,0,0,.6);';
  (document.body||document.documentElement).appendChild(el);
  __bzOvEl=el;
  __bzOvUpdate(__bzBal);
}
function __bzOvUpdate(bal){
  if(!__bzOvEl||!document.body||!document.body.contains(__bzOvEl)){__bzOvMount();}
  if(__bzOvEl)__bzOvEl.textContent='₺'+(+bal||0).toFixed(2);
}
// İlk mount — body henüz hazır olmayabilir
(function tryMount(){if(document.body){__bzOvMount();}else{setTimeout(tryMount,150);}})();
// Heartbeat: document.write/open ile overlay silinirse yeniden ekle
var __bzOvHB=setInterval(function(){
  if(document.body&&!document.getElementById('__bz-bal')){__bzOvEl=null;__bzOvMount();}
},800);

// ── spin field tespiti ────────────────────────────────────────────────────
function exSpin(o,d){
  d=d||0;if(d>6||!o||typeof o!=='object')return null;
  if(Array.isArray(o)){for(var i=0;i<o.length;i++){var r=exSpin(o[i],d+1);if(r)return r;}return null;}
  var bk=['bet','betAmount','betValue','stake','wager','totalBet','totalStake','cashBet','spinBet',
          'bet_amount','wager_amount','betCents','credit_bet','gamble_bet','betPerLine',
          'roundBet','roundStake','totalRoundBet','betSize','coin_value','totalCoinsPlayed',
          'sf','spinFee','betCredit','totalBet_cents','stake_amount'];
  var wk=['win','winAmount','winValue','payout','totalWin','totalPayout','cashWin','spinWin',
          'prize','winnings','totalWinAmount','win_amount','credit_win','awardAmount','winCents',
          'roundWin','totalRoundWin','totalWinnings','totalCoinsWon','coinWin',
          'sw','spinWinAmount','totalWin_cents','win_cents'];
  var b,w,k;
  for(k=0;k<bk.length;k++){if(typeof o[bk[k]]==='number'&&o[bk[k]]>=0){b=o[bk[k]];break;}}
  for(k=0;k<wk.length;k++){if(typeof o[wk[k]]==='number'&&o[wk[k]]>=0){w=o[wk[k]];break;}}
  if(typeof b==='number'&&b>0&&w!==undefined&&typeof w==='number')return{bet:b,win:w};
  var ks=Object.keys(o);
  for(var i=0;i<ks.length;i++){var r=exSpin(o[ks[i]],d+1);if(r)return r;}
  return null;
}

// ── PP URL-encoded spin tespiti (doSpin URL-encoded response için) ────────
var __bzPPBal=null; // PP internal bakiye tracker
function exSpinPP(body,postBody){
  // PP doSpin yanıtı: tw=X.XX&balance=Y,YYY.YY&...  (URL-encoded, JSON değil)
  try{
    if(!body||body.indexOf('balance=')===-1)return null;
    var act=(postBody||'').match(/action=([^&]*)/);
    if(!act)return null;
    var a=act[1];
    if(a!=='doSpin'&&a!=='spin'&&a!=='playRound'&&a!=='doFreeSpin')return null;
    var params=new URLSearchParams(body);
    var rawBal=params.get('balance')||params.get('balance_cash');
    if(!rawBal)return null;
    var newBal=parseFloat(rawBal.replace(/,/g,''));
    if(isNaN(newBal))return null;
    var tw=parseFloat((params.get('tw')||params.get('win')||params.get('winCash')||'0').replace(/,/g,''))||0;
    var bet=0;
    if(__bzPPBal!==null&&__bzPPBal>0){bet=__bzPPBal-newBal+tw;}
    __bzPPBal=newBal;
    console.log('[BZ-pp] action='+a+' prevBal='+(__bzPPBal===newBal?'N/A':__bzPPBal)+' newBal='+newBal+' tw='+tw+' bet='+bet);
    if(bet>0)return{bet:bet,win:tw};
    return null;
  }catch(e){return null;}
}
// PP doInit/doSpin dışı balance response'larından da balance'ı izle
function __bzPPTrackBal(body){
  try{
    if(!body||body.indexOf('balance=')===-1)return;
    var params=new URLSearchParams(body);
    var rawBal=params.get('balance')||params.get('balance_cash');
    if(!rawBal)return;
    var b=parseFloat(rawBal.replace(/,/g,''));
    if(!isNaN(b)&&b>0){__bzPPBal=b;}
  }catch(e){}
}

// ── balance injection ─────────────────────────────────────────────────────
var __bzBAL_KEYS=['balance','Balance','playerBalance','wallet','walletBalance',
                  'currentBalance','availableBalance','cashBalance','playerCashBalance',
                  'realBalance','cash_balance','account_balance','userBalance',
                  'playerCash','accountBalance','funBalance','playBalance','creditBalance',
                  'p','credits','playerCredits','balanceAmount','credit'];
function injectBal(obj,bal,d){
  d=d||0;if(d>5||!obj||typeof obj!=='object')return obj;
  if(Array.isArray(obj)){var a=[];for(var i=0;i<obj.length;i++)a.push(injectBal(obj[i],bal,d+1));return a;}
  var out={};var ks=Object.keys(obj);
  for(var i=0;i<ks.length;i++){
    var k=ks[i];
    if(__bzBAL_KEYS.indexOf(k)!==-1&&typeof obj[k]==='number'&&obj[k]>=0){out[k]=bal;}
    else{out[k]=injectBal(obj[k],bal,d+1);}
  }
  return out;
}

// ── alive signal ──────────────────────────────────────────────────────────
var __bzAlive=false;
function sendAlive(){if(!__bzAlive){__bzAlive=true;window.parent.postMessage({type:'bz_first_request'},'*');}}
// Canvas tespiti — canvas bulununca 'bz_canvas' sinyali gönder (timer sıfırlanır ama iptal EDİLMEZ).
// Gerçek "alive" sinyali sadece fetch/XHR intercept'inden gelir (sendAlive → bz_first_request).
// Bu ayrım: yükleme canvas'ı olan ama ağ isteği yapmayan bozuk oyunların tespitini sağlar.
var __bzCanCheck=setInterval(function(){
  if(document.querySelector('canvas')){
    clearInterval(__bzCanCheck);
    window.parent.postMessage({type:'bz_canvas'},'*');
    setTimeout(function(){__bzOvEl=null;__bzOvMount();},200);
  }
},400);
setTimeout(function(){clearInterval(__bzCanCheck);},30000);

// ── DOM hata metin tarayıcı — Loading Error vb. ───────────────────────────
// BGaming/PP loading screen'inde "Loading Error", "Something went wrong" vb.
// göründüğünde ebeveyne bz_error sinyali ilet; parent hemen broken alert gösterir.
var __bzErrPats=['loading error','something went wrong','connection error',
  'failed to connect','network error','error loading','game error',
  'failed to load','cannot connect','server error','service unavailable',
  'yükleme hatası','bağlantı hatası','hata oluştu','sunucu hatası'];
var __bzErrFired=false;
var __bzErrCheck=setInterval(function(){
  if(__bzErrFired)return;
  try{
    var t=((document.body||{}).innerText||'').toLowerCase();
    for(var __bze=0;__bze<__bzErrPats.length;__bze++){
      if(t.indexOf(__bzErrPats[__bze])!==-1){
        __bzErrFired=true;
        clearInterval(__bzErrCheck);
        window.parent.postMessage({type:'bz_error',msg:__bzErrPats[__bze]},'*');
        return;
      }
    }
  }catch(__bzEE){}
},2000);
setTimeout(function(){clearInterval(__bzErrCheck);},90000);

// ── PP Unity input bridge: pointer/touch → Enter key ─────────────────────
// PP Unity WebGL oyunlarında Enter tuşuyla spin tetiklenebiliyor ancak
// canvas mouse/touch click'i Unity'nin input sistemine ulaşmıyor.
// Neden: PP'nin Unity build'i HTMLInputManager'da pointer event listener'larını
// yalnızca belirli koşullarda (focus, headless-olmayan ortam) aktive ediyor.
// Çözüm: Canvas'a gelen pointer/touch eventlarını Enter keydown/keyup çiftine
// dönüştür. Unity'nin KeyboardHandler'ı her zaman aktif — bu yol güvenilir.
// __bzPPLastSpin: son spin isteğinden bu yana geçen süre kontrolü (debounce)
var __bzPPLastSpin=0;
var __bzPPSpinLock=false;
function __bzPPFireEnter(){
  var now=Date.now();
  // Spin sırasında (XHR/fetch yanıt gelmeden) tekrar tetikleme engeli
  if(__bzPPSpinLock)return;
  // Minimum 500ms debounce
  if(now-__bzPPLastSpin<500)return;
  __bzPPLastSpin=now;
  var c=document.querySelector('canvas');
  if(!c)return;
  // Enter key sequencesini canvas üzerinde dispatch et
  var evOpts={key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true};
  c.dispatchEvent(new KeyboardEvent('keydown',evOpts));
  c.dispatchEvent(new KeyboardEvent('keypress',evOpts));
  setTimeout(function(){c.dispatchEvent(new KeyboardEvent('keyup',evOpts));},80);
  console.log('[bz-pp] Enter key dispatched via pointer bridge');
}
// PP oyunu tespiti: hostname veya gameConfig param
var __bzIsPP=(function(){
  try{
    var h=location.hostname;
    var s=location.search;
    // demoUrl içinde pragmaticplay geçiyorsa veya PP'ye özgü param'lar varsa PP
    return h.includes('pragmaticplay')||h.includes('game-service')||
           s.includes('pragmaticplay')||
           s.includes('gameSymbol=vs')||s.includes('symbol=vs')||
           s.includes('casinoId=ppcdemo')||s.includes('extGame=1')||
           document.title.toLowerCase().includes('pragmatic')||
           !!document.querySelector('div#GameContainer,div#loadingBar,div#ScaleRootLoading');
  }catch(e){return false;}
})();
// Canvas hazır olunca PP input bridge'i kur
function __bzPPInstallBridge(){
  var c=document.querySelector('canvas');
  if(!c||c.__bzBridgeInstalled)return;
  c.__bzBridgeInstalled=true;
  // touch olayı → Enter (mobil kullanıcılar için kritik)
  c.addEventListener('touchstart',function(e){
    e.preventDefault();
    c.focus();
    __bzPPFireEnter();
  },{passive:false,capture:true});
  // pointer/mouse → Enter (masaüstü)
  c.addEventListener('pointerdown',function(e){
    if(e.pointerType==='touch')return; // touchstart zaten handle etti
    c.focus();
    __bzPPFireEnter();
  },{capture:true});
  // Canvas'a her zaman dokunulabilir olsun
  c.setAttribute('tabindex','0');
  c.style.touchAction='none';
  console.log('[bz-pp] PP input bridge installed on canvas');
}
// SpinLock: XHR/fetch response gelince kilidi aç — exSpinPP→report() sırasında çift spin engeli
// PP yüklenme sonrası bridge kur — ScaleRootLoading gizlenince
if(__bzIsPP){
  var __bzPPBridgeCheck=setInterval(function(){
    var loading=document.getElementById('ScaleRootLoading');
    var hidden=!loading||(loading.style.display==='none');
    if(hidden&&document.querySelector('canvas')){
      clearInterval(__bzPPBridgeCheck);
      // ChromeHeadless ve benzeri sınıfları kaldır — PP pointer event engelini kaldırır
      var html=document.documentElement;
      var toRemove=Array.from(html.classList).filter(function(c){
        return c.toLowerCase().includes('headless')||c==='ChromeHeadless';
      });
      toRemove.forEach(function(c){html.classList.remove(c);console.log('[bz-pp] removed blocking class: '+c);});
      // Overlay/PauseRoot üstünde pointer-events:all olan transparent div'leri kaldır
      try{
        var overlays=document.querySelectorAll('div,section');
        for(var __bzi=0;__bzi<overlays.length;__bzi++){
          var ov=overlays[__bzi];
          if(ov.id==='__bz-bal')continue;
          var cs=window.getComputedStyle(ov);
          var r=ov.getBoundingClientRect();
          // Canvas'ı tamamen kaplayan, ama içi boş (background:transparent) overlay'ler
          if(r.width>200&&r.height>200&&cs.backgroundColor==='rgba(0, 0, 0, 0)'&&
             cs.pointerEvents!=='none'&&!ov.querySelector('canvas')){
            var hasText=ov.textContent.trim().length<5;
            if(hasText){ov.style.pointerEvents='none';console.log('[bz-pp] overlay pointer-events:none patched id='+ov.id);}
          }
        }
      }catch(__bzOE){}
      __bzPPInstallBridge();
      // 2s sonra tekrar kontrol — oyun geç mount ederse
      setTimeout(__bzPPInstallBridge,2000);
      setTimeout(__bzPPInstallBridge,5000);
    }
  },500);
  setTimeout(function(){clearInterval(__bzPPBridgeCheck);},65000);
}

// ── report: spin → DB güncelle → bakiye eşitle ───────────────────────────
function report(s){
  // PP input bridge spin lock: spin isteği gidince lock'la, yanıt gelince aç
  if(__bzIsPP){__bzPPSpinLock=true;}
  var subunits=__bzGetSub();
  var bet=Math.max(0.01,parseFloat((s.bet/subunits).toFixed(4)));
  var win=Math.max(0,parseFloat((s.win/subunits).toFixed(4)));
  console.log('[BZ-spin] bet='+bet+' win='+win+' sub='+subunits+' rawBet='+s.bet+' bal='+__bzBal);
  _f.call(window,__bzH+'/api/casino/spin',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},
    body:JSON.stringify({bet:bet,payout:win,gameId:__bzGID,gameTitle:__bzGTIT,provider:__bzGPROV})
  }).then(function(r){return r.json();}).then(function(d){
    if(d&&typeof d.balance==='number'){
      __bzBal=d.balance;
      __bzOvUpdate(d.balance);
      console.log('[BZ-balance] updated='+d.balance);
      window.parent.postMessage({type:'bz_balance',balance:d.balance},'*');
    }
    // PP spin lock'u aç — sonraki tıklamayı kabul et
    if(__bzIsPP){__bzPPSpinLock=false;}
  }).catch(function(e){
    console.log('[BZ-report-err]',e&&e.message);
    // Hata durumunda da lock'u aç
    if(__bzIsPP){__bzPPSpinLock=false;}
  });
}

// Oyunun subunit çarpanını belirle (BGaming=100, diğerleri=1)
function __bzGetSub(){
  try{
    var o=window.__OPTIONS__;
    if(!o){return 1;}
    // BGaming: rules.currency.subunits
    if(o.rules&&o.rules.currency&&o.rules.currency.subunits)return o.rules.currency.subunits;
    // BGaming alt yapı: options.currency.subunits
    if(o.options&&o.options.currency&&o.options.currency.subunits)return o.options.currency.subunits;
    // PP/diğer: currency.subunits
    if(o.currency&&o.currency.subunits)return o.currency.subunits;
    return 1;
  }catch(e){return 1;}
}

// ── fetch override — CORS bypass + spin + balance injection ──────────────
window.fetch=function(url,opts){
  var us=typeof url==='string'?url:(url&&url.url)||String(url||'');
  if(ok(us)){
    sendAlive();
    var relay=__bzH+'/api/casino/relay?gid='+encodeURIComponent(__bzGID)+'&url='+encodeURIComponent(us);
    var _bzOpts=opts?Object.assign({},opts):{};
    try{var _bzGO=new URL(document.baseURI).origin;if(_bzGO&&!_bzGO.includes('localhost')){var _bzHdr=new Headers(_bzOpts.headers||{});_bzHdr.set('X-BZ-Origin',_bzGO);_bzOpts.headers=_bzHdr;}}catch(_){}
    var p=_f.call(this,relay,_bzOpts);
    p=p.then(function(r){
      var ct=r.headers.get('content-type')||'';
      if(!ct.includes('json'))return r;
      return r.clone().json().then(function(d){
        console.log('[BZ-json-fetch] keys='+Object.keys(d||{}).slice(0,8).join(','));
        var s=exSpin(d);
        if(s){report(s);}
        var mth=((opts&&opts.method)||'GET').toUpperCase();
        var outD=d;
        if(mth==='POST'){
          var balToInject=Math.round(__bzBal*__bzGetSub());
          outD=injectBal(d,balToInject,0);
        }
        return new Response(JSON.stringify(outD),{
          status:r.status,
          headers:new Headers({'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*'})
        });
      }).catch(function(){return r;});
    });
    return p;
  }
  // PP oyunu /gs2c/ path'ine local origin üzerinden istek atabilir (Vite proxy devreye girer).
  // Bu istekler ok() testini geçmez (localhost ALLOWED'da yok) ama spin response'unu içerir.
  // POST /gs2c/ veya benzeri gameService isteklerini local response üzerinde yakala.
  try{
    var up=new URL(us,location.href);
    if((up.pathname.indexOf('/gs2c/')===0||up.pathname.indexOf('/gameService')!==-1)&&
       ((opts&&opts.method||'GET').toUpperCase()==='POST')){
      sendAlive();
      var __bzPostBody=String((opts&&opts.body)||'');
      var p2=_f.apply(this,arguments);
      p2=p2.then(function(r2){
        var ct2=r2.headers.get('content-type')||'';
        if(ct2.includes('json')){
          // JSON response (bazı PP versiyonları)
          return r2.clone().json().then(function(d2){
            console.log('[BZ-json-gs] keys='+Object.keys(d2||{}).slice(0,8).join(','));
            var s2=exSpin(d2);
            if(s2){report(s2);}
            var balToInject2=Math.round(__bzBal*__bzGetSub());
            var outD2=injectBal(d2,balToInject2,0);
            return new Response(JSON.stringify(outD2),{
              status:r2.status,
              headers:new Headers({'content-type':'application/json; charset=utf-8'})
            });
          }).catch(function(){return r2;});
        }
        // URL-encoded response (PP native format: tw=X&balance=Y&...)
        return r2.clone().text().then(function(body2){
          __bzPPTrackBal(body2);
          var s2=exSpinPP(body2,__bzPostBody);
          if(s2){report(s2);}
          return r2;
        }).catch(function(){return r2;});
      });
      return p2;
    }
  }catch(__bzFE){}
  return _f.apply(this,arguments);
};

// ── XHR override — CORS bypass + spin + balance injection ────────────────
XMLHttpRequest.prototype.open=function(m,url){
  var u=String(url||'');
  if(ok(u)){
    sendAlive();
    this.__bzP=true;this.__bzU=u;this.__bzMethod=(m||'GET').toUpperCase();
    return _op.call(this,m,__bzH+'/api/casino/relay?gid='+encodeURIComponent(__bzGID)+'&url='+encodeURIComponent(u));
  }
  // PP oyunu /gs2c/ path'ine local origin üzerinden XHR POST yapabilir
  try{
    var up2=new URL(u,location.href);
    if(up2.pathname.indexOf('/gs2c/')===0&&(m||'GET').toUpperCase()==='POST'){
      sendAlive();
      this.__bzGS=true;this.__bzMethod=(m||'GET').toUpperCase();
    }
  }catch(__bzXE2){}
  return _op.apply(this,arguments);
};
XMLHttpRequest.prototype.send=function(b){
  if(this.__bzP||this.__bzGS){
    var x=this;
    try{var _bzXO=new URL(document.baseURI).origin;if(_bzXO&&!_bzXO.includes('localhost'))this.setRequestHeader('X-BZ-Origin',_bzXO);}catch(_){}
    var __bzXhrBody=String(b||'');
    x.addEventListener('readystatechange',function(){
      if(x.readyState!==4)return;
      var ct=x.getResponseHeader('content-type')||'';
      if(x.status>0&&x.status<400){
        if(ct.includes('json')){
          try{
            var d=JSON.parse(x.responseText);
            var logTag=x.__bzP?'[BZ-json-xhr]':'[BZ-json-gs-xhr]';
            console.log(logTag+' keys='+Object.keys(d||{}).slice(0,8).join(','));
            var s=exSpin(d);
            if(s){report(s);}
            var xMod=d;
            if(x.__bzMethod==='POST'){
              var balToInject=Math.round(__bzBal*__bzGetSub());
              xMod=injectBal(d,balToInject,0);
            }
            var mStr=JSON.stringify(xMod);
            try{Object.defineProperty(x,'response',{get:function(){return mStr;},configurable:true});}catch(e){}
            try{Object.defineProperty(x,'responseText',{get:function(){return mStr;},configurable:true});}catch(e){}
          }catch(e){}
        } else if(x.__bzGS){
          // PP URL-encoded response (text/plain;charset=ISO-8859-1)
          try{
            var body=x.responseText||'';
            __bzPPTrackBal(body);
            var s2=exSpinPP(body,__bzXhrBody);
            if(s2){report(s2);}
          }catch(e){}
        }
      }
    });
    x.addEventListener('error',function(){});
  }
  return _sn.apply(this,arguments);
};

// ── Script src interception — dinamik <script> tag'larını relay'e yönlendir ──
// Kapsam: tüm ALLOWED domain script'leri (GWT/Wazdan, PP build.js, logo_info.js vb.)
// Kısıtlama: ok() testi geçmeyen URL'ler değiştirilmez (harici CDN, data:, blob: vb.)
(function(){
  var __sd=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,'src');
  if(__sd&&__sd.set){
    Object.defineProperty(HTMLScriptElement.prototype,'src',{
      set:function(v){
        if(typeof v==='string'&&ok(v)){
          __sd.set.call(this,__bzH+'/api/casino/relay?url='+encodeURIComponent(v));return;
        }
        __sd.set.call(this,v);
      },
      get:__sd.get,configurable:true,enumerable:__sd.enumerable
    });
  }
  // GWT ve bazı framework'ler setAttribute('src',url) kullanır — prototype setter'ı bypass eder
  var _sa=Element.prototype.setAttribute;
  Element.prototype.setAttribute=function(name,val){
    if(this.tagName==='SCRIPT'&&name==='src'&&typeof val==='string'&&ok(val)){
      val=__bzH+'/api/casino/relay?url='+encodeURIComponent(val);
    }
    return _sa.call(this,name,val);
  };
})();
window.parent.postMessage({type:'bz_loaded'},'*');
})();
</script>`;
}

// BGaming gibi Vite-tabanlı oyunlar <script type="module"> kullanır — CORS zorunlu.
// Sadece type="module" script ve crossorigin link tag'ları rewrite edilir.
// Normal <script src> (Unity Loader vb.) asla dokunulmaz — Loader kendi URL'sinden
// asset path hesaplar; relay URL'ye çekilirse bundle yüklemesi bozulur.
function rewriteAssets(html, base, origin = '') {
  function toRelay(url) {
    if (!url || /^(data:|blob:|#|javascript:|\/api\/)/.test(url)) return url;
    try {
      const abs = /^https?:\/\//.test(url) ? url : new URL(url, base).href;
      // <base href> PP CDN'ini işaret ettiğinden relative URL relay'e değil PP'ye resolve edilir.
      // Absolute URL kullan — base href'ten bağımsız.
      if (isAllowed(abs)) return `${origin}/api/casino/relay?url=${encodeURIComponent(abs)}`;
    } catch {}
    return url;
  }
  return html
    .replace(/<script\b([^>]*)>/gi, (match, attrs) => {
      // type="module" ve normal <script src> — hepsini relay'e yönlendir
      return `<script${attrs.replace(/(\bsrc=)(["'])([^"']+)\2/i, (_, a, q, u) => `${a}${q}${toRelay(u)}${q}`)}>`;
    })
    .replace(/<link\b([^>]*)>/gi, (match, attrs) => {
      if (!/\brel=(["'])stylesheet\1/i.test(attrs) && !/\bcrossorigin\b/i.test(attrs)) return match;
      return `<link${attrs.replace(/(\bhref=)(["'])([^"']+)\2/i, (_, a, q, u) => `${a}${q}${toRelay(u)}${q}`)}>`;
    });
}

// ── GET /api/casino/game/:gameId — oyun HTML'ini proxy'le ve inject et ─────────
r.get('/game/:gameId', casinoAuth, async (req, res, next) => {
  try {
    const { demoUrl } = req.query;
    if (!demoUrl || !isAllowed(demoUrl)) return res.status(400).send('Geçersiz URL');

    // oddsSource launcher URL'leri server-side resolve et: SvelteKit SPA'sını bypass edip
    // gerçek PP oyun URL'ini doğrudan proxy'le. SPA router sorununu (localhost route çakışması) önler.
    let activeDemoUrl = demoUrl;
    const _parsedDemo = new URL(demoUrl);
    if (_parsedDemo.hostname.startsWith('launch-') && _parsedDemo.hostname.endsWith('w5tpzfk7ugytdghuzt8y.com')) {
      const _gameId = _parsedDemo.searchParams.get('id');
      if (_gameId) {
        try {
          const _linkUrl = `https://${_parsedDemo.hostname}/link?id=${encodeURIComponent(_gameId)}`;
          const { status: _ls, body: _lb } = await fetchRaw(_linkUrl);
          if (_ls === 200) {
            const _ld = JSON.parse(_lb.toString('utf-8'));
            if (_ld.url && isAllowed(_ld.url)) {
              activeDemoUrl = _ld.url;
              console.log('[oddsSource] launcher resolved → PP URL:', activeDemoUrl.slice(0, 80));
              // Resolved game origin'ini cache'le — relay Origin spoofing için
              gameOriginCache.set(req.params.gameId, new URL(activeDemoUrl).origin);
            }
          }
        } catch (_e) { console.warn('[oddsSource] /link failed:', _e.message); }
      }
    }

    const { status, body, finalUrl, headers: fetchHeaders } = await fetchRaw(activeDemoUrl).catch(e => { throw e; });
    if (status >= 400) return res.status(status).send('Oyun şu an erişilemiyor');

    // PP ve diğer provider'ların set ettiği session cookie'lerini relay için sakla
    if (fetchHeaders?.['set-cookie']) {
      const domain = new URL(finalUrl || demoUrl).hostname;
      const cookies = [].concat(fetchHeaders['set-cookie'])
        .map(c => c.split(';')[0])
        .join('; ');
      proxyCookieCache.set(domain, cookies);
    }

    const html = body.toString('utf-8');
    const resolvedUrl = finalUrl || demoUrl;
    const origin = new URL(resolvedUrl).origin;
    const path = new URL(resolvedUrl).pathname;
    const base = origin + path.substring(0, path.lastIndexOf('/') + 1);

    // PP: openGame.do → html5Game.do?mgckey=...SESSION@xxx redirect yapar.
    // Session ID redirect URL'sindedir — resolvedUrl öncelikli, yoksa orijinal.
    const origSearch = new URL(resolvedUrl).search || new URL(demoUrl).search;
    const searchFix = origSearch ? `<script>
(function(){
var __os=${JSON.stringify(origSearch)};
// Method 1: history.replaceState — absolute URL kullan, <base href> base resolution'ı bypass eder
try{
  var __abs=location.protocol+'//'+location.host+location.pathname+__os;
  history.replaceState(null,'',__abs);
  console.log('[BZ-searchfix] replaceState OK, search:',location.search);
}catch(e){console.warn('[BZ-searchfix] replaceState failed:',e.message);}
// Method 2: Location.prototype getter — replaceState fallback'i
try{
  Object.defineProperty(Location.prototype,'search',{
    get:function(){return __os;},configurable:true,enumerable:true
  });
  console.log('[BZ-searchfix] proto override OK');
}catch(e2){console.warn('[BZ-searchfix] proto override failed:',e2.message);}
})();
</script>` : '';
    // PP: Loader.Start() window.sendToAdapter'ı arar (önce window.parent, sonra window).
    // sendToAdapter bulursa "online mode" ile EVT_GET_CONFIGURATION ister ve
    // window.sendToGame (=Loader.Listener) ile config bekler + parseOnlineConfig çağrılmalı.
    // Biz window.sendToAdapter hook'u kurarak bu akışı simüle ediyoruz.
    const gcMatch = html.match(/gameConfig:\s*'([^']+)'/);
    const ppConfigInject = gcMatch ? `<script>
(function(){
var __bzGC=${JSON.stringify(gcMatch[1])};
var __bzCfg=null;
try{__bzCfg=JSON.parse(__bzGC);}catch(__bzJE){console.warn('[bz] PP gcParse err:',__bzJE&&__bzJE.message);}
if(!__bzCfg)return;
window.sendToAdapter=function(json){
  try{
    var msg=JSON.parse(json);
    if(msg.common==="EVT_GET_CONFIGURATION"){
      if(window.sendToGame)window.sendToGame(JSON.stringify({common:"EVT_GET_CONFIGURATION",args:{config:__bzCfg}}));
      console.log('[bz] PP sendToAdapter→sendToGame config sent');
      setTimeout(function(){
        try{
          if(window.parseOnlineConfig){parseOnlineConfig(__bzCfg);console.log('[bz] PP parseOnlineConfig done');}
          if(window.loadGame){loadGame();console.log('[bz] PP loadGame called');}
        }catch(__bzPE){console.warn('[bz] PP post-config err:',__bzPE&&__bzPE.message);}
      },50);
    }
  }catch(__bzSAE){console.warn('[bz] PP sendToAdapter err:',__bzSAE&&__bzSAE.message);}
};
console.log('[bz] PP sendToAdapter hook installed');
})();
</script>` : '';

    const dbUser = await User.findById(req.user.id).select('balance').lean();
    const reqOrigin = (req.get('x-forwarded-proto') || req.protocol) + '://' + req.get('host');

    // oddsSource SPA tespiti — yalnızca launch- prefix'li URL'ler (server-side resolve fallback)
    // activeDemoUrl launcher URL kalırsa (resolve başarısız) bu yol çalışır
    const isoddsSourceSPA = new URL(resolvedUrl).hostname.startsWith('launch-') && new URL(resolvedUrl).hostname.endsWith('w5tpzfk7ugytdghuzt8y.com');
    const launchHost = new URL(resolvedUrl).hostname;
    // oddsSource SPA: <base href>'i CDN proxy'e yönlendir — Svelte dinamik import'ları
    // document.baseURI kullandığından CORS hatası olmadan same-origin'de yüklensin
    const effectiveBase = isoddsSourceSPA ? `${reqOrigin}/api/casino/cdn/${launchHost}/` : base;

    // oddsSource SPA: /link ve /freerounds API çağrılarını gerçek launcher backend'e yönlendir.
    // SPA, window.location.hostname kullandığından port olmadan "localhost" → http://localhost (port 80) gider.
    // Bu script fetch'i override eder, çağrıyı /api/casino/launcher-proxy/* üzerinden proxy'ler.
    // Ayrıca /link yanıtındaki oyun URL'ini BZ inject'li proxy URL'ine çevirir.
    // postMessage relay: PP game iframe'den gelen bz_ mesajlarını casino UI'a iletir.
    const oddsSourceSpaFix = isoddsSourceSPA ? `<script>
(function(){
  const _LH=${JSON.stringify(launchHost)};
  const _GID=${JSON.stringify(req.params.gameId)};
  const _SRV=${JSON.stringify(reqOrigin)};
  const _T=${JSON.stringify(req.query.t||'')};
  const _GT=${JSON.stringify(req.query.gt||'')};
  const _GP=${JSON.stringify(req.query.gp||'')};
  const _oFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    let url=typeof input==='string'?input:(input instanceof Request?input.url:String(input));
    const m=url.match(/\\/(link|freerounds)(\\?.*)?$/);
    if(m){
      const path='/'+m[1]+(m[2]||'');
      const proxyUrl=_SRV+'/api/casino/launcher-proxy/'+_LH+path;
      console.log('[BZ-oddsSource]',m[1],'→',proxyUrl.slice(-60));
      if(m[1]==='link'){
        const resp=await _oFetch(proxyUrl,init);
        if(resp.ok){
          try{
            const data=await resp.json();
            if(data.url){
              data.url=_SRV+'/api/casino/game/'+_GID
                +'?demoUrl='+encodeURIComponent(data.url)
                +'&t='+encodeURIComponent(_T)
                +'&gt='+encodeURIComponent(_GT)
                +'&gp='+encodeURIComponent(_GP);
              console.log('[BZ-oddsSource] game URL rewrite:',data.url.slice(0,80));
            }
            return new Response(JSON.stringify(data),{status:resp.status,headers:{'Content-Type':'application/json'}});
          }catch(e){console.warn('[BZ-oddsSource] /link parse err:',e.message);}
        }
        return resp;
      }
      return _oFetch(proxyUrl,init);
    }
    return _oFetch(input,init);
  };
  window.addEventListener('message',function(e){
    if(e.data&&typeof e.data==='object'&&e.data.type&&(e.data.type.startsWith('bz_')||e.data.type.startsWith('bz-'))){
      try{parent.postMessage(e.data,'*');}catch(_){}
    }
  });
  console.log('[BZ-oddsSource] SPA fix installed:',_LH);
})();
</script>` : '';

    const inject = `<base href="${effectiveBase}">${searchFix}${ppConfigInject}${oddsSourceSpaFix}${monitorScript(req.user.id, req.query.t, dbUser?.balance ?? 0, req.params.gameId, req.query.gt || '', req.query.gp || '')}`;

    let modified = html
      .replace(/<meta[^>]*content-security-policy[^>]*>/gi, '')
      // Cloudflare rocket-loader script'leri async defer ederek location.search override'ını bozar
      .replace(/<script[^>]+src="[^"]*rocket-loader[^"]*"[^>]*><\/script>/gi, '')
      .replace(/<script[^>]+src="[^"]*rocket-loader[^"]*"[^>]*\/>/gi, '')
      .replace(/(<head[^>]*>)/i, `$1${inject}`);

    // <head> tag yoksa başa ekle
    if (!/<head/i.test(html)) modified = inject + html;

    // oddsSource SPA: root-relative import() yollarını CDN proxy'e yönlendir
    // Svelte runtime inline script içinde import("/_app/...") kullanır — root-relative
    // olduğundan <base href>'ten bağımsız, mevcut origin'e gider (localhost:3001/_app/ = 404)
    // Çözüm: /_app/ → /api/casino/cdn/LAUNCH_HOST/_app/ şeklinde rewrite et
    if (isoddsSourceSPA) {
      const cdnRoot = `/api/casino/cdn/${launchHost}`;
      modified = modified.replace(
        /import\(([`"'])(\/_app\/[^`"']+)\1\)/g,
        (_, q, p) => `import(${q}${cdnRoot}${p}${q})`
      );
      // <link rel="modulepreload" href="/_app/..."> — preload ipuçları da rewrite et
      modified = modified.replace(
        /(<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["'])(\/_app\/[^"']+)(["'])/gi,
        (_, pre, p, suf) => `${pre}${cdnRoot}${p}${suf}`
      );
    }

    // type="module" scriptler ve link:stylesheet için CORS bypass — src/href relay'e yönlendir
    // Origin: <base href> PP CDN'ine işaret ettiğinden absolute URL gerekli
    modified = rewriteAssets(modified, base, reqOrigin);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cache-Control', 'no-store');
    // Inject ettiğimiz script ve oyunun kendi JS'i çalışabilsin
    res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;");
    res.send(modified);
  } catch (e) { next(e); }
});

// ── ALL /api/casino/relay — provider API çağrılarını proxyle ─────────────────
// Auth yok — whitelist domain kontrolü yeterli güvenlik sağlar
r.all('/relay', (req, res) => {
  const { url: rawUrl } = req.query;
  if (!rawUrl) return res.status(400).end();

  let target;
  try { target = decodeURIComponent(rawUrl); }
  catch { return res.status(400).end(); }

  if (!isAllowed(target)) return res.status(403).end();

  const parsed = new URL(target);
  const mod = parsed.protocol === 'https:' ? https : http;

  const fwd = { ...req.headers };
  delete fwd.host; delete fwd.cookie;
  // Sıkıştırılmış binary yanıtları relay üzerinde pipe ederken corruption önle
  delete fwd['accept-encoding'];
  fwd.host = parsed.host;
  // Origin ve Referer'ı hedef domain gibi göster — CDN hotlink/same-origin koruması bypass
  // BZ script oyunun gerçek origin'ini X-BZ-Origin header'ı ile iletirse onu kullan
  // (gp-1-*.w5tpzfk7ugytdghuzt8y.com gibi game frame origin'i, localhost:3001 değil)
  // Origin/Referer belirleme: X-BZ-Origin header → gameOriginCache → fallback
  const _qGid = req.query.gid;
  const _bzGameOrigin = req.headers['x-bz-origin'];
  const _cachedFromGid = _qGid ? gameOriginCache.get(_qGid) : undefined;
  let _effectiveOrigin = _cachedFromGid || _bzGameOrigin || null;
  if (!_effectiveOrigin) {
    // Fallback: Referer header'dan gameId çıkar
    try {
      const _ref = new URL(req.headers['referer'] || '');
      const _gidMatch = _ref.pathname.match(/\/api\/casino\/game\/([^/?]+)/);
      if (_gidMatch) _effectiveOrigin = gameOriginCache.get(_gidMatch[1]);
    } catch(_e) {}
  }
  fwd['origin'] = _effectiveOrigin || parsed.origin;
  fwd['referer'] = (_effectiveOrigin ? _effectiveOrigin + '/' : parsed.origin + '/');
  delete fwd['x-bz-origin'];
  fwd['user-agent'] = UA;
  // fetchRaw'dan önbelleğe alınan session cookie'lerini ekle (CF clearance, PP session vb.)
  const cachedCookie = proxyCookieCache.get(parsed.hostname);
  if (cachedCookie) fwd.cookie = cachedCookie;

  // Eğer JSON body parse edildiyse yeniden serialize et
  let bodyBuf;
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    bodyBuf = Buffer.from(JSON.stringify(req.body));
    fwd['content-type'] = 'application/json';
    fwd['content-length'] = String(bodyBuf.length);
  } else if (typeof req.body === 'string' && req.body.length > 0) {
    bodyBuf = Buffer.from(req.body);
    fwd['content-length'] = String(bodyBuf.length);
  }

  const proxyReq = mod.request({
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: req.method,
    headers: fwd,
  }, (proxyRes) => {
    const h = { ...proxyRes.headers };
    delete h['access-control-allow-origin'];
    delete h['access-control-allow-credentials'];
    delete h['content-security-policy'];
    delete h['x-frame-options'];
    // Cross-Origin isolation header'ları — same-origin kısıtlamasını relay için kaldır
    delete h['cross-origin-resource-policy'];
    delete h['cross-origin-opener-policy'];
    delete h['cross-origin-embedder-policy'];
    // Node.js HTTP incoming response auto de-chunks — transfer-encoding'i iletmek double-parse'a yol açar
    delete h['transfer-encoding'];
    h['access-control-allow-origin'] = '*';
    h['cross-origin-resource-policy'] = 'cross-origin';

    // Redirect'leri relay üzerinden aktar — CDN yönlendirmeleri doğrudan CORS hatası verir
    if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && h.location) {
      try {
        const loc = new URL(h.location, target).href;
        if (isAllowed(loc)) {
          const rl = req.protocol + '://' + req.get('host');
          h.location = `${rl}/api/casino/relay?url=${encodeURIComponent(loc)}`;
        }
      } catch {}
    }

    // build.js PP tarafından XHR+eval ile yükleniyor — internalContinueImporting
    // içindeki ret.objects[i].transform crash'i null-check ile yamala
    // logo_info.js: PatchAGCC içindeki globalRuntime.sceneRoots null crash
    // ── Wazdan ncd.nocache.js patch ──────────────────────────────────────────
    // GWT bootstrap ncd.nocache.js, kendi URL'sini base path olarak kullanır.
    // Relay üzerinden yüklenince cache.js için relay URL yerine CDN URL'si oluşturur
    // → Cross-Origin-Resource-Policy: same-origin hatası.
    // Çözüm: nocache.js içindeki CDN URL fragment'larını relay URL'leriyle değiştir.
    const isWazdanNocache = (
      (target.includes('static-cdn77.wazdan.com') || target.includes('wazdan.com')) &&
      (target.includes('nocache.js') || target.includes('.nocache.js'))
    );
    if (isWazdanNocache && proxyRes.statusCode === 200) {
      const chunks = [];
      proxyRes.on('data', c => chunks.push(c));
      proxyRes.on('end', () => {
        let body = Buffer.concat(chunks).toString('utf8');
        const reqOrigin = (req.get('x-forwarded-proto') || req.protocol) + '://' + req.get('host');

        // GWT B() fonksiyonu: <script src="...ncd.nocache.js"> src'ini alır, base path çıkarır.
        // Script src relay URL'si olduğunda B() bozuk base döndürür.
        // C(a) bunu kullanır: C(strongName+'.cache.js') → bozuk URL → CORP hatası.
        //
        // Çözüm: C() fonksiyonunu patch et — göreceli URL'leri CDN base + relay'e yönlendir.
        // CDN base URL'ini relay target'ından çıkar:
        const cdnBase = target.replace(/[?#].*$/, '').replace(/ncd\.nocache\.js$/, '');
        // Örnek: "https://static-cdn77.wazdan.com/w202663-153/ncd/"
        const relayPfx = reqOrigin + '/api/casino/relay?url=';

        // C_ORIG: GWT minified C() fonksiyonu — exact string match (hex verified).
        // file bytes: /^\// = 0x2f,0x5e,0x5c,0x2f,0x2f (regex with literal backslash)
        // Node string 4 backslashes → 2 → 1 actual backslash in output string
        const C_ORIG = 'function C(a){if(a.match(/^\\\\//)){ return a}if(a.match(/^[a-zA-Z]+:\\\\/\\\\//)){return a}return ncd.__moduleBase+a}'
          .replace('){ return a}', '){return a}'); // minified has no space

        // C_PATCH: göreceli URL → cdnBase + a → relay wrap; absolute → relay wrap
        const C_PATCH = (
          'function C(a){' +
          'if(typeof a!=="string"){return a;}' +
          'if(a.indexOf("/api/casino/relay")!==-1){return a;}' +
          'if(!a.match(/^[a-zA-Z]+:\\/\\//)){' + // göreceli URL
          'var __bzAbs=' + JSON.stringify(cdnBase) + '+a;' +
          'console.log("[bz-wazdan] C-rel:",__bzAbs.substring(0,80));' +
          'return ' + JSON.stringify(relayPfx) + '+encodeURIComponent(__bzAbs);}' +
          // absolute URL → relay wrap
          'console.log("[bz-wazdan] C-abs:",a.substring(0,80));' +
          'return ' + JSON.stringify(relayPfx) + '+encodeURIComponent(a);}'
        );

        if (body.includes(C_ORIG)) {
          body = body.replace(C_ORIG, C_PATCH);
          console.log('[bz-wazdan-nocache] C() patched, cdnBase:', cdnBase);
        } else {
          // Fallback: ncd.__moduleBase override (B() çalıştıktan sonra cdnBase'e set et)
          // Bu durumda C() absolute branch'e girmeyeceğinden cache.js CDN'den yüklenir
          // (relay bypass) ama en azından hata vermez.
          console.warn('[bz-wazdan-nocache] C() pattern not found, applying moduleBase fallback');
          const MB_ORIG = 'ncd.__moduleBase=B();';
          const MB_PATCH = 'ncd.__moduleBase=B();ncd.__moduleBase=' + JSON.stringify(cdnBase) + ';' +
            'console.log("[bz-wazdan] moduleBase set to cdnBase");';
          if (body.includes(MB_ORIG)) {
            body = body.replace(MB_ORIG, MB_PATCH);
            console.log('[bz-wazdan-nocache] moduleBase fallback patched');
          } else {
            console.warn('[bz-wazdan-nocache] WARNING: no nocache.js patch applied');
          }
        }

        console.log('[bz-wazdan-nocache] patched, size:', body.length);
        delete h['content-length'];
        h['content-type'] = 'application/javascript; charset=utf-8';
        res.writeHead(200, h);
        res.end(body);
      });
      proxyRes.on('error', () => { if (!res.headersSent) res.status(502).end(); });
      return;
    }

    const isLogoInfo = target.includes('logo_info.js');
    if (isLogoInfo && proxyRes.statusCode === 200) {
      const chunks = [];
      proxyRes.on('data', c => chunks.push(c));
      proxyRes.on('end', () => {
        let body = Buffer.concat(chunks).toString('utf8');
        body = body.replaceAll('globalRuntime.sceneRoots.length', '(globalRuntime&&globalRuntime.sceneRoots||[]).length');
        // PatchPlayNowButton: tSOI null ise .RemoveButtonAndPatchText assign hatası
        body = body.replace('tSOI.RemoveButtonAndPatchText = function()', 'if(!tSOI)return; tSOI.RemoveButtonAndPatchText = function()');
        console.log('[bz-logo-patch] sceneRoots + tSOI null-safe patched');
        delete h['content-length'];
        h['content-type'] = 'application/javascript; charset=utf-8';
        res.writeHead(200, h);
        res.end(body);
      });
      proxyRes.on('error', () => { if (!res.headersSent) res.status(502).end(); });
      return;
    }

    const isBuildJs = target.includes('/build.js');
    if (isBuildJs && proxyRes.statusCode === 200) {
      const chunks = [];
      proxyRes.on('data', c => chunks.push(c));
      proxyRes.on('end', () => {
        let body = Buffer.concat(chunks).toString('utf8');
        // Advance() sonrasına tüm undefined/transform-suz ret.objects'leri dummy ile doldur
        // → transform/children/GetComponentsInChildren crash'larını tek seferde önle
        const ADV_ORIG = 'var ret=globalImporter.Advance(JsonsToImport,globalGamePath);';
        const DUMMY_OBJ = '{transform:{SetParent:function(){},localPosition:{x:0,y:0,z:0},localRotation:{x:0,y:0,z:0,w:1},localScale:{x:1,y:1,z:1},children:[],Find:function(){return null;}},GetComponentsInChildren:function(){return[];},GetComponent:function(){return null;},SetActive:function(){},SetParent:function(){},name:"",children:[],tag:""}';
        const ADV_PATCH = ADV_ORIG +
          'if(ret&&ret.objects){' +
          'var __bzD=' + DUMMY_OBJ + ';' +
          'for(var __bzi=0;__bzi<ret.objects.length;__bzi++){' +
          'if(!ret.objects[__bzi]){ret.objects[__bzi]=__bzD;}' +
          'else if(!ret.objects[__bzi].transform){ret.objects[__bzi].transform=__bzD.transform;}' +
          '}}';
        if (body.includes(ADV_ORIG)) {
          body = body.replace(ADV_ORIG, ADV_PATCH);
        }
        // GetComponentsInChildren(LocalizationRoot,true)[0].transform — boş array'de [0] undefined
        // .concat([dummy]) → array her zaman en az 1 eleman içerir, [0] her zaman geçerli
        const DUMMY_T = '{SetParent:function(){},children:[],Find:function(){return null;},localPosition:{x:0,y:0,z:0},localRotation:{x:0,y:0,z:0,w:1},localScale:{x:1,y:1,z:1}}';
        const LOC_ORIG = 'GetComponentsInChildren(LocalizationRoot,true)[0].transform';
        const LOC_PATCH = 'GetComponentsInChildren(LocalizationRoot,true).concat([{transform:' + DUMMY_T + '}])[0].transform';
        if (body.includes(LOC_ORIG)) {
          body = body.replaceAll(LOC_ORIG, LOC_PATCH);
          console.log('[bz-build-patch] LocalizationRoot[0].transform null-safe patched');
        }
        // computeActiveState: root.transform.parent.gameObject undefined crash
        // parent.gameObject null-check ile koruma
        const ACT_ORIG = 'root.activeInHierarchy=root.transform.parent.gameObject.activeInHierarchy&&root.activeSelf;';
        const ACT_PATCH = 'root.activeInHierarchy=(root.transform.parent&&root.transform.parent.gameObject)?root.transform.parent.gameObject.activeInHierarchy&&root.activeSelf:root.activeSelf;';
        if (body.includes(ACT_ORIG)) {
          body = body.replaceAll(ACT_ORIG, ACT_PATCH);
          console.log('[bz-build-patch] computeActiveState parent.gameObject null-safe patched');
        }
        // callComponentCallback: comp.Start()/Awake() throw ederse loading durmasın
        const CBC_ORIG = 'comp.flags=comp.flags|flagToSet;comp[funcToCall]()}}';
        const CBC_PATCH = 'comp.flags=comp.flags|flagToSet;try{comp[funcToCall]()}catch(__bzCCE){console.warn("[bz] component cb err:",__bzCCE&&__bzCCE.message)}}}';
        if (body.includes(CBC_ORIG)) {
          body = body.replace(CBC_ORIG, CBC_PATCH);
          console.log('[bz-build-patch] callComponentCallback try-catch patched');
        }
        // callOnEnable: comp.OnEnable() throw ederse (ör. AnimationController.GetAnimationState)
        const COE_ORIG = 'function callOnEnable(comp){comp.OnEnable();comp.flags|=ComponentStateFlags.onEnable_called;';
        const COE_PATCH = 'function callOnEnable(comp){try{comp.OnEnable();}catch(__bzCOE){console.warn("[bz] onEnable err:",__bzCOE&&__bzCOE.message);}comp.flags|=ComponentStateFlags.onEnable_called;';
        if (body.includes(COE_ORIG)) {
          body = body.replace(COE_ORIG, COE_PATCH);
          console.log('[bz-build-patch] callOnEnable try-catch patched');
        } else {
          console.warn('[bz-build-patch] WARNING: callOnEnable ORIG not found');
        }
        // CallOnGameObjectList: Update/LateUpdate callback null hatalarını yut
        const COGL_ORIG = 'if(c!=null)c[methodName]()}}';
        const COGL_PATCH = 'if(c!=null)try{c[methodName]()}catch(__bzCOGL){console.warn("[bz] update err:",__bzCOGL&&__bzCOGL.message)}}}';
        if (body.includes(COGL_ORIG)) {
          body = body.replace(COGL_ORIG, COGL_PATCH);
          console.log('[bz-build-patch] CallOnGameObjectList try-catch patched');
        } else {
          console.warn('[bz-build-patch] WARNING: CallOnGameObjectList ORIG not found');
        }
        // PP ServerOptions.serverUrl — build.js içinde yanlış domain (studio.game-service.biz)
        // hardcoded. PP demo oyunlarında spin istekleri bu domain'e gider, ALLOWED listesinde yok.
        // Doğru demo sunucusuna yönlendir → relay interceptleyebilsin.
        const SRV_ORIG = 'serverUrl:"https://studio.game-service.biz"';
        const SRV_PATCH = 'serverUrl:"https://demogamesfree.pragmaticplay.net"';
        if (body.includes(SRV_ORIG)) {
          body = body.replace(SRV_ORIG, SRV_PATCH);
          console.log('[bz-build-patch] serverUrl → demogamesfree.pragmaticplay.net');
        } else {
          // Tek tırnak versiyonu dene
          const SRV_ORIG2 = "serverUrl:'https://studio.game-service.biz'";
          if (body.includes(SRV_ORIG2)) {
            body = body.replace(SRV_ORIG2, "serverUrl:'https://demogamesfree.pragmaticplay.net'");
            console.log('[bz-build-patch] serverUrl (sq) → demogamesfree.pragmaticplay.net');
          } else {
            console.warn('[bz-build-patch] WARNING: serverUrl studio.game-service.biz NOT found in build.js');
          }
        }

        // tryToHide güvenlik ağı: PP OnRequestToHideLoader event'i tetiklenmezse
        // ClientLoader.tryToHide = false kalıyor ve loading screen kapanmıyor.
        // doFrame başladıktan 12s sonra hala false ise zorla true yap.
        const TRY_HIDE_PATCH =
          '\nsetTimeout(function(){' +
          'try{if(window.globalRuntime&&window.ClientLoader){' +
          'var __bzSrs=globalRuntime.sceneRoots||[];' +
          'for(var __bzSi=0;__bzSi<__bzSrs.length;__bzSi++){' +
          'var __bzCls=__bzSrs[__bzSi].GetComponentsInChildren(ClientLoader,true);' +
          'if(__bzCls&&__bzCls.length>0&&!__bzCls[0].tryToHide){' +
          '__bzCls[0].tryToHide=true;console.log("[bz] forced tryToHide true");}}}' +
          '}catch(__bzTE){console.warn("[bz] tryToHide err:",__bzTE&&__bzTE.message);}' +
          '},12000);';
        // İdempotency guard: if-block function hoist sorununu önlemek için
        // sadece tryToHide ekliyoruz; guard kaldırıldı (build.js sadece bir kez XHR yükleniyor).
        body = body + TRY_HIDE_PATCH;
        console.log('[bz-build-patch] build.js Advance-safety patched');
        delete h['content-length'];
        h['content-type'] = 'application/javascript; charset=utf-8';
        res.writeHead(200, h);
        res.end(body);
      });
      proxyRes.on('error', () => { if (!res.headersSent) res.status(502).end(); });
    } else {
      res.writeHead(proxyRes.statusCode, h);
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', (err) => {
    console.error('[relay err]', target, err.message);
    if (!res.headersSent) res.status(502).end();
  });
  proxyReq.setTimeout(60000, () => { proxyReq.destroy(); });

  if (bodyBuf) proxyReq.write(bodyBuf);
  proxyReq.end();
});

// ── GET /api/casino/cdn/* — oddsSource SPA JavaScript CDN pass-through (CORS bypass) ──
// Svelte dinamik import'ları CDN'den CORS başlığı olmadan yüklenemez; bu endpoint
// CDN JS/CSS dosyalarını same-origin üzerinden serve ederek sorunu çözer.
// Whitelist koruması: yalnızca ALLOWED domain'lere erişim.
r.get('/cdn/*', (req, res) => {
  console.log('[CDN] HIT:', req.url.slice(0, 80), 'params:', req.params[0]?.slice(0, 50));
  const rest = req.params[0]; // "launch-HASH.w5tpzfk7ugytdghuzt8y.com/_app/..."
  const slashIdx = rest.indexOf('/');
  const host = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
  const pathStr = slashIdx === -1 ? '/' : rest.slice(slashIdx);
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = `https://${host}${pathStr}${qs}`;

  if (!isAllowed(target)) return res.status(403).end();

  fetchRaw(target).then(({ status, headers: fwdH, body }) => {
    console.log('[CDN] fetchRaw status:', status, 'body bytes:', body.length, 'target:', target.slice(-40));
    const h = { ...fwdH };
    delete h['access-control-allow-origin'];
    delete h['content-security-policy'];
    delete h['x-frame-options'];
    delete h['transfer-encoding'];
    delete h['cross-origin-resource-policy'];
    delete h['cross-origin-opener-policy'];
    delete h['cross-origin-embedder-policy'];
    h['access-control-allow-origin'] = '*';
    h['cross-origin-resource-policy'] = 'cross-origin';
    h['cache-control'] = 'public, max-age=300';
    res.writeHead(status, h);
    res.end(body);
  }).catch(err => {
    console.error('[cdn-proxy]', target, err.message);
    if (!res.headersSent) res.status(502).end();
  });
});

// ── GET /api/casino/launcher-proxy/* — oddsSource SPA launcher API proxy ───────────
// Svelte SPA /link ve /freerounds çağrılarını gerçek launcher backend'e iletir.
// Whitelist koruması: yalnızca ALLOWED domain'lere erişim.
r.get('/launcher-proxy/*', (req, res) => {
  const rest = req.params[0];
  const slashIdx = rest.indexOf('/');
  const host = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
  const pathStr = slashIdx === -1 ? '/' : rest.slice(slashIdx);
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = `https://${host}${pathStr}${qs}`;

  if (!isAllowed(target)) return res.status(403).end();

  fetchRaw(target).then(({ status, headers: fwdH, body }) => {
    const h = { ...fwdH };
    delete h['transfer-encoding'];
    delete h['content-security-policy'];
    delete h['x-frame-options'];
    delete h['cross-origin-resource-policy'];
    delete h['cross-origin-opener-policy'];
    delete h['cross-origin-embedder-policy'];
    h['access-control-allow-origin'] = '*';
    h['cross-origin-resource-policy'] = 'cross-origin';
    res.writeHead(status, h);
    res.end(body);
  }).catch(err => {
    console.error('[launcher-proxy]', target, err.message);
    if (!res.headersSent) res.status(502).end();
  });
});

// ── GET /api/casino/logo-stub.js — PP logo_info.js yerine boş JS döner ────────
r.get('/logo-stub.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send('/* bz logo stub */');
});

// ── GET /api/casino/broken-games — pending GameTask gameId listesi ───────────
r.get('/broken-games', async (req, res, next) => {
  try {
    const tasks = await GameTask.find({ status: 'pending' }).select('gameId').lean();
    res.json({ broken: tasks.map(t => t.gameId) });
  } catch(e) { next(e); }
});

// ── POST /api/casino/broken-game — yönetim paneli için iş kaydı oluştur ──────
r.post('/broken-game', casinoAuth, async (req, res, next) => {
  try {
    const { gameId, gameTitle, provider } = req.body;
    if (!gameId) return res.status(400).json({ error: 'gameId gerekli' });
    const existing = await GameTask.findOne({ gameId, status: 'pending' });
    if (!existing) await GameTask.create({ gameId, gameTitle: gameTitle || '', provider: provider || '' });
    res.json({ ok: true });
  } catch(e) { next(e); }
});

// ── POST /api/casino/spin — bakiye güncelle + CasinoRound kaydet ─────────────
r.post('/spin', requireAuth, async (req, res, next) => {
  try {
    const { bet, payout, gameId, gameTitle, provider } = req.body;
    if (!bet || typeof bet !== 'number' || bet <= 0)
      return res.status(400).json({ error: { code: 'INVALID_BET', message: 'Geçersiz bahis miktarı' } });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    if (user.balance < bet)
      return res.status(400).json({ error: { code: 'INSUFFICIENT_BALANCE', message: 'Yetersiz bakiye' } });

    const balanceBefore = user.balance;
    const netChange = (payout ?? 0) - bet;
    user.balance = Math.max(0, parseFloat((user.balance + netChange).toFixed(2)));
    await user.save();

    if (gameId) {
      CasinoRound.create({
        userId: req.user.id,
        gameId,
        gameTitle: gameTitle || '',
        provider: provider || '',
        bet,
        payout: payout ?? 0,
        net: netChange,
        balanceBefore,
        balanceAfter: user.balance,
      }).catch(() => {});
    }

    res.json({ balance: user.balance, netChange });
  } catch (e) { next(e); }
});

// ── GET /api/casino/oddsSource-game/:id — Tek oyun bilgisi + launch URL ────────
r.get('/oddsSource-game/:id', casinoAuth, async (req, res, next) => {
  try {
    const games = loadoddsSourceGames();
    const game = games.find(g => g.id === req.params.id);
    if (!game) return res.status(404).json({ error: 'Oyun bulunamadı' });

    const url = await getoddsSourceGameUrl(game.id, game.oddsSourceProvider, true);
    res.json({ game, url });
  } catch (e) { next(e); }
});

// ── GET /api/casino/oddsSource-games — oddsSource oyun kataloğu ───────────────────
r.get('/oddsSource-games', casinoAuth, (req, res) => {
  const games = loadoddsSourceGames();
  res.json({ total: games.length, games });
});

// ── POST /api/casino/oddsSource-launch — oddsSource üzerinden oyun URL'si al ──────
// Body: { gameId: "<uuid>", provider: "pragmatic-play", fun?: true }
r.post('/oddsSource-launch', casinoAuth, async (req, res, next) => {
  try {
    const { gameId, provider, fun = true } = req.body;
    if (!gameId || !provider) return res.status(400).json({ error: 'gameId ve provider zorunlu' });

    const url = await getoddsSourceGameUrl(gameId, provider, fun !== false);
    res.json({ url });
  } catch (e) { next(e); }
});

export default r;
