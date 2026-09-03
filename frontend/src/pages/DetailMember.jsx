import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api, { fetchMeta } from "../api";
import { Card, CHART_COLORS, Empty, GrowthChip, KpiCard, Loading, SEV_DOT, StatusBadge, useStickyState } from "../components/common";
import { fmtCompactIDR, fmtCompactNum, fmtIDR, fmtNum, fmtDate, fmtDateTime, monthShort } from "../format";
import { Building2 } from "lucide-react";

export default function DetailMember() {
  const { code } = useParams();
  const nav = useNavigate();
  const [meta, setMeta] = useState(null);
  const [f, setF] = useStickyState("flt-member", { start: "", end: "" });
  const [data, setData] = useState(null);
  useEffect(() => { fetchMeta().then(setMeta).catch(() => {}); }, []);

  const params = useMemo(() => {
    const p = {};
    if (f.start) p.start = f.start;
    if (f.end) p.end = f.end;
    return p;
  }, [f]);

  useEffect(() => {
    if (!code) return;
    setData(null);
    api.get(`/members/${code}`, { params }).then((r) => setData(r.data)).catch(() => setData({ error: true }));
  }, [code, params]);

  if (!code) {
    return (
      <div className="space-y-4" data-testid="member-picker">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Detail Member</h1>
          <p className="text-sm text-muted-foreground">Pilih member untuk melihat partisipasi produk dan kinerja transaksi.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(meta?.members || []).map((m) => (
            <button key={m.member_code} data-testid={`pick-${m.member_code}`} onClick={() => nav(`/member/${m.member_code}`)}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left shadow-sm hover:border-[#0284C7] hover:shadow">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#0F172A] text-white"><Building2 size={15} /></div>
              <div>
                <div className="text-xs font-semibold">{m.member_name}</div>
                <div className="text-[10px] text-muted-foreground">{m.member_code} · {m.member_type}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return <Loading label="Memuat detail member…" />;
  if (data.error) return <Empty title="Member tidak ditemukan" detail="Periksa kembali kode member." />;
  const m = data.member;
  const p = data.performance;

  return (
    <div className="space-y-4" data-testid="member-detail-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/member" className="text-[11px] font-medium text-[#0284C7] hover:underline">← Semua Member</Link>
          <h1 className="text-2xl font-bold text-[#0F172A]" data-testid="member-name">{m.member_name}</h1>
          <p className="text-sm text-muted-foreground">
            {m.member_code} · Alias {m.alias} · {m.member_type} · PIC {m.pic || "—"} · Status {m.status}
          </p>
          <p className="text-[11px] text-muted-foreground">Data transaksi terakhir: {fmtDateTime(data.last_data_update)}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card p-2.5" data-testid="member-period-filter">
          <input type="month" data-testid="member-filter-start" className="h-8 rounded border px-2 text-xs" value={f.start} min={meta?.period_min} max={meta?.period_max} onChange={(e) => setF({ ...f, start: e.target.value })} />
          <span className="text-xs text-muted-foreground">s.d.</span>
          <input type="month" data-testid="member-filter-end" className="h-8 rounded border px-2 text-xs" value={f.end} min={meta?.period_min} max={meta?.period_max} onChange={(e) => setF({ ...f, end: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="member-kpis">
        <KpiCard title="Volume" value={fmtCompactNum(p.volume)} sub={p.period_label} delta={p.volume_growth_pct} testid="member-kpi-volume" accent />
        <KpiCard title="Nominal" value={fmtCompactIDR(p.nominal)} sub={p.period_label} delta={p.nominal_growth_pct} testid="member-kpi-nominal" accent />
        <KpiCard title="Fee / Revenue" value={p.fee == null ? "Dibatasi" : fmtCompactIDR(p.fee)} sub={p.period_label} delta={p.fee_growth_pct} testid="member-kpi-fee" accent />
        <KpiCard title="Nilai Rata-rata" value={fmtIDR(p.avg_value)} sub="per transaksi" testid="member-kpi-avg" />
      </div>

      {data.indicators.length > 0 && (
        <Card title="Indikator Peluang & Perhatian" sub="Dihasilkan otomatis oleh sistem berdasarkan aturan — bukan kesimpulan definitif" testid="member-indicators">
          <ul className="space-y-2">
            {data.indicators.map((ind, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded border p-2.5" data-testid={`indicator-${i}`}>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: ind.type === "Peluang" ? "#059669" : "#D97706" }} />
                <div>
                  <div className="text-xs font-semibold">{ind.title}</div>
                  <div className="text-[11px] text-muted-foreground">{ind.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Tren Bulanan" sub={p.period_label} testid="member-chart-trend">
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={p.trend} margin={{ left: 0, right: 8, top: 4 }}>
              <defs><linearGradient id="gM" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0284C7" stopOpacity={0.25} /><stop offset="100%" stopColor="#0284C7" stopOpacity={0.02} />
              </linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="period" tickFormatter={monthShort} tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={fmtCompactNum} tick={{ fontSize: 10 }} width={52} />
              <Tooltip formatter={(v, n) => [n === "volume" ? fmtNum(v) : fmtIDR(v), n === "volume" ? "Volume" : "Nominal"]} labelFormatter={monthShort} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="volume" name="Volume" stroke="#0284C7" strokeWidth={2} fill="url(#gM)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Komposisi Transaksi per Produk" testid="member-chart-composition">
          {p.composition.length === 0 ? <Empty title="Tidak ada transaksi pada periode ini" /> : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={p.composition.slice(0, 8)} dataKey="volume" nameKey="product_code" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {p.composition.slice(0, 8).map((c, i) => <Cell key={c.product_code} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${fmtNum(v)} (${fmtPctOf(p.composition, n)})`, n]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Kontribusi Issuer vs Acquirer" sub={p.period_label} testid="member-position">
          <div className="grid grid-cols-2 gap-3">
            {[["Issuer", p.issuer], ["Acquirer", p.acquirer]].map(([label, v]) => (
              <div key={label} className="rounded-lg border p-3" data-testid={`member-pos-${label.toLowerCase()}`}>
                <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
                <div className="mt-1 text-lg font-bold tabular-nums">{fmtCompactNum(v.volume)}</div>
                <div className="text-[11px] text-muted-foreground">Nominal {fmtCompactIDR(v.nominal)}</div>
                {v.fee != null && <div className="text-[11px] text-muted-foreground">Fee {fmtCompactIDR(v.fee)}</div>}
              </div>
            ))}
          </div>
        </Card>
        <Card title="Perbandingan Periode" sub={`${p.period_label} vs ${p.prev_label}`} testid="member-pop">
          <table className="w-full text-xs">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5 font-medium">Metrik</th><th className="py-1.5 text-right font-medium">Berjalan</th><th className="py-1.5 text-right font-medium">Perubahan</th></tr></thead>
            <tbody>
              <tr className="border-b"><td className="py-1.5">Volume</td><td className="py-1.5 text-right tabular-nums">{fmtNum(p.volume)}</td><td className="py-1.5 text-right"><GrowthChip value={p.volume_growth_pct} /></td></tr>
              <tr className="border-b"><td className="py-1.5">Nominal</td><td className="py-1.5 text-right tabular-nums">{fmtIDR(p.nominal)}</td><td className="py-1.5 text-right"><GrowthChip value={p.nominal_growth_pct} /></td></tr>
              <tr><td className="py-1.5">Fee</td><td className="py-1.5 text-right tabular-nums">{p.fee == null ? "—" : fmtIDR(p.fee)}</td><td className="py-1.5 text-right"><GrowthChip value={p.fee_growth_pct} /></td></tr>
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Partisipasi Produk" sub={`${data.products.length} produk tercatat`} testid="member-products">
        {data.products.length === 0 ? <Empty title="Belum ada produk terdaftar" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Produk</th><th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Posisi</th><th className="py-2 pr-4 font-medium">Tanggal Status</th>
                <th className="py-2 font-medium">Catatan</th>
              </tr></thead>
              <tbody>
                {data.products.map((mp) => (
                  <tr key={mp.product_code} className="border-b last:border-0 hover:bg-secondary/50" data-testid={`member-product-${mp.product_code}`}>
                    <td className="py-2 pr-4 font-medium">{mp.product_name}</td>
                    <td className="py-2 pr-4"><StatusBadge status={mp.status} small /></td>
                    <td className="py-2 pr-4">{mp.position}</td>
                    <td className="py-2 pr-4">{fmtDate(mp.status_date)}</td>
                    <td className="py-2 text-muted-foreground">{mp.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function fmtPctOf(list, key) {
  const item = list.find((x) => x.product_code === key);
  return item ? `${item.share_pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%` : "—";
}
