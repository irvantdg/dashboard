import React, { useState } from "react";
import { TrendingUp, TrendingDown, Minus, CheckCircle2, FlaskConical, Code2, Clock3, PauseCircle, CircleDashed, Loader2, Inbox } from "lucide-react";

export const CHART_COLORS = ["#0284C7", "#0D9488", "#D97706", "#1E3A5F", "#DC2626", "#7C3AED", "#059669", "#64748B", "#DB2777", "#65A30D"];

export const STATUS_STYLE = {
  "Live": { cls: "bg-emerald-50 text-emerald-800 border-emerald-300", Icon: CheckCircle2 },
  "UAT": { cls: "bg-amber-50 text-amber-800 border-amber-300", Icon: FlaskConical },
  "Development": { cls: "bg-sky-50 text-sky-800 border-sky-300", Icon: Code2 },
  "Preparation": { cls: "bg-slate-100 text-slate-700 border-slate-300", Icon: Clock3 },
  "On Hold": { cls: "bg-orange-50 text-orange-800 border-orange-300", Icon: PauseCircle },
  "Not Implemented": { cls: "bg-white text-slate-500 border-slate-300 border-dashed", Icon: CircleDashed },
};

export function StatusBadge({ status, small }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE["Not Implemented"];
  return (
    <span data-testid={`status-badge-${status?.replace(/\s/g, "-")}`} className={`inline-flex items-center gap-1 rounded border font-medium ${small ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"} ${s.cls}`}>
      <s.Icon size={small ? 10 : 12} strokeWidth={2.2} />
      {status}
    </span>
  );
}

export function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-2" data-testid="status-legend">
      {Object.keys(STATUS_STYLE).map((k) => <StatusBadge key={k} status={k} small />)}
    </div>
  );
}

export function GrowthChip({ value, testid }) {
  if (value == null) return <span className="text-[11px] text-muted-foreground" data-testid={testid}>n/a</span>;
  const up = value > 0.05, down = value < -0.05;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  const cls = up ? "text-emerald-700 bg-emerald-50" : down ? "text-red-700 bg-red-50" : "text-slate-600 bg-slate-100";
  return (
    <span data-testid={testid} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon size={11} />{up ? "+" : ""}{value.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
    </span>
  );
}

export function KpiCard({ title, value, sub, delta, testid, accent }) {
  return (
    <div data-testid={testid} className={`rounded-lg border bg-card p-4 shadow-sm ${accent ? "border-l-4 border-l-[#0284C7]" : ""}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1.5 text-xl font-bold tabular-nums text-[#0F172A]">{value}</div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground truncate">{sub}</span>
        {delta !== undefined && <GrowthChip value={delta} testid={`${testid}-delta`} />}
      </div>
    </div>
  );
}

export function Loading({ label = "Memuat data…" }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground" data-testid="loading-state">
      <Loader2 className="animate-spin" size={18} /><span className="text-sm">{label}</span>
    </div>
  );
}

export function Empty({ title = "Tidak ada data", detail = "Coba ubah filter atau periode yang dipilih." }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="empty-state">
      <Inbox size={32} className="text-slate-300" />
      <div className="mt-2 text-sm font-semibold text-slate-700">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center justify-between" data-testid="error-state">
      <span>{message}</span>
      {onRetry && <button onClick={onRetry} className="text-xs font-semibold underline">Coba lagi</button>}
    </div>
  );
}

export function Card({ title, sub, children, actions, testid, className = "" }) {
  return (
    <div className={`rounded-lg border bg-card shadow-sm ${className}`} data-testid={testid}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[#0F172A]">{title}</h3>
            {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function FilterChips({ chips, onRemove, onReset }) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="active-filter-chips">
      <span className="text-[11px] text-muted-foreground font-medium">{chips.length} filter aktif:</span>
      {chips.map((c) => (
        <button key={c.key} data-testid={`chip-${c.key}`} onClick={() => onRemove(c.key)}
          className="inline-flex items-center gap-1 rounded-full bg-[#0F172A] px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-slate-700">
          {c.label}<span aria-hidden>×</span>
        </button>
      ))}
      <button data-testid="reset-filter-btn" onClick={onReset} className="text-[11px] font-semibold text-[#0284C7] hover:underline ml-1">
        Reset Filter
      </button>
    </div>
  );
}

export function Paginator({ page, total, pageSize, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between pt-3" data-testid="paginator">
      <span className="text-xs text-muted-foreground">{total.toLocaleString("id-ID")} baris · Halaman {page} dari {pages}</span>
      <div className="flex gap-1">
        <button data-testid="page-prev" disabled={page <= 1} onClick={() => onPage(page - 1)}
          className="rounded border px-2.5 py-1 text-xs font-medium disabled:opacity-40 hover:bg-secondary">Sebelumnya</button>
        <button data-testid="page-next" disabled={page >= pages} onClick={() => onPage(page + 1)}
          className="rounded border px-2.5 py-1 text-xs font-medium disabled:opacity-40 hover:bg-secondary">Berikutnya</button>
      </div>
    </div>
  );
}

export function useStickyState(key, def) {
  const [v, setV] = useState(() => {
    try { const s = sessionStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; }
  });
  const set = (val) => {
    setV(val);
    try { sessionStorage.setItem(key, JSON.stringify(val)); } catch { /* abaikan */ }
  };
  return [v, set];
}

export const SEV_STYLE = {
  "Informasi": "border-sky-300 bg-sky-50 text-sky-900",
  "Peluang": "border-emerald-300 bg-emerald-50 text-emerald-900",
  "Perhatian": "border-amber-300 bg-amber-50 text-amber-900",
  "Kritis": "border-red-300 bg-red-50 text-red-900",
};
export const SEV_DOT = { "Informasi": "#0284C7", "Peluang": "#059669", "Perhatian": "#D97706", "Kritis": "#DC2626" };
