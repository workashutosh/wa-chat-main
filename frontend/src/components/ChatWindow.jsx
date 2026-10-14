import { useEffect, useRef, useState } from "react";
import { Phone, MoreVertical } from "lucide-react";
import { Avatar } from "./ui/avatar";
import { Button } from "./ui/button";
import { MessageBubble } from "./MessageBubble";
import { SendBar } from "./SendBar";
import { getMessages, sendMessage } from "../lib/api";

export function ChatWindow({ contact, socket, onMessageSent }) {
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  // Load messages when contact changes
  useEffect(() => {
    if (!contact) return;
    setMessages([]);
    getMessages(contact.wa_id).then(setMessages).catch(console.error);
  }, [contact?.wa_id]);

  // Real-time: incoming messages and status updates
  useEffect(() => {
    if (!socket || !contact) return;

    function onNewMessage({ message }) {
      if (message.contact_wa_id !== contact.wa_id) return;
      setMessages((prev) => {
        if (prev.some((m) => m.wamid === message.wamid)) return prev;
        return [...prev, message];
      });
    }

    function onStatus({ wamid, status }) {
      setMessages((prev) =>
        prev.map((m) => (m.wamid === wamid ? { ...m, status } : m))
      );
    }

    socket.on("new_message", onNewMessage);
    socket.on("message_status", onStatus);
    return () => {
      socket.off("new_message", onNewMessage);
      socket.off("message_status", onStatus);
    };
  }, [socket, contact?.wa_id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(text) {
    setError(null);
    setSending(true);
    // Optimistic update
    const optimistic = {
      wamid: `opt_${Date.now()}`,
      contact_wa_id: contact.wa_id,
      direction: "outbound",
      type: "text",
      body: text,
      status: "sent",
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const { wamid } = await sendMessage(contact.wa_id, text);
      setMessages((prev) =>
        prev.map((m) => (m.wamid === optimistic.wamid ? { ...m, wamid } : m))
      );
      onMessageSent?.(contact.wa_id, text);
    } catch (err) {
      setError(err.response?.data?.error ?? "Failed to send. Try again.");
      setMessages((prev) => prev.filter((m) => m.wamid !== optimistic.wamid));
    } finally {
      setSending(false);
    }
  }

  if (!contact) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center text-muted-foreground">
          <div className="text-5xl mb-3">💬</div>
          <p className="text-lg font-medium">Select a conversation</p>
          <p className="text-sm mt-1">Choose from your existing chats on the left</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shadow-sm">
        <Avatar name={contact.name} className="w-10 h-10" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{contact.name}</p>
          <p className="text-xs text-muted-foreground">+{contact.phone}</p>
        </div>
        <Button variant="ghost" size="icon">
          <Phone className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-muted/10 space-y-0.5">
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground mt-10">
            No messages yet. Say hello!
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.wamid ?? msg.id} message={msg} />
        ))}
        {error && (
          <p className="text-center text-xs text-red-500 mt-2">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      <SendBar onSend={handleSend} disabled={sending} />
    </div>
  );
}
