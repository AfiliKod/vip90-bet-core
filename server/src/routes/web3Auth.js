import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { walletNonceSchema, walletAuthSchema } from '../validators/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { guestOnly } from '../middleware/guestOnly.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  setAuthNonce, generateAuthMessage,
  authenticateWithWallet, linkWalletToUser, unlinkWallet,
} from '../services/web3Auth.js';
import {
  signRefresh, setRefreshCookie, enrichWithPalaceBalance, enrichWithLockedBalance,
} from '../controllers/auth.js';
import { getSiteName } from '../branding/index.js';

const r = Router();
const testMode = process.env.NODE_ENV === 'test' || process.env.E2E_TEST === 'true';
const conditionalAuthLimiter = testMode ? (req, res, next) => next() : authLimiter;

// POST /api/auth/wallet/nonce — hem giriş hem hesaba bağlama için kullanılır,
// bu yüzden auth gerektirmez.
r.post('/nonce', conditionalAuthLimiter, validate(walletNonceSchema), async (req, res) => {
  const nonce = setAuthNonce(req.validated.address);
  res.json({ message: generateAuthMessage(nonce, await getSiteName()) });
});

// POST /api/auth/wallet/login — cüzdanla giriş (yeni kullanıcı ise otomatik oluşturur)
r.post('/login', guestOnly, conditionalAuthLimiter, validate(walletAuthSchema), async (req, res, next) => {
  try {
    const { address, signature, message, walletType, chainId } = req.validated;
    const { user, accessToken, refreshToken } = await authenticateWithWallet({
      address, signature, message, options: { walletType, chainId },
    });
    setRefreshCookie(res, refreshToken);
    const obj = user.toSafeObject();
    await enrichWithPalaceBalance(user, obj);
    await enrichWithLockedBalance(user, obj);
    res.json({ accessToken, user: obj });
  } catch (e) { next(e); }
});

// POST /api/auth/wallet/link — mevcut hesaba cüzdan bağla
r.post('/link', requireAuth, validate(walletAuthSchema), async (req, res, next) => {
  try {
    const { address, signature, message, walletType, chainId } = req.validated;
    const user = await linkWalletToUser({
      userId: req.user.id, address, signature, message, options: { walletType, chainId },
    });
    res.json({ user });
  } catch (e) { next(e); }
});

// DELETE /api/auth/wallet — cüzdan bağını kaldır
r.delete('/', requireAuth, async (req, res, next) => {
  try {
    const user = await unlinkWallet(req.user.id);
    res.json({ user });
  } catch (e) { next(e); }
});

export default r;
