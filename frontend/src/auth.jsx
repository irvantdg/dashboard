import React, { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import api from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = memeriksa sesi
  useEffect(() => {
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => setUser(null));
  }, []);
  const login = async (email, password) => {
    const r = await api.post("/auth/login", { email, password });
    setUser(r.data);
    return r.data;
  };
  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) { /* abaikan */ }
    setUser(null);
  };
  return <AuthCtx.Provider value={{ user, setUser, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export const ROLE_LABELS = { admin: "Administrator", analyst: "Business Analyst", management: "Management" };

export function Protected({ children, roles }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === undefined)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="auth-loading">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-[#0F172A]" />
      </div>
    );
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(user.role))
    return (
      <div className="p-10 text-center" data-testid="forbidden">
        <h2 className="text-lg font-semibold">Akses Ditolak</h2>
        <p className="text-sm text-muted-foreground mt-1">Anda tidak memiliki izin untuk halaman ini.</p>
      </div>
    );
  return children;
}
