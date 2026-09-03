import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import api, { errMsg, fetchMeta } from "../api";
import { Card, Empty, GrowthChip, Loading, SEV_STYLE, useStickyState } from "../components/common";
import { fmtCompactIDR, fmtCompactNum, fmtIDR, fmtNum, fmtPct, monthShort } from "../format";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Download, FileDown, Save, Star, Trash2, Info } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MODES = [
  { id: "mom", label: "Bulan ke Bulan (MoM)" },
  { id: "yoy", label: "Tahun ke Tahun (YoY)" },
  { id: "ytd", label: "Year-to-Date (YTD)" },
  { id: "ytd_yoy", label: "YTD vs YTD Tahun Lalu" },
  { id: "qoq", label: "Kuartal ke Kuartal (QoQ)" },
  { id: "qoq_yoy", label: "Kuartal YoY" },
  { id: "custom", label: "Periode Kustom (A vs B)" },
  { id: "rolling", label: "Periode Bergulir" },
  { id: "avg", label: "Bulan vs Rata-rata Bulanan" },
];
const METRICS = { volume: "Volume", nominal: "Nominal", fee: "Revenue" };
const QUAD_COLOR = { "Pertumbuhan Strategis": "#059669", "Lindungi & Pantau": "#0284C7", "Peluang Baru": "#D97706", "Prioritas Tinjauan": "#DC2626", "Data Pembanding Tidak Ada": "#94A3B8" };

const DEF = { mode: "mom", month: "2026-06", rolling_n: 3, avg_n: 3, a_start: "2026-04", a_end: "2026-06", b_start: "2026-01", b_end: "2026-03", member: "", product: "", position: "All", agg_type: "All", category: "All", min_materiality: 0, metric: "volume", benchmark_member: "", benchmark_product: "" };

function Delta({ k }) {
  return (
    <div className="text-right">
      {k.comparable ? (
        <>
          <GrowthChip value={k.pct} />
          <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">Δ {k.abs >= 0 ? "+" : ""}{fmtCompactNum(k.abs)}</div>
        </>
      ) : <span className="text-[10px] text-amber-700 font-medium" title={k.note}>Tidak dapat dibandingkan</span>}
    </div>
  );
}

export default function ManagementInsights() {
  const [meta, setMeta] = useState(null);
  const [f, setF] = useStickyState("flt-insights", DEF);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [views, setViews] = useState([]);
  const [saveName, setSaveName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [explain, setExplain] = useState(null);

  useEffect(() => { fetchMeta().then(setMeta).catch(() => {}); loadViews(); }, []);
  const loadViews = () => api.get("/saved-views").then((r) => {
    setViews(r.data.views);
    return r.data.views;
  }).catch(() => []);

  useEffect(() => {
    // Terapkan tampilan default sekali saat awal jika belum ada filter tersimpan
    if (!sessionStorage.getItem("flt-insights")) {
      loadViews().then((vs) => {
        const d = vs.find((v) => v.is_default);
        if (d) setF({ ...DEF, ...d.params });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const params = useMemo(() => {
    const p = { mode: f.mode, metric: f.metric };
    if (["mom", "yoy", "ytd", "ytd_yoy", "qoq", "qoq_yoy", "rolling", "avg"].includes(f.mode)) p.month = f.month;
    if (f.mode === "rolling") p.rolling_n = f.rolling_n;
    if (f.mode === "avg") p.avg_n = f.avg_n;
    if (f.mode === "custom") { p.a_start = f.a_start; p.a_end = f.a_end; p.b_start = f.b_start; p.b_end = f.b_end; }
    if (f.member) p.member = f.member;
    if (f.product) p.product = f.product;
    if (f.position !== "All") p.position = f.position;
    if (f.agg_type !== "All") p.agg_type = f.agg_type;
    if (f.category !== "All") p.category = f.category;
    if (f.min_materiality > 0) p.min_materiality = f.min_materiality;
    if (f.benchmark_member) p.benchmark_member = f.benchmark_member;
    if (f.benchmark_product) p.benchmark_product = f.benchmark_product;
    return p;
  }, [f]);

  const load = () => {
    setData(null); setError("");
    api.get("/insights", { params }).then((r) => setData(r.data)).catch((e) => setError(errMsg(e)));
  };
  useEffect(load, [params]);

  const saveView = async () => {
    try {
      await api.post("/saved-views", { name: saveName, params: f });
      toast.success("Tampilan tersimpan"); setSaveOpen(false); setSaveName(""); loadViews();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const exportPdf = () => {
    if (!data) return;
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text("Management Insights — Perbandingan Periode", 14, 16);
    doc.setFontSize(9); doc.setTextColor(100);
    doc.text(`Mode: ${MODES.find((m) => m.id === data.mode)?.label} | A: ${data.periods.label_a} | B: ${data.periods.label_b}`, 14, 22);
    const krows = Object.entries(data.kpis).map(([k, v]) => [k, fmtCompactNum(v.value), v.comparison != null ? fmtCompactNum(v.comparison) : "—", v.comparable ? fmtPct(v.pct) : "Tidak dapat dibandingkan"]);
    autoTable(doc, { startY: 26, head: [["Metrik", "Periode A", "Periode B", "Perubahan"]], body: krows, styles: { fontSize: 8 } });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6, head: [["Insight", "Tingkat", "Penjelasan"]],
      body: data.insights.map((c) => [c.title, c.severity, c.text]), styles: { fontSize: 7 }, columnStyles: { 2: { cellWidth: 110 } },
    });
    doc.save("management-insights.pdf");
  };

  // Data waterfall dengan basis kumulatif (triki stacked bar)
  const wf = useMemo(() => {
    if (!data) return [];
    let run = 0;
    return data.waterfall.map((w) => {
      if (w.total) return { name: w.name, base: 0, up: w.value >= 0 ? w.value : 0, down: w.value < 0 ? -w.value : 0, value: w.value };
      const base = w.value >= 0 ? run : run + w.value;
      run += w.value;
      return { name: w.name, base, up: w.value >= 0 ? w.value : 0, down: w.value < 0 ? -w.value : 0, value: w.value };
    });
  }, [data]);

  // Tren gabungan dua periode
  const trendMerged = useMemo(() => {
    if (!data) return [];
    const map = {};
    data.trend.a.forEach((r) => { map[r.period] = { period: r.period, A: r[f.metric] }; });
    data.trend.b.forEach((r) => { map[r.period] = { ...(map[r.period] || { period: r.period }), B: r[f.metric] }; });
    return Object.values(map).sort((x, y) => x.period.localeCompare(y.period));
  }, [data, f.metric]);

  const heatColor = (g) => {
    if (g == null) return "#F1F5F9";
    if (g >= 10) return "#A7F3D0";
    if (g >= 0) return "#D1FAE5";
    if (g <= -10) return "#FECACA";
    return "#FEE2E2";
  };

  return (
    <div className="space-y-4" data-testid="insights-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Management Insights</h1>
          <p className="text-sm text-muted-foreground">Apa yang berubah, seberapa besar, siapa penyumbangnya, dan area yang perlu perhatian. Seluruh perhitungan memakai lapisan metrik terpusat.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" data-testid="insights-save-view-btn" onClick={() => setSaveOpen(true)}><Save size={13} className="mr-1" />Simpan Tampilan</Button>
          <Button variant="outline" size="sm" data-testid="insights-export-pdf-btn" onClick={exportPdf}><FileDown size={13} className="mr-1" />Export PDF</Button>
          <Button size="sm" data-testid="insights-export-xlsx-btn" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/export/transactions.xlsx?${new URLSearchParams({ start: data?.periods.a_start || "", end: data?.periods.a_end || "" })}`, "_blank")}
            className="bg-[#0F172A] hover:bg-slate-800"><Download size={13} className="mr-1" />Export Excel</Button>
        </div>
      </div>

      {views.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="saved-views">
          <span className="text-[11px] font-medium text-muted-foreground">Tampilan tersimpan:</span>
          {views.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px]">
              <button data-testid={`view-${v.id}`} className="font-medium hover:text-[#0284C7]" onClick={() => setF({ ...DEF, ...v.params })}>{v.name}</button>
              <button title="Jadikan default" onClick={async () => { await api.put(`/saved-views/${v.id}/default`); loadViews(); }}>
                <Star size={10} className={v.is_default ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
              </button>
              <button title="Hapus" onClick={async () => { await api.delete(`/saved-views/${v.id}`); loadViews(); }}><Trash2 size={10} className="text-slate-300 hover:text-red-500" /></button>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-lg border bg-card p-3 space-y-2" data-testid="insights-filters">
        <div className="flex flex-wrap items-center gap-2">
          <select data-testid="insights-mode" className="h-8 rounded border px-2 text-xs font-medium" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
            {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          {f.mode !== "custom" && (
            <input type="month" data-testid="insights-month" className="h-8 rounded border px-2 text-xs" value={f.month} min={meta?.period_min} max={meta?.period_max} onChange={(e) => setF({ ...f, month: e.target.value })} />
          )}
          {f.mode === "rolling" && (
            <select data-testid="insights-rolling" className="h-8 rounded border px-2 text-xs" value={f.rolling_n} onChange={(e) => setF({ ...f, rolling_n: parseInt(e.target.value) })}>
              <option value={3}>3 bulan terakhir</option><option value={6}>6 bulan terakhir</option><option value={12}>12 bulan terakhir</option>
            </select>
          )}
          {f.mode === "avg" && (
            <select data-testid="insights-avg" className="h-8 rounded border px-2 text-xs" value={f.avg_n} onChange={(e) => setF({ ...f, avg_n: parseInt(e.target.value) })}>
              <option value={3}>Rata-rata 3 bulan</option><option value={6}>Rata-rata 6 bulan</option><option value={12}>Rata-rata 12 bulan</option>
            </select>
          )}
          {f.mode === "custom" && (
            <>
              <span className="text-[11px] font-semibold text-muted-foreground">A:</span>
              <input type="month" data-testid="insights-a-start" className="h-8 rounded border px-2 text-xs" value={f.a_start} onChange={(e) => setF({ ...f, a_start: e.target.value })} />
              <span className="text-xs text-muted-foreground">s.d.</span>
              <input type="month" data-testid="insights-a-end" className="h-8 rounded border px-2 text-xs" value={f.a_end} onChange={(e) => setF({ ...f, a_end: e.target.value })} />
              <span className="text-[11px] font-semibold text-muted-foreground">B:</span>
              <input type="month" data-testid="insights-b-start" className="h-8 rounded border px-2 text-xs" value={f.b_start} onChange={(e) => setF({ ...f, b_start: e.target.value })} />
              <span className="text-xs text-muted-foreground">s.d.</span>
              <input type="month" data-testid="insights-b-end" className="h-8 rounded border px-2 text-xs" value={f.b_end} onChange={(e) => setF({ ...f, b_end: e.target.value })} />
            </>
          )}
          <select data-testid="insights-member" className="h-8 rounded border px-2 text-xs max-w-40" value={f.member} onChange={(e) => setF({ ...f, member: e.target.value })}>
            <option value="">Semua Member</option>
            {meta?.members.map((m) => <option key={m.member_code} value={m.member_code}>{m.member_name}</option>)}
          </select>
          <select data-testid="insights-product" className="h-8 rounded border px-2 text-xs max-w-40" value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })}>
            <option value="">Semua Produk</option>
            {meta?.products.map((p) => <option key={p.product_code} value={p.product_code}>{p.product_name}</option>)}
          </select>
          <select data-testid="insights-position" className="h-8 rounded border px-2 text-xs" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })}>
            <option value="All">Semua Posisi</option><option value="Issuer">Issuer</option><option value="Acquirer">Acquirer</option>
          </select>
          <select data-testid="insights-agg" className="h-8 rounded border px-2 text-xs" value={f.agg_type} onChange={(e) => setF({ ...f, agg_type: e.target.value })}>
            <option value="All">Semua Agregasi</option><option value="Single Side">Single Side</option><option value="Cross">Cross</option>
          </select>
          <select data-testid="insights-category" className="h-8 rounded border px-2 text-xs" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="All">Semua Kategori</option>
            {meta?.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Materialitas min.
            <input type="number" data-testid="insights-materiality" className="h-8 w-16 rounded border px-1.5 text-xs" value={f.min_materiality}
              onChange={(e) => setF({ ...f, min_materiality: parseFloat(e.target.value) || 0 })} />%
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          <span className="text-[11px] font-medium text-muted-foreground">Metrik driver:</span>
          <div className="inline-flex rounded border overflow-hidden" data-testid="insights-metric-switch">
            {Object.entries(METRICS).map(([key, label]) => (
              <button key={key} onClick={() => setF({ ...f, metric: key })}
                className={`px-2.5 py-1 text-[11px] font-medium ${f.metric === key ? "bg-[#0F172A] text-white" : "hover:bg-secondary"}`}>{label}</button>
            ))}
          </div>
          <span className="text-[11px] font-medium text-muted-foreground ml-2">Benchmark:</span>
          <select data-testid="insights-benchmark-member" className="h-7 rounded border px-1.5 text-[11px]" value={f.benchmark_member}
            onChange={(e) => setF({ ...f, benchmark_member: e.target.value, benchmark_product: "" })}>
            <option value="">— member vs rata-rata —</option>
            {meta?.members.map((m) => <option key={m.member_code} value={m.member_code}>{m.member_name}</option>)}
          </select>
          <select data-testid="insights-benchmark-product" className="h-7 rounded border px-1.5 text-[11px]" value={f.benchmark_product}
            onChange={(e) => setF({ ...f, benchmark_product: e.target.value, benchmark_member: "" })}>
            <option value="">— produk vs portofolio —</option>
            {meta?.products.map((p) => <option key={p.product_code} value={p.product_code}>{p.product_name}</option>)}
          </select>
          <button data-testid="insights-reset-btn" onClick={() => setF(DEF)} className="ml-auto text-[11px] font-semibold text-[#0284C7] hover:underline">Reset Filter</button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800" data-testid="insights-error">{error}</div>}
      {!data ? <Loading label="Menghitung insight…" /> : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="period-labels">
            <span className="rounded bg-[#0F172A] px-2.5 py-1 font-semibold text-white">Periode A: {data.periods.label_a}</span>
            <span className="text-muted-foreground">vs</span>
            <span className="rounded bg-secondary px-2.5 py-1 font-semibold">Periode B: {data.periods.label_b}</span>
            {data.periods.avg_note && <span className="text-[11px] text-amber-700">{data.periods.avg_note}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" data-testid="insights-kpis">
            {[
              ["Volume", data.kpis.volume, fmtCompactNum, "kpi-c-volume"],
              ["Nominal", data.kpis.nominal, fmtCompactIDR, "kpi-c-nominal"],
              ["Revenue", data.kpis.fee, fmtCompactIDR, "kpi-c-fee"],
              ["Member Aktif", data.kpis.active_members, fmtNum, "kpi-c-members"],
              ["Nilai Rata-rata", data.kpis.avg_value, fmtIDR, "kpi-c-avg"],
              ["Produk Live", data.kpis.live_products, fmtNum, "kpi-c-live"],
              ["Produk Bertransaksi", data.kpis.trx_products, fmtNum, "kpi-c-trxprod"],
            ].map(([label, k, fmt, id]) => (
              <div key={id} data-testid={id} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className="mt-1 text-base font-bold tabular-nums">{fmt(k.value)}</div>
                <Delta k={k} />
              </div>
            ))}
          </div>

          {data.benchmark && (
            <Card title={`Benchmark: ${data.benchmark.key} vs rata-rata ${data.benchmark.type === "member" ? "member" : "produk"}`} testid="benchmark-card">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-xs">
                <div><div className="text-muted-foreground">Nilai {data.benchmark.key}</div><div className="text-base font-bold tabular-nums">{f.metric === "volume" ? fmtNum(data.benchmark.a_value) : fmtIDR(data.benchmark.a_value)}</div></div>
                <div><div className="text-muted-foreground">Rata-rata {data.benchmark.type === "member" ? "member" : "produk"}</div><div className="text-base font-bold tabular-nums">{f.metric === "volume" ? fmtNum(data.benchmark.avg_value) : fmtIDR(data.benchmark.avg_value)}</div></div>
                <div><div className="text-muted-foreground">Kontribusi ke total perusahaan</div><div className="text-base font-bold tabular-nums">{fmtPct(data.benchmark.share_pct, false)}</div></div>
                <div><div className="text-muted-foreground">Pertumbuhan</div><GrowthChip value={data.benchmark.growth_pct} /></div>
              </div>
            </Card>
          )}

          <div className="grid gap-3 lg:grid-cols-2" data-testid="insight-cards">
            {data.insights.length === 0 && <Card testid="no-insights"><Empty title="Tidak ada insight pada periode ini" detail="Tidak ada aturan yang terpicu dengan ambang saat ini." /></Card>}
            {data.insights.map((c) => (
              <div key={c.id} data-testid={`insight-${c.id}`} className={`rounded-lg border p-4 ${SEV_STYLE[c.severity]}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-bold">{c.title}</div>
                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase">{c.severity}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed">{c.text}</p>
                {c.contributors?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.contributors.map((ct, i) => (
                      <span key={i} className="rounded bg-white/70 border px-1.5 py-0.5 text-[10px] font-medium">
                        {ct.name}{ct.pct != null ? ` (${ct.pct.toLocaleString("id-ID", { maximumFractionDigits: 0 })}%)` : ""}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2.5 flex items-center justify-between border-t border-current/10 pt-2">
                  <button data-testid={`insight-rule-${c.id}`} onClick={() => setExplain(c)}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold hover:underline"><Info size={10} />Cara dihitung</button>
                  {c.link && <Link to={c.link} className="text-[10px] font-bold hover:underline" data-testid={`insight-link-${c.id}`}>Lihat analisis detail →</Link>}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Waterfall Kontribusi Perubahan" sub={`Per member · metrik ${METRICS[f.metric]} · total terekonsiliasi`} testid="chart-waterfall">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={wf} margin={{ left: 0, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={56} />
                  <YAxis tickFormatter={f.metric === "volume" ? fmtCompactNum : fmtCompactIDR} tick={{ fontSize: 10 }} width={70} />
                  <Tooltip formatter={(v, n, item) => [f.metric === "volume" ? fmtNum(item.payload.value) : fmtIDR(item.payload.value), item.payload.name]} />
                  <Bar dataKey="base" stackId="w" fill="transparent" />
                  <Bar dataKey="up" stackId="w" fill="#059669" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="down" stackId="w" fill="#DC2626" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Tren Kedua Periode" sub={`A: ${data.periods.label_a} · B: ${data.periods.label_b}`} testid="chart-dual-trend">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendMerged} margin={{ left: 0, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="period" tickFormatter={monthShort} tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={f.metric === "volume" ? fmtCompactNum : fmtCompactIDR} tick={{ fontSize: 10 }} width={70} />
                  <Tooltip formatter={(v, n) => [f.metric === "volume" ? fmtNum(v) : fmtIDR(v), n]} labelFormatter={monthShort} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="A" name="Periode A" stroke="#0284C7" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="B" name="Periode B" stroke="#94A3B8" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Kuadran Pertumbuhan vs Kontribusi" sub="Per member · label kategori bersifat analitis, bukan keputusan otomatis" testid="chart-quadrant">
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart margin={{ left: 0, right: 12, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" dataKey="share_pct" name="Kontribusi" unit="%" tick={{ fontSize: 10 }} label={{ value: "Kontribusi (%)", position: "insideBottom", offset: -2, fontSize: 10 }} />
                  <YAxis type="number" dataKey="growth_pct" name="Pertumbuhan" unit="%" tick={{ fontSize: 10 }} width={44} />
                  <ZAxis range={[60, 60]} />
                  <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="4 4" />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }}
                    content={({ payload }) => payload?.[0] ? (
                      <div className="rounded border bg-white p-2 text-[11px] shadow">
                        <div className="font-bold">{payload[0].payload.member}</div>
                        <div>Pertumbuhan: {fmtPct(payload[0].payload.growth_pct)}</div>
                        <div>Kontribusi: {fmtPct(payload[0].payload.share_pct, false)}</div>
                        <div className="font-semibold" style={{ color: QUAD_COLOR[payload[0].payload.category] }}>{payload[0].payload.category}</div>
                      </div>
                    ) : null} />
                  <Scatter data={data.quadrant}>
                    {data.quadrant.map((q, i) => <Cell key={i} fill={QUAD_COLOR[q.category]} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <div className="mt-1 flex flex-wrap gap-2">
                {Object.entries(QUAD_COLOR).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: v }} />{k}
                  </span>
                ))}
              </div>
            </Card>
            <Card title="Heatmap Kinerja Member × Produk" sub="Pertumbuhan % periode A vs B (metrik terpilih)" testid="chart-heatmap">
              {data.heatmap.cells.length === 0 ? <Empty /> : (
                <div className="overflow-x-auto matrix-scroll">
                  <table className="border-collapse text-[10px]">
                    <thead><tr>
                      <th className="sticky left-0 bg-white px-1.5 py-1 text-left font-semibold">Member</th>
                      {data.heatmap.products.map((p) => <th key={p} className="px-1.5 py-1 font-semibold">{p}</th>)}
                    </tr></thead>
                    <tbody>
                      {data.heatmap.members.map((m) => (
                        <tr key={m}>
                          <td className="sticky left-0 bg-white px-1.5 py-1 font-medium whitespace-nowrap">{m}</td>
                          {data.heatmap.products.map((p) => {
                            const cell = data.heatmap.cells.find((c) => c.member === m && c.product === p);
                            return (
                              <td key={p} className="px-1.5 py-1 text-center tabular-nums" title={cell?.growth_pct == null ? "Tidak dapat dibandingkan" : undefined}
                                style={{ background: heatColor(cell?.growth_pct) }}>
                                {cell?.growth_pct == null ? "n/a" : `${cell.growth_pct > 0 ? "+" : ""}${cell.growth_pct.toLocaleString("id-ID", { maximumFractionDigits: 0 })}%`}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <Card title="Apa yang Mendorong Perubahan?" sub={`Kontribusi terhadap total perubahan ${METRICS[f.metric]} · Σ kontribusi = total perubahan (terekonsiliasi: ${Object.values(data.drivers).filter((d) => d?.reconciled !== undefined).every((d) => d.reconciled) ? "ya" : "periksa"})`} testid="drivers-section">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[["member", "Per Member"], ["product", "Per Produk"], ["position", "Issuer vs Acquirer"], ["border", "Domestik vs Lintas Negara"]].map(([dim, title]) => (
                <div key={dim}>
                  <div className="mb-1.5 text-xs font-semibold">{title}</div>
                  <div className="text-[10px] font-semibold uppercase text-emerald-700">Top Positif</div>
                  <ul className="mb-2 space-y-1">
                    {data.drivers[dim].positive.length === 0 && <li className="text-[11px] text-muted-foreground">Tidak ada</li>}
                    {data.drivers[dim].positive.map((r) => (
                      <li key={r.key} className="flex items-center justify-between text-[11px]">
                        <span className="truncate font-medium">{r.key === true ? "Lintas Negara" : r.key === false ? "Domestik" : r.key}</span>
                        <span className="tabular-nums text-emerald-700">+{f.metric === "volume" ? fmtCompactNum(r.diff) : fmtCompactIDR(r.diff)}{r.contribution_pct != null ? ` (${r.contribution_pct.toLocaleString("id-ID", { maximumFractionDigits: 0 })}%)` : ""}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="text-[10px] font-semibold uppercase text-red-700">Top Negatif</div>
                  <ul className="space-y-1">
                    {data.drivers[dim].negative.length === 0 && <li className="text-[11px] text-muted-foreground">Tidak ada</li>}
                    {data.drivers[dim].negative.map((r) => (
                      <li key={r.key} className="flex items-center justify-between text-[11px]">
                        <span className="truncate font-medium">{r.key === true ? "Lintas Negara" : r.key === false ? "Domestik" : r.key}</span>
                        <span className="tabular-nums text-red-700">{f.metric === "volume" ? fmtCompactNum(r.diff) : fmtCompactIDR(r.diff)}{r.contribution_pct != null ? ` (${r.contribution_pct.toLocaleString("id-ID", { maximumFractionDigits: 0 })}%)` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Tabel Perbandingan Detail per Member" testid="insights-detail-table">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Member</th>
                  <th className="py-2 pr-3 text-right font-medium">Periode A</th>
                  <th className="py-2 pr-3 text-right font-medium">Periode B</th>
                  <th className="py-2 pr-3 text-right font-medium">Selisih</th>
                  <th className="py-2 pr-3 text-right font-medium">Perubahan</th>
                  <th className="py-2 text-right font-medium">Kontribusi</th>
                </tr></thead>
                <tbody>
                  {[...data.drivers.member.positive, ...data.drivers.member.negative].length === 0 && (
                    <tr><td colSpan={6}><Empty title="Tidak ada perubahan antar periode" /></td></tr>
                  )}
                  {[...data.drivers.member.positive, ...data.drivers.member.negative]
                    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
                    .map((r) => (
                      <tr key={r.key} className="border-b last:border-0 hover:bg-secondary/50" data-testid={`driver-row-${r.key}`}>
                        <td className="py-1.5 pr-3"><Link to={`/member/${r.key}`} className="font-medium hover:text-[#0284C7] hover:underline">{r.key}</Link></td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{f.metric === "volume" ? fmtNum(r[`a_${f.metric}`]) : fmtIDR(r[`a_${f.metric}`])}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{f.metric === "volume" ? fmtNum(r[`b_${f.metric}`]) : fmtIDR(r[`b_${f.metric}`])}</td>
                        <td className={`py-1.5 pr-3 text-right tabular-nums font-medium ${r.diff >= 0 ? "text-emerald-700" : "text-red-700"}`}>{r.diff >= 0 ? "+" : ""}{f.metric === "volume" ? fmtNum(r.diff) : fmtIDR(r.diff)}</td>
                        <td className="py-1.5 pr-3 text-right"><GrowthChip value={r.change_pct} /></td>
                        <td className="py-1.5 text-right tabular-nums">{r.contribution_pct == null ? "n/a" : fmtPct(r.contribution_pct, false)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent data-testid="save-view-dialog">
          <DialogHeader><DialogTitle>Simpan Tampilan Management</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input data-testid="save-view-name" placeholder="Nama tampilan, mis. Monthly Management Review" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
            <Button data-testid="save-view-confirm-btn" disabled={!saveName.trim()} onClick={saveView} className="w-full bg-[#0F172A] hover:bg-slate-800">Simpan</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!explain} onOpenChange={() => setExplain(null)}>
        <DialogContent data-testid="insight-explain-dialog">
          <DialogHeader><DialogTitle>Cara Insight Ini Dihasilkan</DialogTitle></DialogHeader>
          {explain && (
            <div className="space-y-2 text-xs">
              <p className="font-semibold">{explain.title}</p>
              <p className="rounded bg-secondary p-2.5 font-medium">{explain.rule}</p>
              <p className="text-muted-foreground">{explain.disclaimer}</p>
              <p className="text-muted-foreground">Ambang aktif dapat dilihat dan diubah Administrator pada halaman Pengaturan Threshold.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
