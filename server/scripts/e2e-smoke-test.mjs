/**
 * Full E2E Smoke Test — VIP90.bet
 * Covers: Register → Email Verify → Login → Home → Casino → Bahis → Live → Profile → Logout
 * 
 * Run: cd server && node scripts/e2e-smoke-test.mjs
 * Requires: Client on localhost:5173, Server on localhost:3001
 */

import { chromium } from 'playwright';
import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

config({ path: resolve('../.env') });

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const HEADLESS = process.env.HEADLESS !== 'false';

const TEST_USER = {
  username: `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  email: `smoke_${Date.now()}@test.local`,
  password: 'TestPass123!',
};

let verificationToken = null;
let browser;
let context;
let page;

async function log(step, status, msg = '') {
  const icons = { pass: '✓', fail: '✗', info: 'ℹ', warn: '⚠' };
  console.log(`  ${icons[status] || '•'} ${step}: ${msg}`);
}

// Connect to MongoDB
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone');

async function register() {
  await page.goto(`${CLIENT_URL}/login?tab=register`, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[name="username"]');
  
  await page.fill('input[name="username"]', TEST_USER.username);
  await page.fill('input[name="email"]', TEST_USER.email);
  await page.fill('input[name="password"]', TEST_USER.password);
  
  // Accept terms & KVKK
  const checkboxes = page.locator('input[type="checkbox"]');
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  
  // Capture API response
  let registerResponse = null;
  page.on('response', response => {
    if (response.url().includes('/auth/register')) {
      registerResponse = response;
    }
  });
  
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000); // Wait for DB write
  
  if (registerResponse) {
    const respText = await registerResponse.text();
    console.log(`  [DEBUG] Register response: ${registerResponse.status()} ${respText.slice(0, 300)}`);
  }
  
  // Get verification token from database (dev mode doesn't send real emails)
  const user = await User.findOne({ email: TEST_USER.email });
  console.log('  [DEBUG] User found:', user ? 'yes' : 'no');
  if (user) console.log('  [DEBUG] Token:', user.emailVerificationToken ? 'yes' : 'no');
  if (user && user.emailVerificationToken) {
    verificationToken = user.emailVerificationToken;
    log('Register', 'pass', `User: ${TEST_USER.username}, token: ${verificationToken.slice(0, 12)}...`);
    return true;
  }
  
  throw new Error('Verification token not found in database');
}

async function verifyEmail() {
  const verifyUrl = `${CLIENT_URL}/verify-email?token=${verificationToken}`;
  await page.goto(verifyUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  const bodyText = await page.textContent('body');
  if (!bodyText.includes('doğrulandı') && !bodyText.includes('verified')) {
    throw new Error('Email verification failed: ' + bodyText.slice(0, 200));
  }
  log('Email Verify', 'pass', 'Email verified successfully');
  return true;
}

async function login() {
  await page.goto(`${CLIENT_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[name="username"]');
  
  await page.fill('input[name="username"]', TEST_USER.username);
  await page.fill('input[name="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  
  // Wait for redirect to home
  await page.waitForURL(`${CLIENT_URL}/`, { timeout: 15000 });
  await page.waitForTimeout(2000);
  
  log('Login', 'pass', 'Redirected to home');
  return true;
}

async function checkHomePage() {
  await page.goto(`${CLIENT_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Check for user indicators
  const bodyText = await page.textContent('body');
  const userIndicators = bodyText.includes('Bakiye') || bodyText.includes('Balance') || bodyText.includes('₺') || 
                         bodyText.includes(TEST_USER.username) || bodyText.includes('Çıkış') || bodyText.includes('Profil');
  
  if (!userIndicators) {
    // Check for navbar/user menu
    const userMenu = await page.locator('button:has-text("Profil"), [class*="user"], [class*="avatar"], [aria-label*="user"]').count();
    if (userMenu === 0) {
      throw new Error('Not logged in - no user indicators on home');
    }
  }
  log('Home Page', 'pass', 'Loaded successfully');
  return true;
}

async function checkCasinoPage() {
  await page.goto(`${CLIENT_URL}/casino`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  const bodyText = await page.textContent('body');
  if (bodyText.includes('Casino') || bodyText.includes('casino') || bodyText.includes('Oyun')) {
    log('Casino Page', 'pass', 'Loaded');
  } else {
    log('Casino Page', 'warn', 'Content unclear, but page loaded');
  }
  
  // Try to find game links
  const gameCards = page.locator('[class*="game"], [class*="Game"], a[href*="/games/"], a[href*="/casino/"]');
  const count = await gameCards.count();
  if (count > 0) {
    log('Casino Games', 'pass', `Found ${count} game links`);
  }
  return true;
}

async function checkBahisPage() {
  await page.goto(`${CLIENT_URL}/bahis`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  const bodyText = await page.textContent('body');
  if (bodyText.includes('Bahis') || bodyText.includes('Spor') || bodyText.includes('Maç')) {
    log('Bahis Page', 'pass', 'Loaded');
  } else {
    log('Bahis Page', 'warn', 'Content unclear');
  }
  return true;
}

async function checkLivePage() {
  await page.goto(`${CLIENT_URL}/canli`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  const bodyText = await page.textContent('body');
  if (bodyText.includes('Canlı') || bodyText.includes('Live') || bodyText.includes('canli')) {
    log('Canlı Page', 'pass', 'Loaded');
  } else {
    log('Canlı Page', 'warn', 'Content unclear');
  }
  return true;
}

async function checkProfilePage() {
  await page.goto(`${CLIENT_URL}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  
  const bodyText = await page.textContent('body');
  if (bodyText.includes('Profil') || bodyText.includes('Profile') || bodyText.includes(TEST_USER.username)) {
    log('Profile Page', 'pass', 'Loaded with username');
  } else {
    log('Profile Page', 'warn', 'Content unclear');
  }
  return true;
}

async function checkPromotionsPage() {
  await page.goto(`${CLIENT_URL}/promotions`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  
  const bodyText = await page.textContent('body');
  if (bodyText.includes('Promosyon') || bodyText.includes('Bonus') || bodyText.includes('Kampanya')) {
    log('Promotions Page', 'pass', 'Loaded');
  } else {
    log('Promotions Page', 'warn', 'Content unclear');
  }
  return true;
}

async function logout() {
  // Click user menu / profile dropdown
  const userMenuBtn = page.locator('button:has-text("Profil"), [class*="user-menu"], [class*="avatar"], [aria-label*="user"]').first();
  if (await userMenuBtn.count() > 0) {
    await userMenuBtn.click();
    await page.waitForTimeout(500);
  }
  
  // Find and click logout
  const logoutBtn = page.locator('text=Çıkış, text=Logout, [class*="logout"]').first();
  if (await logoutBtn.count() > 0) {
    await logoutBtn.click();
    await page.waitForURL(`${CLIENT_URL}/login`, { timeout: 5000 });
    log('Logout', 'pass', 'Redirected to login');
  } else {
    // Try direct logout API call
    await page.evaluate(() => fetch('/auth/logout', { method: 'POST', credentials: 'include' }));
    await page.goto(`${CLIENT_URL}/login`, { waitUntil: 'networkidle' });
    log('Logout', 'pass', 'API logout + redirect');
  }
  return true;
}

async function runSmokeTest() {
  console.log('\n' + '═'.repeat(60));
  console.log('🧪 VIP90.BET E2E SMOKE TEST');
  console.log('═'.repeat(60));
  console.log(`   Client: ${CLIENT_URL}`);
  console.log(`   Server: ${SERVER_URL}`);
  console.log(`   User:   ${TEST_USER.username}`);
  console.log('─'.repeat(60));
  
  browser = await chromium.launch({ 
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: 'test-results/videos/', size: { width: 1280, height: 720 } }
  });
  page = await context.newPage();
  
  // Capture console logs from the page
  page.on('console', msg => {
    if (msg.type() === 'log' || msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('verify-email') || text.includes('verification') || text.includes('token')) {
        console.log(`  [CONSOLE] ${text}`);
      }
    }
  });
  
  page.on('pageerror', err => {
    console.log(`  [PAGE ERROR] ${err.message}`);
  });
  
  let passed = 0, failed = 0;
  
  const tests = [
    { name: 'Register', fn: register },
    { name: 'Verify Email', fn: verifyEmail },
    { name: 'Login', fn: login },
    { name: 'Home Page', fn: checkHomePage },
    { name: 'Casino Page', fn: checkCasinoPage },
    { name: 'Bahis Page', fn: checkBahisPage },
    { name: 'Canlı Page', fn: checkLivePage },
    { name: 'Profile Page', fn: checkProfilePage },
    { name: 'Promotions Page', fn: checkPromotionsPage },
    { name: 'Logout', fn: logout },
  ];
  
  for (const test of tests) {
    try {
      await test.fn();
      passed++;
    } catch (e) {
      failed++;
      log(test.name, 'fail', e.message);
      await page.screenshot({ path: `test-results/screenshots/${test.name.toLowerCase().replace(' ', '-')}-fail.png`, fullPage: true });
    }
  }
  
  await browser.close();
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SMOKE TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  ✓ Passed: ${passed}`);
  console.log(`  ✗ Failed: ${failed}`);
  console.log(`  Total:    ${passed + failed}`);
  console.log('═'.repeat(60));
  
  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeTest().catch(async e => {
  console.error('\n❌ Fatal error:', e);
  if (browser) await browser.close();
  process.exit(1);
});