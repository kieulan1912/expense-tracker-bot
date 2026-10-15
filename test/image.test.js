const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveImageMime,
  looksLikeSupportedImage,
} = require('../src/utils/image');

test('nhận HEIC và HEIF từ MIME của Telegram', () => {
  assert.equal(resolveImageMime({ declaredMime: 'image/heic' }), 'image/heic');
  assert.equal(resolveImageMime({ declaredMime: 'image/heif' }), 'image/heif');
  assert.equal(resolveImageMime({ declaredMime: 'image/heic-sequence' }), 'image/heic');
});

test('nhận HEIC theo tên file khi Telegram trả octet-stream', () => {
  assert.equal(
    resolveImageMime({
      declaredMime: 'application/octet-stream',
      filename: 'IMG_1234.HEIC',
    }),
    'image/heic',
  );
  assert.equal(
    looksLikeSupportedImage({
      mimeType: 'application/octet-stream',
      filename: 'receipt.heif',
    }),
    true,
  );
});

test('từ chối document không phải ảnh hỗ trợ', () => {
  assert.equal(
    looksLikeSupportedImage({ mimeType: 'application/pdf', filename: 'bill.pdf' }),
    false,
  );
});
