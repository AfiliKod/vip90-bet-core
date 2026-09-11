import crypto from 'crypto';
import { ethers } from 'ethers';
import User from '../models/User.js';
import { createError } from '../middleware/error.js';
import { signAccess, signRefresh } from '../controllers/auth.js';

/**
 * EVM wallet signature verification and authentication service
 */

/**
 * Recover Ethereum address from signed message
 * @param {string} message - The message that was signed
 * @param {string} signature - The signature (hex string, can include 0x prefix)
 * @returns {string} Recovered address (lowercase, checksum)
 */
export async function recoverAddress(message, signature) {
  // Normalize signature
  let sig = signature.startsWith('0x') ? signature.slice(2) : signature;
  
  // Ensure signature is 65 bytes (130 hex chars)
  if (sig.length !== 130) {
    throw new Error('Invalid signature length');
  }
  
  // Use ethers.js for signature recovery - it handles everything internally
  const recoveredAddress = ethers.verifyMessage(message, signature);
  return recoveredAddress.toLowerCase();
}

/**
 * Generate authentication message for wallet signing
 * @param {string} nonce - Unique nonce for this auth attempt
 * @returns {string} Message to sign
 */
export function generateAuthMessage(nonce, siteName = 'VIP90.bet') {
  return `${siteName} Girişi\n\nNonce: ${nonce}\nTimestamp: ${Date.now()}\n\nBu mesajı imzalayarak kimliğinizi doğruluyorsunuz.`;
}

/**
 * Store nonce for wallet authentication
 * In production, this should be in Redis with TTL
 */
const nonceStore = new Map(); // address -> { nonce, expiresAt }

export function setAuthNonce(address) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const normalized = address.toLowerCase();
  nonceStore.set(normalized, {
    nonce,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  });
  return nonce;
}

export function getAuthNonce(address) {
  const normalized = address.toLowerCase();
  const entry = nonceStore.get(normalized);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    nonceStore.delete(normalized);
    return null;
  }
  return entry.nonce;
}

export function consumeAuthNonce(address) {
  const normalized = address.toLowerCase();
  const entry = nonceStore.get(normalized);
  if (entry) nonceStore.delete(normalized);
  return entry?.nonce || null;
}

/**
 * Authenticate user with wallet signature
 * @param {Object} params
 * @param {string} params.address - Wallet address (lowercase)
 * @param {string} params.signature - Signed message signature
 * @param {string} params.message - Original message that was signed
 * @param {Object} params.options - { session, walletType, chainId }
 * @returns {Object} { user, accessToken, isNewUser }
 */
export async function authenticateWithWallet({ address, signature, message, options = {} }) {
  const { session = null, walletType = 'unknown', chainId = 1 } = options;
  
  const normalizedAddress = address.toLowerCase();
  
  // Verify signature
  const recoveredAddress = await recoverAddress(message, signature);
  if (recoveredAddress.toLowerCase() !== normalizedAddress) {
    throw createError(401, 'INVALID_SIGNATURE', 'İmza doğrulanamadı');
  }
  
  // Verify nonce was used (prevent replay attacks)
  const expectedNonce = getAuthNonce(normalizedAddress);
  if (!expectedNonce || !message.includes(`Nonce: ${expectedNonce}`)) {
    throw createError(401, 'INVALID_NONCE', 'Geçersiz veya süresi dolmuş nonce');
  }
  
  // Consume nonce (single use)
  consumeAuthNonce(normalizedAddress);
  
  // Find or create user
  let user = await User.findOne({ walletAddress: normalizedAddress }).session(session);
  let isNewUser = false;
  
  if (!user) {
    // Create new user with wallet
    const username = `web3_${normalizedAddress.slice(2, 10)}`;
    // DÜZELTME: User.create(docs, options) docs bir array verildiğinde HER ZAMAN
    // bir array döner (session null olsa bile) — önceden `user` bu array'in
    // kendisiydi, `.toSafeObject()`/`.walletAddress` vb. hep undefined dönerdi.
    // Bu, hiçbir route bu fonksiyonu çağırmadığı için (izole kod) fark
    // edilmemişti; P6'nın gerçek mutlu-yol testiyle ortaya çıktı.
    const [created] = await User.create([{
      username,
      email: `${normalizedAddress}@web3.vip90.local`, // Synthetic email
      password: crypto.randomBytes(32).toString('hex'), // Random password, wallet auth only
      walletAddress: normalizedAddress,
      walletType,
      walletConnectedAt: new Date(),
      walletChainId: chainId,
      emailVerified: true, // Wallet auth bypasses email verification
    }], { session });
    user = created;
    isNewUser = true;
  } else {
    // Update wallet info if changed
    if (user.walletType !== walletType) user.walletType = walletType;
    if (user.walletChainId !== chainId) user.walletChainId = chainId;
    user.walletConnectedAt = new Date();
    await user.save({ session });
  }
  
  // Generate tokens — P6 düzeltmesi: önceden yalnızca accessToken
  // dönüyordu, refreshToken hiç üretilmiyordu (normal login/sosyal giriş
  // ile tutarsızlık — cüzdanla giren kullanıcı access token süresi (15dk)
  // dolunca sessizce çıkışa düşerdi).
  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);

  return { user, accessToken, refreshToken, isNewUser };
}

/**
 * Link wallet to existing user account
 * @param {Object} params
 * @param {string} params.userId - Existing user ID
 * @param {string} params.address - Wallet address
 * @param {string} params.signature - Signed message
 * @param {string} params.message - Original message
 * @param {Object} params.options - { session, walletType, chainId }
 */
export async function linkWalletToUser({ userId, address, signature, message, options = {} }) {
  const { session = null, walletType = 'unknown', chainId = 1 } = options;
  
  const normalizedAddress = address.toLowerCase();
  
  // Check if wallet already linked to another user
  const existingUser = await User.findOne({ walletAddress: normalizedAddress }).session(session);
  if (existingUser && !existingUser._id.equals(userId)) {
    throw createError(409, 'WALLET_ALREADY_LINKED', 'Bu cüzdan zaten başka bir hesaba bağlı');
  }
  
  // Verify signature
  const recoveredAddress = await recoverAddress(message, signature);
  if (recoveredAddress.toLowerCase() !== normalizedAddress) {
    throw createError(401, 'INVALID_SIGNATURE', 'İmza doğrulanamadı');
  }
  
  const expectedNonce = getAuthNonce(normalizedAddress);
  if (!expectedNonce || !message.includes(`Nonce: ${expectedNonce}`)) {
    throw createError(401, 'INVALID_NONCE', 'Geçersiz veya süresi dolmuş nonce');
  }
  consumeAuthNonce(normalizedAddress);
  
  // Link wallet
  const user = await User.findByIdAndUpdate(userId, {
    walletAddress: normalizedAddress,
    walletType,
    walletConnectedAt: new Date(),
    walletChainId: chainId,
  }, { new: true, session }).select('-password');
  
  if (!user) throw createError(404, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı');
  
  return user;
}

/**
 * Unlink wallet from user
 */
export async function unlinkWallet(userId, options = {}) {
  const { session = null } = options;
  
  const user = await User.findByIdAndUpdate(userId, {
    walletAddress: null,
    walletType: null,
    walletConnectedAt: null,
    walletChainId: null,
  }, { new: true, session }).select('-password');
  
  if (!user) throw createError(404, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı');
  
  return user;
}

/**
 * Get user by wallet address
 */
export async function getUserByWallet(address) {
  const normalized = address.toLowerCase();
  return User.findOne({ walletAddress: normalized }).select('-password');
}

/**
 * Check if wallet is linked to a user
 */
export async function isWalletLinked(address) {
  const normalized = address.toLowerCase();
  const user = await User.findOne({ walletAddress: normalized }).select('_id');
  return !!user;
}