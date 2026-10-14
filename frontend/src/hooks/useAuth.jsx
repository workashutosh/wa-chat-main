import { createContext, useContext, useEffect, useState } from "react";
import { getMe } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("wa_token");
    if (!token) { setLoading(false); return; }
    getMe().then(setAgent).catch(() => localStorage.removeItem("wa_token")).finally(() => setLoading(false));
  }, []);

  function loginSuccess(data) {
    localStorage.setItem("wa_token", data.token);
    setAgent(data.agent);
  }

  function logout() {
    localStorage.removeItem("wa_token");
    setAgent(null);
  }

  return <AuthContext.Provider value={{ agent, loading, loginSuccess, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
