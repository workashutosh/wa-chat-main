import { cn, getInitials, avatarColor } from "../../lib/utils";

export function Avatar({ name = "", className }) {
  return (
    <div className={cn("flex items-center justify-center rounded-full text-white text-sm font-semibold shrink-0", avatarColor(name), className)}>
      {getInitials(name) || "?"}
    </div>
  );
}
