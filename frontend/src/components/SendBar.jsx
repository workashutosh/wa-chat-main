import { useState, useRef, useEffect } from "react";
import { Send, StickyNote, Zap, X } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { cn } from "../lib/utils";
import { getCannedResponses } from "../lib/api";

export function SendBar({ onSend, onNote, onTemplate, disabled, replyTo, onClearReply }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("message"); // "message" | "note"
  const [canned, setCanned] = useState([]);
  const [showCanned, setShowCanned] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    getCannedResponses().then(setCanned).catch(() => {});
  }, []);

  // Trigger canned when user types "/"
  useEffect(() => {
    if (text === "/") setShowCanned(true);
    else if (!text.startsWith("/")) setShowCanned(false);
    else {
      const q = text.slice(1).toLowerCase();
      setShowCanned(q.length >= 0);
    }
  }, [text]);

  function handleSubmit(e) {
    e?.preventDefault();
    if (!text.trim() || disabled) return;
    if (mode === "note") onNote?.(text.trim());
    else onSend?.(text.trim());
    setText("");
    setShowCanned(false);
    onClearReply?.();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }

  function applyCanned(body) {
    setText(body);
    setShowCanned(false);
    textRef.current?.focus();
  }

  const filteredCanned = text.startsWith("/")
    ? canned.filter((c) => c.shortcut.includes(text.slice(1).toLowerCase()) || c.title.toLowerCase().includes(text.slice(1).toLowerCase()))
    : canned;

  return (
    <div className="border-t border-border bg-background">
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 mx-4 mt-2 px-3 py-2 bg-muted rounded-lg border-l-4 border-primary">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-primary mb-0.5">
              {replyTo.direction === "outbound" ? (replyTo.sender_name ?? "Agent") : "Customer"}
            </p>
            <p className="text-xs text-muted-foreground truncate">{replyTo.body}</p>
          </div>
          <button onClick={onClearReply} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Mode tabs */}
      <div className="flex gap-1 px-4 pt-2">
        <button onClick={() => setMode("message")} className={cn("text-xs px-3 py-1 rounded-full font-medium transition-colors", mode === "message" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          Message
        </button>
        <button onClick={() => setMode("note")} className={cn("text-xs px-3 py-1 rounded-full font-medium transition-colors flex items-center gap-1", mode === "note" ? "bg-amber-400 text-white" : "text-muted-foreground hover:text-foreground")}>
          <StickyNote className="w-3 h-3" /> Note
        </button>
      </div>

      {/* Canned responses popup */}
      {showCanned && filteredCanned.length > 0 && (
        <div className="mx-4 mb-1 mt-2 border border-border rounded-lg overflow-hidden shadow-sm">
          {filteredCanned.slice(0, 6).map((c) => (
            <button key={c.id} onClick={() => applyCanned(c.body)} className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center gap-2">
              <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">/{c.shortcut}</span>
              <span className="font-medium">{c.title}</span>
              <span className="text-muted-foreground truncate flex-1">{c.body}</span>
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 px-4 py-3">
        <div className="flex-1 relative">
          <Textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === "note" ? "Add internal note… (visible to team only)" : "Type a message… (/ for canned responses)"}
            disabled={disabled}
            className={cn("pr-2", mode === "note" && "border-amber-300 focus-visible:ring-amber-400")}
            rows={1}
            style={{ maxHeight: 120, overflowY: "auto" }}
          />
        </div>
        <div className="flex gap-1">
          {onTemplate && (
            <Button type="button" variant="outline" size="icon" onClick={onTemplate} title="Send template">
              <Zap className="w-4 h-4" />
            </Button>
          )}
          <Button type="submit" size="icon" disabled={!text.trim() || disabled} className={mode === "note" ? "bg-amber-400 hover:bg-amber-500" : ""}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
