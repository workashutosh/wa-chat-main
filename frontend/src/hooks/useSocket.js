import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

// Empty string in production → connect to same origin (nginx proxies /socket.io → port 3002)
const SOCKET_URL = import.meta.env.VITE_API_URL || undefined;

export function useSocket(onMessage, onStatus, onConvUpdate) {
  const onMessageRef = useRef(onMessage);
  const onStatusRef = useRef(onStatus);
  const onConvUpdateRef = useRef(onConvUpdate);

  // Keep refs current every render so socket handler always sees latest state
  onMessageRef.current = onMessage;
  onStatusRef.current = onStatus;
  onConvUpdateRef.current = onConvUpdate;

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socket.on("new_message",          (...args) => onMessageRef.current?.(...args));
    socket.on("message_status",       (...args) => onStatusRef.current?.(...args));
    socket.on("conversation_updated", (...args) => onConvUpdateRef.current?.(...args));
    return () => socket.disconnect();
  }, []);
}
