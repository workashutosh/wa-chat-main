import { useEffect, useState, useMemo } from "react";
import {
  RefreshCw, Plus, CheckCircle, Clock, XCircle, Eye, Trash2,
  Copy, Check, X, ChevronDown, AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../components/ui/button";
import { getTemplates, syncTemplates, createTemplate, deleteTemplate } from "../lib/api";

// ── constants ────────────────────────────────────────────────────────────────

const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"];

const LANGUAGES = [
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi",    label: "Hindi" },
  { code: "mr",    label: "Marathi" },
  { code: "gu",    label: "Gujarati" },
  { code: "ta",    label: "Tamil" },
  { code: "te",    label: "Telugu" },
  { code: "kn",    label: "Kannada" },
  { code: "bn",    label: "Bengali" },
];

const STATUS_CONFIG = {
  APPROVED:   { icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950", text: "text-emerald-700 dark:text-emerald-300", label: "Approved" },
  PENDING:    { icon: Clock,        color: "text-amber-500",   bg: "bg-amber-50 dark:bg-amber-950",    text: "text-amber-700 dark:text-amber-300",    label: "Pending" },
  IN_APPEAL:  { icon: AlertCircle,  color: "text-blue-500",    bg: "bg-blue-50 dark:bg-blue-950",      text: "text-blue-700 dark:text-blue-300",      label: "In Appeal" },
  REJECTED:   { icon: XCircle,      color: "text-red-500",     bg: "bg-red-50 dark:bg-red-950",        text: "text-red-700 dark:text-red-300",         label: "Rejected" },
  PAUSED:     { icon: XCircle,      color: "text-orange-500",  bg: "bg-orange-50 dark:bg-orange-950",  text: "text-orange-700 dark:text-orange-300",   label: "Paused" },
  DISABLED:   { icon: XCircle,      color: "text-gray-500",    bg: "bg-gray-100 dark:bg-gray-800",     text: "text-gray-600 dark:text-gray-400",       label: "Disabled" },
};

const FILTER_TABS = [
  { key: "ALL",      label: "All" },
  { key: "APPROVED", label: "Approved" },
  { key: "PENDING",  label: "Pending" },
  { key: "REJECTED", label: "Rejected" },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function parseComponents(raw) {
  try { return JSON.parse(raw); } catch { return []; }
}

function getBody(components) {
  const list = parseComponents(components);
  return list.find((c) => c.type === "BODY")?.text ?? "";
}

function getHeader(components) {
  const list = parseComponents(components);
  const h = list.find((c) => c.type === "HEADER");
  return h?.text ?? null;
}

function getFooter(components) {
  const list = parseComponents(components);
  return list.find((c) => c.type === "FOOTER")?.text ?? null;
}

function getButtons(components) {
  const list = parseComponents(components);
  return list.find((c) => c.type === "BUTTONS")?.buttons ?? [];
}

function detectVars(text) {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
  const nums = [...new Set(matches.map((m) => parseInt(m[1])))].sort((a, b) => a - b);
  return nums;
}

function renderBodyWithVars(text, examples) {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => examples[n] || `{{${n}}}`);
}

// ── WhatsApp preview bubble ───────────────────────────────────────────────────

function WaPreview({ header, body, footer, buttons, varExamples }) {
  const renderedBody = renderBodyWithVars(body || "", varExamples);
  return (
    <div className="bg-[#e5ddd5] dark:bg-[#0d1117] rounded-xl p-4 min-h-[200px] flex items-start">
      <div className="max-w-[280px] w-full">
        <div className="bg-white dark:bg-[#1e2d24] rounded-xl shadow-sm overflow-hidden text-sm">
          {header && (
            <div className="px-3 pt-3 pb-1 font-semibold text-gray-800 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700">
              {header}
            </div>
          )}
          <div className="px-3 py-2 text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
            {renderedBody || <span className="text-gray-400 italic">Message body...</span>}
          </div>
          {footer && (
            <div className="px-3 pb-2 text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
              {footer}
            </div>
          )}
          {buttons.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-700">
              {buttons.map((btn, i) => (
                <div key={i} className={`px-3 py-2 text-center text-blue-500 font-medium text-xs ${i > 0 ? "border-t border-gray-100 dark:border-gray-700" : ""}`}>
                  {btn.text}
                </div>
              ))}
            </div>
          )}
          <div className="px-3 pb-1 text-right">
            <span className="text-[10px] text-gray-400">12:00 PM ✓✓</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create Template Modal ─────────────────────────────────────────────────────

const EMPTY_BUTTON = { type: "QUICK_REPLY", text: "", url: "", phone: "" };

function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "", category: "MARKETING", language: "en_US",
    headerEnabled: false, headerText: "",
    bodyText: "",
    footerEnabled: false, footerText: "",
    buttons: [],
    varExamples: {},
  });
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState("");

  const vars = useMemo(() => detectVars(form.bodyText), [form.bodyText]);

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleNameChange(raw) {
    const clean = raw.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/__+/g, "_");
    set("name", clean);
    setNameError(clean && !/^[a-z0-9_]+$/.test(clean) ? "Only lowercase letters, numbers, underscores" : "");
  }

  function addVar() {
    const next = vars.length + 1;
    set("bodyText", form.bodyText + `{{${next}}}`);
  }

  function addButton() {
    if (form.buttons.length >= 3) return;
    set("buttons", [...form.buttons, { ...EMPTY_BUTTON }]);
  }

  function updateButton(idx, key, val) {
    const updated = form.buttons.map((b, i) => i === idx ? { ...b, [key]: val } : b);
    set("buttons", updated);
  }

  function removeButton(idx) {
    set("buttons", form.buttons.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name) return toast.error("Template name is required");
    if (!form.bodyText.trim()) return toast.error("Body text is required");
    if (vars.some((n) => !form.varExamples[n]?.trim())) {
      return toast.error("Provide example values for all variables");
    }

    const components = [];

    if (form.headerEnabled && form.headerText.trim()) {
      components.push({ type: "HEADER", format: "TEXT", text: form.headerText.trim() });
    }

    const bodyComp = { type: "BODY", text: form.bodyText.trim() };
    if (vars.length > 0) {
      bodyComp.example = { body_text: [vars.map((n) => form.varExamples[n] || "example")] };
    }
    components.push(bodyComp);

    if (form.footerEnabled && form.footerText.trim()) {
      components.push({ type: "FOOTER", text: form.footerText.trim() });
    }

    const validButtons = form.buttons.filter((b) => b.text.trim());
    if (validButtons.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: validButtons.map((b) => {
          if (b.type === "URL") return { type: "URL", text: b.text.trim(), url: b.url.trim() };
          if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: b.phone.trim() };
          return { type: "QUICK_REPLY", text: b.text.trim() };
        }),
      });
    }

    setSubmitting(true);
    try {
      const result = await createTemplate({ name: form.name, category: form.category, language: form.language, components });
      toast.success("Template submitted for Meta review");
      onCreated(result);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error ?? "Failed to create template");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-lg">Create New Template</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* body: form + preview */}
        <div className="flex-1 overflow-hidden flex gap-0">
          {/* form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5 border-r border-border min-w-0">
            {/* row 1: name + category + language */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Template Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. welcome_message"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
                <p className="text-muted-foreground text-[11px] mt-1">lowercase, numbers, underscores only</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Category *</label>
                <select
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Language *</label>
                <select
                  value={form.language}
                  onChange={(e) => set("language", e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
            </div>

            {/* header toggle */}
            <div className="border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium flex items-center gap-2">
                  <input type="checkbox" checked={form.headerEnabled} onChange={(e) => set("headerEnabled", e.target.checked)} className="rounded" />
                  Header (optional)
                </label>
              </div>
              {form.headerEnabled && (
                <input
                  value={form.headerText}
                  onChange={(e) => set("headerText", e.target.value)}
                  placeholder="Header text…"
                  maxLength={60}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              )}
            </div>

            {/* body */}
            <div className="border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Body *</label>
                <button type="button" onClick={addVar} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add Variable
                </button>
              </div>
              <textarea
                value={form.bodyText}
                onChange={(e) => set("bodyText", e.target.value)}
                placeholder="Enter your message text. Click 'Add Variable' to insert {{1}}, {{2}} placeholders that get replaced when sending."
                rows={5}
                maxLength={1024}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                <span>Use {"{{1}}"}, {"{{2}}"} for dynamic values</span>
                <span>{form.bodyText.length}/1024</span>
              </div>

              {/* variable example inputs */}
              {vars.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Example values for variables (required by Meta):</p>
                  <div className="grid grid-cols-2 gap-2">
                    {vars.map((n) => (
                      <div key={n} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground shrink-0 w-8">{`{{${n}}}`}</span>
                        <input
                          value={form.varExamples[n] ?? ""}
                          onChange={(e) => set("varExamples", { ...form.varExamples, [n]: e.target.value })}
                          placeholder={`Example for {{${n}}}`}
                          className="flex-1 border border-border rounded-md px-2 py-1 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* footer toggle */}
            <div className="border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium flex items-center gap-2">
                  <input type="checkbox" checked={form.footerEnabled} onChange={(e) => set("footerEnabled", e.target.checked)} className="rounded" />
                  Footer (optional)
                </label>
              </div>
              {form.footerEnabled && (
                <input
                  value={form.footerText}
                  onChange={(e) => set("footerText", e.target.value)}
                  placeholder="Small text shown below the message…"
                  maxLength={60}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              )}
            </div>

            {/* buttons */}
            <div className="border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium">Buttons (optional, max 3)</label>
                {form.buttons.length < 3 && (
                  <button type="button" onClick={addButton} className="text-xs text-primary hover:underline flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Button
                  </button>
                )}
              </div>
              {form.buttons.map((btn, idx) => (
                <div key={idx} className="flex items-start gap-2 mb-3 p-3 bg-muted/40 rounded-lg">
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={btn.type}
                        onChange={(e) => updateButton(idx, "type", e.target.value)}
                        className="border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none"
                      >
                        <option value="QUICK_REPLY">Quick Reply</option>
                        <option value="URL">Visit URL</option>
                        <option value="PHONE_NUMBER">Call Phone</option>
                      </select>
                      <input
                        value={btn.text}
                        onChange={(e) => updateButton(idx, "text", e.target.value)}
                        placeholder="Button label"
                        maxLength={25}
                        className="flex-1 border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none"
                      />
                    </div>
                    {btn.type === "URL" && (
                      <input
                        value={btn.url}
                        onChange={(e) => updateButton(idx, "url", e.target.value)}
                        placeholder="https://example.com"
                        className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none"
                      />
                    )}
                    {btn.type === "PHONE_NUMBER" && (
                      <input
                        value={btn.phone}
                        onChange={(e) => updateButton(idx, "phone", e.target.value)}
                        placeholder="+91 90000 00000"
                        className="w-full border border-border rounded-md px-2 py-1.5 text-xs bg-background focus:outline-none"
                      />
                    )}
                  </div>
                  <button type="button" onClick={() => removeButton(idx)} className="text-muted-foreground hover:text-red-500 mt-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </form>

          {/* preview panel */}
          <div className="w-80 shrink-0 flex flex-col overflow-y-auto px-5 py-5">
            <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Preview</p>
            <WaPreview
              header={form.headerEnabled ? form.headerText : null}
              body={form.bodyText}
              footer={form.footerEnabled ? form.footerText : null}
              buttons={form.buttons.filter((b) => b.text.trim())}
              varExamples={form.varExamples}
            />
            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              Variables are shown with example values. Meta will review this template before it can be used.
            </p>
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting && <RefreshCw className="w-4 h-4 animate-spin" />}
            Submit for Approval
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Preview Modal ─────────────────────────────────────────────────────────────

function PreviewModal({ template, onClose }) {
  const header  = getHeader(template.components);
  const body    = getBody(template.components);
  const footer  = getFooter(template.components);
  const buttons = getButtons(template.components);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold">Preview Template</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">
          <WaPreview header={header} body={body} footer={footer} buttons={buttons} varExamples={{}} />
        </div>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <Icon className={`w-3 h-3 ${cfg.color}`} />
      {cfg.label}
    </span>
  );
}

// ── API Payload copy button ───────────────────────────────────────────────────

function ApiPayloadButton({ template }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const payload = {
      messaging_product: "whatsapp",
      to: "{{PHONE_NUMBER}}",
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        components: parseComponents(template.components)
          .filter((c) => c.type !== "HEADER" && c.type !== "FOOTER")
          .map((c) => {
            if (c.type === "BODY") {
              const vars = detectVars(c.text);
              if (!vars.length) return null;
              return {
                type: "body",
                parameters: vars.map((n) => ({ type: "text", text: `{{VALUE_${n}}}` })),
              };
            }
            return null;
          })
          .filter(Boolean),
      },
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy API payload"
      className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <span className="font-mono font-bold text-[11px]">{"</>"}</span>}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [previewTpl, setPreviewTpl] = useState(null);

  useEffect(() => { getTemplates().then(setTemplates); }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const { synced } = await syncTemplates();
      toast.success(`Synced ${synced} templates`);
      getTemplates().then(setTemplates);
    } catch (err) {
      toast.error(err.response?.data?.error ?? "Sync failed");
    } finally { setSyncing(false); }
  }

  async function handleDelete(tpl) {
    if (!confirm(`Delete template "${tpl.name}"? This cannot be undone.`)) return;
    try {
      await deleteTemplate(tpl.id);
      toast.success("Template deleted");
      setTemplates((ts) => ts.filter((t) => t.id !== tpl.id));
    } catch (err) {
      toast.error(err.response?.data?.error ?? "Delete failed");
    }
  }

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [templates, statusFilter, search]);

  const counts = useMemo(() => ({
    ALL:      templates.length,
    APPROVED: templates.filter((t) => t.status === "APPROVED").length,
    PENDING:  templates.filter((t) => t.status === "PENDING").length,
    REJECTED: templates.filter((t) => t.status === "REJECTED").length,
  }), [templates]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* top bar */}
      <div className="px-6 py-4 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-lg">Templates</h2>
          <p className="text-xs text-muted-foreground">Create and manage WhatsApp message templates</p>
        </div>
        <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          Sync from Meta
        </Button>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          Create New Template
        </Button>
      </div>

      {/* filter bar */}
      <div className="px-6 py-3 border-b border-border flex items-center gap-4 flex-wrap">
        {/* status tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                statusFilter === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-[11px] ${statusFilter === tab.key ? "text-primary" : "text-muted-foreground"}`}>
                {counts[tab.key]}
              </span>
            </button>
          ))}
        </div>
        {/* search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="border border-border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
        />
        {/* legend */}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> Approved</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-amber-500" /> Pending</span>
          <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-500" /> Rejected</span>
        </div>
      </div>

      {/* table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {templates.length === 0 ? (
              <>
                <p className="text-lg font-medium mb-2">No templates yet</p>
                <p className="text-sm mb-4">Create a new template or sync from Meta to get started</p>
                <div className="flex justify-center gap-3">
                  <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1"><Plus className="w-4 h-4" />Create</Button>
                  <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm">Sync now</Button>
                </div>
              </>
            ) : (
              <p>No templates match your search / filter</p>
            )}
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Body</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Language</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">API Payload</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tpl, idx) => (
                  <tr key={tpl.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground text-xs">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium max-w-[160px]">
                      <span className="font-mono text-xs">{tpl.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{tpl.category}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {getBody(tpl.components) || <span className="italic">No body</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{tpl.language}</td>
                    <td className="px-4 py-3"><StatusBadge status={tpl.status} /></td>
                    <td className="px-4 py-3"><ApiPayloadButton template={tpl} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPreviewTpl(tpl)}
                          title="Preview"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(tpl)}
                          title="Delete"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border text-muted-foreground hover:text-red-500 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* modals */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(tpl) => setTemplates((ts) => [tpl, ...ts])}
        />
      )}
      {previewTpl && (
        <PreviewModal template={previewTpl} onClose={() => setPreviewTpl(null)} />
      )}
    </div>
  );
}
