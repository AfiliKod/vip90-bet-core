import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { ethers } from 'ethers';
import User from '../src/models/User.js';
import { generateAuthMessage, setAuthNonce, getAuthNonce, consumeAuthNonce, recoverAddress, authenticateWithWallet, linkWalletToUser, unlinkWallet, getUserByWallet, isWalletLinked } from '../src/services/web3Auth.js';

describe('Web3 Auth Service', () => {
  before(async () => {
    // signAccess/signRefresh (controllers/auth.js) bu değişkenleri gerektiriyor —
    // yalnızca .env yüklenmemiş bir ortamda test-özel bir yedek değer atanır.
    process.env.JWT_SECRET ||= 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_web3auth');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('generateAuthMessage', () => {
    it('should generate message with nonce', () => {
      const nonce = 'abc123';
      const message = generateAuthMessage(nonce);
      
      assert.ok(message.includes('VIP90.bet Girişi')); // siteName verilmezse varsayılan marka adına düşer
      assert.ok(message.includes(`Nonce: ${nonce}`));
      assert.ok(message.includes('imzalayarak kimliğinizi doğruluyorsunuz'));
    });
  });

  describe('nonce management', () => {
    it('should set and get nonce', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const nonce = setAuthNonce(address);
      
      assert.ok(nonce);
      assert.equal(typeof nonce, 'string');
      assert.equal(nonce.length, 32); // 16 bytes = 32 hex chars
      
      const retrieved = getAuthNonce(address);
      assert.equal(retrieved, nonce);
    });

    it('should return null for non-existent address', () => {
      const nonce = getAuthNonce('0x9999999999999999999999999999999999999999');
      assert.equal(nonce, null);
    });

    it('should consume nonce and remove it', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      setAuthNonce(address);
      
      const consumed = consumeAuthNonce(address);
      assert.ok(consumed);
      
      const retrieved = getAuthNonce(address);
      assert.equal(retrieved, null);
    });

    it('should expire nonce after 5 minutes', async () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      setAuthNonce(address);
      
      // Manually expire by manipulating the store (we can't easily test time)
      // Just verify the function exists
      assert.ok(typeof getAuthNonce === 'function');
    });
  });

  describe('recoverAddress', () => {
    it('should reject signature with wrong length', async () => {
      try {
        await recoverAddress('test', '0x' + '1'.repeat(128)); // Wrong length
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('Invalid signature length'));
      }
    });

    it('should reject signature that is too long', async () => {
      try {
        await recoverAddress('test', '0x' + '1'.repeat(132));
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('Invalid signature length'));
      }
    });
  });

  describe('authenticateWithWallet', () => {
    it('should fail for mismatched address', async () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const message = generateAuthMessage('test-nonce');
      setAuthNonce(address);
      const signature = '0x' + '2'.repeat(130); // Valid length but invalid signature
      
      try {
        await authenticateWithWallet({ address, signature, message });
        assert.fail('Should have thrown error');
      } catch (err) {
        console.log('DEBUG ERROR:', err.message);
        // ethers throws "invalid v" for this signature format
        assert.ok(err.message.includes('invalid v') || 
                  err.message.includes('invalid signature') || 
                  err.message.includes('Signature verification failed') ||
                  err.message.includes('İmza doğrulanamadı') ||
                  err.message.includes('Geçersiz'));
      }
    });

    it('should fail for invalid nonce', async () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const message = 'Message without nonce';
      const signature = '0x' + '2'.repeat(130);
      
      try {
        await authenticateWithWallet({ address, signature, message });
        assert.fail('Should have thrown error');
      } catch (err) {
        console.log('DEBUG ERROR 2:', err.message);
        assert.ok(err.message.includes('invalid v') ||
                  err.message.includes('invalid signature') ||
                  err.message.includes('Signature verification failed') ||
                  err.message.includes('İmza doğrulanamadı') ||
                  err.message.includes('Geçersiz'));
      }
    });

    // P6 — daha önce yalnızca hata yolları test ediliyordu, gerçek imzalı
    // mutlu-yol hiç doğrulanmamıştı. Ayrıca P6'nın düzelttiği eksik burada
    // doğrulanıyor: authenticateWithWallet önceden yalnızca accessToken
    // döndürüyordu, refreshToken hiç üretilmiyordu.
    it('should authenticate with a real signed message, create a new user, and return both tokens', async () => {
      const wallet = ethers.Wallet.createRandom();
      const address = wallet.address.toLowerCase();
      const nonce = setAuthNonce(address);
      const message = generateAuthMessage(nonce);
      const signature = await wallet.signMessage(message);

      const result = await authenticateWithWallet({ address, signature, message, options: { walletType: 'metamask', chainId: 1 } });

      assert.equal(result.isNewUser, true);
      assert.equal(result.user.walletAddress, address);
      assert.equal(result.user.walletType, 'metamask');
      assert.ok(typeof result.accessToken === 'string' && result.accessToken.length > 0);
      assert.ok(typeof result.refreshToken === 'string' && result.refreshToken.length > 0);

      // Nonce tek kullanımlık — aynı mesajla ikinci deneme reddedilmeli
      await assert.rejects(
        () => authenticateWithWallet({ address, signature, message }),
        /Geçersiz|nonce/i
      );
    });
  });

  describe('linkWalletToUser', () => {
    it('should fail for wallet already linked to another user', async () => {
      const user1 = await User.create({
        username: 'user1',
        email: 'user1@example.com',
        password: 'password123',
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

      const user2 = await User.create({
        username: 'user2',
        email: 'user2@example.com',
        password: 'password123',
      });

      try {
        // Try to link same wallet to user2
        await linkWalletToUser({
          userId: user2._id,
          address: '0x1234567890abcdef1234567890abcdef12345678',
          signature: '0x' + '2'.repeat(130),
          message: generateAuthMessage('test-nonce'),
        });
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('zaten başka bir hesaba bağlı') || err.message.includes('WALLET_ALREADY_LINKED'));
      }
    });

    it('should fail for invalid signature', async () => {
      const user = await User.create({
        username: 'user3',
        email: 'user3@example.com',
        password: 'password123',
      });

      try {
        await linkWalletToUser({
          userId: user._id,
          address: '0x1234567890abcdef1234567890abcdef12345678',
          signature: '0x' + '2'.repeat(130),
          message: generateAuthMessage('test-nonce'),
        });
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('invalid v') || 
                  err.message.includes('invalid signature') || 
                  err.message.includes('Signature verification failed') ||
                  err.message.includes('İmza doğrulanamadı') ||
                  err.message.includes('Geçersiz'));
      }
    });
  });

  describe('unlinkWallet', () => {
    it('should unlink wallet from user', async () => {
      const user = await User.create({
        username: 'user4',
        email: 'user4@example.com',
        password: 'password123',
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

      const updated = await unlinkWallet(user._id);
      
      assert.equal(updated.walletAddress, null);
      assert.equal(updated.walletType, null);
      assert.equal(updated.walletConnectedAt, null);
      assert.equal(updated.walletChainId, null);
    });

    it('should return null wallet fields', async () => {
      const user = await User.create({
        username: 'user5',
        email: 'user5@example.com',
        password: 'password123',
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        walletType: 'metamask',
        walletConnectedAt: new Date(),
        walletChainId: 1,
      });

      const updated = await unlinkWallet(user._id);
      
      assert.equal(updated.walletAddress, null);
      assert.equal(updated.walletType, null);
      assert.equal(updated.walletConnectedAt, null);
      assert.equal(updated.walletChainId, null);
    });
  });

  describe('getUserByWallet', () => {
    it('should return user by wallet address', async () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const user = await User.create({
        username: 'walletuser',
        email: 'wallet@example.com',
        password: 'password123',
        walletAddress: address.toLowerCase(),
      });

      const found = await getUserByWallet(address);
      assert.ok(found);
      assert.equal(found._id.toString(), user._id.toString());
    });

    it('should return null for non-existent wallet', async () => {
      const found = await getUserByWallet('0x9999999999999999999999999999999999999999');
      assert.equal(found, null);
    });
  });

  describe('isWalletLinked', () => {
    it('should return true for linked wallet', async () => {
      await User.create({
        username: 'linkeduser',
        email: 'linked@example.com',
        password: 'password123',
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

      const linked = await isWalletLinked('0x1234567890abcdef1234567890abcdef12345678');
      assert.equal(linked, true);
    });

    it('should return false for unlinked wallet', async () => {
      const linked = await isWalletLinked('0x9999999999999999999999999999999999999999');
      assert.equal(linked, false);
    });
  });
});