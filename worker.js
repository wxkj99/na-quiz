// Cloudflare Worker: AI API proxy
// Deploy at: https://dash.cloudflare.com/workers
// Secrets to set:
//   API_KEY        = your API key
//   API_BASE_URL   = e.g. https://api.routeway.ai/v1
//   ALLOWED_ORIGIN = e.g. https://wxkj99.github.io

const RATE_LIMIT = 20;      // max requests per window
const RATE_WINDOW = 60000;  // 1 minute in ms

const ipCounts = new Map();

function checkRate(ip) {
  const now = Date.now();
  const entry = ipCounts.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW) { entry.count = 0; entry.start = now; }
  entry.count++;
  ipCounts.set(ip, entry);
  return entry.count <= RATE_LIMIT;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors(allowed) });
    }

    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    if (allowed && origin !== allowed) return new Response('Forbidden', { status: 403 });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRate(ip)) return new Response('Too Many Requests', { status: 429 });

    const body = await request.text();
    const resp = await fetch(`${env.API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
      },
      body
    });

    const data = await resp.text();
    return new Response(data, {
      status: resp.status,
      headers: { 'Content-Type': 'application/json', ...cors(allowed) }
    });
  }
};

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
