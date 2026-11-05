const REPORT_CONTEXT_TTL_MS = 30 * 60 * 1000;

function createConversationStore() {
  const reportContexts = new Map();

  function keyFor(userId, ledgerId) {
    return `${String(userId)}:${String(ledgerId)}`;
  }

  function getReportPeriod(userId, ledgerId) {
    const key = keyFor(userId, ledgerId);
    const entry = reportContexts.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      reportContexts.delete(key);
      return null;
    }
    return { ...entry.period };
  }

  function setReportPeriod(userId, ledgerId, period) {
    const month = Number(period?.month);
    const year = Number(period?.year);
    if (!Number.isInteger(month) || month < 1 || month > 12
      || !Number.isInteger(year) || year < 2000 || year > 9999) return false;
    const now = Date.now();
    for (const [key, entry] of reportContexts) {
      if (entry.expiresAt <= now) reportContexts.delete(key);
    }
    reportContexts.set(keyFor(userId, ledgerId), {
      period: { month, year },
      expiresAt: now + REPORT_CONTEXT_TTL_MS,
    });
    return true;
  }

  function clearUser(userId) {
    const prefix = `${String(userId)}:`;
    for (const key of reportContexts.keys()) {
      if (key.startsWith(prefix)) reportContexts.delete(key);
    }
  }

  return Object.freeze({ getReportPeriod, setReportPeriod, clearUser });
}

module.exports = { createConversationStore, REPORT_CONTEXT_TTL_MS };
