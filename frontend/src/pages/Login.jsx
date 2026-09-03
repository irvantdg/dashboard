import React, { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { errMsg } from "../api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await login(email, password);
      nav(loc.state?.from || "/", { replace: true });
    } catch (e2) {
      setError(errMsg(e2));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-[#0284C7] text-white font-extrabold">MTI</div>
          <h1 className="text-xl font-bold text-white">Member & Transaction Intelligence</h1>
          <p className="mt-1 text-xs text-slate-400">Portal internal — masuk dengan akun perusahaan Anda</p>
        </div>
        <form onSubmit={submit} className="rounded-lg bg-white p-6 shadow-xl space-y-4" data-testid="login-form">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" data-testid="login-email" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@mti.internal" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="password">Kata Sandi</Label>
            <Input id="password" data-testid="login-password" type="password" required autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="mt-1" />
          </div>
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="login-error">{error}</div>}
          <Button data-testid="login-submit-btn" type="submit" disabled={busy} className="w-full bg-[#0F172A] hover:bg-slate-800">
            {busy ? "Memeriksa…" : "Masuk"}
          </Button>
          <div className="text-center">
            <Link to="/forgot-password" className="text-xs font-medium text-[#0284C7] hover:underline" data-testid="forgot-password-link">
              Lupa kata sandi?
            </Link>
          </div>
        </form>
        <p className="mt-4 text-center text-[11px] text-slate-500">Rahasia — hanya untuk pengguna internal yang berwenang.</p>
      </div>
    </div>
  );
}
