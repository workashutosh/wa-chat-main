import { useEffect, useRef, useState } from "react";
import { Search, Upload, Download, Plus, Pencil, Trash2, Tag, UserX } from "lucide-react";
import toast from "react-hot-toast";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Avatar } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";
import { getContacts, updateContact, deleteContact, importContacts, exportContactsCsv, getTags } from "../lib/api";

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const fileRef = useRef(null);

  function load() {
    getContacts().then(setContacts).catch(console.error);
    getTags().then(setTags).catch(console.error);
  }

  useEffect(() => { load(); }, []);

  function openEdit(c) {
    setEditing(c);
    setForm({ name: c.name, email: c.email ?? "", notes: c.notes ?? "", opted_in: c.opted_in, blacklisted: c.blacklisted, tags: (c.tags ?? []).map((t) => t.name) });
  }

  async function handleSave() {
    try {
      await updateContact(editing.wa_id, form);
      toast.success("Saved");
      setEditing(null);
      load();
    } catch { toast.error("Save failed"); }
  }

  async function handleDelete(c) {
    if (!confirm(`Delete ${c.name}?`)) return;
    await deleteContact(c.wa_id);
    setContacts((p) => p.filter((x) => x.wa_id !== c.wa_id));
    toast.success("Deleted");
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

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    const matchQ = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email ?? "").toLowerCase().includes(q);
    const matchTag = !filterTag || (c.tags ?? []).some((t) => t.name === filterTag);
    return matchQ && matchTag;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <h2 className="font-semibold text-lg flex-1">Contacts <span className="text-muted-foreground text-sm font-normal">({contacts.length})</span></h2>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5"><Upload className="w-4 h-4" />Import</Button>
        <Button variant="outline" size="sm" onClick={exportContactsCsv} className="gap-1.5"><Download className="w-4 h-4" />Export</Button>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-border flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search contacts…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setFilterTag("")} className={`text-xs px-3 py-1 rounded-full border font-medium ${!filterTag ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>All</button>
          {tags.map((tag) => (
            <button key={tag.id} onClick={() => setFilterTag(filterTag === tag.name ? "" : tag.name)}
              className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${filterTag === tag.name ? "text-white border-transparent" : "border-border text-muted-foreground hover:bg-muted"}`}
              style={filterTag === tag.name ? { backgroundColor: tag.color, borderColor: tag.color } : {}}>
              {tag.name}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-2">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-muted-foreground text-left">
            <th className="py-2 pr-4 font-medium">Contact</th>
            <th className="py-2 pr-4 font-medium">Phone</th>
            <th className="py-2 pr-4 font-medium">Tags</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 font-medium">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.wa_id} className="border-b border-border/50 hover:bg-muted/30 group">
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={c.name} className="w-8 h-8 text-xs" />
                    <div>
                      <p className="font-medium">{c.name}</p>
                      {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                    </div>
                  </div>
                </td>
                <td className="py-2.5 pr-4 text-muted-foreground">+{c.phone}</td>
                <td className="py-2.5 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {(c.tags ?? []).map((t) => (
                      <span key={t.id} className="text-[11px] px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: t.color }}>{t.name}</span>
                    ))}
                  </div>
                </td>
                <td className="py-2.5 pr-4">
                  {c.blacklisted ? <span className="text-xs text-red-500 font-medium flex items-center gap-1"><UserX className="w-3 h-3"/>Blacklisted</span>
                    : c.opted_in ? <span className="text-xs text-emerald-600 font-medium">Opted in</span>
                    : <span className="text-xs text-muted-foreground">Opted out</span>}
                </td>
                <td className="py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => handleDelete(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12">No contacts found</p>}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.name}`} className="max-w-lg">
        <div className="space-y-3">
          <div><label className="text-xs font-medium text-muted-foreground">Name</label><Input value={form.name ?? ""} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="mt-1" /></div>
          <div><label className="text-xs font-medium text-muted-foreground">Email</label><Input value={form.email ?? ""} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="mt-1" /></div>
          <div><label className="text-xs font-medium text-muted-foreground">Notes</label><textarea value={form.notes ?? ""} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none h-20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div>
          <div><label className="text-xs font-medium text-muted-foreground">Tags (comma separated)</label><Input value={(form.tags ?? []).join(", ")} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))} className="mt-1" placeholder="e.g. VIP, Lead" /></div>
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!form.opted_in} onChange={(e) => setForm((p) => ({ ...p, opted_in: e.target.checked ? 1 : 0 }))} />Opted in</label>
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!form.blacklisted} onChange={(e) => setForm((p) => ({ ...p, blacklisted: e.target.checked ? 1 : 0 }))} />Blacklisted</label>
          </div>
          <Button className="w-full" onClick={handleSave}>Save changes</Button>
        </div>
      </Dialog>
    </div>
  );
}
