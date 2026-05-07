/**
 * Vercel serverless proxy for Gemini with Google Search Grounding (built-in browsing).
 *
 * POST body:
 * {
 *   messages: [{ role: "user"|"model", text: string }, ...],
 *   model: "models/gemini-1.5-flash-latest" // optional
 * }
 *
 * Response: { text, modelUsed?, sources?: [{ uri, title }], webSearchQueries?: string[], groundingMetadata? }
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

  function buildConversationContents(messages) {
    return messages
      .slice(-12)
      .filter((m) => m && typeof m.text === 'string' && m.text.trim().length > 0)
      .map((m) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));
  }

  const contents = buildConversationContents(rawMessages);

  if (!contents.length) {
    return res.status(400).json({ error: 'Missing messages content' });
  }

  const systemInstruction = [
    'You are Resume Bot for Gaurab Giri’s portfolio site.',
    '',
    'You may use Grounding with Google Search when users ask about live deals, current prices, product availability, retailer offers, promotions, breaking news, or other time-bound web facts.',
    'When search grounding returns sources, summarize clearly and include inline references to factual claims where appropriate; cite the pages you relied on.',
    '',
    'If the user asks to change theme or to navigate the portfolio, you MUST include a command block in your response:',
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
    '- Always provide a helpful human-readable response outside the command block.',
    '- Do NOT wrap the whole message in code fences.',
  ].join('\n');

  /** Extract citation links Gemini returns alongside grounded answers */
  function normalizeGrounding(candidate) {
    const gm = candidate?.groundingMetadata || candidate?.grounding_metadata || null;

    if (!gm || typeof gm !== 'object') {
      return {
        sources: [],
        webSearchQueries: [],
        raw: gm || null,
      };
    }

    const webSearchQueries = Array.isArray(gm.webSearchQueries)
      ? gm.webSearchQueries.map((q) => String(q || '').trim()).filter(Boolean)
      : [];

    /** @type {Array<{ uri: string, title: string }>} */
    const sources = [];
    const seen = new Set();

    const chunks = gm.groundingChunks || gm.grounding_chunks || [];

    for (const ch of chunks) {
      if (!ch || typeof ch !== 'object') continue;

      let web =
        ch.web ||
        ch.retrievedWeb ||
        ch.retrieved_web ||
        ch.chunk?.web ||
        ch.chunk?.uri ||
        null;

      /** Some responses nest URI/title differently */
      if (!web && ch.uri) {
        web = { uri: ch.uri, title: ch.title };
      }

      let uri = web?.uri || web?.url || ch.uri || '';
      const title = String(web?.title ?? ch.title ?? '').trim();
      uri = typeof uri === 'string' ? uri.trim() : String(uri || '').trim();
      if (!uri) continue;

      let key = '';
      try {
        const parsed = new URL(uri);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
        key = parsed.href.replace(/\/$/, '');
      } catch {
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);

      sources.push({
        uri: key,
        title: title || key,
      });
    }

    return { sources, webSearchQueries, raw: gm };
  }

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
    push(base);
    push('models/gemini-1.5-flash-latest');
    push('models/gemini-1.5-flash');
    push('gemini-1.5-flash');
    return out;
  }

  /**
   * Google Search grounding per REST docs: ["google_search", {}].
   * If the API rejects the key shape, callers may retry with alternate casing.
   */
  function buildPayload(toolEntry) {
    return {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools: [toolEntry],
      generationConfig: {
        temperature: 0.65,
        maxOutputTokens: 1024,
      },
    };
  }

  async function callGenerate(modelName, toolEntry) {
    const payload = buildPayload(toolEntry);
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function listFlashModels() {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return [];
    return (d.models || [])
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent')
      )
      .map((m) => m.name)
      .filter((name) => /flash/i.test(name));
  }

  const toolVariants = [{ google_search: {} }, { googleSearch: {} }];

  /** Try generating with grounding; retries alternate protobuf JSON key casing for the tool slot. */
  async function generateGrounded(modelName, triedBucket) {
    let lastFail = { response: { status: 0 }, data: {} };
    for (const toolEntry of toolVariants) {
      const { response, data } = await callGenerate(modelName, toolEntry);
      if (response.ok) {
        triedBucket.toolShape = Object.keys(toolEntry)[0];
        const candidate = data?.candidates?.[0];
        const text =
          candidate?.content?.parts?.map((p) => p?.text || '').join('')?.trim() || '';
        const { sources, webSearchQueries } = normalizeGrounding(candidate || {});

        return {
          ok: true,
          text,
          groundingMetadata: candidate?.groundingMetadata || candidate?.grounding_metadata || null,
          sources,
          webSearchQueries,
          modelUsed: modelName,
        };
      }

      lastFail = { response, data };
      const msg = String(data?.error?.message || '').toLowerCase();
      /** Retry alternate tool key casing on invalid / unknown enum */
      const maybeShape =
        response.status === 400 &&
        (/unknown/i.test(msg) ||
          /invalid/i.test(msg) ||
          /unrecognized/i.test(msg) ||
          /field/i.test(msg) ||
          /parse/i.test(msg));

      if (!maybeShape) break;
    }

    return { ok: false, response: lastFail.response, data: lastFail.data, modelUsed: modelName };
  }

  try {
    const tried = [];
    const modelCandidates = candidateModels(modelInput);

    for (const model of modelCandidates) {
      const tb = {};
      const out = await generateGrounded(model, tb);

      tried.push({
        model,
        ok: out.ok,
        apiStatus: out.response?.status ?? 200,
        toolShape: tb.toolShape,
        error: out.data?.error?.message ?? null,
      });

      if (out.ok) {
        const text = out.text || 'I received a response but it was empty.';
        return res.status(200).json({
          text,
          modelUsed: out.modelUsed,
          sources: out.sources || [],
          webSearchQueries: out.webSearchQueries || [],
          groundingMetadata: out.groundingMetadata || null,
        });
      }

      const status404 = out.response?.status === 404;
      const notFoundFlag = out.data?.error?.status === 'NOT_FOUND';
      if (!(status404 || notFoundFlag)) {
        return res.status(500).json({
          error: out.data?.error?.message || 'Gemini proxy failed',
          detail: out.data?.error || null,
          tried,
        });
      }
    }

    const discovered = await listFlashModels();
    for (const model of discovered) {
      if (modelCandidates.includes(model)) continue;

      const tb = {};
      const out = await generateGrounded(model, tb);
      tried.push({
        model,
        ok: out.ok,
        apiStatus: out.response?.status ?? 200,
        toolShape: tb.toolShape,
        error: out.data?.error?.message ?? null,
      });

      if (out.ok) {
        const text = out.text || 'I received a response but it was empty.';
        return res.status(200).json({
          text,
          modelUsed: out.modelUsed,
          discoveredUsed: model,
          sources: out.sources || [],
          webSearchQueries: out.webSearchQueries || [],
          groundingMetadata: out.groundingMetadata || null,
        });
      }

      const status404 = out.response?.status === 404;
      const notFoundFlag = out.data?.error?.status === 'NOT_FOUND';
      const otherError = !(status404 || notFoundFlag);
      if (otherError) {
        return res.status(500).json({
          error: out.data?.error?.message || 'Gemini proxy failed',
          detail: out.data?.error || null,
          tried,
          discovered,
        });
      }
    }

    return res.status(500).json({
      error: 'No compatible Gemini Flash model found or grounding failed',
      detail: { tried, discovered },
    });
  } catch (err) {
    console.error('Gemini proxy error:', err);
    return res.status(500).json({ error: 'Failed to fetch Gemini', detail: String(err?.message || err) });
  }
};
