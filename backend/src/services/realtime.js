/**
 * Real-time event broadcaster — SSE (Server-Sent Events) orqali.
 *
 * Foydalanish:
 *   - Manba yangilanganda: emit('source.updated', { sourceId }, { organizationId })
 *   - Yangi xabar/anomaliya: emit('alert.new', payload, { organizationId, userId? })
 *   - Hisobot tayyor: emit('report.ready', { reportId }, { userId })
 *
 * Broadcast scope:
 *   - organizationId — barcha shu org foydalanuvchilariga
 *   - userId — faqat shu user'ga (boshqa device'lariga ham)
 *   - global — hammaga (admin update'lari)
 *
 * Single-instance memory bus (Redis emas) — kichik deploy uchun yetarli.
 * Ko'p replica kerak bo'lsa Redis pub/sub'ga ko'chirish kerak.
 */

const subscribers = new Set(); // Set<{ res, userId, organizationId }>

function subscribe({ res, userId, organizationId }) {
  const sub = { res, userId, organizationId, connectedAt: Date.now() };
  subscribers.add(sub);
  return () => subscribers.delete(sub);
}

function broadcast(event, payload, scope = {}) {
  const { organizationId = null, userId = null, global = false } = scope;
  const data = JSON.stringify({ event, payload, ts: Date.now() });
  const sseData = `event: ${event}\ndata: ${data}\n\n`;
  let count = 0;
  for (const sub of subscribers) {
    let match = false;
    if (global) match = true;
    else if (userId && sub.userId === userId) match = true;
    else if (organizationId && sub.organizationId === organizationId) match = true;
    if (!match) continue;
    try {
      sub.res.write(sseData);
      count++;
    } catch (e) {
      subscribers.delete(sub);
    }
  }
  return count;
}

function getStats() {
  return {
    subscribers: subscribers.size,
    connections: Array.from(subscribers).map(s => ({
      userId: s.userId,
      organizationId: s.organizationId,
      uptime_s: Math.round((Date.now() - s.connectedAt) / 1000),
    })),
  };
}

// Heartbeat — har 25 sekundda ping (proxy timeout oldini olish uchun)
setInterval(() => {
  for (const sub of subscribers) {
    try {
      sub.res.write(': ping\n\n');
    } catch {
      subscribers.delete(sub);
    }
  }
}, 25000);

module.exports = { subscribe, broadcast, getStats };
