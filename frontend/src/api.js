/**
 * P31 API Layer — thin fetch wrapper for all backend REST endpoints.
 * Uses Vite's /api proxy (vite.config.js) → localhost:8031.
 */

const API = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${path}: ${res.status}`);
  return res.json();
}

export const fetchHealth = () => request('/health');

export const ingestNode = (content, axis = 'D', metadata = {}) =>
  request('/ingest', {
    method: 'POST',
    body: JSON.stringify({ content, axis, metadata }),
  });

export const scoreVoltage = (text) =>
  request('/voltage', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });

export const getSpoons = () => request('/spoons');

export const deductSpoons = (amount = 1.0, reason = 'manual') =>
  request(`/spoons/deduct?amount=${amount}&reason=${encodeURIComponent(reason)}`, {
    method: 'POST',
  });

export const restoreSpoons = (amount = 1.0, reason = 'manual') =>
  request(`/spoons/restore?amount=${amount}&reason=${encodeURIComponent(reason)}`, {
    method: 'POST',
  });

export const getTaxonomy = () => request('/taxonomy');

export const routeQuery = (query) =>
  request('/route', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });

export const getGraphData = () =>
  request('/graph').catch(() => ({ nodes: [], edges: [] }));

/**
 * Server-side AI chat — single round trip.
 * Backend routes query, enriches context, proxies to LiteLLM, streams back.
 * Returns an async iterator of {type, ...} NDJSON chunks.
 */
export async function* streamChat(message, history = []) {
  const res = await fetch(`${API}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });

  if (!res.ok) {
    yield { type: 'error', message: `Chat failed: ${res.status}` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (line.trim()) {
        try {
          yield JSON.parse(line);
        } catch {
          // skip malformed chunks
        }
      }
    }
  }

  // flush remaining
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer);
    } catch {
      // skip
    }
  }
}
