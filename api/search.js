/**
 * Optional HTTP route: POST { "query": "..." } or GET ?query=...
 * Core logic exported as `.searchTheWeb` for Gemini tool execution.
 *
 * Env (set in Vercel / local .env):
 * - GOOGLE_SEARCH_API_KEY — Google Cloud API key with Custom Search API enabled
 * - GOOGLE_CUSTOM_SEARCH_ENGINE_ID — Programmable Search Engine ID (CX)
 */

const SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

async function searchTheWeb(query) {
  const key = process.env.GOOGLE_SEARCH_API_KEY || process.env.GOOGLE_CUSTOM_SEARCH_JSON_API_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;

  if (!key || !cx) {
    return {
      configured: false,
      error: 'Google Custom Search is not configured on the server.',
      hint: 'Set GOOGLE_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID.',
    };
  }

  const q = String(query || '').trim();
  if (!q) {
    return { configured: true, query: '', results: [], error: 'Empty query string.' };
  }

  const maxNum = Math.min(Math.max(Number(process.env.GOOGLE_SEARCH_RESULT_COUNT || 8), 1), 10);
  const url = new URL(SEARCH_URL);
  url.searchParams.set('key', key);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', q);
  url.searchParams.set('num', String(maxNum));

  const resp = await fetch(url.href);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      configured: true,
      query: q,
      results: [],
      error: data?.error?.message || data?.error || `Search HTTP ${resp.status}`,
    };
  }

  const results = (data.items || []).map((it) => ({
    title: it.title || '',
    link: it.link || '',
    displayLink: it.displayLink || '',
    snippet: it.snippet || '',
  }));

  return { configured: true, query: q, results };
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let query = '';
    if (req.method === 'GET') {
      query = String(req.query?.query ?? '').trim();
    } else {
      let body = {};
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      } catch (_) {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
      query = String(body.query ?? '').trim();
    }
    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter' });
    }
    const payload = await searchTheWeb(query);
    return res.status(200).json(payload);
  } catch (err) {
    console.error('search proxy error:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

handler.searchTheWeb = searchTheWeb;
module.exports = handler;
