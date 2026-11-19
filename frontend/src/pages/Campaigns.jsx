import { useEffect, useState, useCallback, useRef } from "react";
import { Plus, Rocket, Trash2, Users, Tag, List, ChevronDown, ChevronUp, Eye, BarChart2, RefreshCw, Send, CheckCircle, XCircle, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Dialog } from "../components/ui/dialog";
import { useSocket } from "../hooks/useSocket";
import { cn, formatTime } from "../lib/utils";
import {
  getCampaigns, getCampaign, createCampaign, updateCampaign, deleteCampaign,
  launchCampaign, previewAudience, getTemplates, getTags, getContacts,
} from "../lib/api";

const STATUS_COLOR = {
  draft:     "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  running:   "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  failed:    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function getTemplateBodyVars(template) {
  if (!template) return [];
  let components = [];
  try { components = typeof template.components === "string" ? JSON.parse(template.components) : template.components; } catch {}
  const body = components.find((c) => c.type === "BODY");
  if (!body?.text) return [];
  const matches = [...body.text.matchAll(/\{\{(\d+)\}\}/g)];
  return [...new Set(matches.map((m) => parseInt(m[1])))].sort((a, b) => a - b);
}

function renderTemplateBody(template, varValues) {
  if (!template) return "";
  let components = [];
  try { components = typeof template.components === "string" ? JSON.parse(template.components) : template.components; } catch {}
  const body = components.find((c) => c.type === "BODY");
  if (!body?.text) return "";
  return body.text.replace(/\{\{(\d+)\}\}/g, (_, n) => varValues[n] || `{{${n}}}`);
}

// ── New / Edit Campaign Dialog ────────────────────────────────────────────────
function CampaignForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [templates, setTemplates] = useState([]);
  const [tags, setTags] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [varValues, setVarValues] = useState({});
  const [audienceCount, setAudienceCount] = useState(null);
  const [saving, setSaving] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState(() => {
    if (initial.audience_type === "custom" && initial.audience_value) {
      try { return new Set(JSON.parse(initial.audience_value)); } catch {}
    }
    return new Set();
  });

  useEffect(() => {
    getTemplates().then((t) => setTemplates(t.filter((x) => x.status === "APPROVED" && x.enabled !== 0))).catch(() => {});
    getTags().then(setTags).catch(() => {});
    getContacts().then(setContacts).catch(() => {});
  }, []);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const selectedTemplate = templates.find((t) => t.name === form.template_name);
  const bodyVars = getTemplateBodyVars(selectedTemplate);

  // Refresh audience count whenever audience config changes
  useEffect(() => {
    const aVal = form.audience_type === "custom"
      ? JSON.stringify([...selectedContacts])
      : form.audience_value;
    previewAudience({ audience_type: form.audience_type, audience_value: aVal })
      .then((r) => setAudienceCount(r.count))
      .catch(() => setAudienceCount(null));
  }, [form.audience_type, form.audience_value, selectedContacts]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name?.trim()) return toast.error("Campaign name required");
    if (!form.template_name) return toast.error("Select a template");
    if (form.audience_type === "tag" && !form.audience_value) return toast.error("Select a tag");
    if (form.audience_type === "custom" && selectedContacts.size === 0) return toast.error("Select at least one contact");
    if (bodyVars.some((n) => !varValues[n]?.trim())) return toast.error("Fill in all template variables");

    const components = bodyVars.length > 0 ? [{
      type: "body",
      parameters: bodyVars.map((n) => ({ type: "text", text: varValues[n] })),
    }] : [];

    const payload = {
      name: form.name.trim(),
      template_name: form.template_name,
      language: selectedTemplate?.language ?? "en_US",
      components,
      audience_type: form.audience_type,
      audience_value: form.audience_type === "custom"
        ? JSON.stringify([...selectedContacts])
        : (form.audience_value ?? null),
    };

    setSaving(true);
    try { await onSave(payload); }
    catch (err) { toast.error(err.response?.data?.error ?? "Save failed"); }
    finally { setSaving(false); }
  }

  const filteredContacts = contacts.filter((c) =>
    contactSearch === "" || c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.wa_id.includes(contactSearch)
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <div>
        <label className="text-sm font-medium block mb-1.5">Campaign Name <span className="text-red-500">*</span></label>
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. November Promo Blast" />
      </div>

      {/* Template */}
      <div>
        <label className="text-sm font-medium block mb-1.5">Template <span className="text-red-500">*</span></label>
        <Select value={form.template_name} onChange={(e) => { set("template_name", e.target.value); setVarValues({}); }}>
          <option value="">— Select approved template —</option>
          {templates.map((t) => <option key={t.id} value={t.name}>{t.name} ({t.language})</option>)}
        </Select>
        {templates.length === 0 && <p className="text-xs text-muted-foreground mt-1">No approved templates available. Sync templates first.</p>}
      </div>

      {/* Template body preview + var inputs */}
      {selectedTemplate && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/50 px-4 py-2.5 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Template Preview</p>
          </div>
          <div className="px-4 py-3 bg-background">
            <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
              {renderTemplateBody(selectedTemplate, varValues) || <span className="text-muted-foreground italic">No body text</span>}
            </p>
          </div>
          {bodyVars.length > 0 && (
            <div className="px-4 pb-3 pt-1 border-t border-border bg-muted/20 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {bodyVars.map((n) => (
                <div key={n}>
                  <label className="text-xs text-muted-foreground block mb-1">{`{{${n}}}`}</label>
                  <Input
                    value={varValues[n] ?? ""}
                    onChange={(e) => setVarValues((p) => ({ ...p, [n]: e.target.value }))}
                    placeholder={`Variable ${n}`}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audience */}
      <div>
        <label className="text-sm font-medium block mb-1.5">Audience <span className="text-red-500">*</span></label>
        <div className="flex gap-2 mb-3">
          {[
            { v: "all", label: "All contacts", icon: Users },
            { v: "tag", label: "By tag", icon: Tag },
            { v: "custom", label: "Custom", icon: List },
          ].map(({ v, label, icon: Icon }) => (
            <button key={v} type="button" onClick={() => set("audience_type", v)}
              className={cn("flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-colors",
                form.audience_type === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              )}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {form.audience_type === "tag" && (
          <Select value={form.audience_value ?? ""} onChange={(e) => set("audience_value", e.target.value)}>
            <option value="">— Select tag —</option>
            {tags.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </Select>
        )}

        {form.audience_type === "custom" && (
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-muted/40 flex items-center justify-between gap-2">
              <Input className="h-7 text-sm flex-1" placeholder="Search contacts…" value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} />
              <span className="text-xs text-muted-foreground shrink-0">{selectedContacts.size} selected</span>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-border">
              {filteredContacts.slice(0, 100).map((c) => (
                <label key={c.wa_id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30">
                  <input type="checkbox" checked={selectedContacts.has(c.wa_id)}
                    onChange={() => setSelectedContacts((prev) => {
                      const next = new Set(prev);
                      next.has(c.wa_id) ? next.delete(c.wa_id) : next.add(c.wa_id);
                      return next;
                    })}
                    className="accent-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.wa_id}</p>
                  </div>
                </label>
              ))}
              {filteredContacts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No contacts found</p>}
            </div>
          </div>
        )}

        {/* Audience count */}
        {audienceCount !== null && (
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Users className="w-3 h-3" />
            {audienceCount === 0 ? "No eligible contacts in this audience" : `${audienceCount} contact${audienceCount !== 1 ? "s" : ""} will receive this campaign`}
          </p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving ? "Saving…" : "Save Campaign"}
        </Button>
      </div>
    </form>
  );
}

// ── Recipient list dialog ─────────────────────────────────────────────────────
function RecipientsDialog({ campaign, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!campaign) return;
    getCampaign(campaign.id).then(setData).catch(() => {});
  }, [campaign?.id]);

  if (!campaign) return null;
  return (
    <Dialog open onClose={onClose} title={`Recipients — ${campaign.name}`} className="max-w-2xl">
      {!data ? (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total", value: data.total, color: "text-foreground" },
              { label: "Sent", value: data.sent, color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Failed", value: data.failed, color: "text-red-600 dark:text-red-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="border border-border rounded-lg p-3 text-center bg-muted/20">
                <p className={cn("text-2xl font-bold", color)}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_80px_120px] text-xs font-medium text-muted-foreground px-3 py-2 bg-muted/40 border-b border-border">
              <span>Contact</span><span>Phone</span><span>Status</span><span>Sent At</span>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-border">
              {data.recipients?.map((r) => (
                <div key={r.id} className="grid grid-cols-[1fr_1fr_80px_120px] text-sm px-3 py-2 items-center">
                  <span className="truncate">{r.contact_name ?? r.wa_id}</span>
                  <span className="text-muted-foreground truncate">{r.wa_id}</span>
                  <span className={cn("text-xs font-medium", r.status === "sent" ? "text-emerald-600 dark:text-emerald-400" : r.status === "failed" ? "text-red-500" : "text-muted-foreground")}>
                    {r.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{r.sent_at ? formatTime(r.sent_at) : "—"}</span>
                </div>
              ))}
              {!data.recipients?.length && <p className="text-sm text-muted-foreground text-center py-4">No recipients yet</p>}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [viewingCampaign, setViewingCampaign] = useState(null);
  const [launching, setLaunching] = useState(null);

  const BLANK = { name: "", template_name: "", language: "en_US", components: [], audience_type: "all", audience_value: null };

  const load = useCallback(() => {
    getCampaigns().then((data) => { setCampaigns(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live campaign progress via socket
  useSocket(null, null, null, ({ id, sent, failed, total, completed }) => {
    setCampaigns((prev) => prev.map((c) =>
      c.id === id
        ? { ...c, sent: sent ?? c.sent, failed: failed ?? c.failed, total: total ?? c.total, status: completed ? "completed" : c.status }
        : c
    ));
  });

  async function handleSave(payload) {
    if (editingCampaign) {
      const updated = await updateCampaign(editingCampaign.id, payload);
      setCampaigns((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      toast.success("Campaign updated");
    } else {
      const created = await createCampaign(payload);
      setCampaigns((prev) => [created, ...prev]);
      toast.success("Campaign created");
    }
    setShowForm(false);
    setEditingCampaign(null);
  }

  async function handleDelete(campaign) {
    if (!window.confirm(`Delete "${campaign.name}"?`)) return;
    await deleteCampaign(campaign.id);
    setCampaigns((prev) => prev.filter((c) => c.id !== campaign.id));
    toast.success("Deleted");
  }

  async function handleLaunch(campaign) {
    if (!window.confirm(`Launch "${campaign.name}" to ${campaign.total || "?"} contacts? This cannot be undone.`)) return;
    setLaunching(campaign.id);
    try {
      const result = await launchCampaign(campaign.id);
      setCampaigns((prev) => prev.map((c) => c.id === campaign.id ? { ...c, status: "running", total: result.total } : c));
      toast.success(`Campaign launched — sending to ${result.total} contacts`);
    } catch (err) {
      toast.error(err.response?.data?.error ?? "Launch failed");
    } finally {
      setLaunching(null);
    }
  }

  const pct = (c) => c.total > 0 ? Math.round(((c.sent + c.failed) / c.total) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Campaigns</h1>
          <p className="text-xs text-muted-foreground">Bulk template messages to your contacts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => { setEditingCampaign(null); setShowForm(true); }} className="gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> New Campaign
          </Button>
        </div>
      </div>

      {/* Campaign list */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Loading…</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No campaigns yet</p>
            <p className="text-sm mt-1">Create your first campaign to send bulk WhatsApp messages</p>
            <Button className="mt-4 gap-1.5" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4" /> Create Campaign
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-6xl">
            {campaigns.map((c) => (
              <div key={c.id} className="border border-border rounded-xl bg-background overflow-hidden hover:border-primary/30 transition-colors">
                {/* Card header */}
                <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Template: <span className="text-foreground">{c.template_name}</span>
                    </p>
                  </div>
                  <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 capitalize", STATUS_COLOR[c.status])}>
                    {c.status}
                  </span>
                </div>

                {/* Stats */}
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {c.audience_type === "all" ? "All contacts" : c.audience_type === "tag" ? `Tag: ${c.audience_value}` : "Custom selection"}
                    </span>
                    <span>{formatTime(c.created_at)}</span>
                  </div>

                  {c.status !== "draft" && (
                    <>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle className="w-3 h-3" /> {c.sent} sent
                        </span>
                        <span className="flex items-center gap-1 text-red-500">
                          <XCircle className="w-3 h-3" /> {c.failed} failed
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground ml-auto">
                          <Clock className="w-3 h-3" /> {c.total} total
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full flex">
                          <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${c.total > 0 ? (c.sent / c.total) * 100 : 0}%` }} />
                          <div className="bg-red-400 transition-all duration-500" style={{ width: `${c.total > 0 ? (c.failed / c.total) * 100 : 0}%` }} />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground text-right">{pct(c)}% processed</p>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="px-4 pb-3 flex gap-2">
                  {c.status === "draft" && (
                    <>
                      <Button size="sm" variant="outline" className="flex-1 text-xs gap-1"
                        onClick={() => { setEditingCampaign(c); setShowForm(true); }}>
                        Edit
                      </Button>
                      <Button size="sm" className="flex-1 text-xs gap-1"
                        disabled={launching === c.id}
                        onClick={() => handleLaunch(c)}>
                        <Rocket className="w-3 h-3" />
                        {launching === c.id ? "Launching…" : "Launch"}
                      </Button>
                    </>
                  )}
                  {c.status !== "draft" && (
                    <Button size="sm" variant="outline" className="flex-1 text-xs gap-1"
                      onClick={() => setViewingCampaign(c)}>
                      <Eye className="w-3 h-3" /> View Recipients
                    </Button>
                  )}
                  {c.status !== "running" && (
                    <Button size="sm" variant="outline" className="text-xs text-red-500 hover:text-red-600 hover:border-red-300 dark:hover:border-red-800 px-2"
                      onClick={() => handleDelete(c)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / edit dialog */}
      <Dialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditingCampaign(null); }}
        title={editingCampaign ? `Edit — ${editingCampaign.name}` : "New Campaign"}
        className="max-w-2xl"
      >
        {showForm && (
          <CampaignForm
            initial={editingCampaign ?? BLANK}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditingCampaign(null); }}
          />
        )}
      </Dialog>

      {/* Recipients dialog */}
      <RecipientsDialog campaign={viewingCampaign} onClose={() => setViewingCampaign(null)} />
    </div>
  );
}
