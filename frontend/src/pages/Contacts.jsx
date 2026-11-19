import { useEffect, useRef, useState, useMemo } from "react";
import { Search, Upload, Download, Plus, Pencil, Trash2, Tag, UserX, MessageSquare, X, Check } from "lucide-react";
import toast from "react-hot-toast";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Avatar } from "../components/ui/avatar";
import { Dialog } from "../components/ui/dialog";
import { getContacts, updateContact, deleteContact, importContacts, exportContactsCsv,
         getTags, createTag, deleteTag, createContact, bulkDeleteContacts,
         getTemplates, broadcastTemplate } from "../lib/api";

const TAG_COLORS = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#64748b"];

// ── Add Contact Modal ─────────────────────────────────────────────────────────
function AddContactModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.phone.trim()) return toast.error("Phone is required");
    setSaving(true);
    try {
      await createContact({ ...form, phone: form.phone.replace(/\D/g, "") });
      toast.success("Contact added");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error ?? "Failed to add contact");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onClose={onClose} title="Add Contact">
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="mt-1" placeholder="John Doe" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Phone <span className="text-red-500">*</span></label>
          <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="mt-1" placeholder="919876543210" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Email</label>
          <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="mt-1" placeholder="john@example.com" />
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">{saving ? "Saving…" : "Add Contact"}</Button>
        </div>
      </div>
    </Dialog>
  );
}

// ── Edit Contact Modal ────────────────────────────────────────────────────────
function EditModal({ contact, allTags, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: contact.name, email: contact.email ?? "", notes: contact.notes ?? "",
    opted_in: contact.opted_in, blacklisted: contact.blacklisted,
    tags: (contact.tags ?? []).map(t => t.name),
  });

  async function handleSave() {
    try {
      await updateContact(contact.wa_id, form);
      toast.success("Saved");
      onSaved();
      onClose();
    } catch { toast.error("Save failed"); }
  }

  return (
    <Dialog open onClose={onClose} title={`Edit ${contact.name}`}>
      <div className="space-y-3">
        <div><label className="text-xs font-medium text-muted-foreground">Name</label>
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="mt-1" /></div>
        <div><label className="text-xs font-medium text-muted-foreground">Email</label>
          <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="mt-1" /></div>
        <div><label className="text-xs font-medium text-muted-foreground">Notes</label>
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none h-20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div>
        <div><label className="text-xs font-medium text-muted-foreground">Tags (comma separated)</label>
          <Input value={(form.tags ?? []).join(", ")} onChange={e => setForm(p => ({ ...p, tags: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))} className="mt-1" placeholder="e.g. VIP, Lead" /></div>
        <div className="flex gap-4 pt-1">
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!form.opted_in} onChange={e => setForm(p => ({ ...p, opted_in: e.target.checked ? 1 : 0 }))} />Opted in</label>
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!form.blacklisted} onChange={e => setForm(p => ({ ...p, blacklisted: e.target.checked ? 1 : 0 }))} />Blacklisted</label>
        </div>
        <Button className="w-full" onClick={handleSave}>Save changes</Button>
      </div>
    </Dialog>
  );
}

// ── Tags Management Modal ─────────────────────────────────────────────────────
function TagsModal({ tags, onClose, onChanged }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try { await createTag(name.trim(), color); setName(""); onChanged(); }
    catch { toast.error("Failed to create tag"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    try { await deleteTag(id); onChanged(); toast.success("Tag deleted"); }
    catch { toast.error("Failed to delete tag"); }
  }

  return (
    <Dialog open onClose={onClose} title="Manage Tags">
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Tag name…" className="flex-1" onKeyDown={e => e.key === "Enter" && handleCreate()} />
          <div className="flex gap-1">
            {TAG_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <Button onClick={handleCreate} disabled={saving || !name.trim()} size="sm"><Plus className="w-4 h-4" /></Button>
        </div>
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {tags.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No tags yet</p>}
          {tags.map(t => (
            <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted group">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
              <span className="text-sm flex-1">{t.name}</span>
              <button onClick={() => handleDelete(t.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="outline" onClick={onClose} className="w-full">Done</Button>
      </div>
    </Dialog>
  );
}

// ── Broadcast Modal ───────────────────────────────────────────────────────────
function BroadcastModal({ contacts, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { getTemplates().then(ts => setTemplates(ts.filter(t => t.status === "APPROVED" && t.enabled))); }, []);

  async function handleSend() {
    if (!selected) return toast.error("Pick a template");
    setSending(true);
    try {
      const r = await broadcastTemplate(contacts.map(c => c.wa_id), selected.name, selected.language, []);
      setResult(r);
    } catch (err) { toast.error(err.response?.data?.error ?? "Broadcast failed"); }
    finally { setSending(false); }
  }

  return (
    <Dialog open onClose={onClose} title="Quick Broadcast">
      {result ? (
        <div className="text-center py-4 space-y-3">
          <p className="text-2xl font-bold text-emerald-500">{result.sent} sent</p>
          {result.failed > 0 && <p className="text-sm text-red-500">{result.failed} failed</p>}
          <p className="text-sm text-muted-foreground">out of {result.total} contacts</p>
          <Button onClick={onClose} className="w-full">Done</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Sending to <span className="font-semibold text-foreground">{contacts.length}</span> contacts</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {templates.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No enabled approved templates</p>}
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
              {sending ? "Sending…" : `Broadcast to ${contacts.length}`}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const fileRef = useRef(null);

  function load() {
    getContacts().then(setContacts).catch(console.error);
    getTags().then(setTags).catch(console.error);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return contacts.filter(c => {
      const matchQ = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email ?? "").toLowerCase().includes(q);
      const matchTag = !filterTag || (c.tags ?? []).some(t => t.name === filterTag);
      return matchQ && matchTag;
    });
  }, [contacts, search, filterTag]);

  const selectedContacts = filtered.filter(c => selected.has(c.wa_id));
  const broadcastTargets = selected.size > 0 ? selectedContacts : filtered;

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.wa_id)));
  }

  async function handleDelete(c) {
    if (!confirm(`Delete ${c.name}?`)) return;
    await deleteContact(c.wa_id);
    setContacts(p => p.filter(x => x.wa_id !== c.wa_id));
    toast.success("Deleted");
  }

  async function handleBulkDelete() {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} contacts? This cannot be undone.`)) return;
    try {
      await bulkDeleteContacts([...selected]);
      setContacts(p => p.filter(c => !selected.has(c.wa_id)));
      setSelected(new Set());
      toast.success(`Deleted ${selected.size} contacts`);
    } catch { toast.error("Bulk delete failed"); }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { imported } = await importContacts(file);
      toast.success(`Imported ${imported} contacts`);
      load();
    } catch { toast.error("Import failed"); }
    e.target.value = "";
  }

  function fmtDate(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <div className="flex-1">
          <h2 className="font-semibold text-lg">Contacts</h2>
          <p className="text-xs text-muted-foreground">{contacts.length} total contacts</p>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
        {selected.size > 0 && (
          <Button variant="outline" size="sm" onClick={handleBulkDelete} className="gap-1.5 text-red-500 hover:text-red-600 border-red-200 hover:bg-red-50">
            <Trash2 className="w-4 h-4" />Delete ({selected.size})
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setShowBroadcast(true)} className="gap-1.5">
          <MessageSquare className="w-4 h-4" />
          Broadcast {selected.size > 0 ? `(${selected.size})` : ""}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowTags(true)} className="gap-1.5"><Tag className="w-4 h-4" />Tags</Button>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5"><Upload className="w-4 h-4" />Import</Button>
        <Button variant="outline" size="sm" onClick={exportContactsCsv} className="gap-1.5"><Download className="w-4 h-4" />Export</Button>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5"><Plus className="w-4 h-4" />Add Contact</Button>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-border flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by name, phone, email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setFilterTag("")} className={`text-xs px-3 py-1 rounded-full border font-medium ${!filterTag ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>All</button>
          {tags.map(tag => (
            <button key={tag.id} onClick={() => setFilterTag(filterTag === tag.name ? "" : tag.name)}
              className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${filterTag === tag.name ? "text-white border-transparent" : "border-border text-muted-foreground hover:bg-muted"}`}
              style={filterTag === tag.name ? { backgroundColor: tag.color, borderColor: tag.color } : {}}>
              {tag.name}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/70 backdrop-blur border-b border-border">
            <tr>
              <th className="px-4 py-3 w-10">
                <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Tags</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Created On</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.wa_id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors group ${selected.has(c.wa_id) ? "bg-primary/5" : ""}`}>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(c.wa_id)}
                    onChange={() => setSelected(s => { const n = new Set(s); n.has(c.wa_id) ? n.delete(c.wa_id) : n.add(c.wa_id); return n; })}
                    className="rounded" />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={c.name} className="w-8 h-8 text-xs flex-shrink-0" />
                    <span className="font-medium">{c.name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">+{c.phone}</td>
                <td className="px-3 py-3 text-muted-foreground text-xs">{c.email ?? "—"}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(c.tags ?? []).map(t => (
                      <span key={t.id} className="text-[11px] px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: t.color }}>{t.name}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{fmtDate(c.created_at)}</td>
                <td className="px-3 py-3">
                  {c.blacklisted
                    ? <span className="text-xs text-red-500 font-medium flex items-center gap-1"><UserX className="w-3 h-3" />Blacklisted</span>
                    : c.opted_in
                    ? <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><Check className="w-3 h-3" />Opted in</span>
                    : <span className="text-xs text-muted-foreground">Opted out</span>}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => handleDelete(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12 text-sm">No contacts found</p>}
      </div>

      {/* Modals */}
      {showAdd && <AddContactModal onClose={() => setShowAdd(false)} onSaved={load} />}
      {editing && <EditModal contact={editing} allTags={tags} onClose={() => setEditing(null)} onSaved={load} />}
      {showTags && <TagsModal tags={tags} onClose={() => setShowTags(false)} onChanged={load} />}
      {showBroadcast && <BroadcastModal contacts={broadcastTargets} onClose={() => setShowBroadcast(false)} />}
    </div>
  );
}
