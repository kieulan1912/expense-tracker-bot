const supportedImageMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const extensionMimes = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
]);

function normalizeMime(mime) {
  const value = String(mime || '').split(';')[0].trim().toLowerCase();
  if (value === 'image/heic-sequence') return 'image/heic';
  if (value === 'image/heif-sequence') return 'image/heif';
  return value;
}

function mimeFromFilename(filename) {
  const match = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? extensionMimes.get(match[1]) || '' : '';
}

function resolveImageMime({ declaredMime, responseMime, filename }) {
  const candidates = [
    normalizeMime(declaredMime),
    normalizeMime(responseMime),
    mimeFromFilename(filename),
  ];
  return candidates.find((mime) => supportedImageMimes.has(mime)) || null;
}

function looksLikeSupportedImage({ mimeType, filename }) {
  return Boolean(resolveImageMime({ declaredMime: mimeType, filename }));
}

module.exports = {
  supportedImageMimes,
  resolveImageMime,
  looksLikeSupportedImage,
};
