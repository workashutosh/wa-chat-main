import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Download, MessageSquare, SlidersHorizontal, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../components/ui/button";
import { getConversations, getAgents, setLeadStatus, setConversationLabel, getTemplates, broadcastTemplate } from "../lib/api";
import { Dialog } from "../components/ui/dialog";
import { useAuth } from "../hooks/useAuth";

const LEAD_STATUSES = [
  { value: "new_lead",   label: "New Lead",   color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-950",   dot: "bg-blue-500" },
  { value: "working_on", label: "Working On", color: "text-amber-600",  bg: "bg-amber-50 dark:bg-amber-950", dot: "bg-amber-500" },
  { value: "qualified",  label: "Qualified",  color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950", dot: "bg-purple-500" },
  { value: "converted",  label: "Converted",  color: "text-emerald-600",bg: "bg-emerald-50 dark:bg-emerald-950", dot: "bg-emerald-500" },
  { value: "closed",     label: "Closed",     color: "text-gray-500",   bg: "bg-gray-100 dark:bg-gray-800",  dot: "bg-gray-400" },
];

const TICKET_STATUSES = ["open", "pending", "resolved"];
const SOURCES = ["All", "whatsapp", "import", "web"];

function statusCfg(v) { return LEAD_STATUSES.find(s => s.value === v) ?? LEAD_STATUSES[0]; }

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Broadcast Modal ───────────────────────────────────────────────────────────
function BroadcastModal({ leads, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { getTemplates().then(ts => setTemplates(ts.filter(t => t.status === "APPROVED" && t.enabled))); }, []);

  async function handleSend() {
    if (!selected) return toast.error("Pick a template");
    setSending(true);
    try {
      const wa_ids = leads.map(l => l.contact_wa_id);
      const r = await broadcastTemplate(wa_ids, selected.name, selected.language, []);
      setResult(r);
    } catch (err) {
      toast.error(err.response?.data?.error ?? "Broadcast failed");
    } finally { setSending(false); }
  }

  return (
    <Dialog open onClose={onClose} title="Broadcast to Leads">
      {result ? (
        <div className="text-center py-4 space-y-3">
          <p className="text-2xl font-bold text-emerald-500">{result.sent} sent</p>
          {result.failed > 0 && <p className="text-sm text-red-500">{result.failed} failed</p>}
          <p className="text-sm text-muted-foreground">out of {result.total} contacts</p>
          <Button onClick={onClose} className="w-full">Done</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Sending to <span className="font-semibold text-foreground">{leads.length}</span> leads</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {templates.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No enabled approved templates found</p>}
            {templates.map(t => (
              <button key={t.id} onClick={() => setSelected(t)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${selected?.id === t.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                <p className="font-medium text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.language} · {t.category}</p>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSend} disabled={!selected || sending} className="flex-1">
              {sending ? "Sending…" : `Send to ${leads.length} leads`}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Leads() {
  const navigate = useNavigate();
  const { agent } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [showBroadcast, setShowBroadcast] = useState(false);

  // filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [label, setLabel] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [ticketStatus, setTicketStatus] = useState("open");
  const [leadStatusFilter, setLeadStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("recent");

  useEffect(() => {
    setLoading(true);
    Promise.all([getConversations({}), getAgents()])
      .then(([convs, ags]) => { setConversations(convs); setAgents(ags); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let rows = [...conversations];
    if (ticketStatus !== "all") rows = rows.filter(r => r.status === ticketStatus);
    if (leadStatusFilter !== "All") rows = rows.filter(r => (r.lead_status ?? "new_lead") === leadStatusFilter);
    if (agentFilter) rows = rows.filter(r => String(r.assigned_to) === agentFilter);
    if (sourceFilter !== "All") rows = rows.filter(r => (r.contact_source ?? "whatsapp") === sourceFilter);
    if (label.trim()) rows = rows.filter(r => (r.label ?? "").toLowerCase().includes(label.toLowerCase()));
    if (startDate) rows = rows.filter(r => r.last_message_at >= new Date(startDate).getTime());
    if (endDate) rows = rows.filter(r => r.last_message_at <= new Date(endDate).getTime() + 86400000);
    if (sortBy === "recent") rows.sort((a, b) => b.last_message_at - a.last_message_at);
    else if (sortBy === "oldest") rows.sort((a, b) => a.last_message_at - b.last_message_at);
    else if (sortBy === "name") rows.sort((a, b) => (a.contact_name ?? "").localeCompare(b.contact_name ?? ""));
    return rows;
  }, [conversations, ticketStatus, leadStatusFilter, agentFilter, sourceFilter, label, startDate, endDate, sortBy]);

  const selectedLeads = filtered.filter(r => selected.has(r.id));
  const broadcastTargets = selected.size > 0 ? selectedLeads : filtered;

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.id)));
  }

  async function handleLeadStatusChange(conv, val) {
    setConversations(cs => cs.map(c => c.id === conv.id ? { ...c, lead_status: val } : c));
    try { await setLeadStatus(conv.id, val); }
    catch { setConversations(cs => cs.map(c => c.id === conv.id ? { ...c, lead_status: conv.lead_status } : c)); }
  }

  async function handleLabelChange(conv, val) {
    setConversations(cs => cs.map(c => c.id === conv.id ? { ...c, label: val } : c));
    try { await setConversationLabel(conv.id, val || null); }
    catch {}
  }

  function exportCSV() {
    const rows = filtered.map(r => [
      r.id, r.contact_name, r.phone, r.lead_status ?? "new_lead",
      r.label ?? "", r.agent_name ?? "", r.status,
      r.contact_source ?? "whatsapp", fmtDate(r.last_message_at)
    ]);
    const header = "ID,Name,Phone,Lead Status,Label,Agent,Ticket Status,Source,Date\n";
    const csv = header + rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `leads_${Date.now()}.csv`;
    a.click();
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <div className="flex-1">
          <h2 className="font-semibold text-lg">Lead Management</h2>
          <p className="text-xs text-muted-foreground">View and manage your sales leads in one place</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5"><Download className="w-4 h-4" />Export</Button>
        <Button size="sm" onClick={() => setShowBroadcast(true)} className="gap-1.5">
          <MessageSquare className="w-4 h-4" />
          Broadcast {selected.size > 0 ? `(${selected.size})` : `(${filtered.length})`}
        </Button>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-border bg-muted/20 space-y-2">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Label</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Filter by label…"
              className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Agent Assigned</label>
            <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
              className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none">
              <option value="">All Agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Source</label>
            <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
              className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none">
              {SOURCES.map(s => <option key={s} value={s}>{s === "All" ? "All Sources" : s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Ticket Status</label>
            <select value={ticketStatus} onChange={e => setTicketStatus(e.target.value)}
              className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none">
              <option value="all">All</option>
              {TICKET_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Lead Status</label>
            <select value={leadStatusFilter} onChange={e => setLeadStatusFilter(e.target.value)}
              className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none">
              <option value="All">All</option>
              {LEAD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Sort By</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none">
              <option value="recent">Most Recent</option>
              <option value="oldest">Oldest First</option>
              <option value="name">Name A-Z</option>
            </select>
          </div>
          <div className="flex items-end">
            <div className="text-sm font-medium">
              <span className="text-muted-foreground">Leads: </span>
              <span className="text-primary font-bold">{filtered.length}</span>
              {selected.size > 0 && <span className="text-muted-foreground ml-2">({selected.size} selected)</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No leads match your filters</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 backdrop-blur border-b border-border">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll} className="rounded" />
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Lead Status</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Label</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Agent Assigned</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Date & Time</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(conv => {
                const ls = statusCfg(conv.lead_status ?? "new_lead");
                return (
                  <tr key={conv.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${selected.has(conv.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(conv.id)}
                        onChange={() => setSelected(s => { const n = new Set(s); n.has(conv.id) ? n.delete(conv.id) : n.add(conv.id); return n; })}
                        className="rounded" />
                    </td>
                    <td className="px-3 py-3">
                      <select value={conv.lead_status ?? "new_lead"} onChange={e => handleLeadStatusChange(conv, e.target.value)}
                        className={`text-xs font-medium rounded-lg px-2 py-1 border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/30 ${ls.bg} ${ls.color}`}>
                        {LEAD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-primary cursor-pointer hover:underline" onClick={() => navigate("/", { state: { openConvId: conv.id } })}>
                        {conv.contact_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{conv.phone}</p>
                    </td>
                    <td className="px-3 py-3">
                      <input value={conv.label ?? ""} onChange={e => handleLabelChange(conv, e.target.value)}
                        onBlur={e => setConversationLabel(conv.id, e.target.value || null).catch(() => {})}
                        placeholder="Add label…"
                        className="text-xs border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 w-28" />
                    </td>
                    <td className="px-3 py-3 text-sm">{conv.agent_name ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full
                        ${conv.status === "open" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : conv.status === "pending" ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${conv.status === "open" ? "bg-emerald-500" : conv.status === "pending" ? "bg-amber-500" : "bg-gray-400"}`} />
                        {conv.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{fmtDate(conv.last_message_at)}</td>
                    <td className="px-3 py-3">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="w-3 h-3" />{conv.notes_count ?? 0}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => navigate("/", { state: { openConvId: conv.id } })}
                        title="Open in chat"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border text-muted-foreground hover:text-primary hover:bg-muted transition-colors">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showBroadcast && (
        <BroadcastModal leads={broadcastTargets} onClose={() => setShowBroadcast(false)} />
      )}
    </div>
  );
}
