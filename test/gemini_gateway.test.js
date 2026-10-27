const test = require('node:test');
const assert = require('node:assert/strict');
const { createGeminiAiGateway } = require('../src/data/gateways/gemini_ai_gateway');

function createPool() {
  const directQueries = [];
  const client = {
    async query(sql) {
      if (sql.includes('global_count')) {
        return {
          rows: [{ global_count: 0, user_count: 0, usage_date: '2026-10-27' }],
        };
      }
      return { rows: [] };
    },
    release() {},
  };
  return {
    directQueries,
    async connect() { return client; },
    async query(sql, params) {
      directQueries.push({ sql, params });
      return { rows: [] };
    },
  };
}

function createConfig(overrides = {}) {
  return {
    aiEnabled: true,
    geminiApiKey: 'test-key',
    geminiModel: 'gemini-primary',
    geminiFallbackModels: ['gemini-fallback'],
    aiTextDailyLimit: 150,
    aiImageDailyLimit: 10,
    aiGlobalDailyLimit: 300,
    ocrMaxImageMb: 10,
    timezone: 'Asia/Ho_Chi_Minh',
    ...overrides,
  };
}

function successfulUnknownResponse() {
  return {
    ok: true,
    async json() {
      return {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                intent: 'UNKNOWN', reply: 'Xin chào!', confidence: 1,
                needs_confirmation: false, occurred_at: null, limit: null,
                filters: {
                  keyword: null, transaction_type: 'all', category_id: null,
                  amount_min: null, amount_max: null, date_from: null,
                  date_to: null, created_by: null,
                },
                items: [],
              }),
            }],
          },
        }],
      };
    },
  };
}

test('Gemini tự chuyển model khi model chính trả 503', async () => {
  const pool = createPool();
  const urls = [];
  const gateway = createGeminiAiGateway({
    config: createConfig(),
    pool,
    fetchImpl: async (url) => {
      urls.push(url);
      if (url.includes('gemini-primary')) {
        return {
          ok: false,
          status: 503,
          async json() { return { error: { message: 'High demand' } }; },
        };
      }
      return successfulUnknownResponse();
    },
  });

  const result = await gateway.analyzeText({ userId: 1, text: 'xin chào' });
  assert.equal(result.intent, 'UNKNOWN');
  assert.equal(urls.length, 2);
  assert.match(urls[0], /gemini-primary/);
  assert.match(urls[1], /gemini-fallback/);
  assert.equal(pool.directQueries.length, 0);
});

test('Gemini tự chuyển model khi request bị timeout', async () => {
  const pool = createPool();
  let requests = 0;
  const gateway = createGeminiAiGateway({
    config: createConfig(),
    pool,
    fetchImpl: async () => {
      requests += 1;
      if (requests === 1) {
        const error = new Error('The operation was aborted due to timeout');
        error.name = 'TimeoutError';
        throw error;
      }
      return successfulUnknownResponse();
    },
  });

  const result = await gateway.analyzeText({ userId: 1, text: 'xin chào' });
  assert.equal(result.intent, 'UNKNOWN');
  assert.equal(requests, 2);
  assert.equal(pool.directQueries.length, 0);
});

test('Gemini hoàn quota khi mọi model đều thất bại', async () => {
  const pool = createPool();
  const gateway = createGeminiAiGateway({
    config: createConfig(),
    pool,
    fetchImpl: async () => {
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      throw error;
    },
  });

  await assert.rejects(
    gateway.analyzeText({ userId: 99, text: 'xin chào' }),
    /timeout/,
  );
  assert.equal(pool.directQueries.length, 1);
  assert.match(pool.directQueries[0].sql, /UPDATE ai_usage_daily/);
  assert.deepEqual(pool.directQueries[0].params, ['2026-10-27', 99, 'text']);
});
