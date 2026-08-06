const handlers = new Map();
const anyHandlers = [];

export function on(eventType, handler) {
  const list = handlers.get(eventType) || [];
  list.push(handler);
  handlers.set(eventType, list);
}

export function onAny(handler) {
  anyHandlers.push(handler);
}

export function emitEvent(type, entity, payload = {}) {
  const list = handlers.get(type) || [];
  const results = [];
  const event = { type, entity, payload };
  for (const handler of [...list, ...anyHandlers]) {
    try {
      const result = handler(event);
      if (typeof result === 'number') results.push(result);
    } catch (err) {
      console.error(`[events] handler error for "${type}":`, err.message);
    }
  }
  return results;
}
