import { useRef, useEffect, useCallback } from 'react';
import { SYMBOLS } from '../hooks/useSlotGame';

const COLS = 5;
const ROWS = 3;
const CELL = 90;       // hücre boyutu px
const GAP = 6;
const REEL_H = ROWS * (CELL + GAP) - GAP;
const CANVAS_W = COLS * (CELL + GAP) - GAP;
const CANVAS_H = REEL_H;
const SPIN_FRAMES = 40;  // animasyon frame sayısı

// Offset → sembol pozisyonu (yukarı kayma hissi)
function drawReel(ctx, col, symIds, offsetY, winLineRows) {
  const x = col * (CELL + GAP);

  for (let row = 0; row < ROWS; row++) {
    const y = row * (CELL + GAP) + offsetY;
    if (y < -CELL || y > CANVAS_H) continue;

    const symId = symIds[row];
    const sym = SYMBOLS[symId];
    const isWin = winLineRows.includes(row);

    // Hücre arka planı
    ctx.fillStyle = isWin ? 'rgba(0,212,255,0.18)' : 'rgba(17,29,48,0.95)';
    ctx.beginPath();
    ctx.roundRect(x, y, CELL, CELL, 10);
    ctx.fill();

    // Kenarlık
    ctx.strokeStyle = isWin ? '#00d4ff' : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = isWin ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, CELL, CELL, 10);
    ctx.stroke();

    // Emoji
    ctx.font = `${CELL * 0.52}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sym.emoji, x + CELL / 2, y + CELL / 2);
  }
}

export default function SlotCanvas({ grid, spinning, lastWins }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const frameRef = useRef(0);
  const spinGridRef = useRef(null); // animasyon sırasında geçici grid

  // Kazanan satırları hesapla
  const winCols = {};
  for (const win of lastWins) {
    const PAYLINES = [
      [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],
      [0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],
      [2,2,1,0,0],[1,0,1,2,1],[1,2,1,0,1],[0,1,0,1,0],
    ];
    const line = PAYLINES[win.lineIdx] || [];
    line.forEach((row, col) => {
      if (!winCols[col]) winCols[col] = new Set();
      winCols[col].add(row);
    });
  }

  const draw = useCallback((overrideGrid, offsets) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Klip bölgesi
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, CANVAS_W, CANVAS_H, 14);
    ctx.clip();

    const g = overrideGrid || grid;
    for (let col = 0; col < COLS; col++) {
      const offset = offsets ? offsets[col] : 0;
      const winRows = winCols[col] ? [...winCols[col]] : [];
      drawReel(ctx, col, g[col], offset, winRows);
    }
    ctx.restore();
  }, [grid, winCols]);

  // Normal (statik) render
  useEffect(() => {
    if (!spinning) draw();
  }, [grid, lastWins, spinning, draw]);

  // Spin animasyonu
  useEffect(() => {
    if (!spinning) return;

    frameRef.current = 0;
    // Animasyon sırasında rastgele geçici grid kullan
    spinGridRef.current = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => Math.floor(Math.random() * SYMBOLS.length))
    );

    const animate = () => {
      const frame = frameRef.current++;

      // Her 4 frame'de geçici grid değiştir (dönme efekti)
      if (frame % 4 === 0) {
        spinGridRef.current = Array.from({ length: COLS }, () =>
          Array.from({ length: ROWS }, () => Math.floor(Math.random() * SYMBOLS.length))
        );
      }

      // Kaydırma offset'i (sinüs eğrisi ile yumuşak dur)
      const progress = frame / SPIN_FRAMES;
      const offsets = Array.from({ length: COLS }, (_, col) => {
        const delay = col * 0.1;
        const t = Math.max(0, progress - delay);
        return Math.sin(t * Math.PI * 4) * 12 * (1 - t);
      });

      draw(spinGridRef.current, offsets);

      if (frame < SPIN_FRAMES + COLS * 4) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [spinning]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      className="rounded-xl shadow-2xl"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
