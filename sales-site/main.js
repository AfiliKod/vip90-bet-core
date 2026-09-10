/* ═══════════════════════════════════════════════════
   VIP90.BET v5 SALES SITE — MAIN JS
   ═══════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── CANVAS HERO GRID ──────────────────────── */
  const canvas = document.getElementById('heroCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let w, h, dots = [];

    function resize() {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
      initDots();
    }

    function initDots() {
      dots = [];
      const spacing = 60;
      for (let x = spacing; x < w; x += spacing) {
        for (let y = spacing; y < h; y += spacing) {
          dots.push({
            x, y,
            ox: x, oy: y,
            r: Math.random() < 0.08 ? 2 : 1,
            gold: Math.random() < 0.08,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.04)';
      ctx.lineWidth = 1;
      const spacing = 60;
      for (let x = spacing; x < w; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = spacing; y < h; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Dots
      for (const d of dots) {
        const pulse = Math.sin(t * 0.001 + d.phase) * 0.5 + 0.5;
        d.x = d.ox + Math.sin(t * 0.0005 + d.phase) * 2;
        d.y = d.oy + Math.cos(t * 0.0007 + d.phase) * 2;

        if (d.gold) {
          ctx.fillStyle = `rgba(240, 180, 41, ${0.3 + pulse * 0.5})`; /* --gold #f0b429 */
          ctx.shadowColor = 'rgba(240, 180, 41, 0.4)';
        } else {
          ctx.fillStyle = `rgba(0, 212, 255, ${0.1 + pulse * 0.15})`;
          ctx.shadowColor = 'transparent';
        }
        ctx.shadowBlur = d.gold ? 8 : 0;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(draw);
  }

  /* ── GSAP SCROLL REVEAL ────────────────────── */
  gsap.registerPlugin(ScrollTrigger);

  document.querySelectorAll('[data-reveal]').forEach((el, i) => {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 88%',
        toggleActions: 'play none none none',
      },
      delay: (i % 4) * 0.1,
    });
  });

  /* ── HERO ANIMATIONS ───────────────────────── */
  gsap.from('.hero__badge', { opacity: 0, y: 20, duration: 0.8, delay: 0.2 });
  gsap.from('.hero__title', { opacity: 0, y: 30, duration: 0.9, delay: 0.4 });
  gsap.from('.hero__subtitle', { opacity: 0, y: 20, duration: 0.8, delay: 0.6 });
  gsap.from('.hero__actions', { opacity: 0, y: 20, duration: 0.8, delay: 0.8 });
  gsap.from('.hero__stats', { opacity: 0, y: 20, duration: 0.8, delay: 1.0 });
  gsap.from('.hero__scroll', { opacity: 0, duration: 1, delay: 1.5 });

  /* ── COUNTER ANIMATION ─────────────────────── */
  document.querySelectorAll('.hero__stat-num[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count);
    const obj = { val: 0 };
    gsap.to(obj, {
      val: target,
      duration: 2,
      delay: 1.2,
      ease: 'power2.out',
      onUpdate() {
        el.textContent = Math.round(obj.val);
      },
    });
  });

  /* ── SCROLL PROGRESS BAR ────────────────────── */
  const scrollProgress = document.getElementById('scrollProgress');
  if (scrollProgress) {
    window.addEventListener('scroll', () => {
      const h = document.documentElement;
      const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
      scrollProgress.style.width = pct + '%';
    }, { passive: true });
  }

  /* ── ARCHITECTURE CONNECTOR SEQUENCE ────────── */
  const archDots = document.querySelectorAll('.arch-dot');
  const archLines = document.querySelectorAll('.arch-line');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (archDots.length && !prefersReducedMotion) {
    gsap.set(archLines, { scaleY: 0, transformOrigin: 'top' });
    gsap.set(archDots, { scale: 0 });
    ScrollTrigger.create({
      trigger: '.arch-visual',
      start: 'top 75%',
      once: true,
      onEnter: () => {
        const tl = gsap.timeline();
        archDots.forEach((dot, i) => {
          tl.to(dot, { scale: 1, duration: 0.3, ease: 'back.out(2)' }, i * 0.15);
        });
        archLines.forEach((line, i) => {
          tl.to(line, { scaleY: 1, duration: 0.4, ease: 'power2.out' }, i * 0.15 + 0.15);
        });
      },
    });
  }

  /* ── NAV SCROLL ────────────────────────────── */
  const nav = document.getElementById('nav');
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('nav--scrolled', y > 50);
    lastScroll = y;
  }, { passive: true });

  /* ── SMOOTH SCROLL ─────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        const offset = 80;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  /* ── FAQ ACCORDION ─────────────────────────── */
  document.querySelectorAll('.faq-item__q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const wasActive = item.classList.contains('active');

      // Close all
      document.querySelectorAll('.faq-item.active').forEach(el => {
        el.classList.remove('active');
      });

      // Toggle clicked
      if (!wasActive) {
        item.classList.add('active');
      }
    });
  });

  /* ── MOBILE NAV ────────────────────────────── */
  const burger = document.getElementById('navBurger');
  if (burger) {
    burger.addEventListener('click', () => {
      const links = document.querySelector('.nav__links');
      if (links) {
        links.style.display = links.style.display === 'flex' ? 'none' : 'flex';
        links.style.position = 'absolute';
        links.style.top = '72px';
        links.style.left = '0';
        links.style.right = '0';
        links.style.background = 'rgba(6, 10, 19, 0.98)';
        links.style.flexDirection = 'column';
        links.style.padding = '24px';
        links.style.gap = '16px';
        links.style.borderBottom = '1px solid rgba(255,255,255,0.07)';
      }
    });
  }

  /* ── ADMIN DASHBOARD PREVIEW (real chart, sample data) ──
     Same hand-rolled SVG technique as the actual admin panel's Revenue
     Overview widget — no charting library needed for a 2-series area chart.
     Data is illustrative (this is a marketing page, not the live product),
     but the interaction (range toggle, live redraw) is the real mechanic. */
  (function initDashPreview() {
    const svg = document.getElementById('dashChart');
    if (!svg) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function mulberry32(seed) {
      return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function genSeries(n, base, amp, seed) {
      const rnd = mulberry32(seed);
      const pts = []; let v = base;
      for (let i = 0; i < n; i++) {
        v += (rnd() - 0.42) * amp;
        v = Math.max(base * 0.35, v);
        pts.push(Math.round(v));
      }
      return pts;
    }

    const DATASETS = {
      7:  { casino: genSeries(7, 120, 26, 11),  betting: genSeries(7, 40, 14, 22) },
      30: { casino: genSeries(30, 118, 24, 33), betting: genSeries(30, 38, 13, 44) },
      90: { casino: genSeries(90, 112, 22, 55), betting: genSeries(90, 36, 12, 66) },
    };

    const W = 560, H = 180, PAD = 6;
    function pathFor(points, maxY) {
      const innerW = W - PAD * 2, innerH = H - PAD * 2;
      const step = innerW / (points.length - 1);
      const coords = points.map((v, i) => [
        PAD + i * step,
        PAD + innerH - (v / maxY) * innerH,
      ]);
      const line = 'M' + coords.map(c => c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' L');
      const area = line + ` L${coords[coords.length - 1][0].toFixed(1)},${H - PAD} L${coords[0][0].toFixed(1)},${H - PAD} Z`;
      return { line, area };
    }

    svg.innerHTML = `
      <defs>
        <linearGradient id="dashGradCasino" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stop-color="#8b5cf6" stop-opacity="0.32"/>
          <stop offset="95%" stop-color="#8b5cf6" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="dashGradBetting" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stop-color="#f0b429" stop-opacity="0.28"/>
          <stop offset="95%" stop-color="#f0b429" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path id="dashAreaBetting" fill="url(#dashGradBetting)" style="${reduceMotion ? '' : 'transition:d .35s ease'}"/>
      <path id="dashAreaCasino" fill="url(#dashGradCasino)" style="${reduceMotion ? '' : 'transition:d .35s ease'}"/>
      <path id="dashLineBetting" fill="none" stroke="#f0b429" stroke-width="2" style="${reduceMotion ? '' : 'transition:d .35s ease'}"/>
      <path id="dashLineCasino" fill="none" stroke="#8b5cf6" stroke-width="2" style="${reduceMotion ? '' : 'transition:d .35s ease'}"/>
    `;
    const areaCasino = document.getElementById('dashAreaCasino');
    const areaBetting = document.getElementById('dashAreaBetting');
    const lineCasino = document.getElementById('dashLineCasino');
    const lineBetting = document.getElementById('dashLineBetting');
    const donutCasino = document.getElementById('dashDonutCasino');
    const donutBetting = document.getElementById('dashDonutBetting');
    const donutPct = document.getElementById('dashDonutPct');

    function render(range) {
      const data = DATASETS[range];
      const maxY = Math.max(...data.casino, ...data.betting) * 1.15;
      const c = pathFor(data.casino, maxY);
      const b = pathFor(data.betting, maxY);
      areaCasino.setAttribute('d', c.area);
      areaBetting.setAttribute('d', b.area);
      lineCasino.setAttribute('d', c.line);
      lineBetting.setAttribute('d', b.line);

      const sumCasino = data.casino.reduce((a, v) => a + v, 0);
      const sumBetting = data.betting.reduce((a, v) => a + v, 0);
      const total = sumCasino + sumBetting;
      const pctCasino = Math.round((sumCasino / total) * 100);
      const circumference = 2 * Math.PI * 50;
      const casinoLen = (pctCasino / 100) * circumference;
      donutCasino.setAttribute('stroke-dasharray', `${casinoLen} ${circumference}`);
      donutBetting.setAttribute('stroke-dasharray', `${circumference - casinoLen} ${circumference}`);
      donutBetting.setAttribute('stroke-dashoffset', -casinoLen);
      donutPct.textContent = pctCasino + '%';
    }

    document.querySelectorAll('#dashRange button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#dashRange button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        render(parseInt(btn.dataset.range, 10));
      });
    });

    render(7);
  })();

  /* ── SECTION PARALLAX (subtle) ─────────────── */
  document.querySelectorAll('.section__header').forEach(el => {
    gsap.from(el, {
      opacity: 0.5,
      scrollTrigger: {
        trigger: el,
        start: 'top 90%',
        end: 'top 40%',
        scrub: 1,
      },
    });
  });

})();
