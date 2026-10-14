import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog } from "../components/ui/dialog";
import { Select } from "../components/ui/select";
import { Avatar } from "../components/ui/avatar";
import { Textarea } from "../components/ui/textarea";
import { useAuth } from "../hooks/useAuth.jsx";
import { getAgents, createAgent, getCannedResponses, createCannedResponse, updateCannedResponse, deleteCannedResponse } from "../lib/api";

export default function Settings() {
  const { agent } = useAuth();
  const [tab, setTab] = useState("agents");
  const [agents, setAgents] = useState([]);
  const [canned, setCanned] = useState([]);
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [showCannedForm, setShowCannedForm] = useState(false);
  const [editingCanned, setEditingCanned] = useState(null);
  const [agentForm, setAgentForm] = useState({ name: "", email: "", password: "", role: "agent" });
  const [cannedForm, setCannedForm] = useState({ shortcut: "", title: "", body: "" });

  function load() {
    getAgents().then(setAgents).catch(console.error);
    getCannedResponses().then(setCanned).catch(console.error);
  }
  useEffect(() => { load(); }, []);

  async function handleCreateAgent() {
    try {
      await createAgent(agentForm);
      toast.success("Agent created");
      setShowAgentForm(false);
      setAgentForm({ name: "", email: "", password: "", role: "agent" });
      load();
    } catch (err) { toast.error(err.response?.data?.error ?? "Failed"); }
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-semibold text-lg">Settings</h2>
      </div>
      <div className="flex gap-1 px-6 py-3 border-b border-border">
        {[["agents","Team"],["canned","Canned Responses"]].map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)} className={`text-sm px-4 py-1.5 rounded-md font-medium transition-colors ${tab===v?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted"}`}>{l}</button>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {tab === "agents" && (
          <div>
            <div className="flex justify-end mb-4">
              {agent?.role === "admin" && <Button size="sm" className="gap-1.5" onClick={() => setShowAgentForm(true)}><Plus className="w-4 h-4" />Add agent</Button>}
            </div>
            <div className="space-y-2">
              {agents.map((a) => (
                <div key={a.id} className="flex items-center gap-3 border border-border rounded-xl px-4 py-3">
                  <Avatar name={a.name} className="w-10 h-10" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{a.name} {a.id === agent?.id && <span className="text-xs text-muted-foreground">(you)</span>}</p>
                    <p className="text-xs text-muted-foreground">{a.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.role==="admin"?"bg-violet-100 text-violet-700":"bg-slate-100 text-slate-600"}`}>{a.role}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${a.is_active?"bg-emerald-100 text-emerald-700":"bg-red-100 text-red-600"}`}>{a.is_active?"Active":"Inactive"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "canned" && (
          <div>
            <div className="flex justify-end mb-4">
              <Button size="sm" className="gap-1.5" onClick={() => openCanned(null)}><Plus className="w-4 h-4" />New response</Button>
            </div>
            <div className="space-y-2">
              {canned.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No canned responses. Create shortcuts to reply faster.</p>}
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

      <Dialog open={showAgentForm} onClose={() => setShowAgentForm(false)} title="Add team member">
        <div className="space-y-3">
          <div><label className="text-xs font-medium text-muted-foreground">Name</label><Input value={agentForm.name} onChange={(e) => setAgentForm((p) => ({ ...p, name: e.target.value }))} className="mt-1" /></div>
          <div><label className="text-xs font-medium text-muted-foreground">Email</label><Input type="email" value={agentForm.email} onChange={(e) => setAgentForm((p) => ({ ...p, email: e.target.value }))} className="mt-1" /></div>
          <div><label className="text-xs font-medium text-muted-foreground">Password</label><Input type="password" value={agentForm.password} onChange={(e) => setAgentForm((p) => ({ ...p, password: e.target.value }))} className="mt-1" /></div>
          <div><label className="text-xs font-medium text-muted-foreground">Role</label><Select value={agentForm.role} onChange={(e) => setAgentForm((p) => ({ ...p, role: e.target.value }))} className="mt-1"><option value="agent">Agent</option><option value="admin">Admin</option></Select></div>
          <Button className="w-full" onClick={handleCreateAgent}>Create</Button>
        </div>
      </Dialog>

      <Dialog open={showCannedForm} onClose={() => setShowCannedForm(false)} title={editingCanned ? "Edit canned response" : "New canned response"}>
        <div className="space-y-3">
          <div><label className="text-xs font-medium text-muted-foreground">Shortcut (type / in chat to search)</label><Input value={cannedForm.shortcut} onChange={(e) => setCannedForm((p) => ({ ...p, shortcut: e.target.value }))} className="mt-1" placeholder="e.g. greet" /></div>
          <div><label className="text-xs font-medium text-muted-foreground">Title</label><Input value={cannedForm.title} onChange={(e) => setCannedForm((p) => ({ ...p, title: e.target.value }))} className="mt-1" placeholder="Greeting message" /></div>
          <div><label className="text-xs font-medium text-muted-foreground">Message</label><Textarea value={cannedForm.body} onChange={(e) => setCannedForm((p) => ({ ...p, body: e.target.value }))} className="mt-1" placeholder="Hi! Thanks for reaching out to Nexus…" /></div>
          <Button className="w-full" onClick={handleSaveCanned}>{editingCanned ? "Update" : "Create"}</Button>
        </div>
      </Dialog>
    </div>
  );
}
