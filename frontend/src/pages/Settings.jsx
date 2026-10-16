import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Shield, UserCheck, User, Sliders, Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog } from "../components/ui/dialog";
import { Select } from "../components/ui/select";
import { Avatar } from "../components/ui/avatar";
import { Textarea } from "../components/ui/textarea";
import { useAuth } from "../hooks/useAuth.jsx";
import { getAgents, createAgent, updateAgent, getCannedResponses, createCannedResponse, updateCannedResponse, deleteCannedResponse } from "../lib/api";

// ── Permission groups ─────────────────────────────────────────────────────────
const PERMISSION_GROUPS = [
  {
    key: "conversations",
    label: "Conversations",
    items: [
      { key: "view_all", label: "View all conversations" },
      { key: "reply", label: "Send messages" },
      { key: "assign", label: "Assign conversations" },
      { key: "change_status", label: "Change conversation status" },
      { key: "add_note", label: "Add internal notes" },
    ],
  },
  {
    key: "contacts",
    label: "Contacts",
    items: [
      { key: "view", label: "View contacts" },
      { key: "edit", label: "Edit contacts" },
      { key: "import", label: "Import contacts" },
      { key: "export", label: "Export contacts" },
      { key: "delete", label: "Delete contacts" },
    ],
  },
  {
    key: "automation",
    label: "Automation",
    items: [
      { key: "view", label: "View automation rules" },
      { key: "manage", label: "Create & edit rules" },
    ],
  },
  {
    key: "templates",
    label: "Templates",
    items: [
      { key: "view", label: "View templates" },
      { key: "sync", label: "Sync from Meta" },
    ],
  },
  {
    key: "team",
    label: "Team & Settings",
    items: [
      { key: "manage_team", label: "Manage team members" },
      { key: "canned", label: "Manage canned responses" },
    ],
  },
];

const TYPE_DEFAULTS = {
  admin: "all",
  manager: {
    conversations: { view_all: true, reply: true, assign: true, change_status: true, add_note: true },
    contacts: { view: true, edit: true, import: true, export: true, delete: false },
    automation: { view: true, manage: true },
    templates: { view: true, sync: true },
    team: { manage_team: true, canned: true },
  },
  agent: {
    conversations: { view_all: false, reply: true, assign: false, change_status: true, add_note: true },
    contacts: { view: true, edit: false, import: false, export: false, delete: false },
    automation: { view: false, manage: false },
    templates: { view: true, sync: false },
    team: { manage_team: false, canned: true },
  },
};

const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Argentina","Australia","Austria","Bangladesh","Belgium",
  "Brazil","Canada","Chile","China","Colombia","Denmark","Egypt","Ethiopia","Finland",
  "France","Germany","Ghana","Greece","Hungary","India","Indonesia","Iran","Iraq","Ireland",
  "Israel","Italy","Japan","Jordan","Kenya","Malaysia","Mexico","Morocco","Myanmar",
  "Netherlands","New Zealand","Nigeria","Norway","Pakistan","Peru","Philippines","Poland",
  "Portugal","Romania","Russia","Saudi Arabia","Singapore","South Africa","South Korea",
  "Spain","Sri Lanka","Sweden","Switzerland","Thailand","Turkey","UAE","Uganda","UK",
  "Ukraine","USA","Venezuela","Vietnam","Zimbabwe",
];

const AGENT_TYPES = [
  { value: "admin", label: "Admin", icon: Shield, desc: "Full system access" },
  { value: "manager", label: "Manager", icon: UserCheck, desc: "Manage team & conversations" },
  { value: "agent", label: "Agent", icon: User, desc: "Handle assigned conversations" },
  { value: "custom", label: "Custom Permission", icon: Sliders, desc: "Choose specific permissions" },
];

function emptyPerms() {
  const p = {};
  PERMISSION_GROUPS.forEach((g) => {
    p[g.key] = {};
    g.items.forEach((i) => { p[g.key][i.key] = false; });
  });
  return p;
}

function defaultPermsFor(type) {
  if (type === "admin") return emptyPerms(); // admin bypasses checks
  return TYPE_DEFAULTS[type] ? JSON.parse(JSON.stringify(TYPE_DEFAULTS[type])) : emptyPerms();
}

// ── Agent form ────────────────────────────────────────────────────────────────
function AgentForm({ initial, onSave, onCancel, isEdit }) {
  const [form, setForm] = useState(initial);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openGroups, setOpenGroups] = useState({});

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  function changeType(type) {
    set("agent_type", type);
    if (type !== "custom") set("permissions", defaultPermsFor(type));
  }

  function togglePerm(group, key) {
    setForm((p) => ({
      ...p,
      permissions: {
        ...p.permissions,
        [group]: { ...p.permissions[group], [key]: !p.permissions[group]?.[key] },
      },
    }));
  }

  function toggleGroup(group) {
    const items = PERMISSION_GROUPS.find((g) => g.key === group)?.items ?? [];
    const allOn = items.every((i) => form.permissions[group]?.[i.key]);
    const next = {};
    items.forEach((i) => { next[i.key] = !allOn; });
    setForm((p) => ({ ...p, permissions: { ...p.permissions, [group]: next } }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.email) return toast.error("Name and email required");
    if (!isEdit && !form.password) return toast.error("Password required");
    setSaving(true);
    try {
      await onSave({ ...form, permissions: JSON.stringify(form.permissions) });
    } finally { setSaving(false); }
  }

  const typeInfo = AGENT_TYPES.find((t) => t.value === form.agent_type);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 2-col grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">Name <span className="text-red-500">*</span></label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="John Doe" />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">Email <span className="text-red-500">*</span></label>
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="john@company.com" disabled={isEdit} />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">Country</label>
          <Select value={form.country ?? ""} onChange={(e) => set("country", e.target.value)}>
            <option value="">Select country…</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">Phone</label>
          <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="9876543210" />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">{isEdit ? "New Password" : "Password"} {!isEdit && <span className="text-red-500">*</span>}</label>
          <div className="relative">
            <Input
              type={showPass ? "text" : "password"}
              value={form.password ?? ""}
              onChange={(e) => set("password", e.target.value)}
              placeholder={isEdit ? "Leave blank to keep current" : "Min 8 characters"}
              className="pr-9"
            />
            <button type="button" onClick={() => setShowPass((p) => !p)} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">Agent Type <span className="text-red-500">*</span></label>
          <Select value={form.agent_type} onChange={(e) => changeType(e.target.value)}>
            {AGENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          {typeInfo && <p className="text-xs text-muted-foreground mt-1">{typeInfo.desc}</p>}
        </div>
      </div>

      {/* Custom permissions */}
      {form.agent_type === "custom" && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
            <p className="text-sm font-semibold">Custom Permissions</p>
            <p className="text-xs text-muted-foreground">Select exactly what this agent can access</p>
          </div>
          <div className="divide-y divide-border">
            {PERMISSION_GROUPS.map((group) => {
              const allOn = group.items.every((i) => form.permissions[group.key]?.[i.key]);
              const someOn = group.items.some((i) => form.permissions[group.key]?.[i.key]);
              const isOpen = openGroups[group.key] !== false;
              return (
                <div key={group.key}>
                  <button
                    type="button"
                    onClick={() => setOpenGroups((p) => ({ ...p, [group.key]: !isOpen }))}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={(el) => { if (el) el.indeterminate = !allOn && someOn; }}
                        onChange={(e) => { e.stopPropagation(); toggleGroup(group.key); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded accent-primary"
                      />
                      <span className="text-sm font-medium">{group.label}</span>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 bg-background">
                      {group.items.map((item) => (
                        <label key={item.key} className="flex items-center gap-2 cursor-pointer group/perm">
                          <input
                            type="checkbox"
                            checked={!!form.permissions[group.key]?.[item.key]}
                            onChange={() => togglePerm(group.key, item.key)}
                            className="w-4 h-4 rounded accent-primary"
                          />
                          <span className="text-sm text-muted-foreground group-hover/perm:text-foreground transition-colors">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Default perms preview (non-custom) */}
      {form.agent_type !== "custom" && form.agent_type !== "admin" && (
        <div className="border border-border rounded-xl p-4 bg-muted/20">
          <p className="text-sm font-medium mb-2">Default permissions for <span className="capitalize">{form.agent_type}</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {PERMISSION_GROUPS.map((group) =>
              group.items.map((item) => {
                const on = TYPE_DEFAULTS[form.agent_type]?.[group.key]?.[item.key];
                if (!on) return null;
                return (
                  <div key={group.key + item.key} className="flex items-center gap-1.5 text-xs text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    {item.label}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {form.agent_type === "admin" && (
        <div className="flex items-center gap-2 text-sm text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-4 py-3">
          <Shield className="w-4 h-4 shrink-0" />
          Admin has unrestricted access to all features.
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={saving}>{saving ? "Saving…" : isEdit ? "Save changes" : "Create agent"}</Button>
      </div>
    </form>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────
export default function Settings() {
  const { agent } = useAuth();
  const [tab, setTab] = useState("agents");
  const [agents, setAgents] = useState([]);
  const [canned, setCanned] = useState([]);
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [showCannedForm, setShowCannedForm] = useState(false);
  const [editingCanned, setEditingCanned] = useState(null);
  const [cannedForm, setCannedForm] = useState({ shortcut: "", title: "", body: "" });

  const BLANK_AGENT = { name: "", email: "", password: "", country: "", phone: "", agent_type: "agent", permissions: defaultPermsFor("agent"), is_active: true };

  function load() {
    getAgents().then(setAgents).catch(console.error);
    getCannedResponses().then(setCanned).catch(console.error);
  }
  useEffect(() => { load(); }, []);

  function openCreateAgent() { setEditingAgent(null); setShowAgentForm(true); }
  function openEditAgent(a) {
    let perms;
    try { perms = typeof a.permissions === "string" ? JSON.parse(a.permissions || "{}") : (a.permissions ?? {}); }
    catch { perms = defaultPermsFor(a.agent_type ?? "agent"); }
    setEditingAgent({ ...a, password: "", permissions: perms });
    setShowAgentForm(true);
  }

  async function handleSaveAgent(data) {
    try {
      if (editingAgent) {
        await updateAgent(editingAgent.id, data);
        toast.success("Agent updated");
      } else {
        await createAgent(data);
        toast.success("Agent created");
      }
      setShowAgentForm(false);
      load();
    } catch (err) { toast.error(err.response?.data?.error ?? "Failed"); }
  }

  async function handleToggleActive(a) {
    try {
      await updateAgent(a.id, { name: a.name, role: a.role, is_active: !a.is_active, phone: a.phone, country: a.country, agent_type: a.agent_type ?? "agent", permissions: a.permissions ?? "{}" });
      load();
      toast.success(a.is_active ? "Agent deactivated" : "Agent activated");
    } catch { toast.error("Failed"); }
  }

  function openCanned(c) {
    if (c) { setEditingCanned(c); setCannedForm({ shortcut: c.shortcut, title: c.title, body: c.body }); }
    else { setEditingCanned(null); setCannedForm({ shortcut: "", title: "", body: "" }); }
    setShowCannedForm(true);
  }

  async function handleSaveCanned() {
    try {
      if (editingCanned) await updateCannedResponse(editingCanned.id, cannedForm);
      else await createCannedResponse(cannedForm);
      toast.success("Saved");
      setShowCannedForm(false);
      load();
    } catch { toast.error("Failed"); }
  }

  async function handleDeleteCanned(id) {
    await deleteCannedResponse(id);
    setCanned((p) => p.filter((c) => c.id !== id));
    toast.success("Deleted");
  }

  const typeColors = {
    admin: "bg-violet-100 text-violet-700",
    manager: "bg-blue-100 text-blue-700",
    agent: "bg-slate-100 text-slate-600",
    custom: "bg-amber-100 text-amber-700",
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-semibold text-lg">Settings</h2>
      </div>
      <div className="flex gap-1 px-6 py-3 border-b border-border">
        {[["agents","Team Members"],["canned","Canned Responses"]].map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)} className={`text-sm px-4 py-1.5 rounded-md font-medium transition-colors ${tab===v?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted"}`}>{l}</button>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        {/* ── Team Members ── */}
        {tab === "agents" && (
          <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-base">Team Members</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{agents.length} member{agents.length !== 1 ? "s" : ""} in your team</p>
              </div>
              {agent?.role === "admin" && (
                <Button size="sm" className="gap-1.5" onClick={openCreateAgent}>
                  <Plus className="w-4 h-4" /> Add agent
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {agents.map((a) => {
                const type = a.agent_type ?? (a.role === "admin" ? "admin" : "agent");
                return (
                  <div key={a.id} className={`flex items-center gap-4 border border-border rounded-xl px-4 py-3.5 bg-background transition-opacity ${!a.is_active ? "opacity-60" : ""}`}>
                    <Avatar name={a.name} className="w-10 h-10 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{a.name}</p>
                        {a.id === agent?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{a.email}</p>
                      {(a.phone || a.country) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[a.country, a.phone].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${typeColors[type] ?? "bg-slate-100 text-slate-600"}`}>{type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${a.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                        {a.is_active ? "Active" : "Inactive"}
                      </span>
                      {agent?.role === "admin" && a.id !== agent?.id && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditAgent(a)} title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className={`h-7 w-7 ${a.is_active ? "text-red-500 hover:text-red-600" : "text-emerald-600 hover:text-emerald-700"}`}
                            onClick={() => handleToggleActive(a)}
                            title={a.is_active ? "Deactivate" : "Activate"}
                          >
                            {a.is_active ? <Trash2 className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Canned Responses ── */}
        {tab === "canned" && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-base">Canned Responses</h3>
                <p className="text-sm text-muted-foreground mt-0.5">Type / in chat to search and insert</p>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => openCanned(null)}><Plus className="w-4 h-4" />New response</Button>
            </div>
            <div className="space-y-2">
              {canned.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No canned responses yet. Create shortcuts to reply faster.</p>}
              {canned.map((c) => (
                <div key={c.id} className="flex items-start gap-3 border border-border rounded-xl px-4 py-3 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">/{c.shortcut}</span>
                      <span className="font-medium text-sm">{c.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.body}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCanned(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => handleDeleteCanned(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Agent create / edit dialog ── */}
      <Dialog
        open={showAgentForm}
        onClose={() => setShowAgentForm(false)}
        title={editingAgent ? `Edit ${editingAgent.name}` : "Add team member"}
      >
        {showAgentForm && (
          <AgentForm
            initial={editingAgent ?? BLANK_AGENT}
            onSave={handleSaveAgent}
            onCancel={() => setShowAgentForm(false)}
            isEdit={!!editingAgent}
          />
        )}
      </Dialog>

      {/* ── Canned response dialog ── */}
      <Dialog open={showCannedForm} onClose={() => setShowCannedForm(false)} title={editingCanned ? "Edit canned response" : "New canned response"}>
        <div className="space-y-3">
          <div><label className="text-xs font-medium text-muted-foreground">Shortcut</label><Input value={cannedForm.shortcut} onChange={(e) => setCannedForm((p) => ({ ...p, shortcut: e.target.value }))} className="mt-1" placeholder="e.g. greet" /></div>
          <div><label className="text-xs font-medium text-muted-foreground">Title</label><Input value={cannedForm.title} onChange={(e) => setCannedForm((p) => ({ ...p, title: e.target.value }))} className="mt-1" placeholder="Greeting message" /></div>
          <div><label className="text-xs font-medium text-muted-foreground">Message</label><Textarea value={cannedForm.body} onChange={(e) => setCannedForm((p) => ({ ...p, body: e.target.value }))} className="mt-1" placeholder="Hi! Thanks for reaching out…" /></div>
          <Button className="w-full" onClick={handleSaveCanned}>{editingCanned ? "Update" : "Create"}</Button>
        </div>
      </Dialog>
    </div>
  );
}
