import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import api, { errMsg } from "../api";
import { Card, Empty, Loading } from "../components/common";
import { fmtDateTime, fmtNum } from "../format";
import { Button } from "../components/ui/button";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const TYPES = [
  { id: "member", label: "Master Member" },
  { id: "product", label: "Master Produk" },
  { id: "matrix", label: "Matriks Member-Produk" },
  { id: "transaction", label: "Data Transaksi Agregat" },
];

export default function DataManagement() {
  const [fields, setFields] = useState(null);
  const [history, setHistory] = useState(null);
  const [step, setStep] = useState(0); // 0 pilih, 1 preview+mapping, 2 validasi, 3 hasil
  const [importType, setImportType] = useState("transaction");
  const [batch, setBatch] = useState(null);
  const [mapping, setMapping] = useState({});
  const [validation, setValidation] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const loadHistory = () => api.get("/imports").then((r) => setHistory(r.data.batches)).catch(() => {});
  useEffect(() => { api.get("/imports/fields").then((r) => setFields(r.data)).catch(() => {}); loadHistory(); }, []);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post(`/imports?import_type=${importType}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setBatch(r.data);
      setMapping(r.data.suggested_mapping || {});
      setValidation(null);
      setStep(1);
      loadHistory();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const validate = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/imports/${batch.batch_id}/validate`, { mapping });
      setValidation(r.data);
      setStep(2);
      loadHistory();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const commit = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/imports/${batch.batch_id}/commit`);
      toast.success(r.data.message);
      setStep(3);
      loadHistory();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const requiredMapped = fields?.[importType]?.filter((f) => f.required).every((f) => mapping[f.field]);

  return (
    <div className="space-y-4" data-testid="data-management-page">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Data Management</h1>
        <p className="text-sm text-muted-foreground">Import CSV/Excel melalui proses staging: pilih file → pratinjau → pemetaan kolom → validasi → konfirmasi. Data produksi tidak ditimpa sebelum validasi lolos.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Import Data Baru" testid="import-wizard" className="lg:col-span-2">
          <ol className="mb-4 flex flex-wrap gap-2 text-[11px]" data-testid="wizard-steps">
            {["1. Pilih File", "2. Pratinjau & Pemetaan", "3. Validasi", "4. Hasil"].map((s, i) => (
              <li key={s} className={`rounded-full px-2.5 py-1 font-medium ${i === step ? "bg-[#0F172A] text-white" : i < step ? "bg-emerald-100 text-emerald-800" : "bg-secondary text-muted-foreground"}`}>{s}</li>
            ))}
          </ol>

          {step === 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <button key={t.id} data-testid={`import-type-${t.id}`} onClick={() => setImportType(t.id)}
                    className={`rounded border px-3 py-1.5 text-xs font-medium ${importType === t.id ? "bg-[#0F172A] text-white border-[#0F172A]" : "hover:bg-secondary"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              {fields && (
                <div className="rounded border bg-secondary/50 p-3 text-[11px] text-muted-foreground">
                  Kolom yang diharapkan untuk {TYPES.find((t) => t.id === importType)?.label}:{" "}
                  {fields[importType].map((f) => `${f.label}${f.required ? " *" : ""}`).join(", ")}
                </div>
              )}
              <label data-testid="file-drop" className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 py-10 hover:border-[#0284C7] hover:bg-sky-50/40">
                <Upload size={22} className="text-slate-400" />
                <span className="mt-2 text-xs font-medium text-slate-600">{busy ? "Mengunggah…" : "Klik untuk memilih file CSV atau XLSX (maks 10 MB)"}</span>
                <input ref={fileRef} data-testid="file-input" type="file" accept=".csv,.xlsx,.xlsm" className="hidden"
                  onChange={(e) => upload(e.target.files[0])} />
              </label>
            </div>
          )}

          {step === 1 && batch && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <FileSpreadsheet size={14} className="text-emerald-600" />
                <span className="font-semibold">{batch.file_name}</span>
                <span className="text-muted-foreground">· {fmtNum(batch.total_rows)} baris terdeteksi</span>
              </div>
              <div className="overflow-x-auto rounded border max-h-56 overflow-y-auto" data-testid="preview-table">
                <table className="w-full text-[11px]">
                  <thead className="bg-secondary sticky top-0"><tr>{batch.headers.map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {batch.preview.map((r, i) => (
                      <tr key={i} className="border-t">{batch.headers.map((h) => <td key={h} className="px-2 py-1 whitespace-nowrap">{r[h]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold">Pemetaan Kolom Sumber → Field Aplikasi</div>
                <div className="grid gap-2 md:grid-cols-2" data-testid="mapping-grid">
                  {fields[batch && Object.keys(fields).find((k) => batch && k) && importType].map((f) => (
                    <div key={f.field} className="flex items-center gap-2">
                      <span className="w-40 text-[11px] font-medium">{f.label}{f.required && <span className="text-red-600"> *</span>}</span>
                      <select data-testid={`map-${f.field}`} className="h-7 flex-1 rounded border px-1.5 text-[11px]"
                        value={mapping[f.field] || ""} onChange={(e) => setMapping({ ...mapping, [f.field]: e.target.value })}>
                        <option value="">— tidak dipetakan —</option>
                        {batch.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setStep(0); setBatch(null); }}>Batal</Button>
                <Button size="sm" data-testid="validate-btn" disabled={!requiredMapped || busy} onClick={validate} className="bg-[#0F172A] hover:bg-slate-800">
                  {busy ? "Memvalidasi…" : "Validasi Data"}
                </Button>
              </div>
            </div>
          )}

          {step === 2 && validation && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center" data-testid="accepted-count">
                  <div className="text-2xl font-bold text-emerald-700">{fmtNum(validation.accepted)}</div>
                  <div className="text-[11px] font-medium text-emerald-800">Baris diterima</div>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center" data-testid="rejected-count">
                  <div className="text-2xl font-bold text-red-700">{fmtNum(validation.rejected)}</div>
                  <div className="text-[11px] font-medium text-red-800">Baris ditolak</div>
                </div>
              </div>
              {validation.errors.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded border" data-testid="validation-errors">
                  <table className="w-full text-[11px]">
                    <thead className="bg-secondary sticky top-0"><tr>
                      <th className="px-2 py-1.5 text-left font-medium">Baris</th>
                      <th className="px-2 py-1.5 text-left font-medium">Field</th>
                      <th className="px-2 py-1.5 text-left font-medium">Level</th>
                      <th className="px-2 py-1.5 text-left font-medium">Pesan</th>
                    </tr></thead>
                    <tbody>
                      {validation.errors.map((e, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1">{e.row}</td>
                          <td className="px-2 py-1 font-medium">{e.field}</td>
                          <td className="px-2 py-1">
                            {e.level === "error"
                              ? <span className="inline-flex items-center gap-1 text-red-700"><XCircle size={11} />Error</span>
                              : <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={11} />Peringatan</span>}
                          </td>
                          <td className="px-2 py-1">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep(1)}>Kembali</Button>
                <Button size="sm" data-testid="commit-btn" disabled={validation.accepted === 0 || busy} onClick={commit}
                  className="bg-emerald-700 hover:bg-emerald-800">
                  <CheckCircle2 size={13} className="mr-1" />{busy ? "Memproses…" : `Konfirmasi Import ${fmtNum(validation.accepted)} Baris`}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center py-8 text-center" data-testid="import-success">
              <CheckCircle2 size={36} className="text-emerald-600" />
              <div className="mt-2 text-sm font-semibold">Import berhasil di-commit</div>
              <p className="mt-1 text-xs text-muted-foreground">Data telah masuk ke tabel produksi dan tercatat di audit log.</p>
              <Button size="sm" className="mt-4 bg-[#0F172A] hover:bg-slate-800" data-testid="import-again-btn"
                onClick={() => { setStep(0); setBatch(null); setValidation(null); }}>Import File Lain</Button>
            </div>
          )}
        </Card>

        <Card title="Riwayat Upload" testid="import-history">
          {!history ? <Loading /> : history.length === 0 ? <Empty title="Belum ada upload" /> : (
            <ul className="space-y-2 max-h-[520px] overflow-y-auto">
              {history.map((b) => (
                <li key={b.id} className="rounded border p-2.5 text-[11px]" data-testid={`batch-${b.id}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#0F172A]">{b.file_name}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${{ staged: "bg-slate-100 text-slate-600", validated: "bg-amber-100 text-amber-800", committed: "bg-emerald-100 text-emerald-800" }[b.status]}`}>
                      {{ staged: "Staging", validated: "Tervalidasi", committed: "Committed" }[b.status]}
                    </span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {TYPES.find((t) => t.id === b.import_type)?.label} · {fmtDateTime(b.uploaded_at)} · {b.uploaded_by}
                  </div>
                  <div className="mt-0.5 text-muted-foreground">
                    Diterima {fmtNum(b.accepted_rows)} · Ditolak {fmtNum(b.rejected_rows)} · Total {fmtNum(b.total_rows)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
