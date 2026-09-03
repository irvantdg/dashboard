import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api, { fetchMeta } from "../api";
import { Card, CHART_COLORS, Empty, ErrorBox, FilterChips, GrowthChip, KpiCard, Loading, StatusBadge, useStickyState } from "../components/common";
import { fmtCompactIDR, fmtCompactNum, fmtIDR, fmtNum, fmtPct, monthShort } from "../format";

const DEF = { start: "", end: "", member: "", product: "", position: "All", status: "" };

export default function Overview() {
  const [meta, setMeta] = useState(null);
  const [f, setF] = useStickyState("flt-overview", DEF);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { fetchMeta().then(setMeta).catch(() => {}); }, []);

  const params = useMemo(() => {
    const p = {};
    if (f.start) p.start = f.start;
    if (f.end) p.end = f.end;
    if (f.member) p.member = f.member;
    if (f.product) p.product = f.product;
    if (f.position && f.position !== "All") p.position = f.position;
    if (f.status) p.status = f.status;
    return p;
  }, [f]);

  const load = () => {
    setData(null);
    api.get("/overview", { params }).then((r) => { setData(r.data); setError(""); }).catch(() => setError("Gagal memuat ringkasan eksekutif"));
  };
  useEffect(load, [params]);

  if (error) return <ErrorBox message={error} onRetry={load} />;

  const chips = [];
  if (f.start) chips.push({ key: "start", label: `Dari ${monthShort(f.start)}` });
  if (f.end) chips.push({ key: "end", label: `s.d. ${monthShort(f.end)}` });
  if (f.member) chips.push({ key: "member", label: meta?.members.find((m) => m.member_code === f.member)?.member_name || f.member });
  if (f.product) chips.push({ key: "product", label: meta?.products.find((p) => p.product_code === f.product)?.product_name || f.product });
  if (f.position !== "All") chips.push({ key: "position", label: `Posisi ${f.position}` });
  if (f.status) chips.push({ key: "status", label: `Status ${f.status}` });

  return (
    <div className="space-y-4" data-testid="overview-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Overview</h1>
          <p className="text-sm text-muted-foreground">Ringkasan eksekutif Matriks Mitra & Rekap Transaksi{data ? ` · ${data.period_label}` : ""}</p>
        </div>
        <FilterChips chips={chips} onRemove={(k) => setF({ ...f, [k]: k === "position" ? "All" : "" })} onReset={() => setF(DEF)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3" data-testid="overview-filters">
        <input type="month" data-testid="filter-start" className="h-8 rounded border px-2 text-xs" value={f.start} min={meta?.period_min} max={meta?.period_max}
          onChange={(e) => setF({ ...f, start: e.target.value })} />
        <span className="text-xs text-muted-foreground">s.d.</span>
        <input type="month" data-testid="filter-end" className="h-8 rounded border px-2 text-xs" value={f.end} min={meta?.period_min} max={meta?.period_max}
          onChange={(e) => setF({ ...f, end: e.target.value })} />
        <select data-testid="filter-member" className="h-8 rounded border px-2 text-xs max-w-44" value={f.member} onChange={(e) => setF({ ...f, member: e.target.value })}>
          <option value="">Semua Member</option>
          {meta?.members.map((m) => <option key={m.member_code} value={m.member_code}>{m.member_name}</option>)}
        </select>
        <select data-testid="filter-product" className="h-8 rounded border px-2 text-xs max-w-44" value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })}>
          <option value="">Semua Produk</option>
          {meta?.products.map((p) => <option key={p.product_code} value={p.product_code}>{p.product_name}</option>)}
        </select>
        <select data-testid="filter-position" className="h-8 rounded border px-2 text-xs" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })}>
          <option value="All">Semua Posisi</option><option value="Issuer">Issuer</option><option value="Acquirer">Acquirer</option>
        </select>
        <select data-testid="filter-status" className="h-8 rounded border px-2 text-xs" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Semua Status Implementasi</option>
          {meta?.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {!data ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="kpi-grid">
            <KpiCard title="Total Member" value={fmtNum(data.kpis.total_members)} sub="Master data (dinamis)" testid="kpi-total-member" />
            <KpiCard title="Total Produk/Layanan" value={fmtNum(data.kpis.total_products)} sub="Master data" testid="kpi-total-product" />
            <KpiCard title="Member Live" value={fmtNum(data.kpis.members_live)} sub="≥1 produk Live" testid="kpi-member-live" />
            <KpiCard title="Member UAT" value={fmtNum(data.kpis.members_uat)} sub="≥1 produk UAT" testid="kpi-member-uat" />
            <KpiCard title="Volume Transaksi" value={fmtCompactNum(data.kpis.volume)} sub={data.period_label} delta={data.kpis.volume_growth_pct} testid="kpi-volume" accent />
            <KpiCard title="Nominal Transaksi" value={fmtCompactIDR(data.kpis.nominal)} sub={data.period_label} delta={data.kpis.nominal_growth_pct} testid="kpi-nominal" accent />
            <KpiCard title="Fee / Revenue" value={data.kpis.fee == null ? "Dibatasi" : fmtCompactIDR(data.kpis.fee)} sub={data.period_label} delta={data.kpis.fee_growth_pct} testid="kpi-fee" accent />
            <KpiCard title="Member Aktif Bertransaksi" value={fmtNum(data.kpis.active_members)} sub={data.period_label} testid="kpi-active-members" accent />
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2">Perubahan dibanding periode sebelumnya yang setara: {data.prev_label}.</p>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Tren Volume Transaksi Bulanan" testid="chart-volume-trend">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data.volume_trend} margin={{ left: 0, right: 8, top: 4 }}>
                  <defs><linearGradient id="gVol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0284C7" stopOpacity={0.25} /><stop offset="100%" stopColor="#0284C7" stopOpacity={0.02} />
                  </linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="period" tickFormatter={monthShort} tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={fmtCompactNum} tick={{ fontSize: 10 }} width={52} />
                  <Tooltip formatter={(v) => [fmtNum(v), "Volume"]} labelFormatter={monthShort} />
                  <Area type="monotone" dataKey="volume" stroke="#0284C7" strokeWidth={2} fill="url(#gVol)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Tren Nominal & Revenue Bulanan" testid="chart-nominal-trend">
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={data.nominal_fee_trend} margin={{ left: 0, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="period" tickFormatter={monthShort} tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={fmtCompactIDR} tick={{ fontSize: 10 }} width={84} />
                  <Tooltip formatter={(v, n) => [fmtIDR(v), n === "nominal" ? "Nominal" : "Revenue"]} labelFormatter={monthShort} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="nominal" name="Nominal" fill="#1E3A5F" radius={[2, 2, 0, 0]} />
                  {data.kpis.fee != null && <Line type="monotone" dataKey="fee" name="Revenue" stroke="#0D9488" strokeWidth={2} dot={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card title="Distribusi Status Implementasi" sub="Kombinasi member-produk" testid="chart-status-dist">
              {data.status_distribution.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={data.status_distribution} dataKey="count" nameKey="status" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {data.status_distribution.map((s, i) => <Cell key={s.status} fill={{ Live: "#059669", UAT: "#D97706", Development: "#0284C7", Preparation: "#64748B", "On Hold": "#EA580C", "Not Implemented": "#CBD5E1" }[s.status] || CHART_COLORS[i % 10]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [fmtNum(v), n]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card title="Top 5 Member by Volume" testid="chart-top-members">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.top_members} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtCompactNum} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={86} />
                  <Tooltip formatter={(v) => [fmtNum(v), "Volume"]} />
                  <Bar dataKey="volume" fill="#0284C7" radius={[0, 2, 2, 0]} cursor="pointer"
                    onClick={(d) => { window.location.href = `/member/${d.code}`; }} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Top 5 Produk by Volume" testid="chart-top-products">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.top_products} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtCompactNum} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={86} />
                  <Tooltip formatter={(v) => [fmtNum(v), "Volume"]} />
                  <Bar dataKey="volume" fill="#0D9488" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card title="Member Pertumbuhan Tertinggi" sub={`vs ${data.prev_label}`} testid="card-growing">
              {data.growing_members.length === 0 ? <Empty title="Tidak ada member tumbuh" /> : (
                <ul className="space-y-2">
                  {data.growing_members.map((m) => (
                    <li key={m.code} className="flex items-center justify-between text-xs">
                      <Link to={`/member/${m.code}`} className="font-medium text-[#0F172A] hover:text-[#0284C7] hover:underline" data-testid={`growing-${m.code}`}>{m.name}</Link>
                      <span className="flex items-center gap-2"><span className="text-muted-foreground tabular-nums">{fmtCompactNum(m.volume)}</span><GrowthChip value={m.growth_pct} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Member Volume Menurun" sub={`vs ${data.prev_label}`} testid="card-declining">
              {data.declining_members.length === 0 ? <Empty title="Tidak ada member menurun" /> : (
                <ul className="space-y-2">
                  {data.declining_members.map((m) => (
                    <li key={m.code} className="flex items-center justify-between text-xs">
                      <Link to={`/member/${m.code}`} className="font-medium text-[#0F172A] hover:text-[#0284C7] hover:underline" data-testid={`declining-${m.code}`}>{m.name}</Link>
                      <span className="flex items-center gap-2"><span className="text-muted-foreground tabular-nums">{fmtCompactNum(m.volume)}</span><GrowthChip value={m.growth_pct} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Live Tanpa Transaksi" sub={`Periode ${data.period_label}`} testid="card-live-no-trx">
              {data.live_no_trx.length === 0 ? <Empty title="Semua produk Live bertransaksi" /> : (
                <ul className="space-y-2">
                  {data.live_no_trx.slice(0, 6).map((z) => (
                    <li key={`${z.member_code}-${z.product_code}`} className="flex items-center justify-between gap-2 text-xs">
                      <Link to={`/member/${z.member_code}`} className="font-medium text-[#0F172A] hover:text-[#0284C7] hover:underline">{z.member_name}</Link>
                      <span className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">{z.product_name}</span>
                    </li>
                  ))}
                  {data.live_no_trx_count > 6 && <li className="text-[11px] text-muted-foreground">+{data.live_no_trx_count - 6} kombinasi lainnya</li>}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
