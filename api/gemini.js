/**
 * Vercel serverless function to proxy Gemini (Generative Language) requests.
 * Keeps GEMINI_API_KEY server-side.
 *
 * Expected request body (POST):
 * {
 *   messages: [{ role: "user"|"model", text: string }, ...],
 *   model: "models/gemini-1.5-flash" // optional
 * }
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key not configured' });
  }
  console.log('Gemini initialized');

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body', detail: String(e?.message || e) });
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const modelInput = String(body.model || 'models/gemini-1.5-flash-latest').trim();

  const contents = rawMessages
    .slice(-12)
    .filter((m) => m && typeof m.text === 'string' && m.text.trim().length > 0)
    .map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }));

  if (!contents.length) {
    return res.status(400).json({ error: 'Missing messages content' });
  }

  const systemInstruction = [
    'You are Resume Bot for Gaurab Giri’s portfolio site.',
    'If the user asks to change theme (e.g. "make it dark mode", "change theme", "set accent color to teal") or to navigate (e.g. "scroll to projects", "open resume"), you MUST include a command block in your response.',
    '',
    'Command block format (must be valid JSON, wrapped exactly like this):',
    '<COMMAND>{"type":"theme","mode":"dark","accent":"#0d9488","bg":"#0b1220"}</COMMAND>',
    '',
    'Supported commands:',
    '- theme: {"type":"theme","mode":"dark"|"light", "accent":"#RRGGBB" (optional), "bg":"#RRGGBB" (optional)}',
    '- scroll: {"type":"scroll","target":"projects"|"skills"|"experience"|"community"|"education"|"contact"|"news"|"entertainment"}',
    '- open: {"type":"open","target":"resume"|"portfolio"}',
    '',
    'Rules:',
    '- Include at most ONE <COMMAND> block per response.',
    '- Always also provide a normal human-readable response outside the <COMMAND> block.',
    '- Do NOT wrap the whole message in code fences.',
  ].join('\n');

  function normalizeModelName(m) {
    const t = String(m || '').trim();
    if (!t) return '';
    return t.startsWith('models/') ? t : `models/${t}`;
  }

  function candidateModels(inputModel) {
    const base = String(inputModel || '').trim();
    const out = [];
    const push = (m) => {
      const n = normalizeModelName(m);
      if (!n) return;
      if (!out.includes(n)) out.push(n);
    };
    // User-requested model first
    push(base);
    // Explicit requested variations
    push('models/gemini-1.5-flash-latest');
    push('models/gemini-1.5-flash');
    push('gemini-1.5-flash');
    return out;
  }

  async function callGenerate(modelName) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 512,
          },
        }),
      }
    );
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function listFlashModels() {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return [];
    return (d.models || [])
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => m.name)
      .filter((name) => /flash/i.test(name));
  }

  try {
    const tried = [];
    const candidates = candidateModels(modelInput);

    // Try explicit candidate list first
    for (const model of candidates) {
      const { response, data } = await callGenerate(model);
      tried.push({ model, status: response.status, error: data?.error?.message || null, errorObj: data?.error || null });
      if (response.ok) {
        const text =
          data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('')?.trim() ||
          '';
        return res.status(200).json({ text, modelUsed: model });
      }
      // If not a NOT_FOUND model issue, fail fast for real API errors (quota, auth, etc.)
      if (response.status !== 404 && data?.error?.status !== 'NOT_FOUND') {
        return res.status(500).json({
          error: data?.error?.message || 'Gemini proxy failed',
          detail: data?.error || null,
          tried,
        });
      }
    }

    // Fallback: discover active flash models dynamically
    const discovered = await listFlashModels();
    for (const model of discovered) {
      if (candidates.includes(model)) continue;
      const { response, data } = await callGenerate(model);
      tried.push({ model, status: response.status, error: data?.error?.message || null, errorObj: data?.error || null });
      if (response.ok) {
        const text =
          data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('')?.trim() ||
          '';
        return res.status(200).json({ text, modelUsed: model });
      }
      if (response.status !== 404 && data?.error?.status !== 'NOT_FOUND') {
        return res.status(500).json({
          error: data?.error?.message || 'Gemini proxy failed',
          detail: data?.error || null,
          tried,
          discovered,
        });
      }
    }

    return res.status(500).json({
      error: 'No compatible Gemini Flash model found for generateContent',
      detail: { tried, discovered },
    });
  } catch (err) {
    console.error('Gemini proxy error:', err);
    return res.status(500).json({ error: 'Failed to fetch Gemini', detail: String(err?.message || err) });
  }
};

