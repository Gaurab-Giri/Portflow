import React, { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@anam-ai/js-sdk";
import {
  Gamepad2,
  Wrench,
  Newspaper,
  Languages,
  Sparkles,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Explore More+ hub — Lucide card icons (backup / React source of truth)      */
/* -------------------------------------------------------------------------- */

const EXPLORE_CARDS = [
  {
    id: "games",
    Icon: Gamepad2,
    title: "Games",
    desc: "Snake, memory, typing & more",
  },
  {
    id: "tools",
    Icon: Wrench,
    title: "Tools",
    desc: "GPA scenario planner",
  },
  {
    id: "news",
    Icon: Newspaper,
    title: "News",
    desc: "Live world headlines",
  },
  {
    id: "translator",
    Icon: Languages,
    title: "Translator",
    desc: "Translate the portfolio",
  },
  {
    id: "utilities",
    Icon: Sparkles,
    title: "Extra utilities",
    desc: "Theme, weather, media & more",
  },
];

const exploreStyles = `
.explore-hub { padding: 8px 4px 24px; }
.explore-hub-title { margin-bottom: 8px; }
.explore-hub-desc {
  color: var(--text-light, #64748b);
  font-size: 0.92rem;
  margin: 0 0 20px;
  max-width: 520px;
}
.explore-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 14px;
}
.explore-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 18px 16px;
  border-radius: 16px;
  border: 1px solid rgba(var(--primary-rgb, 13, 148, 136), 0.2);
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.25s ease, border-color 0.25s ease;
}
.explore-card:hover {
  transform: translateY(-3px);
  border-color: var(--accent, #0f766e);
  box-shadow: 0 12px 28px rgba(var(--primary-rgb, 13, 148, 136), 0.18);
}
.explore-card-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(var(--primary-rgb, 13, 148, 136), 0.1);
  color: var(--accent, #0f766e);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 0.25s ease, color 0.25s ease;
}
.explore-card:hover .explore-card-icon-wrap {
  transform: scale(1.08);
  background: rgba(var(--primary-rgb, 13, 148, 136), 0.14);
  color: var(--primary, #0d9488);
}
.explore-card:focus-visible .explore-card-icon-wrap {
  transform: scale(1.06);
  background: rgba(var(--primary-rgb, 13, 148, 136), 0.14);
  color: var(--primary, #0d9488);
  outline: 2px solid rgba(var(--primary-rgb, 13, 148, 136), 0.35);
  outline-offset: 2px;
}
.explore-card-title {
  font-weight: 700;
  font-size: 1rem;
  color: var(--text-dark, #1e293b);
}
.explore-card-desc {
  font-size: 0.8rem;
  color: var(--text-light, #64748b);
  line-height: 1.35;
}
`;

function ExploreCard({ card, onOpen }) {
  const { id, Icon, title, desc } = card;
  return (
    <button
      type="button"
      className="explore-card"
      data-explore-open={id}
      onClick={() => onOpen?.(id)}
    >
      <span className="explore-card-icon-wrap" aria-hidden="true">
        <Icon size={20} strokeWidth={2} />
      </span>
      <span className="explore-card-title">{title}</span>
      <span className="explore-card-desc">{desc}</span>
    </button>
  );
}

/**
 * Explore More+ card hub with Lucide icons.
 * Wire `onOpen` to your tab/panel logic (games, tools, news, translator, utilities).
 */
export function ExploreMoreHub({ onOpen, className = "" }) {
  return (
    <div id="exploreHub" className={`explore-hub ${className}`.trim()}>
      <style>{exploreStyles}</style>
      <h2 className="section-title explore-hub-title">Explore More+</h2>
      <p className="explore-hub-desc">
        Games, planning tools, live news, translation, and site utilities — pick a
        card or use the tab menu ▾
      </p>
      <div className="explore-card-grid">
        {EXPLORE_CARDS.map((card) => (
          <ExploreCard key={card.id} card={card} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Anam video communication platform (default export)                          */
/* -------------------------------------------------------------------------- */

const VIDEO_ELEMENT_ID = "anam-sdk-video";

export default function CommunicationPlatform() {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const clientRef = useRef(null);

  const fetchSessionToken = useCallback(async () => {
    const res = await fetch("/api/anam-token", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.sessionToken) {
      throw new Error(data?.error || "Failed to fetch Anam session token");
    }
    return data.sessionToken;
  }, []);

  const startCall = useCallback(async () => {
    if (status === "connecting" || status === "connected") return;
    setError("");
    setStatus("connecting");
    try {
      const sessionToken = await fetchSessionToken();
      const client = createClient(sessionToken, {
        disableInputAudio: false,
      });
      clientRef.current = client;
      await client.streamToVideoElement(VIDEO_ELEMENT_ID);
      setStatus("connected");
    } catch (e) {
      setStatus("error");
      setError(e?.message || "Unable to start Anam session");
    }
  }, [fetchSessionToken, status]);

  const stopCall = useCallback(async () => {
    const client = clientRef.current;
    clientRef.current = null;
    if (client?.stopStreaming) {
      try {
        await client.stopStreaming();
      } catch (_) {}
    }
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
      if (clientRef.current?.stopStreaming) {
        clientRef.current.stopStreaming().catch(() => {});
      }
      clientRef.current = null;
    };
  }, []);

  return (
    <div>
      <video id={VIDEO_ELEMENT_ID} autoPlay playsInline muted={false} />
      <div>
        <button
          type="button"
          onClick={startCall}
          disabled={status === "connecting" || status === "connected"}
        >
          {status === "connecting" ? "Connecting..." : "Start Video Call"}
        </button>
        <button type="button" onClick={stopCall} disabled={status !== "connected"}>
          Hang Up
        </button>
      </div>
      {error ? <p>{error}</p> : null}
    </div>
  );
}
