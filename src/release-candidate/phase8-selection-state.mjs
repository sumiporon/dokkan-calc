export const LAST_EVENT_KEY = 'dokkan_phase8_rc_last_event_v1';

export function readLastEvent(storage, eventIds) {
  const validIds = eventIds instanceof Set ? eventIds : new Set(eventIds);
  const raw = storage.getItem(LAST_EVENT_KEY);
  if (raw == null) return { eventId: null, reason: 'first-use' };
  let eventId;
  try {
    const value = JSON.parse(raw);
    eventId = typeof value === 'string' ? value : value?.schemaVersion === '1.0.0' ? value.eventId : null;
  } catch {
    eventId = raw.startsWith('{') || raw.startsWith('[') ? null : raw;
  }
  if (typeof eventId === 'string' && validIds.has(eventId)) return { eventId, reason: 'restored' };
  storage.removeItem(LAST_EVENT_KEY);
  return { eventId: null, reason: typeof eventId === 'string' ? 'missing-event' : 'invalid-storage' };
}

export function saveLastEvent(storage, eventId, datasetVersion) {
  storage.setItem(LAST_EVENT_KEY, JSON.stringify({ schemaVersion: '1.0.0', eventId, datasetVersion }));
}
