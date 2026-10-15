import { Check, CheckCheck, StickyNote, Reply } from "lucide-react";
import { cn, formatMessageTime } from "../lib/utils";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const STATUS_ICON = {
  sent:      <Check className="w-3 h-3" />,
  delivered: <CheckCheck className="w-3 h-3" />,
  read:      <CheckCheck className="w-3 h-3 text-sky-400" />,
};

function resolveMediaUrl(message) {
  if (!message.media_url) return null;
  if (message.direction === "inbound") return `${API_URL}/api/media/${message.media_url}`;
  // outbound: media_url is like /uploads/outbound/filename.jpg (blob URL during optimistic)
  if (message.media_url.startsWith("blob:")) return message.media_url;
  return `${API_URL}${message.media_url}`;
}

export function MessageBubble({ message, onReply }) {
  const out = message.direction === "outbound";
  const isNote = message.is_note === 1;
  const isImage = message.type === "image" && message.media_url;

  const replyLabel = message.reply_to_direction === "outbound"
    ? (message.reply_to_sender_name ?? "Agent")
    : "Customer";

  return (
    <div className={cn("group flex mb-1 items-end gap-1", out ? "justify-end" : "justify-start")}>
      {/* Reply button for outbound (left side) */}
      {!isNote && out && (
        <button
          onClick={() => onReply?.(message)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-muted text-muted-foreground shrink-0 mb-1"
          title="Reply"
        >
          <Reply className="w-3.5 h-3.5" />
        </button>
      )}

      <div className={cn("max-w-[72%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
        isNote
          ? "bg-amber-50 border border-amber-200 text-amber-900 rounded-br-sm"
          : out
          ? "bg-primary text-primary-foreground rounded-br-sm"
          : "bg-white border border-border rounded-bl-sm",
        isImage && "p-1.5"
      )}>
        {isNote && (
          <div className="flex items-center gap-1 text-[11px] text-amber-600 mb-1 font-medium px-2 pt-1">
            <StickyNote className="w-3 h-3" /> Internal Note
            {message.sender_name && <span>· {message.sender_name}</span>}
          </div>
        )}
        {!isNote && out && message.sender_name && !isImage && (
          <p className="text-[11px] text-primary-foreground/60 mb-0.5">{message.sender_name}</p>
        )}

        {/* Quoted reply block */}
        {message.reply_to_wamid && message.reply_to_body && (
          <div className={cn(
            "mb-2 px-2.5 py-1.5 rounded-lg border-l-4 text-[12px]",
            isImage ? "mx-1 mt-1" : "",
            out
              ? "bg-primary-foreground/10 border-primary-foreground/40 text-primary-foreground/80"
              : "bg-muted/60 border-primary/50 text-muted-foreground"
          )}>
            <p className={cn("font-semibold text-[11px] mb-0.5", out ? "text-primary-foreground/60" : "text-primary")}>
              {replyLabel}
            </p>
            <p className="truncate leading-snug">{message.reply_to_body}</p>
          </div>
        )}

        {/* Image */}
        {isImage && (
          <a href={resolveMediaUrl(message)} target="_blank" rel="noopener noreferrer" className="block">
            <img
              src={resolveMediaUrl(message)}
              alt="Image"
              className="rounded-xl max-w-full max-h-64 object-cover"
              loading="lazy"
            />
          </a>
        )}

        {/* Caption or text body */}
        {(!isImage || message.body && message.body !== "📷 Image") && !isNote && isImage ? (
          <p className={cn("break-words leading-relaxed whitespace-pre-wrap px-1.5 pt-1 text-sm", out ? "text-primary-foreground" : "text-foreground")}>
            {message.body !== "📷 Image" ? message.body : null}
          </p>
        ) : !isImage ? (
          <p className="break-words leading-relaxed whitespace-pre-wrap">{message.body}</p>
        ) : null}

        {/* Timestamp + status */}
        <div className={cn(
          "flex items-center gap-1 mt-0.5 justify-end text-[11px]",
          isImage ? "px-1.5 pb-0.5" : "mt-1",
          isNote ? "text-amber-500" : out ? "text-primary-foreground/60" : "text-muted-foreground"
        )}>
          <span>{formatMessageTime(message.timestamp)}</span>
          {out && !isNote && STATUS_ICON[message.status]}
        </div>
      </div>

      {/* Reply button for inbound (right side) */}
      {!isNote && !out && (
        <button
          onClick={() => onReply?.(message)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-muted text-muted-foreground shrink-0 mb-1"
          title="Reply"
        >
          <Reply className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
