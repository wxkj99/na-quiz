// Cloudflare Worker: AI API proxy
// Deploy at: https://dash.cloudflare.com/workers
// Secrets to set:
//   API_KEY        = your API key
//   API_BASE_URL   = e.g. https://api.routeway.ai/v1
//   API_MODEL      = e.g. glm-4.5-air:free
//   API_TYPE       = openai (default) | gemini | claude
//   INVITE_CODE    = invite code required for default API access
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

    const invite = request.headers.get('X-Invite') || '';
    if (env.INVITE_CODE && !env.INVITE_CODE.split(',').map(s => s.trim()).includes(invite))
      return new Response('Unauthorized', { status: 401 });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRate(ip)) return new Response('Too Many Requests', { status: 429 });

    const parsed = JSON.parse(await request.text());
    if (env.API_MODEL) parsed.model = env.API_MODEL;
    const type = (env.API_TYPE || 'openai').toLowerCase();
    const base = env.API_BASE_URL.replace(/\/$/, '');
    const model = parsed.model;

    let url, headers, reqBody;
    if (type === 'gemini') {
      url = `${base}/models/${model}:generateContent?key=${env.API_KEY}`;
      headers = { 'Content-Type': 'application/json' };
      reqBody = { contents: parsed.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) };
    } else if (type === 'claude') {
      url = `${base}/messages`;
      headers = { 'Content-Type': 'application/json', 'x-api-key': env.API_KEY, 'anthropic-version': '2023-06-01' };
      reqBody = { ...parsed, max_tokens: parsed.max_tokens || 4096 };
    } else {
      url = `${base}/chat/completions`;
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.API_KEY}` };
      reqBody = parsed;
    }

    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(reqBody) });
    if (!resp.ok) return new Response(await resp.text(), { status: resp.status, headers: { 'Content-Type': 'application/json', ...cors(allowed) } });

    const data = await resp.json();
    let text;
    if (type === 'gemini') text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    else if (type === 'claude') text = data.content?.[0]?.text || '';
    else return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json', ...cors(allowed) } });

    const wrapped = { choices: [{ message: { role: 'assistant', content: text } }] };
    return new Response(JSON.stringify(wrapped), {
      status: 200,
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
