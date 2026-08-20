import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createApprovalGate } from '../src/agent/approvalGate.js';

describe('createApprovalGate — salt-okunur eylemler otomatik', () => {
  test('salt-okunur eylem hemen auto-approved döner, onay beklemez', () => {
    const gate = createApprovalGate();
    const result = gate.propose({ actionId: 'REINDEX_DB', params: { target: 'cache_table' } });
    assert.strictEqual(result.status, 'auto-approved');
    assert.strictEqual(result.actionId, 'REINDEX_DB');
  });

  test('auto-approved sonuç için pending kayıt oluşmaz', () => {
    const gate = createApprovalGate();
    gate.propose({ actionId: 'CLEAR_CACHE', params: {} });
    assert.strictEqual(gate.pendingCount(), 0);
  });
});

describe('createApprovalGate — yıkıcı eylemler temsilci onayı bekler', () => {
  test('yıkıcı eylem pending-approval döner, actionId/params taşır ama HENÜZ onaylı değil', () => {
    const gate = createApprovalGate();
    const result = gate.propose({ actionId: 'RUN_MIGRATION', params: { version: '2026_08' } });
    assert.strictEqual(result.status, 'pending-approval');
    assert.strictEqual(typeof result.proposalId, 'string');
    assert.strictEqual(gate.pendingCount(), 1);
  });

  test('approve() çağrılmadan bu eylem asla "approved" statüsüne geçmez', () => {
    const gate = createApprovalGate();
    const proposed = gate.propose({ actionId: 'RESTART_SERVICE', params: {} });
    assert.notStrictEqual(proposed.status, 'approved');
  });

  test('temsilci approve() çağırınca approved statüsüne geçer, kimin onayladığı kayıtlı', () => {
    const gate = createApprovalGate();
    const proposed = gate.propose({ actionId: 'RUN_MIGRATION', params: { version: 'x' } });
    const approved = gate.approve(proposed.proposalId, 'rep-42');
    assert.strictEqual(approved.status, 'approved');
    assert.strictEqual(approved.approvedBy, 'rep-42');
    assert.strictEqual(approved.actionId, 'RUN_MIGRATION');
    assert.deepStrictEqual(approved.params, { version: 'x' });
  });

  test('onaylanan öneri pending listesinden düşer', () => {
    const gate = createApprovalGate();
    const proposed = gate.propose({ actionId: 'RUN_MIGRATION', params: {} });
    gate.approve(proposed.proposalId, 'rep-1');
    assert.strictEqual(gate.pendingCount(), 0);
  });

  test('reject() ile reddedilir, onaylanamaz hale gelir', () => {
    const gate = createApprovalGate();
    const proposed = gate.propose({ actionId: 'RESET_USER_PASSWORD', params: {} });
    const rejected = gate.reject(proposed.proposalId, 'rep-9', 'yanlış kullanıcı');
    assert.strictEqual(rejected.status, 'rejected');
    assert.strictEqual(rejected.reason, 'yanlış kullanıcı');
    assert.strictEqual(gate.pendingCount(), 0);
  });

  test('aynı öneri iki kez onaylanamaz', () => {
    const gate = createApprovalGate();
    const proposed = gate.propose({ actionId: 'RUN_MIGRATION', params: {} });
    gate.approve(proposed.proposalId, 'rep-1');
    assert.throws(() => gate.approve(proposed.proposalId, 'rep-2'), /Bilinmeyen|zaten/i);
  });

  test('var olmayan proposalId için approve/reject hata fırlatır', () => {
    const gate = createApprovalGate();
    assert.throws(() => gate.approve('yok', 'rep-1'), /Bilinmeyen/);
    assert.throws(() => gate.reject('yok', 'rep-1', 'x'), /Bilinmeyen/);
  });
});

describe('createApprovalGate — kayıtsız eylem', () => {
  test('katalogda olmayan actionId için propose() hata fırlatır, öneri OLUŞTURULMAZ', () => {
    const gate = createApprovalGate();
    assert.throws(() => gate.propose({ actionId: 'DELETE_EVERYTHING', params: {} }), /kayıtlı değil/);
    assert.strictEqual(gate.pendingCount(), 0);
  });
});
