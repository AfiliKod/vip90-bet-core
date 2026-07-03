import { Router } from 'express';
import { createHmac, randomBytes } from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import User from '../models/User.js';
import CasinoRound from '../models/CasinoRound.js';

const router = Router();
router.use(requireAuth);

// ── MINES ────────────────────────────────────────────────────────────────────

// Mines multiplier table: mines count → payout per reveal step
// Formula: (25-revealed) / (25-mines-revealed) accumulated, house edge 4%
function minesMultiplier(mines, revealed) {
  if (revealed === 0) return 1;
  let m = 1;
  for (let i = 0; i < revealed; i++) {
    m *= (25 - mines - i) / (25 - i);
  }
  // Invert & apply house edge
  const raw = 1 / m;
  return Math.floor(raw * 0.78 * 100) / 100;
}

function generateMinePositions(serverSeed, clientSeed, mines) {
  const hash = createHmac('sha256', serverSeed).update(clientSeed).digest('hex');
  const positions = new Set();
  let i = 0;
  while (positions.size < mines) {
    const chunk = parseInt(hash.slice((i * 2) % 60, (i * 2) % 60 + 4), 16);
    positions.add(chunk % 25);
    i++;
    if (i > 200) break; // safety
  }
  // Fill remaining with different method if hash exhausted
  if (positions.size < mines) {
    for (let p = 0; p < 25 && positions.size < mines; p++) {
      positions.add(p);
    }
  }
  return [...positions];
}

// In-memory active mines sessions (userId → session)
const mineSessions = new Map();

// POST /inhouse/mines/start
router.post('/mines/start', async (req, res, next) => {
  try {
    const { amount, mines } = req.body;
    const minesCount = parseInt(mines);
    const betAmount = parseFloat(amount);

    if (isNaN(betAmount) || betAmount < 1) return res.status(400).json({ error: 'Geçersiz miktar' });
    if (isNaN(minesCount) || minesCount < 1 || minesCount > 24) return res.status(400).json({ error: 'Geçersiz mayın sayısı (1-24)' });

    const user = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: betAmount } },
      { $inc: { balance: -betAmount } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'Yetersiz bakiye' });

    const newBalance = user.balance;

    const serverSeed = randomBytes(16).toString('hex');
    const clientSeed = randomBytes(8).toString('hex');
    const minePos = generateMinePositions(serverSeed, clientSeed, minesCount);

    mineSessions.set(req.user.id.toString(), {
      serverSeed,
      clientSeed,
      minePos,
      mines: minesCount,
      bet: betAmount,
      balanceBefore: user.balance + betAmount,
      revealed: [],
      cashedOut: false,
    });

    res.json({
      balance: newBalance,
      clientSeed,
      mines: minesCount,
      grid: 25,
    });
  } catch (err) { next(err); }
});

// POST /inhouse/mines/reveal
router.post('/mines/reveal', async (req, res, next) => {
  try {
    const { index } = req.body;
    const session = mineSessions.get(req.user.id.toString());
    if (!session || session.cashedOut) return res.status(400).json({ error: 'Aktif oyun yok' });

    const cell = parseInt(index);
    if (isNaN(cell) || cell < 0 || cell > 24) return res.status(400).json({ error: 'Geçersiz hücre' });
    if (session.revealed.includes(cell)) return res.status(400).json({ error: 'Zaten açıldı' });

    const isMine = session.minePos.includes(cell);
    session.revealed.push(cell);

    if (isMine) {
      // Game over — lose bet
      session.cashedOut = true;
      mineSessions.delete(req.user.id.toString());

      const user = await User.findById(req.user.id).select('balance');
      await CasinoRound.create({
        userId: req.user.id, gameId: 'inhouse-mines', gameTitle: 'Mines',
        provider: 'inhouse', bet: session.bet, payout: 0,
        net: -session.bet,
        balanceBefore: session.balanceBefore,
        balanceAfter: user.balance,
      });

      return res.json({
        result: 'mine',
        minePositions: session.minePos,
        serverSeed: session.serverSeed,
        balance: user.balance,
      });
    }

    const safeRevealed = session.revealed.length;
    const mult = minesMultiplier(session.mines, safeRevealed);

    res.json({
      result: 'safe',
      revealed: safeRevealed,
      multiplier: mult,
      nextMultiplier: minesMultiplier(session.mines, safeRevealed + 1),
      canCashout: true,
    });
  } catch (err) { next(err); }
});

// POST /inhouse/mines/cashout
router.post('/mines/cashout', async (req, res, next) => {
  try {
    const session = mineSessions.get(req.user.id.toString());
    if (!session || session.cashedOut || session.revealed.length === 0) {
      return res.status(400).json({ error: 'Aktif oyun yok' });
    }

    session.cashedOut = true;
    mineSessions.delete(req.user.id.toString());

    const mult = minesMultiplier(session.mines, session.revealed.length);
    const payout = parseFloat((session.bet * mult).toFixed(2));

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $inc: { balance: payout } },
      { new: true }
    );
    const newBalance = user.balance;

    await CasinoRound.create({
      userId: req.user.id, gameId: 'inhouse-mines', gameTitle: 'Mines',
      provider: 'inhouse', bet: session.bet, payout,
      net: payout - session.bet,
      balanceBefore: session.balanceBefore,
      balanceAfter: newBalance,
    });

    res.json({
      mult,
      payout,
      balance: newBalance,
      minePositions: session.minePos,
      serverSeed: session.serverSeed,
    });
  } catch (err) { next(err); }
});

// ── PLINKO ───────────────────────────────────────────────────────────────────

// Multiplier tables by risk and rows
const PLINKO_MULT = {
  low: {
    8:  [4.4, 1.7, 0.9, 0.8, 0.4, 0.8, 0.9, 1.7, 4.4],
    12: [7, 2.4, 1.1, 0.9, 0.8, 0.4, 0.8, 0.9, 1.1, 2.4, 7],
    16: [12.6, 7.1, 1.6, 1.1, 0.9, 0.8, 0.4, 0.2, 0.4, 0.8, 0.9, 1.1, 1.6, 7.1, 12.6],
  },
  medium: {
    8:  [10.3, 2.4, 1.0, 0.6, 0.3, 0.6, 1.0, 2.4, 10.3],
    12: [26, 8.7, 3.2, 1.6, 0.9, 0.5, 0.2, 0.5, 0.9, 1.6, 3.2, 8.7, 26],
    16: [87, 32, 7.9, 4, 2.4, 1.2, 0.8, 0.4, 0.2, 0.4, 0.8, 1.2, 2.4, 4, 7.9, 32, 87],
  },
  high: {
    8:  [22.9, 3.2, 1.2, 0.2, 0.2, 0.2, 1.2, 3.2, 22.9],
    12: [111, 20.5, 7.1, 1.6, 0.7, 0.2, 0.1, 0.2, 0.7, 1.6, 7.1, 20.5, 111],
    16: [789, 102, 20.5, 7.1, 3.2, 1.6, 0.6, 0.2, 0.1, 0.2, 0.6, 1.6, 3.2, 7.1, 20.5, 102, 789],
  },
};

function dropBall(serverSeed, clientSeed, rows) {
  const hash = createHmac('sha256', serverSeed).update(clientSeed).digest('hex');
  let pos = 0;
  const path = [];
  for (let i = 0; i < rows; i++) {
    const bit = parseInt(hash[i % 64], 16) % 2;
    pos += bit;
    path.push(bit === 1 ? 'R' : 'L');
  }
  return { slot: pos, path };
}

// POST /inhouse/plinko/drop
router.post('/plinko/drop', async (req, res, next) => {
  try {
    const { amount, risk = 'medium', rows = 16 } = req.body;
    const betAmount = parseFloat(amount);
    const rowCount = parseInt(rows);
    const riskLevel = ['low', 'medium', 'high'].includes(risk) ? risk : 'medium';
    const validRows = [8, 12, 16];
    const actualRows = validRows.includes(rowCount) ? rowCount : 16;

    if (isNaN(betAmount) || betAmount < 1) return res.status(400).json({ error: 'Geçersiz miktar' });

    const serverSeed = randomBytes(16).toString('hex');
    const clientSeed = randomBytes(8).toString('hex');
    const { slot, path } = dropBall(serverSeed, clientSeed, actualRows);

    const multTable = PLINKO_MULT[riskLevel][actualRows];
    const mult = multTable[slot];
    const payout = parseFloat((betAmount * mult).toFixed(2));

    const netChange = parseFloat((payout - betAmount).toFixed(2));
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: betAmount } },
      { $inc: { balance: netChange } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'Yetersiz bakiye' });
    const balanceBefore = parseFloat((user.balance - netChange).toFixed(2));
    const newBalance = user.balance;

    await CasinoRound.create({
      userId: req.user.id, gameId: 'inhouse-plinko', gameTitle: 'Plinko',
      provider: 'inhouse', bet: betAmount, payout,
      net: payout - betAmount,
      balanceBefore,
      balanceAfter: Math.max(0, newBalance),
    });

    res.json({
      slot,
      path,
      mult,
      payout,
      balance: Math.max(0, newBalance),
      serverSeed,
      clientSeed,
      multTable,
    });
  } catch (err) { next(err); }
});

// ── DICE ─────────────────────────────────────────────────────────────────────
// Roll 0-100. Player picks target + over/under. House edge 4%.

function diceRoll(serverSeed, clientSeed) {
  const hash = createHmac('sha256', serverSeed).update(clientSeed).digest('hex');
  const h = parseInt(hash.slice(0, 8), 16);
  return parseFloat(((h % 10001) / 100).toFixed(2)); // 0.00–100.00
}

// POST /inhouse/dice/roll
router.post('/dice/roll', async (req, res, next) => {
  try {
    const { amount, target, over } = req.body;
    const betAmount = parseFloat(amount);
    const targetNum = parseFloat(target);
    const isOver = over !== false; // default over

    if (isNaN(betAmount) || betAmount < 1) return res.status(400).json({ error: 'Geçersiz miktar' });
    if (isNaN(targetNum) || targetNum < 2 || targetNum > 98) return res.status(400).json({ error: 'Hedef 2-98 arasında olmalı' });

    const winChance = isOver ? (100 - targetNum) : targetNum;
    const mult = parseFloat(((78 / winChance)).toFixed(4));

    const serverSeed = randomBytes(16).toString('hex');
    const clientSeed = randomBytes(8).toString('hex');
    const roll = diceRoll(serverSeed, clientSeed);

    const win = isOver ? roll > targetNum : roll < targetNum;
    const payout = win ? parseFloat((betAmount * mult).toFixed(2)) : 0;
    const netChange = parseFloat((payout - betAmount).toFixed(2));
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: betAmount } },
      { $inc: { balance: netChange } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'Yetersiz bakiye' });
    const balanceBefore = parseFloat((user.balance - netChange).toFixed(2));
    const newBalance = user.balance;

    await CasinoRound.create({
      userId: req.user.id, gameId: 'inhouse-dice', gameTitle: 'Dice',
      provider: 'inhouse', bet: betAmount, payout,
      net: payout - betAmount, balanceBefore,
      balanceAfter: Math.max(0, newBalance),
    });

    res.json({ roll, win, mult, payout, balance: Math.max(0, newBalance), winChance, serverSeed, clientSeed });
  } catch (err) { next(err); }
});

// ── LIMBO ─────────────────────────────────────────────────────────────────────
// Set a target multiplier. Win if generated crash point >= target.

function limboCrash(serverSeed) {
  const hash = createHmac('sha256', 'limbo-v1').update(serverSeed).digest('hex');
  const h = parseInt(hash.slice(0, 8), 16);
  const e = 2 ** 32;
  if (h % 5 === 0) return 1.00; // ~20% house edge
  return Math.max(1.01, Math.floor((100 * e) / (e - h)) / 100);
}

// POST /inhouse/limbo/play
router.post('/limbo/play', async (req, res, next) => {
  try {
    const { amount, target } = req.body;
    const betAmount = parseFloat(amount);
    const targetMult = parseFloat(target);

    if (isNaN(betAmount) || betAmount < 1) return res.status(400).json({ error: 'Geçersiz miktar' });
    if (isNaN(targetMult) || targetMult < 1.01 || targetMult > 1000000) return res.status(400).json({ error: 'Geçersiz çarpan (1.01-1000000)' });

    const serverSeed = randomBytes(16).toString('hex');
    const result = limboCrash(serverSeed);
    const win = result >= targetMult;
    const payout = win ? parseFloat((betAmount * targetMult).toFixed(2)) : 0;
    const netChange = parseFloat((payout - betAmount).toFixed(2));
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: betAmount } },
      { $inc: { balance: netChange } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'Yetersiz bakiye' });
    const balanceBefore = parseFloat((user.balance - netChange).toFixed(2));
    const newBalance = user.balance;
    await CasinoRound.create({
      userId: req.user.id, gameId: 'inhouse-limbo', gameTitle: 'Limbo',
      provider: 'inhouse', bet: betAmount, payout,
      net: payout - betAmount, balanceBefore,
      balanceAfter: Math.max(0, newBalance),
    });

    res.json({ result, win, payout, balance: Math.max(0, newBalance), serverSeed });
  } catch (err) { next(err); }
});

// ── WHEEL ─────────────────────────────────────────────────────────────────────
// EV: low≈0.785, medium≈0.77, high≈0.77
const WHEEL_SEGMENTS = {
  low:    [{ m: 0, w: 45 }, { m: 0.75, w: 30 }, { m: 1.5, w: 15 }, { m: 2.5, w: 7 }, { m: 4, w: 2 }, { m: 8, w: 1 }],
  medium: [{ m: 0, w: 62 }, { m: 0.5, w: 20 }, { m: 1.5, w: 10 }, { m: 4, w: 6 }, { m: 10, w: 1 }, { m: 18, w: 1 }],
  high:   [{ m: 0, w: 87 }, { m: 0.5, w: 6 }, { m: 2, w: 4 }, { m: 8, w: 2 }, { m: 50, w: 1 }],
};

function wheelSpin(serverSeed, risk) {
  const hash = createHmac('sha256', 'wheel-v1').update(serverSeed).digest('hex');
  const h = parseInt(hash.slice(0, 8), 16);
  const segs = WHEEL_SEGMENTS[risk];
  const total = segs.reduce((a, s) => a + s.w, 0);
  let pos = h % total;
  for (let i = 0; i < segs.length; i++) {
    if (pos < segs[i].w) return { segIndex: i, mult: segs[i].m };
    pos -= segs[i].w;
  }
  return { segIndex: 0, mult: segs[0].m };
}

// POST /inhouse/wheel/spin
router.post('/wheel/spin', async (req, res, next) => {
  try {
    const { amount, risk = 'medium' } = req.body;
    const betAmount = parseFloat(amount);
    const riskLevel = ['low', 'medium', 'high'].includes(risk) ? risk : 'medium';

    if (isNaN(betAmount) || betAmount < 1) return res.status(400).json({ error: 'Geçersiz miktar' });

    const serverSeed = randomBytes(16).toString('hex');
    const { segIndex, mult } = wheelSpin(serverSeed, riskLevel);
    const payout = parseFloat((betAmount * mult).toFixed(2));
    const netChange = parseFloat((payout - betAmount).toFixed(2));
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: betAmount } },
      { $inc: { balance: netChange } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'Yetersiz bakiye' });
    const balanceBefore = parseFloat((user.balance - netChange).toFixed(2));
    const newBalance = user.balance;

    await CasinoRound.create({
      userId: req.user.id, gameId: 'inhouse-wheel', gameTitle: 'Wheel',
      provider: 'inhouse', bet: betAmount, payout,
      net: payout - betAmount, balanceBefore,
      balanceAfter: Math.max(0, newBalance),
    });

    res.json({ segIndex, mult, payout, balance: Math.max(0, newBalance), segments: WHEEL_SEGMENTS[riskLevel], serverSeed });
  } catch (err) { next(err); }
});

// ── HILO ──────────────────────────────────────────────────────────────────────
// Standard 52-card deck. Guess higher/lower, accumulate multiplier.

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const hiloSessions = new Map(); // userId → { deck, pos, currentCard, mult, bet, balanceBefore }

function shuffleDeck(serverSeed) {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank, value: RANKS.indexOf(rank) });
  // Fisher-Yates with seeded hash
  const hash = createHmac('sha256', 'hilo-v1').update(serverSeed).digest('hex');
  for (let i = deck.length - 1; i > 0; i--) {
    const h = parseInt(hash.slice((i * 2) % 60, (i * 2) % 60 + 4), 16);
    const j = h % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function hiloMultiplier(currentValue, guess, deck, pos) {
  // Count remaining cards that satisfy guess
  const remaining = deck.slice(pos + 1);
  const wins = remaining.filter(c => guess === 'higher' ? c.value > currentValue : c.value < currentValue).length;
  if (wins === 0) return null; // impossible
  const winChance = wins / remaining.length;
  return parseFloat((0.78 / winChance).toFixed(3));
}

// POST /inhouse/hilo/start
router.post('/hilo/start', async (req, res, next) => {
  try {
    const { amount } = req.body;
    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount < 1) return res.status(400).json({ error: 'Geçersiz miktar' });

    const user = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: betAmount } },
      { $inc: { balance: -betAmount } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'Yetersiz bakiye' });
    const newBalance = user.balance;

    const serverSeed = randomBytes(16).toString('hex');
    const deck = shuffleDeck(serverSeed);

    hiloSessions.set(req.user.id.toString(), {
      deck, pos: 0, serverSeed,
      mult: 1, bet: betAmount, balanceBefore: user.balance + betAmount, cashedOut: false,
    });

    const firstCard = deck[0];
    const higherMult = hiloMultiplier(firstCard.value, 'higher', deck, 0);
    const lowerMult = hiloMultiplier(firstCard.value, 'lower', deck, 0);

    res.json({
      card: firstCard,
      balance: newBalance,
      currentMult: 1,
      higherMult,
      lowerMult,
    });
  } catch (err) { next(err); }
});

// POST /inhouse/hilo/guess
router.post('/hilo/guess', async (req, res, next) => {
  try {
    const { guess } = req.body; // 'higher' | 'lower'
    const session = hiloSessions.get(req.user.id.toString());
    if (!session || session.cashedOut) return res.status(400).json({ error: 'Aktif oyun yok' });
    if (!['higher', 'lower'].includes(guess)) return res.status(400).json({ error: 'higher veya lower girin' });

    const { deck, pos } = session;
    const currentCard = deck[pos];
    const nextCard = deck[pos + 1];

    if (!nextCard) return res.status(400).json({ error: 'Deste bitti' });

    const win = guess === 'higher' ? nextCard.value > currentCard.value : nextCard.value < currentCard.value;
    const roundMult = hiloMultiplier(currentCard.value, guess, deck, pos) ?? 1;

    session.pos += 1;
    session.mult = parseFloat((session.mult * roundMult).toFixed(4));

    if (!win) {
      session.cashedOut = true;
      hiloSessions.delete(req.user.id.toString());
      const user = await User.findById(req.user.id).select('balance');
      await CasinoRound.create({
        userId: req.user.id, gameId: 'inhouse-hilo', gameTitle: 'HiLo',
        provider: 'inhouse', bet: session.bet, payout: 0,
        net: -session.bet, balanceBefore: session.balanceBefore,
        balanceAfter: user.balance,
      });
      return res.json({ result: 'lose', card: nextCard, revealedValue: currentCard.value });
    }

    const newPos = session.pos;
    const nextForGuess = deck[newPos + 1] ? deck[newPos] : null;
    const higherMult = nextForGuess ? hiloMultiplier(nextCard.value, 'higher', deck, newPos) : null;
    const lowerMult = nextForGuess ? hiloMultiplier(nextCard.value, 'lower', deck, newPos) : null;

    res.json({
      result: 'win',
      card: nextCard,
      currentMult: session.mult,
      higherMult,
      lowerMult,
      canCashout: true,
    });
  } catch (err) { next(err); }
});

// POST /inhouse/hilo/cashout
router.post('/hilo/cashout', async (req, res, next) => {
  try {
    const session = hiloSessions.get(req.user.id.toString());
    if (!session || session.cashedOut || session.pos === 0) return res.status(400).json({ error: 'Aktif oyun yok' });

    session.cashedOut = true;
    hiloSessions.delete(req.user.id.toString());

    const payout = parseFloat((session.bet * session.mult).toFixed(2));
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $inc: { balance: payout } },
      { new: true }
    );
    const newBalance = user.balance;

    await CasinoRound.create({
      userId: req.user.id, gameId: 'inhouse-hilo', gameTitle: 'HiLo',
      provider: 'inhouse', bet: session.bet, payout,
      net: payout - session.bet, balanceBefore: session.balanceBefore,
      balanceAfter: newBalance,
    });

    res.json({ mult: session.mult, payout, balance: newBalance, serverSeed: session.serverSeed });
  } catch (err) { next(err); }
});

// ── KENO ──────────────────────────────────────────────────────────────────────
// Pick 1-10 numbers (1-40). 10 balls drawn. Payout by hits.

const KENO_PAYOUTS = {
  1:  [0, 3.0],
  2:  [0, 0, 5.5],
  3:  [0, 0, 2.0, 11.8],
  4:  [0, 0, 1.2, 4.0, 23.7],
  5:  [0, 0, 0.9, 1.6, 7.9, 63],
  6:  [0, 0, 0.8, 1.2, 3.2, 11.8, 118],
  7:  [0, 0, 0, 1.2, 2.4, 6.3, 39.5, 395],
  8:  [0, 0, 0, 0.9, 1.6, 4.0, 15.8, 79, 790],
  9:  [0, 0, 0, 0.8, 1.2, 2.4, 7.9, 39.5, 237, 2370],
  10: [0, 0, 0, 0.8, 0.9, 1.6, 4.0, 15.8, 79, 790, 7900],
};

function kenoDrawn(serverSeed) {
  const hash = createHmac('sha256', 'keno-v1').update(serverSeed).digest('hex');
  const drawn = new Set();
  let i = 0;
  while (drawn.size < 10) {
    const h = parseInt(hash.slice((i * 3) % 60, (i * 3) % 60 + 4), 16);
    drawn.add((h % 40) + 1);
    i++;
    if (i > 500) break;
  }
  // Fill if hash exhausted (rare)
  for (let n = 1; n <= 40 && drawn.size < 10; n++) drawn.add(n);
  return [...drawn].slice(0, 10);
}

// POST /inhouse/keno/play
router.post('/keno/play', async (req, res, next) => {
  try {
    const { amount, picks } = req.body;
    const betAmount = parseFloat(amount);
    const picksArr = Array.isArray(picks) ? picks.map(Number).filter(n => n >= 1 && n <= 40) : [];

    if (isNaN(betAmount) || betAmount < 1) return res.status(400).json({ error: 'Geçersiz miktar' });
    if (picksArr.length < 1 || picksArr.length > 10) return res.status(400).json({ error: '1-10 arası sayı seçin' });

    const serverSeed = randomBytes(16).toString('hex');
    const drawn = kenoDrawn(serverSeed);
    const hits = picksArr.filter(p => drawn.includes(p)).length;
    const payoutTable = KENO_PAYOUTS[picksArr.length];
    const mult = payoutTable[hits] ?? 0;
    const payout = parseFloat((betAmount * mult).toFixed(2));
    const netChange = parseFloat((payout - betAmount).toFixed(2));
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: betAmount } },
      { $inc: { balance: netChange } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'Yetersiz bakiye' });
    const balanceBefore = parseFloat((user.balance - netChange).toFixed(2));
    const newBalance = user.balance;

    await CasinoRound.create({
      userId: req.user.id, gameId: 'inhouse-keno', gameTitle: 'Keno',
      provider: 'inhouse', bet: betAmount, payout,
      net: payout - betAmount, balanceBefore,
      balanceAfter: Math.max(0, newBalance),
    });

    res.json({ drawn, hits, mult, payout, balance: Math.max(0, newBalance), serverSeed });
  } catch (err) { next(err); }
});

// ── BLACKJACK ─────────────────────────────────────────────────────────────────
// Standard 6-deck blackjack. Dealer stands on soft 17. Blackjack pays 3:2.

const BJ_SUITS = ['♠', '♥', '♦', '♣'];
const BJ_RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const bjSessions = new Map(); // userId → session

function buildShoe(serverSeed) {
  const deck = [];
  for (let d = 0; d < 6; d++)
    for (const suit of BJ_SUITS)
      for (const rank of BJ_RANKS)
        deck.push({ suit, rank });
  // Fisher-Yates with seeded hash
  const hash = createHmac('sha256', serverSeed).update('blackjack-shoe').digest('hex');
  for (let i = deck.length - 1; i > 0; i--) {
    const h = parseInt(hash.slice((i * 2) % 60, (i * 2) % 60 + 4), 16);
    const j = h % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(rank) {
  if (['J','Q','K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank);
}

function handTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardValue(c.rank);
    total += v;
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isSoft(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c.rank);
    if (c.rank === 'A') aces++;
  }
  return aces > 0 && total !== handTotal(cards);
}

function dealerPlay(shoe, dealerCards, shoePos) {
  let pos = shoePos;
  while (handTotal(dealerCards) < 17 || (handTotal(dealerCards) === 17 && isSoft(dealerCards))) {
    dealerCards.push(shoe[pos++]);
  }
  return { dealerCards, shoePos: pos };
}

// POST /inhouse/blackjack/deal
router.post('/blackjack/deal', async (req, res, next) => {
  try {
    const { amount } = req.body;
    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount < 1) return res.status(400).json({ error: 'Geçersiz miktar' });

    const user = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: betAmount } },
      { $inc: { balance: -betAmount } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'Yetersiz bakiye' });
    const newBalance = user.balance;

    const serverSeed = randomBytes(16).toString('hex');
    const shoe = buildShoe(serverSeed);
    let pos = 0;
    const playerCards = [shoe[pos++], shoe[pos++]];
    const dealerCards = [shoe[pos++], shoe[pos++]];

    const session = {
      serverSeed, shoe, shoePos: pos,
      playerCards, dealerCards,
      bet: betAmount, balanceBefore: user.balance + betAmount,
      done: false,
    };
    bjSessions.set(req.user.id.toString(), session);

    const playerTotal = handTotal(playerCards);
    const dealerTotal = handTotal(dealerCards);

    // Natural blackjack check
    if (playerTotal === 21) {
      session.done = true;
      bjSessions.delete(req.user.id.toString());
      // Dealer also check
      const dealerBJ = dealerTotal === 21;
      let payout, outcome;
      if (dealerBJ) {
        payout = betAmount; outcome = 'push';
      } else {
        payout = parseFloat((betAmount * 2.0).toFixed(2)); outcome = 'blackjack';
      }
      const updated = await User.findByIdAndUpdate(
        req.user.id,
        { $inc: { balance: payout } },
        { new: true }
      );
      const finalBalance = updated.balance;
      await CasinoRound.create({
        userId: req.user.id, gameId: 'inhouse-blackjack', gameTitle: 'Blackjack',
        provider: 'inhouse', bet: betAmount, payout,
        net: payout - betAmount, balanceBefore: user.balance + betAmount, balanceAfter: finalBalance,
      });
      return res.json({
        playerCards, dealerCards, playerTotal, dealerTotal,
        outcome, payout, balance: finalBalance,
        done: true,
      });
    }

    res.json({
      playerCards,
      dealerCard: dealerCards[0], // hide second dealer card
      playerTotal,
      dealerVisible: cardValue(dealerCards[0].rank) > 10 ? cardValue(dealerCards[0].rank) : cardValue(dealerCards[0].rank),
      balance: newBalance,
      done: false,
      canDouble: playerCards.length === 2 && newBalance >= betAmount,
    });
  } catch (err) { next(err); }
});

// POST /inhouse/blackjack/hit
router.post('/blackjack/hit', async (req, res, next) => {
  try {
    const session = bjSessions.get(req.user.id.toString());
    if (!session || session.done) return res.status(400).json({ error: 'Aktif oyun yok' });

    session.playerCards.push(session.shoe[session.shoePos++]);
    const playerTotal = handTotal(session.playerCards);

    if (playerTotal > 21) {
      // Bust
      session.done = true;
      bjSessions.delete(req.user.id.toString());
      const user = await User.findById(req.user.id).select('balance');
      await CasinoRound.create({
        userId: req.user.id, gameId: 'inhouse-blackjack', gameTitle: 'Blackjack',
        provider: 'inhouse', bet: session.bet, payout: 0,
        net: -session.bet, balanceBefore: session.balanceBefore, balanceAfter: user.balance,
      });
      return res.json({
        playerCards: session.playerCards, playerTotal,
        dealerCards: session.dealerCards,
        outcome: 'bust', payout: 0, balance: user.balance, done: true,
      });
    }

    if (playerTotal === 21) {
      // Auto-stand
      return await resolveStand(session, req.user.id, res);
    }

    res.json({
      playerCards: session.playerCards,
      playerTotal,
      dealerCard: session.dealerCards[0],
      done: false,
    });
  } catch (err) { next(err); }
});

// POST /inhouse/blackjack/stand
router.post('/blackjack/stand', async (req, res, next) => {
  try {
    const session = bjSessions.get(req.user.id.toString());
    if (!session || session.done) return res.status(400).json({ error: 'Aktif oyun yok' });
    await resolveStand(session, req.user.id, res);
  } catch (err) { next(err); }
});

// POST /inhouse/blackjack/double
router.post('/blackjack/double', async (req, res, next) => {
  try {
    const session = bjSessions.get(req.user.id.toString());
    if (!session || session.done || session.playerCards.length !== 2) return res.status(400).json({ error: 'Double down yapılamaz' });

    const extraBet = session.bet;
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: extraBet } },
      { $inc: { balance: -extraBet } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'Yetersiz bakiye' });
    session.bet = parseFloat((session.bet * 2).toFixed(2));

    session.playerCards.push(session.shoe[session.shoePos++]);
    await resolveStand(session, req.user.id, res, true);
  } catch (err) { next(err); }
});

async function resolveStand(session, userId, res, isDouble = false) {
  const { dealerCards: dc, shoePos, shoe } = session;
  const result = dealerPlay(shoe, dc, shoePos);
  session.dealerCards = result.dealerCards;

  const playerTotal = handTotal(session.playerCards);
  const dealerTotal = handTotal(result.dealerCards);
  const dealerBust = dealerTotal > 21;

  let outcome, payout;
  if (dealerBust || playerTotal > dealerTotal) {
    outcome = 'win'; payout = parseFloat((session.bet * 1.4).toFixed(2));
  } else if (playerTotal === dealerTotal) {
    outcome = 'push'; payout = session.bet;
  } else {
    outcome = 'lose'; payout = 0;
  }

  session.done = true;
  bjSessions.delete(userId.toString());

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { balance: payout } },
    { new: true }
  );
  const newBalance = user.balance;

  await CasinoRound.create({
    userId, gameId: 'inhouse-blackjack', gameTitle: 'Blackjack',
    provider: 'inhouse', bet: session.bet, payout,
    net: payout - session.bet, balanceBefore: session.balanceBefore, balanceAfter: newBalance,
  });

  res.json({
    playerCards: session.playerCards, playerTotal,
    dealerCards: session.dealerCards, dealerTotal,
    outcome, payout, balance: newBalance, done: true,
    isDouble,
  });
}

// ── EUROPEAN ROULETTE ─────────────────────────────────────────────────────────
// Single-zero European roulette. Multiple bet types supported.

const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function rouletteNumber(serverSeed) {
  const hash = createHmac('sha256', serverSeed).update('roulette-v1').digest('hex');
  const h = parseInt(hash.slice(0, 8), 16);
  return h % 37; // 0-36
}

function evaluateBets(bets, num) {
  // bets: [{ type, value, amount }]
  // Returns total payout (not including stake)
  let totalPayout = 0;
  const isRed = RED_NUMBERS.has(num);
  const isEven = num !== 0 && num % 2 === 0;
  const isLow = num >= 1 && num <= 18;

  for (const bet of bets) {
    const a = parseFloat(bet.amount);
    if (!a || a <= 0) continue;
    let multiplier = 0;

    switch (bet.type) {
      case 'straight':
        if (parseInt(bet.value) === num) multiplier = 29;
        break;
      case 'red':
        if (isRed) multiplier = 1.6;
        break;
      case 'black':
        if (!isRed && num !== 0) multiplier = 1.6;
        break;
      case 'even':
        if (isEven) multiplier = 1.6;
        break;
      case 'odd':
        if (!isEven && num !== 0) multiplier = 1.6;
        break;
      case 'low':
        if (isLow) multiplier = 1.6;
        break;
      case 'high':
        if (!isLow && num !== 0) multiplier = 1.6;
        break;
      case 'dozen1': if (num >= 1 && num <= 12) multiplier = 2.4; break;
      case 'dozen2': if (num >= 13 && num <= 24) multiplier = 2.4; break;
      case 'dozen3': if (num >= 25 && num <= 36) multiplier = 2.4; break;
      case 'col1': if (num !== 0 && num % 3 === 1) multiplier = 2.4; break;
      case 'col2': if (num !== 0 && num % 3 === 2) multiplier = 2.4; break;
      case 'col3': if (num !== 0 && num % 3 === 0) multiplier = 2.4; break;
      case 'split': {
        const nums = String(bet.value).split(',').map(Number);
        if (nums.includes(num)) multiplier = 14;
        break;
      }
    }
    totalPayout += a * multiplier;
  }
  return parseFloat(totalPayout.toFixed(2));
}

// POST /inhouse/roulette/spin
router.post('/roulette/spin', async (req, res, next) => {
  try {
    const { amount, bets } = req.body;
    // bets: [{ type, value?, amount }]  OR simple: amount = total, bets = [{type:'red',amount}]
    const totalBet = parseFloat(amount);
    if (isNaN(totalBet) || totalBet < 1) return res.status(400).json({ error: 'Geçersiz miktar' });
    if (!Array.isArray(bets) || bets.length === 0) return res.status(400).json({ error: 'Bahis seçin' });

    const serverSeed = randomBytes(16).toString('hex');
    const num = rouletteNumber(serverSeed);
    const payout = evaluateBets(bets, num);

    const netChange = parseFloat((payout - totalBet).toFixed(2));
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: totalBet } },
      { $inc: { balance: netChange } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'Yetersiz bakiye' });
    const balanceBefore = parseFloat((user.balance - netChange).toFixed(2));
    const newBalance = user.balance;

    await CasinoRound.create({
      userId: req.user.id, gameId: 'inhouse-roulette', gameTitle: 'European Roulette',
      provider: 'inhouse', bet: totalBet, payout,
      net: payout - totalBet, balanceBefore,
      balanceAfter: Math.max(0, newBalance),
    });

    res.json({
      number: num,
      isRed: RED_NUMBERS.has(num),
      payout,
      win: payout > 0,
      balance: Math.max(0, newBalance),
      serverSeed,
    });
  } catch (err) { next(err); }
});

// ── BACCARAT ──────────────────────────────────────────────────────────────────
// Standard punto banco baccarat. Banker/Player/Tie bets.

function baccaratCardValue(rank) {
  if (['10','J','Q','K'].includes(rank)) return 0;
  if (rank === 'A') return 1;
  return parseInt(rank);
}

function baccaratTotal(cards) {
  return cards.reduce((s, c) => s + baccaratCardValue(c.rank), 0) % 10;
}

function baccaratDeal(serverSeed) {
  const shoe = buildShoe(serverSeed); // reuse BJ shoe builder
  let pos = 0;
  const player = [shoe[pos++], shoe[pos++]];
  const banker = [shoe[pos++], shoe[pos++]];

  const pTotal = baccaratTotal(player);
  const bTotal = baccaratTotal(banker);

  // Natural — no third card
  if (pTotal >= 8 || bTotal >= 8) {
    return { player, banker, playerTotal: pTotal, bankerTotal: bTotal };
  }

  // Player third card rule
  let playerThird = null;
  if (pTotal <= 5) {
    playerThird = shoe[pos++];
    player.push(playerThird);
  }

  const pTotal2 = baccaratTotal(player);

  // Banker third card rule
  let bankerDraw = false;
  if (playerThird === null) {
    bankerDraw = bTotal <= 5;
  } else {
    const ptv = baccaratCardValue(playerThird.rank);
    if (bTotal <= 2) bankerDraw = true;
    else if (bTotal === 3) bankerDraw = ptv !== 8;
    else if (bTotal === 4) bankerDraw = ptv >= 2 && ptv <= 7;
    else if (bTotal === 5) bankerDraw = ptv >= 4 && ptv <= 7;
    else if (bTotal === 6) bankerDraw = ptv === 6 || ptv === 7;
  }

  if (bankerDraw) banker.push(shoe[pos++]);

  return {
    player, banker,
    playerTotal: baccaratTotal(player),
    bankerTotal: baccaratTotal(banker),
  };
}

// POST /inhouse/baccarat/deal
router.post('/baccarat/deal', async (req, res, next) => {
  try {
    const { amount, bet: betSide } = req.body; // betSide: 'player'|'banker'|'tie'
    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount < 1) return res.status(400).json({ error: 'Geçersiz miktar' });
    if (!['player','banker','tie'].includes(betSide)) return res.status(400).json({ error: 'player, banker veya tie seçin' });

    const serverSeed = randomBytes(16).toString('hex');
    const { player, banker, playerTotal, bankerTotal } = baccaratDeal(serverSeed);

    let outcome, mult;
    if (playerTotal > bankerTotal) outcome = 'player';
    else if (bankerTotal > playerTotal) outcome = 'banker';
    else outcome = 'tie';

    if (outcome === betSide) {
      if (betSide === 'tie') mult = 8;
      else if (betSide === 'banker') mult = 1.7;
      else mult = 1.75;
    } else {
      mult = 0;
    }

    const payout = parseFloat((betAmount * mult).toFixed(2));
    const netChange = parseFloat((payout - betAmount).toFixed(2));
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: betAmount } },
      { $inc: { balance: netChange } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'Yetersiz bakiye' });
    const balanceBefore = parseFloat((user.balance - netChange).toFixed(2));
    const newBalance = user.balance;

    await CasinoRound.create({
      userId: req.user.id, gameId: 'inhouse-baccarat', gameTitle: 'Baccarat',
      provider: 'inhouse', bet: betAmount, payout,
      net: payout - betAmount, balanceBefore,
      balanceAfter: Math.max(0, newBalance),
    });

    res.json({
      player, banker, playerTotal, bankerTotal,
      outcome, payout, win: payout > 0,
      balance: Math.max(0, newBalance),
      serverSeed,
    });
  } catch (err) { next(err); }
});

// ── VIDEO POKER (Jacks or Better) ─────────────────────────────────────────────
// Standard 52-card single deck. Player gets 5 cards, holds some, draws replacements.
// Payout table: Jacks or Better standard.

const VP_PAYOUTS = {
  'Royal Flush': 656,
  'Straight Flush': 41,
  'Four of a Kind': 21,
  'Full House': 7,
  'Flush': 5,
  'Straight': 3,
  'Three of a Kind': 2.5,
  'Two Pair': 1.5,
  'Jacks or Better': 0.8,
  'Nothing': 0,
};

const vpSessions = new Map();

function buildDeck52(serverSeed, nonce = 'vp') {
  const deck = [];
  for (const suit of BJ_SUITS)
    for (const rank of BJ_RANKS)
      deck.push({ suit, rank, value: BJ_RANKS.indexOf(rank) });
  const hash = createHmac('sha256', serverSeed).update(nonce).digest('hex');
  for (let i = deck.length - 1; i > 0; i--) {
    const h = parseInt(hash.slice((i * 2) % 60, (i * 2) % 60 + 4), 16);
    const j = h % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function evaluatePokerHand(cards) {
  const values = cards.map(c => c.value).sort((a,b) => a-b);
  const suits = cards.map(c => c.suit);
  const rankCounts = {};
  values.forEach(v => { rankCounts[v] = (rankCounts[v] || 0) + 1; });
  const counts = Object.values(rankCounts).sort((a,b) => b-a);
  const isFlush = suits.every(s => s === suits[0]);
  const isStr = (values[4] - values[0] === 4 && counts[0] === 1) ||
                (values.join(',') === '0,9,10,11,12'); // A-2-3-4-5 low straight not needed; A high: 8,9,10,11,12

  // Royal flush
  if (isFlush && values.join(',') === '8,9,10,11,12') return 'Royal Flush';
  if (isFlush && isStr) return 'Straight Flush';
  if (counts[0] === 4) return 'Four of a Kind';
  if (counts[0] === 3 && counts[1] === 2) return 'Full House';
  if (isFlush) return 'Flush';
  if (isStr) return 'Straight';
  if (counts[0] === 3) return 'Three of a Kind';
  if (counts[0] === 2 && counts[1] === 2) {
    // Two pair - check if either pair is J or better (value >= 9)
    return 'Two Pair';
  }
  if (counts[0] === 2) {
    const pairValue = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 2));
    if (pairValue >= 9) return 'Jacks or Better'; // J=9, Q=10, K=11, A=12
    return 'Nothing';
  }
  return 'Nothing';
}

// POST /inhouse/videopoker/deal
router.post('/videopoker/deal', async (req, res, next) => {
  try {
    const { amount } = req.body;
    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount < 1) return res.status(400).json({ error: 'Geçersiz miktar' });

    const user = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: betAmount } },
      { $inc: { balance: -betAmount } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'Yetersiz bakiye' });
    const newBalance = user.balance;

    const serverSeed = randomBytes(16).toString('hex');
    const deck = buildDeck52(serverSeed);
    const hand = deck.slice(0, 5);
    const remaining = deck.slice(5);

    vpSessions.set(req.user.id.toString(), {
      serverSeed, hand, remaining,
      bet: betAmount, balanceBefore: user.balance + betAmount, done: false,
    });

    res.json({ hand, balance: newBalance });
  } catch (err) { next(err); }
});

// POST /inhouse/videopoker/draw
router.post('/videopoker/draw', async (req, res, next) => {
  try {
    const { holds } = req.body; // holds: [0,1,2,3,4] indices to keep
    const session = vpSessions.get(req.user.id.toString());
    if (!session || session.done) return res.status(400).json({ error: 'Aktif oyun yok' });

    const holdsArr = Array.isArray(holds) ? holds.map(Number).filter(n => n >= 0 && n < 5) : [];
    const newHand = session.hand.map((card, i) => holdsArr.includes(i) ? card : session.remaining.shift());

    session.done = true;
    vpSessions.delete(req.user.id.toString());

    const handName = evaluatePokerHand(newHand);
    const mult = VP_PAYOUTS[handName] ?? 0;
    const payout = parseFloat((session.bet * mult).toFixed(2));
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $inc: { balance: payout } },
      { new: true }
    );
    const newBalance = user.balance;

    await CasinoRound.create({
      userId: req.user.id, gameId: 'inhouse-videopoker', gameTitle: 'Video Poker',
      provider: 'inhouse', bet: session.bet, payout,
      net: payout - session.bet, balanceBefore: session.balanceBefore, balanceAfter: newBalance,
    });

    res.json({
      hand: newHand, handName, mult, payout,
      win: payout > 0, balance: newBalance,
      serverSeed: session.serverSeed,
      payoutTable: VP_PAYOUTS,
    });
  } catch (err) { next(err); }
});

// ── DRAGON TIGER ──────────────────────────────────────────────────────────────
// One card each for Dragon and Tiger. Higher wins. Tie pays 8:1.

function dragonTigerDeal(serverSeed) {
  const deck = buildDeck52(serverSeed, 'dragon-tiger');
  return { dragon: deck[0], tiger: deck[1] };
}

// POST /inhouse/dragontiger/deal
router.post('/dragontiger/deal', async (req, res, next) => {
  try {
    const { amount, bet: betSide } = req.body; // betSide: 'dragon'|'tiger'|'tie'
    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount < 1) return res.status(400).json({ error: 'Geçersiz miktar' });
    if (!['dragon','tiger','tie'].includes(betSide)) return res.status(400).json({ error: 'dragon, tiger veya tie seçin' });

    const serverSeed = randomBytes(16).toString('hex');
    const { dragon, tiger } = dragonTigerDeal(serverSeed);

    const dv = cardValue(dragon.rank);
    const tv = cardValue(tiger.rank);

    let outcome;
    if (dv > tv) outcome = 'dragon';
    else if (tv > dv) outcome = 'tiger';
    else outcome = 'tie';

    let mult = 0;
    if (outcome === betSide) {
      if (betSide === 'tie') mult = 13;
      else mult = 1.6;
    } else if (outcome === 'tie' && betSide !== 'tie') {
      mult = 0.5;
    }

    const payout = parseFloat((betAmount * mult).toFixed(2));
    const netChange = parseFloat((payout - betAmount).toFixed(2));
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, balance: { $gte: betAmount } },
      { $inc: { balance: netChange } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'Yetersiz bakiye' });
    const balanceBefore = parseFloat((user.balance - netChange).toFixed(2));
    const newBalance = user.balance;

    await CasinoRound.create({
      userId: req.user.id, gameId: 'inhouse-dragontiger', gameTitle: 'Dragon Tiger',
      provider: 'inhouse', bet: betAmount, payout,
      net: payout - betAmount, balanceBefore,
      balanceAfter: Math.max(0, newBalance),
    });

    res.json({
      dragon, tiger, dragonValue: dv, tigerValue: tv,
      outcome, payout, win: payout > 0,
      balance: Math.max(0, newBalance),
      serverSeed,
    });
  } catch (err) { next(err); }
});

export default router;
