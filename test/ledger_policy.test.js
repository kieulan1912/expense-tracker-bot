const test = require('node:test');
const assert = require('node:assert/strict');
const {
  roleLabel,
  canWriteLedger,
  canManageLedger,
} = require('../src/domain/ledger_policy');

test('owner và member được ghi, viewer chỉ được xem', () => {
  assert.equal(canWriteLedger('owner'), true);
  assert.equal(canWriteLedger('member'), true);
  assert.equal(canWriteLedger('viewer'), false);
});

test('chỉ owner được quản trị sổ', () => {
  assert.equal(canManageLedger('owner'), true);
  assert.equal(canManageLedger('member'), false);
  assert.equal(canManageLedger('viewer'), false);
});

test('role có nhãn giao diện ổn định', () => {
  assert.equal(roleLabel('owner'), 'Chủ sổ');
  assert.equal(roleLabel('member'), 'Thành viên');
  assert.equal(roleLabel('viewer'), 'Người xem');
});
