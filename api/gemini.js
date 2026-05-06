/**
 * Vercel serverless function to proxy Gemini (Generative Language) requests.
 * Keeps GEMINI_API_KEY server-side.
 *
 * Implements function calling with `search_the_web` (Google Custom Search via ./search.js).
 *
 * Expected request body (POST):
 * {
 *   messages: [{ role: "user"|"model", text: string }, ...],
 *   model: "models/gemini-1.5-flash-latest" // optional
 * }
 */

const searchModule = require('./search');

const TOOL_SEARCH_WEB = 'search_the_web';

const SEARCH_TOOL_DECLARATION = {
  name: TOOL_SEARCH_WEB,
  description:
    'Search the public web via Google Custom Search for current webpages, deals, prices, products, retailers, specs, availability, reviews, recent news.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Focused English search query; include brand, product model, retailer, region, date window, or coupon/deal wording as useful.',
      },
    },
    required: ['query'],
  },
};

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

  const initialContents = buildConversationContents(rawMessages);

  if (!initialContents.length) {
    return res.status(400).json({ error: 'Missing messages content' });
  }

  const systemInstruction = [
    'You are Resume Bot for Gaurab Giri’s portfolio site.',
    '',
    'If the user asks for live info, deals, shipping, store hours, promotions, comparisons, inventory, pricing, specs, retailer links, or other time-sensitive/product-specific details, call the search_the_web tool FIRST and base your reply on returned titles, snippets, and links.',
    '',
    'After searching, summarize clearly with markdown-style bullet points when listing options. Prefer citing real URLs returned by search (titles + links); do not invent prices—only state prices/snippet hints that appear in search results.',
    '',
    'If the user asks to change theme or to navigate, you MUST include a command block in your response:',
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

  async function invokeSearchTool(fc) {
    const name = String(fc?.name || '');
    const argsObj = fc?.args ?? fc?.arguments ?? {};
    const rawQuery = typeof argsObj === 'string' ? argsObj : argsObj.query;
    const query = String(rawQuery ?? '').trim();

    if (name !== TOOL_SEARCH_WEB) {
      return { error: `Unknown tool: ${name}` };
    }
    if (!searchModule?.searchTheWeb) {
      return { error: 'Search handler is unavailable on server.' };
    }
    try {
      return await searchModule.searchTheWeb(query);
    } catch (e) {
      return { error: String(e?.message || e) };
    }
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

  function buildGeminiPayload(contents) {
    return {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools: [{ functionDeclarations: [SEARCH_TOOL_DECLARATION] }],
      toolConfig: {
        functionCallingConfig: {
          mode: 'AUTO',
        },
      },
      generationConfig: {
        temperature: 0.65,
        maxOutputTokens: 1024,
      },
    };
  }

  async function callGenerate(modelName, contents) {
    const payload = buildGeminiPayload(contents);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      .filter(
        (m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent')
      )
      .map((m) => m.name)
      .filter((name) => /flash/i.test(name));
  }

  const MAX_AGENT_STEPS = 5;

  /**
   * One multi-step agent loop (model chooses tools; we fulfill and continue) for a single Gemini model string.
   */
  async function runAgentWithTools(modelName) {
    /** @type {Array<{role: string, parts: any[]}>} */
    const contents = [...initialContents];

    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      const { response, data } = await callGenerate(modelName, contents);
      if (!response.ok) {
        return { ok: false, response, data, modelUsed: modelName };
      }

      const candidate = data?.candidates?.[0];
      const candContent = candidate?.content;
      if (!candContent || !Array.isArray(candContent.parts)) {
        const textFallback =
          data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('')?.trim() || '';
        return { ok: true, text: textFallback || 'I received an empty reply.', modelUsed: modelName, data };
      }

      /** @type {any[]} */
      const partsOut = candContent.parts;
      const textPieces = [];
      /** @type {any[]} */
      const functionCalls = [];

      for (const p of partsOut) {
        if (typeof p?.text === 'string' && p.text) textPieces.push(p.text);
        if (p?.functionCall && (p.functionCall.name || '').trim()) functionCalls.push(p.functionCall);
      }

      /** Model turn MUST be recorded verbatim for the API */
      const modelTurn = {
        role: candContent.role || 'model',
        parts: partsOut,
      };
      contents.push(modelTurn);

      if (!functionCalls.length) {
        const text = textPieces.join('').trim();
        return { ok: true, text, modelUsed: modelName };
      }

      /** Single user turn with parallel function responses */
      const frParts = [];
      for (const fc of functionCalls) {
        const structured = await invokeSearchTool(fc);
        frParts.push({
          functionResponse: {
            name: fc.name,
            response: structured,
          },
        });
      }
      contents.push({ role: 'user', parts: frParts });
    }

    return {
      ok: true,
      text: 'Stopped after too many search steps — please simplify your question.',
      modelUsed: modelName,
    };
  }

  try {
    const tried = [];
    const candidates = candidateModels(modelInput);

    for (const model of candidates) {
      const agent = await runAgentWithTools(model);
      tried.push({ model, agentOk: agent.ok, apiStatus: agent.response?.status ?? 200 });

      if (!agent.ok) {
        const { response, data } = agent;
        tried[tried.length - 1].error = data?.error?.message || null;
        tried[tried.length - 1].errorObj = data?.error || null;
        const status404 = response?.status === 404;
        const notFoundFlag = data?.error?.status === 'NOT_FOUND';
        if (!(status404 || notFoundFlag)) {
          return res.status(500).json({
            error: data?.error?.message || 'Gemini proxy failed',
            detail: data?.error || null,
            tried,
          });
        }
        continue;
      }

      const text =
        typeof agent.text === 'string' && agent.text.trim()
          ? agent.text.trim()
          : '';
      return res.status(200).json({ text, modelUsed: agent.modelUsed });
    }

    const discovered = await listFlashModels();
    for (const model of discovered) {
      if (candidates.includes(model)) continue;

      const agent = await runAgentWithTools(model);
      tried.push({ model, agentOk: agent.ok, apiStatus: agent.response?.status ?? 200 });

      if (!agent.ok) {
        const { response, data } = agent;
        tried[tried.length - 1].error = data?.error?.message || null;
        tried[tried.length - 1].errorObj = data?.error || null;
        const status404 = response?.status === 404;
        const notFoundFlag = data?.error?.status === 'NOT_FOUND';
        if (!(status404 || notFoundFlag)) {
          return res.status(500).json({
            error: data?.error?.message || 'Gemini proxy failed',
            detail: data?.error || null,
            tried,
            discovered,
          });
        }
        continue;
      }

      const text =
        typeof agent.text === 'string' && agent.text.trim()
          ? agent.text.trim()
          : '';
      return res.status(200).json({ text, modelUsed: agent.modelUsed, discoveredUsed: model });
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
