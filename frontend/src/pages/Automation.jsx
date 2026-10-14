import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Zap, Mail } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Dialog } from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { getRules, createRule, updateRule, deleteRule, getSequences, createSequence } from "../lib/api";

const TRIGGER_LABELS = { keyword: "Keyword match", new_conversation: "New conversation", opt_in: "Contact opt-in" };

export default function Automation() {
  const [tab, setTab] = useState("rules");
  const [rules, setRules] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [showSeqForm, setShowSeqForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  // Rule form state
  const [ruleName, setRuleName] = useState("");
  const [triggerType, setTriggerType] = useState("keyword");
  const [triggerValue, setTriggerValue] = useState("");
  const [actionText, setActionText] = useState("");

  // Sequence form state
  const [seqName, setSeqName] = useState("");
  const [seqSteps, setSeqSteps] = useState([{ delay_hours: 0, type: "text", body: "" }]);

  function load() {
    getRules().then(setRules).catch(console.error);
    getSequences().then(setSequences).catch(console.error);
  }

  useEffect(() => { load(); }, []);

  function openNewRule() {
    setEditingRule(null);
    setRuleName(""); setTriggerType("keyword"); setTriggerValue(""); setActionText("");
    setShowRuleForm(true);
  }

  function openEditRule(r) {
    const actions = JSON.parse(r.actions);
    setEditingRule(r);
    setRuleName(r.name); setTriggerType(r.trigger_type); setTriggerValue(r.trigger_value ?? "");
    setActionText(actions.find((a) => a.type === "send_message")?.text ?? "");
    setShowRuleForm(true);
  }

  async function handleSaveRule() {
    const actions = [];
    if (actionText.trim()) actions.push({ type: "send_message", text: actionText.trim() });
    const data = { name: ruleName, trigger_type: triggerType, trigger_value: triggerValue, actions, is_active: 1 };
    try {
      if (editingRule) await updateRule(editingRule.id, data);
      else await createRule(data);
      toast.success(editingRule ? "Rule updated" : "Rule created");
      setShowRuleForm(false);
      load();
    } catch { toast.error("Save failed"); }
  }

  async function handleToggleRule(r) {
    await updateRule(r.id, { ...r, is_active: r.is_active ? 0 : 1, actions: JSON.parse(r.actions) });
    setRules((p) => p.map((x) => x.id === r.id ? { ...x, is_active: x.is_active ? 0 : 1 } : x));
  }

  async function handleDeleteRule(id) {
    if (!confirm("Delete this rule?")) return;
    await deleteRule(id);
    setRules((p) => p.filter((r) => r.id !== id));
    toast.success("Deleted");
  }

  async function handleSaveSeq() {
    try {
      await createSequence({ name: seqName, steps: seqSteps });
      toast.success("Sequence created");
      setShowSeqForm(false);
      setSeqName(""); setSeqSteps([{ delay_hours: 0, type: "text", body: "" }]);
      load();
    } catch { toast.error("Failed"); }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <h2 className="font-semibold text-lg flex-1">Automation</h2>
        <Button size="sm" className="gap-1.5" onClick={tab === "rules" ? openNewRule : () => setShowSeqForm(true)}>
          <Plus className="w-4 h-4" />{tab === "rules" ? "New rule" : "New sequence"}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-border">
        {[["rules","Keyword Rules"],["sequences","Drip Sequences"]].map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)} className={`text-sm px-4 py-1.5 rounded-md font-medium transition-colors ${tab===v?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted"}`}>{l}</button>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {tab === "rules" && (
          <div className="space-y-3">
            {rules.length === 0 && <p className="text-muted-foreground text-sm text-center py-12">No automation rules yet. Create one to auto-reply to keywords.</p>}
            {rules.map((r) => (
              <div key={r.id} className="border border-border rounded-xl p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="font-medium text-sm">{r.name}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${r.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{r.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">{TRIGGER_LABELS[r.trigger_type]}</span>
                    {r.trigger_value && <span>: "<span className="text-foreground">{r.trigger_value}</span>"</span>}
                  </p>
                  {(() => {
                    const actions = JSON.parse(r.actions);
                    const msg = actions.find((a) => a.type === "send_message");
                    return msg ? <p className="text-xs text-muted-foreground mt-1 truncate">Reply: "{msg.text}"</p> : null;
                  })()}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleToggleRule(r)} className="text-muted-foreground hover:text-foreground">
                    {r.is_active ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditRule(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => handleDeleteRule(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "sequences" && (
          <div className="space-y-3">
            {sequences.length === 0 && <p className="text-muted-foreground text-sm text-center py-12">No drip sequences yet. Create one to send follow-up messages automatically.</p>}
            {sequences.map((s) => (
              <div key={s.id} className="border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="w-4 h-4 text-sky-500" />
                  <span className="font-medium text-sm">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.steps?.length ?? 0} steps</span>
                </div>
                <div className="space-y-1">
                  {(s.steps ?? []).map((step, i) => (
                    <div key={step.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">{i + 1}</span>
                      <span>After {step.delay_hours}h —</span>
                      <span className="text-foreground truncate">{step.body}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rule form dialog */}
      <Dialog open={showRuleForm} onClose={() => setShowRuleForm(false)} title={editingRule ? "Edit rule" : "New automation rule"} className="max-w-lg">
        <div className="space-y-4">
          <div><label className="text-xs font-medium text-muted-foreground">Rule name</label><Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} className="mt-1" placeholder="e.g. Greet new leads" /></div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Trigger</label>
            <Select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="mt-1">
              <option value="keyword">Keyword match</option>
              <option value="new_conversation">New conversation</option>
              <option value="opt_in">Contact opt-in</option>
            </Select>
          </div>
          {triggerType === "keyword" && (
            <div><label className="text-xs font-medium text-muted-foreground">Keyword (case-insensitive)</label><Input value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} className="mt-1" placeholder="e.g. hello, hi, help" /></div>
          )}
          <div><label className="text-xs font-medium text-muted-foreground">Auto-reply message</label><Textarea value={actionText} onChange={(e) => setActionText(e.target.value)} className="mt-1" placeholder="Hi! Thanks for reaching out. We'll get back to you shortly…" /></div>
          <Button className="w-full" onClick={handleSaveRule} disabled={!ruleName.trim()}>{editingRule ? "Update rule" : "Create rule"}</Button>
        </div>
      </Dialog>

      {/* Sequence form dialog */}
      <Dialog open={showSeqForm} onClose={() => setShowSeqForm(false)} title="New drip sequence" className="max-w-lg">
        <div className="space-y-4">
          <div><label className="text-xs font-medium text-muted-foreground">Sequence name</label><Input value={seqName} onChange={(e) => setSeqName(e.target.value)} className="mt-1" placeholder="e.g. 3-day follow-up" /></div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Steps</label>
            <div className="space-y-2">
              {seqSteps.map((step, i) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Step {i + 1}</span>
                    {seqSteps.length > 1 && <button onClick={() => setSeqSteps((p) => p.filter((_, j) => j !== i))} className="text-xs text-red-500">Remove</button>}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1"><Input type="number" value={step.delay_hours} onChange={(e) => setSeqSteps((p) => p.map((s, j) => j === i ? { ...s, delay_hours: parseInt(e.target.value) || 0 } : s))} placeholder="0" /></div>
                    <span className="text-xs text-muted-foreground self-center">hours delay</span>
                  </div>
                  <Textarea value={step.body} onChange={(e) => setSeqSteps((p) => p.map((s, j) => j === i ? { ...s, body: e.target.value } : s))} placeholder="Message text…" />
                </div>
              ))}
            </div>
            <button onClick={() => setSeqSteps((p) => [...p, { delay_hours: 24, type: "text", body: "" }])} className="text-xs text-primary mt-2 flex items-center gap-1"><Plus className="w-3 h-3" />Add step</button>
          </div>
          <Button className="w-full" onClick={handleSaveSeq} disabled={!seqName.trim()}>Create sequence</Button>
        </div>
      </Dialog>
    </div>
  );
}
