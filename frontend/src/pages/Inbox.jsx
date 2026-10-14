import { useEffect, useRef, useState, useCallback } from "react";
import { Search, UserCheck, CheckCheck, RefreshCw, SquarePen } from "lucide-react";
import toast from "react-hot-toast";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Avatar } from "../components/ui/avatar";
import { StatusBadge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { MessageBubble } from "../components/MessageBubble";
import { SendBar } from "../components/SendBar";
import { useSocket } from "../hooks/useSocket";
import { useAuth } from "../hooks/useAuth.jsx";
import { cn, formatTime } from "../lib/utils";
import { getConversations, getMessages, sendMessage, addNote, assignConversation, setConversationStatus, getAgents, getTemplates, sendTemplate as apiSendTemplate, startNewChat } from "../lib/api";

export default function Inbox() {
  const { agent } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [newChat, setNewChat] = useState({ phone: "", name: "", message: "", template_name: "", language: "en_US", mode: "text" });
  const bottomRef = useRef(null);
  const sentWamids = useRef(new Set());

  const loadConversations = useCallback(() => {
    getConversations({ status: filter }).then(setConversations).catch(console.error);
  }, [filter]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { getAgents().then(setAgents).catch(() => {}); }, []);

  useEffect(() => {
    if (!active) return;
    getMessages(active.id).then(setMessages).catch(console.error);
    setConversations((prev) => prev.map((c) => c.id === active.id ? { ...c, unread_count: 0 } : c));
    setReplyTo(null);
  }, [active?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Socket
  useSocket(
    ({ conversation_id, contact_wa_id, contact_name, message }) => {
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === conversation_id);
        if (existing) {
          return [
            { ...existing, last_message: message.body, last_direction: message.direction, last_message_at: message.timestamp, unread_count: (active?.id === conversation_id || message.direction === "outbound") ? 0 : (existing.unread_count ?? 0) + 1 },
            ...prev.filter((c) => c.id !== conversation_id),
          ];
        }
        loadConversations();
        return prev;
      });
      if (active?.id === conversation_id) {
        if (sentWamids.current.has(message.wamid)) {
          sentWamids.current.delete(message.wamid);
          return; // skip echo of our own send
        }
        setMessages((prev) => prev.some((m) => m.wamid === message.wamid) ? prev : [...prev, message]);
      }
    },
    ({ wamid, status }) => {
      setMessages((prev) => prev.map((m) => m.wamid === wamid ? { ...m, status } : m));
    },
    ({ id, status, assigned_to }) => {
      setConversations((prev) => prev.map((c) => c.id === id ? { ...c, ...(status && { status }), ...(assigned_to !== undefined && { assigned_to }) } : c));
    }
  );

  async function handleSend(text) {
    setSending(true);
    const replyWamid = replyTo?.wamid ?? null;
    const opt = { id: `opt_${Date.now()}`, wamid: `opt_${Date.now()}`, conversation_id: active.id, direction: "outbound", type: "text", body: text, status: "sent", is_note: 0, sender_id: agent.id, sender_name: agent.name, timestamp: Date.now(), reply_to_wamid: replyWamid, reply_to_body: replyTo?.body ?? null, reply_to_direction: replyTo?.direction ?? null };
    setMessages((p) => [...p, opt]);
    setReplyTo(null);
    try {
      const msg = await sendMessage(active.id, text, replyWamid);
      if (msg?.wamid) sentWamids.current.add(msg.wamid);
      setMessages((p) => p.map((m) => m.id === opt.id ? { ...m, ...msg } : m));
    } catch (err) {
      toast.error(err.response?.data?.error ?? "Send failed");
      setMessages((p) => p.filter((m) => m.id !== opt.id));
    } finally { setSending(false); }
  }

  async function handleNote(text) {
    try {
      const msg = await addNote(active.id, text);
      setMessages((p) => [...p, msg]);
    } catch { toast.error("Failed to add note"); }
  }

  async function handleAssign(agentId) {
    await assignConversation(active.id, agentId || null);
    const a = agents.find((ag) => ag.id === parseInt(agentId));
    setConversations((p) => p.map((c) => c.id === active.id ? { ...c, assigned_to: agentId || null, agent_name: a?.name ?? null } : c));
    setActive((prev) => ({ ...prev, assigned_to: agentId || null, agent_name: a?.name ?? null }));
    setShowAssign(false);
    toast.success("Assigned");
  }

  async function handleStatus(status) {
    await setConversationStatus(active.id, status);
    setConversations((p) => p.map((c) => c.id === active.id ? { ...c, status } : c));
    setActive((prev) => ({ ...prev, status }));
    toast.success(`Marked as ${status}`);
  }

  async function handleNewChat() {
    const payload = { phone: newChat.phone.replace(/\D/g, ""), name: newChat.name };
    if (newChat.mode === "template") payload.template_name = newChat.template_name, payload.language = newChat.language;
    else payload.message = newChat.message;

    try {
      const { conversation } = await startNewChat(payload);
      toast.success("Chat started!");
      setShowNewChat(false);
      setNewChat({ phone: "", name: "", message: "", template_name: "", language: "en_US", mode: "text" });
      loadConversations();
      setActive(conversation);
    } catch (err) {
      toast.error(err.response?.data?.error ?? "Failed to start chat");
    }
  }

  async function handleSendTemplate() {
    if (!selectedTemplate) return;
    const t = JSON.parse(selectedTemplate.components ?? "[]");
    try {
      await apiSendTemplate(active.id, { template_name: selectedTemplate.name, language: selectedTemplate.language, components: [] });
      toast.success("Template sent");
      setShowTemplate(false);
      getMessages(active.id).then(setMessages);
    } catch (err) { toast.error(err.response?.data?.error ?? "Failed"); }
  }

  const filtered = conversations.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.contact_name?.toLowerCase().includes(q) || c.phone?.includes(q);
  });

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Conversation list */}
      <aside className="flex flex-col w-80 border-r border-border shrink-0">
        <div className="px-4 py-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Inbox</h2>
            <div className="flex items-center gap-1">
              <button onClick={loadConversations} className="text-muted-foreground hover:text-foreground" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
              <button onClick={() => { getTemplates().then(setTemplates); setShowNewChat(true); }} className="text-muted-foreground hover:text-foreground" title="New chat"><SquarePen className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1">
            {["open","pending","resolved"].map((s) => (
              <button key={s} onClick={() => setFilter(s)} className={cn("flex-1 text-xs py-1 rounded-md font-medium capitalize transition-colors", filter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {filtered.length === 0 && <li className="text-center text-muted-foreground text-sm py-12">No conversations</li>}
          {filtered.map((conv) => (
            <li key={conv.id}>
              <button onClick={() => setActive(conv)} className={cn("w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors", active?.id === conv.id && "bg-muted")}>
                <Avatar name={conv.contact_name ?? ""} className="w-10 h-10" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">{conv.contact_name}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{formatTime(conv.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.last_direction === "outbound" && <span className="text-primary mr-1">You:</span>}
                      {conv.last_message ?? "No messages"}
                    </p>
                    {conv.unread_count > 0 && active?.id !== conv.id && (
                      <span className="ml-1 bg-primary text-primary-foreground text-[10px] rounded-full min-w-[1.2rem] h-5 flex items-center justify-center px-1 shrink-0">{conv.unread_count}</span>
                    )}
                  </div>
                  {conv.agent_name && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1"><UserCheck className="w-3 h-3" />{conv.agent_name}</p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Chat panel */}
      {!active ? (
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
          <div><div className="text-5xl mb-3">💬</div><p className="font-medium">Select a conversation</p></div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shadow-sm">
            <Avatar name={active.contact_name ?? ""} className="w-10 h-10" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{active.contact_name}</p>
              <p className="text-xs text-muted-foreground">+{active.phone ?? active.contact_wa_id}</p>
            </div>
            <StatusBadge status={active.status} />
            <Button variant="outline" size="sm" onClick={() => setShowAssign(true)} className="text-xs gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              {active.agent_name ? active.agent_name : "Assign"}
            </Button>
            <Select value={active.status} onChange={(e) => handleStatus(e.target.value)} className="w-32 h-8 text-xs">
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
            </Select>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-muted/10 space-y-0.5">
            {messages.map((msg) => <MessageBubble key={msg.wamid ?? msg.id} message={msg} onReply={setReplyTo} />)}
            <div ref={bottomRef} />
          </div>

          <SendBar
            onSend={handleSend}
            onNote={handleNote}
            onTemplate={() => { getTemplates().then(setTemplates); setShowTemplate(true); }}
            disabled={sending}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
          />
        </div>
      )}

      {/* Assign dialog */}
      <Dialog open={showAssign} onClose={() => setShowAssign(false)} title="Assign conversation">
        <div className="space-y-2">
          <button onClick={() => handleAssign("")} className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted text-sm text-muted-foreground">Unassign</button>
          {agents.map((ag) => (
            <button key={ag.id} onClick={() => handleAssign(ag.id)} className={cn("w-full text-left px-3 py-2 rounded-lg hover:bg-muted text-sm flex items-center gap-2", active?.assigned_to === ag.id && "bg-muted font-medium")}>
              <Avatar name={ag.name} className="w-7 h-7 text-xs" />{ag.name}
              {active?.assigned_to === ag.id && <CheckCheck className="w-4 h-4 ml-auto text-primary" />}
            </button>
          ))}
        </div>
      </Dialog>

      {/* New Chat dialog */}
      <Dialog open={showNewChat} onClose={() => setShowNewChat(false)} title="Start new chat">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Phone number <span className="text-red-500">*</span></label>
            <Input value={newChat.phone} onChange={(e) => setNewChat((p) => ({ ...p, phone: e.target.value }))} className="mt-1" placeholder="919876543210 (with country code, no +)" />
            <p className="text-[11px] text-muted-foreground mt-1">Include country code, e.g. 91 for India</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Contact name</label>
            <Input value={newChat.name} onChange={(e) => setNewChat((p) => ({ ...p, name: e.target.value }))} className="mt-1" placeholder="Optional" />
          </div>

          {/* Message type toggle */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">Message type</label>
            <div className="flex gap-2">
              <button onClick={() => setNewChat((p) => ({ ...p, mode: "text" }))} className={`flex-1 text-sm py-2 rounded-lg border font-medium transition-colors ${newChat.mode === "text" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                Free text
                <p className="text-[10px] font-normal mt-0.5">Only for contacts who messaged in last 24h</p>
              </button>
              <button onClick={() => setNewChat((p) => ({ ...p, mode: "template" }))} className={`flex-1 text-sm py-2 rounded-lg border font-medium transition-colors ${newChat.mode === "template" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                Template
                <p className="text-[10px] font-normal mt-0.5">Required for new or cold contacts</p>
              </button>
            </div>
          </div>

          {newChat.mode === "text" ? (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Message</label>
              <Textarea value={newChat.message} onChange={(e) => setNewChat((p) => ({ ...p, message: e.target.value }))} className="mt-1" placeholder="Hi! Just checking in…" />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Template</label>
                <Select value={newChat.template_name} onChange={(e) => {
                  const t = templates.find((t) => t.name === e.target.value);
                  setNewChat((p) => ({ ...p, template_name: e.target.value, language: t?.language ?? p.language }));
                }} className="mt-1">
                  <option value="">Select a template…</option>
                  {templates.filter((t) => t.status === "APPROVED").map((t) => (
                    <option key={t.id} value={t.name}>{t.name} ({t.language})</option>
                  ))}
                </Select>
                {templates.filter((t) => t.status === "APPROVED").length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">No approved templates found. Go to Templates → Sync from Meta first.</p>
                )}
              </div>
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleNewChat}
            disabled={!newChat.phone.trim() || (newChat.mode === "text" ? !newChat.message.trim() : !newChat.template_name)}
          >
            Start conversation
          </Button>
        </div>
      </Dialog>

      {/* Template dialog */}
      <Dialog open={showTemplate} onClose={() => setShowTemplate(false)} title="Send template">
        <div className="space-y-3">
          {templates.filter((t) => t.status === "APPROVED").length === 0 && (
            <p className="text-sm text-muted-foreground">No approved templates. Sync from Meta first.</p>
          )}
          {templates.filter((t) => t.status === "APPROVED").map((t) => (
            <button key={t.id} onClick={() => setSelectedTemplate(t)} className={cn("w-full text-left px-3 py-2.5 rounded-lg border transition-colors", selectedTemplate?.id === t.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
              <p className="font-medium text-sm">{t.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t.language} · {t.category}</p>
            </button>
          ))}
          {selectedTemplate && (
            <Button className="w-full mt-2" onClick={handleSendTemplate}>Send "{selectedTemplate.name}"</Button>
          )}
        </div>
      </Dialog>
    </div>
  );
}
