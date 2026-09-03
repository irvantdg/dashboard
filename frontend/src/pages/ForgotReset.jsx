import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { errMsg } from "../api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

function Shell({ children, title }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-4 text-center text-lg font-bold text-white">{title}</h1>
        <div className="rounded-lg bg-white p-6 shadow-xl">{children}</div>
        <div className="mt-4 text-center">
          <Link to="/login" className="text-xs font-medium text-slate-300 hover:text-white" data-testid="back-to-login">← Kembali ke halaman masuk</Link>
        </div>
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post("/auth/forgot-password", { email }); } catch (e2) { /* respons generik */ }
    setDone(true); setBusy(false);
  };
  return (
    <Shell title="Lupa Kata Sandi">
      {done ? (
        <p className="text-sm text-slate-700" data-testid="forgot-confirmation">
          Jika email terdaftar, tautan reset telah dikirim. Periksa kotak masuk Anda (berlaku 1 jam).
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
          <div>
            <Label htmlFor="fp-email">Email</Label>
            <Input id="fp-email" data-testid="forgot-email" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} className="mt-1" />
          </div>
          <Button data-testid="forgot-submit-btn" type="submit" disabled={busy} className="w-full bg-[#0F172A] hover:bg-slate-800">
            {busy ? "Mengirim…" : "Kirim Tautan Reset"}
          </Button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await api.post("/auth/reset-password", { token: sp.get("token") || "", password });
      nav("/login");
    } catch (e2) { setError(errMsg(e2)); } finally { setBusy(false); }
  };
  return (
    <Shell title="Atur Ulang Kata Sandi">
      <form onSubmit={submit} className="space-y-4" data-testid="reset-form">
        <div>
          <Label htmlFor="rp-pass">Kata Sandi Baru</Label>
          <Input id="rp-pass" data-testid="reset-password-input" type="password" required minLength={8}
            value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
          <p className="mt-1 text-[11px] text-muted-foreground">Minimal 8 karakter.</p>
        </div>
        {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="reset-error">{error}</div>}
        <Button data-testid="reset-submit-btn" type="submit" disabled={busy} className="w-full bg-[#0F172A] hover:bg-slate-800">
          {busy ? "Menyimpan…" : "Simpan Kata Sandi Baru"}
        </Button>
      </form>
    </Shell>
  );
}
