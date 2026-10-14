import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle, Clock, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../components/ui/button";
import { getTemplates, syncTemplates } from "../lib/api";

const STATUS_ICON = {
  APPROVED:  <CheckCircle className="w-4 h-4 text-emerald-500" />,
  PENDING:   <Clock className="w-4 h-4 text-amber-500" />,
  REJECTED:  <XCircle className="w-4 h-4 text-red-500" />,
};

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [syncing, setSyncing] = useState(false);

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

  function getBodyText(components) {
    try {
      const list = JSON.parse(components);
      return list.find((c) => c.type === "BODY")?.text ?? "";
    } catch { return ""; }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <h2 className="font-semibold text-lg flex-1">Templates</h2>
        <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />Sync from Meta
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {templates.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg font-medium mb-2">No templates yet</p>
            <p className="text-sm mb-4">Click "Sync from Meta" to import your approved WhatsApp templates</p>
            <Button onClick={handleSync} disabled={syncing}>Sync now</Button>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <div key={t.id} className="border border-border rounded-xl p-4 bg-background hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-medium text-sm">{t.name}</p>
                  <div className="flex items-center gap-1 text-xs shrink-0">
                    {STATUS_ICON[t.status]}
                    <span className={t.status === "APPROVED" ? "text-emerald-600" : t.status === "REJECTED" ? "text-red-500" : "text-amber-600"}>{t.status}</span>
                  </div>
                </div>
                <div className="flex gap-2 mb-3">
                  <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{t.category}</span>
                  <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{t.language}</span>
                </div>
                {getBodyText(t.components) && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 bg-muted/50 rounded-lg px-3 py-2">
                    {getBodyText(t.components)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
