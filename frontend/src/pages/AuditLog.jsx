import React, { useEffect, useState } from "react";
import api from "../api";
import { Card, Loading, ErrorBox, Paginator } from "../components/common";
import { fmtDateTime } from "../format";

export default function AuditLog() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const load = () => api.get("/audit", { params: { page, page_size: 50 } }).then((r) => { setData(r.data); setError(""); }).catch((e) => setError("Gagal memuat audit log"));
  useEffect(() => { setData(null); load(); }, [page]);
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-4" data-testid="audit-page">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Jejak aktivitas pengguna pada data dan konfigurasi.</p>
      </div>
      <Card testid="audit-table-card">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Waktu</th><th className="py-2 pr-4 font-medium">Pengguna</th>
              <th className="py-2 pr-4 font-medium">Aksi</th><th className="py-2 pr-4 font-medium">Entitas</th>
              <th className="py-2 font-medium">Detail</th>
            </tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-secondary/50" data-testid={`audit-row-${r.id}`}>
                  <td className="py-2 pr-4 whitespace-nowrap">{fmtDateTime(r.timestamp)}</td>
                  <td className="py-2 pr-4">{r.user_name} <span className="text-muted-foreground">({r.user_email})</span></td>
                  <td className="py-2 pr-4 font-medium">{r.action}</td>
                  <td className="py-2 pr-4">{r.entity_type}</td>
                  <td className="py-2 text-muted-foreground max-w-md truncate">
                    {r.new_value ? JSON.stringify(r.new_value) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginator page={data.page} total={data.total} pageSize={data.page_size} onPage={setPage} />
      </Card>
    </div>
  );
}
