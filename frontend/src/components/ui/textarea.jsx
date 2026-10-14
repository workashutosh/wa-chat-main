import { cn } from "../../lib/utils";

export function Textarea({ className, ...props }) {
  return <textarea className={cn("flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 resize-none", className)} {...props} />;
}
