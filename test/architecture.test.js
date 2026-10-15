const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(target);
    return entry.name.endsWith('.js') ? [target] : [];
  });
}

function assertNoImports(directory, forbiddenSegments) {
  for (const file of javascriptFiles(directory)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const segment of forbiddenSegments) {
      assert.equal(
        source.includes(segment),
        false,
        `${path.relative(process.cwd(), file)} không được phụ thuộc ${segment}`,
      );
    }
  }
}

test('domain không phụ thuộc data, infrastructure hoặc presentation', () => {
  assertNoImports(path.join(__dirname, '../src/domain'), [
    '/data/',
    '/infrastructure/',
    '/presentation/',
  ]);
});

test('presentation không import trực tiếp data adapters', () => {
  assertNoImports(path.join(__dirname, '../src/presentation'), ['/data/']);
});
