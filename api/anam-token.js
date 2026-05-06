/**
 * Vercel serverless function to create Anam session tokens.
 * Keeps ANAM_API_KEY server-side.
 *
 * Required env vars:
 * - ANAM_API_KEY
 * - ANAM_PERSONA_ID (recommended; for stateful persona)
 *
 * Response: { sessionToken: string }
 */
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANAM_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANAM_API_KEY is not set" });
  }

  const personaId = process.env.ANAM_PERSONA_ID;
  if (!personaId) {
    return res.status(500).json({ error: "ANAM_PERSONA_ID is not set" });
  }

  try {
    const resp = await fetch("https://api.anam.ai/v1/auth/session-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        personaConfig: {
          personaId,
        },
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(500).json({
        error: data?.error?.message || "Failed to create Anam session token",
        detail: data?.error || data || null,
      });
    }

    const sessionToken = String(data?.sessionToken || "").trim();
    if (!sessionToken) {
      return res.status(500).json({ error: "Missing sessionToken in Anam response", detail: data || null });
    }

    return res.status(200).json({ sessionToken });
  } catch (err) {
    console.error("Anam token error:", err);
    return res.status(500).json({ error: "Failed to fetch Anam token", detail: err?.message || String(err) });
  }
};

