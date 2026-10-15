const test = require('node:test');
const assert = require('node:assert/strict');
const { createInvitationCode, hashInvitationCode } = require('../src/utils/invitation');

test('mã mời có định dạng an toàn và không dùng ký tự dễ nhầm', () => {
  const codes = new Set(Array.from({ length: 100 }, createInvitationCode));
  assert.equal(codes.size, 100);
  for (const code of codes) assert.match(code, /^GD-[A-HJ-NP-Z2-9]{8}$/);
});

test('hash mã mời không phân biệt chữ hoa và khoảng trắng ngoài', () => {
  assert.equal(
    hashInvitationCode(' gd-abcd2345 '),
    hashInvitationCode('GD-ABCD2345'),
  );
  assert.match(hashInvitationCode('GD-ABCD2345'), /^[a-f0-9]{64}$/);
});
