import { cn } from "../../lib/utils";

export function Badge({ children, className, style }) {
  return <span className={cn("inline-flex items-center justify-center rounded-full text-xs font-medium px-2 py-0.5", className)} style={style}>{children}</span>;
}

export function StatusBadge({ status }) {
  const map = { open: "bg-emerald-100 text-emerald-700", pending: "bg-amber-100 text-amber-700", resolved: "bg-slate-100 text-slate-600" };
  return <Badge className={map[status] ?? "bg-slate-100 text-slate-600"}>{status}</Badge>;
}
