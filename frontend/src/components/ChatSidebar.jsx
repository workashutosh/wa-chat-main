import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "./ui/input";
import { Avatar } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { cn, formatTime } from "../lib/utils";

export function ChatSidebar({ contacts, activeId, onSelect }) {
  const [query, setQuery] = useState("");

  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.phone.includes(query)
  );

  return (
    <aside className="flex flex-col w-80 shrink-0 border-r border-border bg-background">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border">
        <h1 className="text-xl font-semibold mb-3">Chats</h1>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search contacts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Contact list */}
      <ul className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <li className="py-12 text-center text-muted-foreground text-sm">No conversations yet</li>
        )}
        {filtered.map((contact) => (
          <li key={contact.wa_id}>
            <button
              onClick={() => onSelect(contact)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors",
                activeId === contact.wa_id && "bg-muted"
              )}
            >
              <Avatar name={contact.name} className="w-11 h-11 text-base" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium text-sm truncate">{contact.name}</span>
                  {contact.last_message_at > 0 && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatTime(contact.last_message_at)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <p className="text-xs text-muted-foreground truncate">
                    {contact.last_direction === "outbound" && (
                      <span className="mr-1 text-primary">You:</span>
                    )}
                    {contact.last_message ?? "No messages yet"}
                  </p>
                  {contact.unread_count > 0 && activeId !== contact.wa_id && (
                    <Badge className="shrink-0">{contact.unread_count}</Badge>
                  )}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
