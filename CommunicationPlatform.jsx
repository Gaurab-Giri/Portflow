import React, { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@anam-ai/js-sdk";

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

      // Must match the id used by streamToVideoElement.
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
      // Cleanup WebRTC when component unmounts.
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
        <button type="button" onClick={startCall} disabled={status === "connecting" || status === "connected"}>
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

