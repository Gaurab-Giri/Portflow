/**
 * Vercel serverless function to summarize news via Anthropic Claude API.
 * Set ANTHROPIC_API_KEY in Vercel env vars (or .env.local for local dev).
 */
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // STEP 2: Verify env variable
  console.log("API KEY EXISTS:", !!process.env.ANTHROPIC_API_KEY);
  console.log("API KEY PREFIX:", process.env.ANTHROPIC_API_KEY?.slice(0, 7));
  if (!process.env.ANTHROPIC_API_KEY) {
    const errMsg = "ANTHROPIC_API_KEY is not set";
    console.error("CAUGHT ERROR:", errMsg);
    return res.status(500).json({ error: errMsg, detail: null });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed", summary: "" });
  }

  // STEP 1: Log incoming request body
  console.log("REQUEST BODY:", req.body);

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    console.error("CAUGHT ERROR:", e);
    return res.status(400).json({ error: "Invalid JSON: " + String(e.message), detail: null });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();

  if (!title && !description) {
    return res.status(400).json({ error: "Missing title and description", detail: null });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: "You are a neutral news summarizer. Given a news headline and description, write a 3-sentence summary in completely original language. Rephrase all facts in plain conversational English. Never copy any phrase from the source text. Avoid passive voice. Be concise and factual.",
        messages: [
          { role: "user", content: `Headline: ${title}\n\nDescription: ${description}` }
        ]
      })
    });

    const data = await response.json();
    // STEP 1: Log full Anthropic raw response
    console.log("ANTHROPIC RAW:", JSON.stringify(data));

    if (!response.ok) {
      console.error("CAUGHT ERROR: Anthropic API error response", data);
      return res.status(500).json({ error: data.error?.message || "Anthropic API error", detail: data });
    }

    const summary = data?.content?.[0]?.text?.trim();
    if (!summary) {
      const errMsg = "No summary in response: " + JSON.stringify(data);
      console.error("CAUGHT ERROR:", errMsg);
      return res.status(500).json({ error: errMsg, detail: data });
    }

    return res.status(200).json({ summary });
  } catch (err) {
    console.error("CAUGHT ERROR:", err);
    return res.status(500).json({
      error: err.message,
      detail: { message: err.message, stack: err.stack }
    });
  }
};
