import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api, { fetchMeta } from "../api";
import { Card, CHART_COLORS, Empty, ErrorBox, FilterChips, KpiCard, Loading, Paginator, useStickyState } from "../components/common";
import { fmtCompactIDR, fmtCompactNum, fmtIDR, fmtNum, fmtPct, monthShort } from "../format";
import { Button } from "../components/ui/button";
import { Download, FileDown, ArrowUpDown } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const DEF = { start: "", end: "", member: "", product: "", position: "All", agg_type: "All", category: "All" };
const METRICS = { volume: "Volume", nominal: "Nominal", fee: "Revenue" };

export default function RekapTransaksi() {
  const [meta, setMeta] = useState(null);
  const [f, setF] = useStickyState("flt-rekap", DEF);
  const [metric, setMetric] = useState("volume");
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState(null);
  const [byProduct, setByProduct] = useState(null);
  const [byPosition, setByPosition] = useState(null);
  const [byMember, setByMember] = useState(null);
  const [table, setTable] = useState(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ by: "period", dir: "desc" });
  const [error, setError] = useState("");

  useEffect(() => { fetchMeta().then(setMeta).catch(() => {}); }, []);

  const params = useMemo(() => {
    const p = {};
    if (f.start) p.start = f.start;
    if (f.end) p.end = f.end;
    if (f.member) p.member = f.member;
    if (f.product) p.product = f.product;
    if (f.position !== "All") p.position = f.position;
    if (f.agg_type !== "All") p.agg_type = f.agg_type;
    if (f.category !== "All") p.category = f.category;
    return p;
  }, [f]);

  useEffect(() => {
    setError("");
    Promise.all([
      api.get("/transactions/summary", { params }),
      api.get("/transactions/series", { params }),
      api.get("/transactions/breakdown", { params: { ...params, dimension: "product" } }),
      api.get("/transactions/breakdown", { params: { ...params, dimension: "position" } }),
      api.get("/transactions/breakdown", { params: { ...params, dimension: "member" } }),
    ]).then(([s, ser, bp, bpos, bm]) => {
      setSummary(s.data); setSeries(ser.data.series); setByProduct(bp.data.rows);
      setByPosition(bpos.data.rows); setByMember(bm.data.rows);
    }).catch(() => setError("Gagal memuat rekap transaksi"));
  }, [params]);

  useEffect(() => {
    api.get("/transactions/table", { params: { ...params, page, page_size: 25, sort_by: sort.by, sort_dir: sort.dir } })
      .then((r) => setTable(r.data)).catch(() => {});
  }, [params, page, sort]);

  const chips = [];
  if (f.start) chips.push({ key: "start", label: `Dari ${monthShort(f.start)}` });
  if (f.end) chips.push({ key: "end", label: `s.d. ${monthShort(f.end)}` });
  if (f.member) chips.push({ key: "member", label: meta?.members.find((m) => m.member_code === f.member)?.member_name || f.member });
  if (f.product) chips.push({ key: "product", label: meta?.products.find((p) => p.product_code === f.product)?.product_name || f.product });
  if (f.position !== "All") chips.push({ key: "position", label: `Posisi ${f.position}` });
  if (f.agg_type !== "All") chips.push({ key: "agg_type", label: f.agg_type });
  if (f.category !== "All") chips.push({ key: "category", label: `Kategori ${f.category}` });
  const removeChip = (k) => setF({ ...f, [k]: ["position", "agg_type", "category"].includes(k) ? "All" : "" });

  const exportXlsx = () => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/export/transactions.xlsx?${new URLSearchParams(params)}`, "_blank");

  const exportPdf = () => {
    if (!summary) return;
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text("Ringkasan Rekap Transaksi", 14, 16);
    doc.setFontSize(9); doc.setTextColor(100);
    doc.text(`Periode: ${summary.period_label} | Pembanding: ${summary.prev_label}`, 14, 22);
    autoTable(doc, {
      startY: 26, head: [["Metrik", "Nilai", "Pertumbuhan"]],
      body: [
        ["Member Aktif", fmtNum(summary.kpis.active_members), "—"],
        ["Volume", fmtNum(summary.kpis.volume), fmtPct(summary.kpis.volume_growth_pct)],
        ["Nominal", fmtIDR(summary.kpis.nominal), fmtPct(summary.kpis.nominal_growth_pct)],
        ["Fee/Revenue", summary.kpis.fee == null ? "Dibatasi" : fmtIDR(summary.kpis.fee), fmtPct(summary.kpis.fee_growth_pct)],
        ["Nilai Rata-rata", fmtIDR(summary.kpis.avg_value), "—"],
      ],
      styles: { fontSize: 8 },
    });
    if (byMember?.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6, head: [["Member Teratas", "Volume", "Nominal", "Pangsa"]],
        body: byMember.slice(0, 10).map((m) => [m.key, fmtNum(m.volume), fmtIDR(m.nominal), fmtPct(m.share_pct, false)]),
        styles: { fontSize: 8 },
      });
    }
    doc.save("ringkasan-rekap-transaksi.pdf");
  };

  const clickProduct = (p) => setF({ ...f, product: p.key });
  const sortBtn = (col, label) => (
    <button className="inline-flex items-center gap-1 font-medium" data-testid={`sort-${col}`}
      onClick={() => setSort({ by: col, dir: sort.by === col && sort.dir === "desc" ? "asc" : "desc" })}>
      {label}<ArrowUpDown size={10} className={sort.by === col ? "text-[#0284C7]" : "text-slate-300"} />
    </button>
  );

  const mLabel = METRICS[metric];
  const k = summary?.kpis;

  return (
    <div className="space-y-4" data-testid="rekap-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Rekap Transaksi</h1>
          <p className="text-sm text-muted-foreground">Analisis transaksi agregat{summary ? ` · ${summary.period_label}` : ""}. Aturan anti double-counting diterapkan terpusat di backend.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" data-testid="rekap-export-pdf-btn" onClick={exportPdf}><FileDown size={13} className="mr-1" />Export PDF</Button>
          <Button size="sm" data-testid="rekap-export-xlsx-btn" onClick={exportXlsx} className="bg-[#0F172A] hover:bg-slate-800"><Download size={13} className="mr-1" />Export Excel</Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3 space-y-2" data-testid="rekap-filters">
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" data-testid="rekap-filter-start" className="h-8 rounded border px-2 text-xs" value={f.start} min={meta?.period_min} max={meta?.period_max} onChange={(e) => setF({ ...f, start: e.target.value })} />
          <span className="text-xs text-muted-foreground">s.d.</span>
          <input type="month" data-testid="rekap-filter-end" className="h-8 rounded border px-2 text-xs" value={f.end} min={meta?.period_min} max={meta?.period_max} onChange={(e) => setF({ ...f, end: e.target.value })} />
          <select data-testid="rekap-filter-member" className="h-8 rounded border px-2 text-xs max-w-40" value={f.member} onChange={(e) => setF({ ...f, member: e.target.value })}>
            <option value="">Semua Member</option>
            {meta?.members.map((m) => <option key={m.member_code} value={m.member_code}>{m.member_name}</option>)}
          </select>
          <select data-testid="rekap-filter-product" className="h-8 rounded border px-2 text-xs max-w-40" value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })}>
            <option value="">Semua Produk</option>
            {meta?.products.map((p) => <option key={p.product_code} value={p.product_code}>{p.product_name}</option>)}
          </select>
          <div className="inline-flex rounded border overflow-hidden" data-testid="rekap-filter-position">
            {["All", "Issuer", "Acquirer"].map((p) => (
              <button key={p} onClick={() => setF({ ...f, position: p })}
                className={`px-2.5 py-1.5 text-[11px] font-medium ${f.position === p ? "bg-[#0F172A] text-white" : "hover:bg-secondary"}`}>
                {p === "All" ? "Semua" : p}
              </button>
            ))}
          </div>
          <select data-testid="rekap-filter-agg" className="h-8 rounded border px-2 text-xs" value={f.agg_type} onChange={(e) => setF({ ...f, agg_type: e.target.value })}>
            <option value="All">Semua Agregasi</option><option value="Single Side">Single Side</option><option value="Cross">Cross</option>
          </select>
          <select data-testid="rekap-filter-category" className="h-8 rounded border px-2 text-xs" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="All">Semua Kategori</option>
            {meta?.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <FilterChips chips={chips} onRemove={removeChip} onReset={() => { setF(DEF); setPage(1); }} />
      </div>

      {error && <ErrorBox message={error} onRetry={() => setF({ ...f })} />}
      {!summary ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="rekap-kpis">
            <KpiCard title="Member Aktif" value={fmtNum(k.active_members)} sub={summary.period_label} testid="rekap-kpi-members" />
            <KpiCard title="Volume" value={fmtCompactNum(k.volume)} sub={summary.period_label} delta={k.volume_growth_pct} testid="rekap-kpi-volume" accent />
            <KpiCard title="Nominal" value={fmtCompactIDR(k.nominal)} sub={summary.period_label} delta={k.nominal_growth_pct} testid="rekap-kpi-nominal" accent />
            <KpiCard title="Fee / Revenue" value={k.fee == null ? "Dibatasi" : fmtCompactIDR(k.fee)} sub={summary.period_label} delta={k.fee_growth_pct} testid="rekap-kpi-fee" accent />
            <KpiCard title="Nilai Rata-rata" value={fmtIDR(k.avg_value)} sub="per transaksi" testid="rekap-kpi-avg" />
            <KpiCard title="Pertumbuhan Volume" value={fmtPct(k.volume_growth_pct)} sub={`vs ${summary.prev_label}`} testid="rekap-kpi-growth-vol" />
            <KpiCard title="Pertumbuhan Nominal" value={fmtPct(k.nominal_growth_pct)} sub={`vs ${summary.prev_label}`} testid="rekap-kpi-growth-nom" />
            <KpiCard title="Pertumbuhan Revenue" value={k.fee_growth_pct == null ? "—" : fmtPct(k.fee_growth_pct)} sub={`vs ${summary.prev_label}`} testid="rekap-kpi-growth-fee" />
          </div>

          <Card title="Tren Bulanan" testid="rekap-chart-trend"
            actions={
              <div className="inline-flex rounded border overflow-hidden" data-testid="metric-switch">
                {Object.entries(METRICS).map(([key, label]) => (
                  <button key={key} onClick={() => setMetric(key)}
                    className={`px-2.5 py-1 text-[11px] font-medium ${metric === key ? "bg-[#0F172A] text-white" : "hover:bg-secondary"}`}>{label}</button>
                ))}
              </div>
            }>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={series} margin={{ left: 0, right: 8, top: 4 }}>
                <defs><linearGradient id="gTr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0284C7" stopOpacity={0.25} /><stop offset="100%" stopColor="#0284C7" stopOpacity={0.02} />
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="period" tickFormatter={monthShort} tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={metric === "volume" ? fmtCompactNum : fmtCompactIDR} tick={{ fontSize: 10 }} width={metric === "volume" ? 52 : 84} />
                <Tooltip formatter={(v) => [metric === "volume" ? fmtNum(v) : fmtIDR(v), mLabel]} labelFormatter={monthShort} />
                <Area type="monotone" dataKey={metric} name={mLabel} stroke="#0284C7" strokeWidth={2} fill="url(#gTr)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card title="Komposisi per Produk" sub="Klik untuk memfilter" testid="rekap-chart-product">
              {!byProduct?.length ? <Empty /> : (
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={byProduct.slice(0, 8)} dataKey={metric} nameKey="key" innerRadius={45} outerRadius={75} paddingAngle={2}
                      onClick={clickProduct} cursor="pointer">
                      {byProduct.slice(0, 8).map((p, i) => <Cell key={p.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [metric === "volume" ? fmtNum(v) : fmtIDR(v), n]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card title="Issuer vs Acquirer" sub="Distribusi volume (kedua sisi)" testid="rekap-chart-position">
              {!byPosition?.length ? <Empty /> : (
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={byPosition} dataKey="volume" nameKey="key" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {byPosition.map((p, i) => <Cell key={p.key} fill={["#1E3A5F", "#0D9488"][i % 2]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${fmtNum(v)} (${fmtPct(byPosition.find((x) => x.key === n)?.share_pct, false)})`, n]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card title="Top Member" sub={`by ${mLabel} · klik untuk detail`} testid="rekap-chart-member">
              {!byMember?.length ? <Empty /> : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={byMember.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                    <XAxis type="number" tickFormatter={metric === "volume" ? fmtCompactNum : fmtCompactIDR} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="key" tick={{ fontSize: 10 }} width={60} />
                    <Tooltip formatter={(v) => [metric === "volume" ? fmtNum(v) : fmtIDR(v), mLabel]} />
                    <Bar dataKey={metric} fill="#0284C7" radius={[0, 2, 2, 0]} cursor="pointer"
                      onClick={(d) => { window.location.href = `/member/${d.key}`; }} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <Card title="Kontribusi Member terhadap Total" testid="rekap-contribution">
            <div className="space-y-1.5">
              {(byMember || []).slice(0, 10).map((m, i) => (
                <div key={m.key} className="flex items-center gap-2 text-xs">
                  <Link to={`/member/${m.key}`} className="w-28 truncate font-medium hover:text-[#0284C7] hover:underline" data-testid={`contrib-${m.key}`}>{m.key}</Link>
                  <div className="flex-1 h-3.5 rounded bg-secondary overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${m.share_pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  </div>
                  <span className="w-20 text-right tabular-nums text-muted-foreground">{fmtPct(m.share_pct, false)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Tabel Detail Transaksi Agregat" sub="Urutkan dengan klik header · 25 baris per halaman" testid="rekap-table-card">
            {!table ? <Loading /> : table.rows.length === 0 ? <Empty /> : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3">{sortBtn("period", "Periode")}</th>
                      <th className="py-2 pr-3">{sortBtn("member_name", "Member")}</th>
                      <th className="py-2 pr-3">{sortBtn("product_name", "Produk")}</th>
                      <th className="py-2 pr-3">{sortBtn("position", "Posisi")}</th>
                      <th className="py-2 pr-3 font-medium">Agregasi</th>
                      <th className="py-2 pr-3 text-right">{sortBtn("volume", "Volume")}</th>
                      <th className="py-2 pr-3 text-right">{sortBtn("nominal", "Nominal")}</th>
                      <th className="py-2 text-right">{sortBtn("fee", "Fee")}</th>
                    </tr></thead>
                    <tbody>
                      {table.rows.map((r, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-secondary/50">
                          <td className="py-1.5 pr-3 whitespace-nowrap">{monthShort(r.period_ym)}</td>
                          <td className="py-1.5 pr-3"><Link className="font-medium hover:text-[#0284C7] hover:underline" to={`/member/${r.member_code}`}>{r.member_name}</Link></td>
                          <td className="py-1.5 pr-3">{r.product_name}</td>
                          <td className="py-1.5 pr-3">{r.position}</td>
                          <td className="py-1.5 pr-3">{r.aggregation_type}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{fmtNum(r.volume)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{fmtIDR(r.nominal)}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.fee == null ? "—" : fmtIDR(r.fee)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Paginator page={table.page} total={table.total} pageSize={table.page_size} onPage={setPage} />
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
