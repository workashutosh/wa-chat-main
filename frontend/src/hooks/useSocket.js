import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

// Empty string in production → connect to same origin (nginx proxies /socket.io → port 3002)
const SOCKET_URL = import.meta.env.VITE_API_URL || undefined;

export function useSocket(onMessage, onStatus, onConvUpdate, onCampaignProgress) {
  const onMessageRef = useRef(onMessage);
  const onStatusRef = useRef(onStatus);
  const onConvUpdateRef = useRef(onConvUpdate);
  const onCampaignRef = useRef(onCampaignProgress);

  onMessageRef.current = onMessage;
  onStatusRef.current = onStatus;
  onConvUpdateRef.current = onConvUpdate;
  onCampaignRef.current = onCampaignProgress;

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socket.on("new_message",          (...args) => onMessageRef.current?.(...args));
    socket.on("message_status",       (...args) => onStatusRef.current?.(...args));
    socket.on("conversation_updated", (...args) => onConvUpdateRef.current?.(...args));
    socket.on("campaign_progress",    (...args) => onCampaignRef.current?.(...args));
    return () => socket.disconnect();
  }, []);
}
