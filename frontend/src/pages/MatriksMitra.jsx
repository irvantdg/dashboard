import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api, { errMsg } from "../api";
import { Card, Empty, Loading, StatusBadge, StatusLegend, useStickyState } from "../components/common";
import { fmtDate, fmtDateTime } from "../format";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Download, RotateCcw, Search } from "lucide-react";
import { useAuth } from "../auth";

const DEF = { search: "", product: "", status: "", position: "", sort: "name" };

export default function MatriksMitra() {
  const { user } = useAuth();
  const [meta, setMeta] = useState(null);
  const [f, setF] = useStickyState("flt-matrix", DEF);
  const [data, setData] = useState(null);
  const [cell, setCell] = useState(null);
  const [editBusy, setEditBusy] = useState(false);

  useEffect(() => { api.get("/meta/options").then((r) => setMeta(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    setData(null);
    const params = {};
    Object.entries(f).forEach(([k, v]) => { if (v) params[k] = v; });
    api.get("/matrix", { params }).then((r) => setData(r.data)).catch(() => {});
  }, [f]);

  const filterCount = ["search", "product", "status", "position"].filter((k) => f[k]).length;

  const openCell = async (mcode, pcode) => {
    try {
      const r = await api.get("/matrix/cell", { params: { member: mcode, product: pcode } });
      setCell(r.data);
    } catch { toast.error("Detail sel tidak ditemukan"); }
  };

  const saveCell = async (patch) => {
    setEditBusy(true);
    try {
      await api.put("/matrix/cell", { member_code: cell.member_code, product_code: cell.product_code, ...patch });
      toast.success("Sel matriks diperbarui");
      setCell(null);
      setF({ ...f }); // muat ulang
    } catch (e) { toast.error(errMsg(e)); } finally { setEditBusy(false); }
  };

  const exportXlsx = () => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v))).toString();
    window.open(`${process.env.REACT_APP_BACKEND_URL}/api/export/matrix.xlsx?${q}`, "_blank");
  };

  return (
    <div className="space-y-4" data-testid="matrix-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Matriks Mitra</h1>
          <p className="text-sm text-muted-foreground">Status partisipasi & implementasi setiap member untuk setiap produk.</p>
        </div>
        <div className="flex items-center gap-2">
          {filterCount > 0 && <span className="rounded-full bg-[#0F172A] px-2.5 py-1 text-[11px] font-semibold text-white" data-testid="matrix-filter-count">{filterCount} filter aktif</span>}
          <Button variant="outline" size="sm" data-testid="matrix-reset-btn" onClick={() => setF(DEF)}><RotateCcw size={13} className="mr-1" />Reset</Button>
          <Button size="sm" data-testid="matrix-export-btn" onClick={exportXlsx} className="bg-[#0F172A] hover:bg-slate-800"><Download size={13} className="mr-1" />Export Excel</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3" data-testid="matrix-filters">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-2 text-slate-400" />
          <input data-testid="matrix-search" placeholder="Cari member…" value={f.search}
            onChange={(e) => setF({ ...f, search: e.target.value })}
            className="h-8 w-48 rounded border pl-7 pr-2 text-xs" />
        </div>
        <select data-testid="matrix-filter-product" className="h-8 rounded border px-2 text-xs" value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })}>
          <option value="">Semua Produk</option>
          {meta?.products.map((p) => <option key={p.product_code} value={p.product_code}>{p.product_name}</option>)}
        </select>
        <select data-testid="matrix-filter-status" className="h-8 rounded border px-2 text-xs" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Semua Status</option>
          {meta?.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select data-testid="matrix-filter-position" className="h-8 rounded border px-2 text-xs" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })}>
          <option value="">Semua Posisi</option>
          <option value="Issuer">Issuer</option><option value="Acquirer">Acquirer</option><option value="Issuer & Acquirer">Issuer & Acquirer</option>
        </select>
        <select data-testid="matrix-sort" className="h-8 rounded border px-2 text-xs" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}>
          <option value="name">Urut: Nama Member</option>
          <option value="live_desc">Urut: Produk Live Terbanyak</option>
        </select>
      </div>

      {!data ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6" data-testid="matrix-summary">
            {[["Total Member", data.summary.total_members, "sum-members"], ["Total Produk", data.summary.total_products, "sum-products"],
              ["Kombinasi Live", data.summary.live_combos, "sum-live"], ["Kombinasi UAT", data.summary.uat_combos, "sum-uat"],
              ["Member sebagai Issuer", data.summary.issuer_members, "sum-issuer"], ["Member sebagai Acquirer", data.summary.acquirer_members, "sum-acquirer"]].map(([t, v, id]) => (
              <div key={id} data-testid={id} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t}</div>
                <div className="mt-1 text-lg font-bold tabular-nums">{v}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Legenda status:</span>
          </div>
          <div className="-mt-2"><StatusLegend /></div>

          {/* Tampilan matriks (desktop) */}
          <div className="hidden md:block rounded-lg border bg-card shadow-sm" data-testid="matrix-table-wrap">
            <div className="matrix-scroll overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="border-collapse text-xs">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="sticky left-0 z-20 bg-[#0F172A] px-3 py-2.5 text-left font-semibold text-white min-w-44">Member</th>
                    {data.products.map((p) => (
                      <th key={p.product_code} className="bg-[#0F172A] px-2 py-2.5 text-center font-semibold text-white min-w-32" title={p.product_name}>
                        <div className="truncate max-w-32">{p.product_name}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.member.member_code} className="border-t hover:bg-slate-50">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2">
                        <Link to={`/member/${r.member.member_code}`} data-testid={`matrix-member-${r.member.member_code}`}
                          className="font-semibold text-[#0F172A] hover:text-[#0284C7] hover:underline">
                          {r.member.member_name}
                        </Link>
                        <div className="text-[10px] text-muted-foreground">{r.member.member_code} · {r.member.member_type}</div>
                      </td>
                      {data.products.map((p) => {
                        const c = r.cells[p.product_code];
                        return (
                          <td key={p.product_code} className="px-1.5 py-1.5 text-center">
                            {c ? (
                              <button data-testid={`cell-${r.member.member_code}-${p.product_code}`} onClick={() => openCell(r.member.member_code, p.product_code)}
                                className="w-full rounded transition-transform hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-[#0284C7]">
                                <StatusBadge status={c.status} small />
                                <div className="mt-0.5 text-[9px] text-muted-foreground">{c.position}</div>
                              </button>
                            ) : <span className="text-[10px] text-slate-300">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.rows.length === 0 && <Empty title="Tidak ada member cocok filter" />}
            </div>
          </div>

          {/* Tampilan daftar (mobile) */}
          <div className="md:hidden space-y-2" data-testid="matrix-list-view">
            {data.rows.map((r) => (
              <div key={r.member.member_code} className="rounded-lg border bg-card p-3 shadow-sm">
                <Link to={`/member/${r.member.member_code}`} className="text-sm font-semibold text-[#0F172A]">{r.member.member_name}</Link>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(r.cells).map(([pc, c]) => (
                    <button key={pc} onClick={() => openCell(r.member.member_code, pc)} className="flex flex-col items-start rounded border px-1.5 py-1">
                      <span className="text-[9px] font-semibold text-slate-500">{pc}</span>
                      <StatusBadge status={c.status} small />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={!!cell} onOpenChange={() => setCell(null)}>
        <DialogContent data-testid="cell-detail-dialog">
          <DialogHeader>
            <DialogTitle>{cell?.member_name} — {cell?.product_name}</DialogTitle>
          </DialogHeader>
          {cell && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Status"><StatusBadge status={cell.status} small /></Field>
                <Field label="Posisi">{cell.position}</Field>
                <Field label="Tanggal Status">{fmtDate(cell.status_date)}</Field>
                <Field label="PIC">{cell.pic || "—"}</Field>
                <Field label="Terakhir Diperbarui">{fmtDateTime(cell.updated_at)}</Field>
                <Field label="Diperbarui Oleh">{cell.updated_by || "—"}</Field>
              </div>
              <Field label="Catatan">{cell.notes || "—"}</Field>
              {user.role === "admin" && (
                <div className="border-t pt-3 space-y-2">
                  <div className="text-xs font-semibold">Ubah Status (Admin)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {meta?.statuses.map((s) => (
                      <button key={s} data-testid={`cell-set-${s.replace(/\s/g, "-")}`} disabled={editBusy}
                        onClick={() => saveCell({ status: s })}
                        className={`rounded border px-2 py-1 text-[11px] font-medium hover:bg-secondary ${s === cell.status ? "bg-[#0F172A] text-white" : ""}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="border-t pt-2">
                <Link to={`/member/${cell.member_code}`} className="text-xs font-semibold text-[#0284C7] hover:underline" data-testid="cell-open-member">
                  Buka Detail Member →
                </Link>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium text-[#0F172A]">{children}</div>
    </div>
  );
}
