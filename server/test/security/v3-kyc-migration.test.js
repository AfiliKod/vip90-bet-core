process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'c'.repeat(64);
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, linkSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import KycDocument from '../../src/models/KycDocument.js';
import { migrateKycUploads, parseArgs, main } from '../../scripts/migrate-kyc-uploads.mjs';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v3_kyc_migration_test';
const quiet = { log() {}, warn() {}, error() {} };

describe('V3 KYC yükleme taşıma', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  const tmp = mkdtempSync(join(tmpdir(), 'v3-kyc-mig-'));
  const srcA = join(tmp, 'a', 'uploads', 'kyc');
  const srcB = join(tmp, 'b', 'uploads', 'kyc');
  const target = join(tmp, 'storage', 'kyc');
  mkdirSync(srcA, { recursive: true }); mkdirSync(srcB, { recursive: true });
  const userId = new mongoose.Types.ObjectId();

  after(async () => {
    if (connected) { await KycDocument.deleteMany({ fileName: /^v3m-/ }); await mongoose.disconnect(); }
    rmSync(tmp, { recursive: true, force: true });
  });

  const run = (dryRun) => migrateKycUploads({ dryRun, logger: quiet, sourceDirs: [srcA, srcB, srcA], targetDir: target });

  it('dry-run dokunmaz; commit iki eski konumdan taşır; ikinci çalıştırma boş', opts, async () => {
    await KycDocument.deleteMany({ fileName: /^v3m-/ });
    writeFileSync(join(srcA, 'x.png'), 'AAA');
    writeFileSync(join(srcB, 'y.png'), 'BBB');
    const base = { userId, documentType: 'identity_card', fileSize: 3, mimeType: 'image/png' };
    const dx = await KycDocument.create({ ...base, fileName: 'v3m-x', fileUrl: '/uploads/kyc/x.png' });
    await KycDocument.create({ ...base, fileName: 'v3m-y', fileUrl: '/uploads/kyc/y.png' });

    const dry = await run(true);
    assert.deepEqual(dry, { moved: 2, updated: 2, skipped: 0 });
    assert.ok(existsSync(join(srcA, 'x.png')) && existsSync(join(srcB, 'y.png')));
    assert.ok(!existsSync(join(target, 'x.png')));
    assert.equal((await KycDocument.findById(dx._id)).storageKey, null);

    const done = await run(false);
    assert.deepEqual(done, { moved: 2, updated: 2, skipped: 0 });
    assert.equal(readFileSync(join(target, 'x.png'), 'utf8'), 'AAA');
    assert.equal(readFileSync(join(target, 'y.png'), 'utf8'), 'BBB');
    assert.ok(!existsSync(join(srcA, 'x.png')) && !existsSync(join(srcB, 'y.png')));
    assert.equal((await KycDocument.findById(dx._id)).storageKey, 'x.png');

    assert.deepEqual(await run(false), { moved: 0, updated: 0, skipped: 0 });
  });

  it('hedefte farklı içerikli aynı adlı dosya varsa kaynak silinmez', opts, async () => {
    writeFileSync(join(srcA, 'x.png'), 'DIFFERENT');
    const r = await run(false);
    assert.equal(r.moved, 0);
    assert.equal(r.skipped, 1);
    assert.equal(readFileSync(join(srcA, 'x.png'), 'utf8'), 'DIFFERENT');
    assert.equal(readFileSync(join(target, 'x.png'), 'utf8'), 'AAA');
  });

  it('targetDir verilmezse KYC_UPLOAD_DIR (çağrı anındaki env) kullanılır', opts, async () => {
    const envTarget = join(tmp, 'env-target');
    const prev = process.env.KYC_UPLOAD_DIR;
    process.env.KYC_UPLOAD_DIR = envTarget;
    try {
      writeFileSync(join(srcB, 'z.png'), 'ZZZ');
      const r = await migrateKycUploads({ dryRun: false, logger: quiet, sourceDirs: [srcB] });
      assert.equal(r.moved, 1);
      assert.equal(readFileSync(join(envTarget, 'z.png'), 'utf8'), 'ZZZ');
    } finally {
      if (prev === undefined) delete process.env.KYC_UPLOAD_DIR; else process.env.KYC_UPLOAD_DIR = prev;
    }
  });

  it('--from tekrarlanabilir ve çözülür', () => {
    const a = parseArgs(['--commit', '--from', 'x/y', '--from', '/abs/z']);
    assert.equal(a.dryRun, false);
    assert.deepEqual(a.from, [join(process.cwd(), 'x/y'), '/abs/z']);
    assert.equal(parseArgs([]).dryRun, true);
    assert.throws(() => parseArgs(['--from']), /--from/);
  });

  it('--from dizinindeki dosyalar taşınır', opts, async () => {
    const extra = join(tmp, 'extra', 'kyc');
    mkdirSync(extra, { recursive: true });
    writeFileSync(join(extra, 'w.png'), 'WWW');
    const r = await migrateKycUploads({ dryRun: false, logger: quiet, sourceDirs: [srcA, extra], targetDir: target });
    assert.equal(r.moved, 1);
    assert.equal(readFileSync(join(target, 'w.png'), 'utf8'), 'WWW');
  });

  it('hedefe sembolik bağ olan --from dizininde hiçbir şey silinmez', opts, async () => {
    const real = join(tmp, 'sym-target');
    const link = join(tmp, 'sym-link');
    mkdirSync(real, { recursive: true });
    symlinkSync(real, link);
    writeFileSync(join(real, 'only.png'), 'ONLY');
    const r = await migrateKycUploads({ dryRun: false, logger: quiet, sourceDirs: [link], targetDir: real });
    assert.equal(r.moved, 0);
    assert.equal(readFileSync(join(real, 'only.png'), 'utf8'), 'ONLY');
    // Hedef sembolik bağ üzerinden verilse de aynı.
    await migrateKycUploads({ dryRun: false, logger: quiet, sourceDirs: [real], targetDir: link });
    assert.equal(readFileSync(join(real, 'only.png'), 'utf8'), 'ONLY');
  });

  it('hedefle aynı inode olan kaynak dosya (hard link) silinmez', opts, async () => {
    const t = join(tmp, 'hl-target');
    const s = join(tmp, 'hl-src');
    mkdirSync(t, { recursive: true }); mkdirSync(s, { recursive: true });
    writeFileSync(join(t, 'h.png'), 'HHH');
    linkSync(join(t, 'h.png'), join(s, 'h.png'));
    const r = await migrateKycUploads({ dryRun: false, logger: quiet, sourceDirs: [s], targetDir: t });
    assert.equal(r.moved, 0);
    assert.ok(existsSync(join(s, 'h.png')) && existsSync(join(t, 'h.png')));
    assert.equal(readFileSync(join(t, 'h.png'), 'utf8'), 'HHH');
  });

  it('MONGODB_URI yoksa main açık hatayla düşer (localhost yedeği yok)', async () => {
    const prev = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;
    try {
      await assert.rejects(main({ argv: [], envPath: join(tmp, 'yok.env') }), /MONGODB_URI/);
    } finally {
      if (prev !== undefined) process.env.MONGODB_URI = prev;
    }
  });
});
