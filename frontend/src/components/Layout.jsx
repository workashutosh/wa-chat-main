import { NavLink, useNavigate } from "react-router-dom";
import { MessageSquare, Users, Zap, FileText, Settings, LogOut, Bot } from "lucide-react";
import { useAuth } from "../hooks/useAuth.jsx";
import { Avatar } from "./ui/avatar";
import { cn } from "../lib/utils";

const NAV = [
  { to: "/", icon: MessageSquare, label: "Inbox" },
  { to: "/contacts", icon: Users, label: "Contacts" },
  { to: "/templates", icon: FileText, label: "Templates" },
  { to: "/automation", icon: Zap, label: "Automation" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Layout({ children }) {
  const { agent, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() { logout(); navigate("/login"); }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar nav */}
      <nav className="flex flex-col w-16 bg-slate-900 items-center py-4 shrink-0">
        <div className="mb-6">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === "/"}
              className={({ isActive }) => cn("w-10 h-10 rounded-xl flex items-center justify-center transition-colors group relative", isActive ? "bg-emerald-500 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white")}
              title={label}
            >
              <Icon className="w-5 h-5" />
            </NavLink>
          ))}
        </div>
        <div className="mt-auto flex flex-col items-center gap-2">
          <Avatar name={agent?.name ?? ""} className="w-8 h-8 text-xs cursor-pointer" />
          <button onClick={handleLogout} className="text-slate-400 hover:text-white" title="Logout">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </nav>
      <main className="flex-1 flex overflow-hidden">{children}</main>
    </div>
  );
}
