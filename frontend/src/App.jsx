import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./hooks/useAuth.jsx";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Inbox from "./pages/Inbox";
import Contacts from "./pages/Contacts";
import Templates from "./pages/Templates";
import Automation from "./pages/Automation";
import Settings from "./pages/Settings";

function PrivateRoute({ children }) {
  const { agent, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  if (!agent) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }) {
  const { agent, loading } = useAuth();
  if (loading) return null;
  if (agent) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ style: { fontSize: 13 } }} />
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/" element={<PrivateRoute><Inbox /></PrivateRoute>} />
          <Route path="/contacts" element={<PrivateRoute><Contacts /></PrivateRoute>} />
          <Route path="/templates" element={<PrivateRoute><Templates /></PrivateRoute>} />
          <Route path="/automation" element={<PrivateRoute><Automation /></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
