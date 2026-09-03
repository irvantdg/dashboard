import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { errMsg } from "../api";
import { Card, Empty, Loading } from "../components/common";
import { fmtDateTime } from "../format";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Plus, Pencil } from "lucide-react";
import { ROLE_LABELS } from "../auth";

const EMPTY_FORM = { id: null, name: "", email: "", password: "", role: "analyst", status: "Aktif", view_fee: true };

export default function UserManagement() {
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/users").then((r) => setUsers(r.data.users)).catch(() => {});
  useEffect(load, []);

  const save = async () => {
    setBusy(true);
    try {
      if (form.id) {
        const payload = { name: form.name, role: form.role, status: form.status, view_fee: form.view_fee };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${form.id}`, payload);
        toast.success("Pengguna diperbarui");
      } else {
        await api.post("/users", { name: form.name, email: form.email, password: form.password, role: form.role });
        toast.success("Pengguna dibuat");
      }
      setForm(null); load();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  if (!users) return <Loading />;
  return (
    <div className="space-y-4" data-testid="users-page">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">User Management</h1>
          <p className="text-sm text-muted-foreground">Kelola akun, peran, dan akses informasi fee/revenue.</p>
        </div>
        <Button data-testid="add-user-btn" size="sm" className="bg-[#0F172A] hover:bg-slate-800"
          onClick={() => setForm({ ...EMPTY_FORM })}><Plus size={13} className="mr-1" />Tambah Pengguna</Button>
      </div>
      <Card testid="users-table-card">
        {users.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Nama</th><th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Peran</th><th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Akses Fee</th><th className="py-2 pr-4 font-medium">Login Terakhir</th>
                <th className="py-2 font-medium">Aksi</th>
              </tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-secondary/50" data-testid={`user-row-${u.email}`}>
                    <td className="py-2 pr-4 font-medium">{u.name}</td>
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2 pr-4"><span className="rounded bg-secondary px-1.5 py-0.5 font-medium">{ROLE_LABELS[u.role] || u.role}</span></td>
                    <td className="py-2 pr-4">{u.status}</td>
                    <td className="py-2 pr-4">{u.permissions?.view_fee !== false ? "Ya" : "Tidak"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{fmtDateTime(u.last_login)}</td>
                    <td className="py-2">
                      <Button variant="ghost" size="sm" data-testid={`edit-user-${u.email}`}
                        onClick={() => setForm({ id: u.id, name: u.name, email: u.email, password: "", role: u.role, status: u.status, view_fee: u.permissions?.view_fee !== false })}>
                        <Pencil size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={!!form} onOpenChange={() => setForm(null)}>
        <DialogContent data-testid="user-form-dialog">
          <DialogHeader><DialogTitle>{form?.id ? "Ubah Pengguna" : "Tambah Pengguna"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div><Label>Nama</Label><Input data-testid="user-form-name" className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              {!form.id && <div><Label>Email</Label><Input data-testid="user-form-email" type="email" className="mt-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>}
              <div>
                <Label>{form.id ? "Kata Sandi Baru (opsional)" : "Kata Sandi"}</Label>
                <Input data-testid="user-form-password" type="password" className="mt-1" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Minimal 8 karakter" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Peran</Label>
                  <select data-testid="user-form-role" className="mt-1 h-9 w-full rounded border px-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="admin">Administrator</option><option value="analyst">Business Analyst</option><option value="management">Management</option>
                  </select>
                </div>
                {form.id && (
                  <div>
                    <Label>Status</Label>
                    <select data-testid="user-form-status" className="mt-1 h-9 w-full rounded border px-2 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="Aktif">Aktif</option><option value="Nonaktif">Nonaktif</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between rounded border p-2.5">
                <div>
                  <div className="text-xs font-semibold">Akses Fee / Revenue</div>
                  <div className="text-[11px] text-muted-foreground">Bila dimatikan, angka fee disembunyikan untuk pengguna ini.</div>
                </div>
                <Switch data-testid="user-form-view-fee" checked={form.view_fee} onCheckedChange={(v) => setForm({ ...form, view_fee: v })} />
              </div>
              <Button data-testid="user-form-save-btn" onClick={save} disabled={busy || !form.name || (!form.id && (!form.email || !form.password))}
                className="w-full bg-[#0F172A] hover:bg-slate-800">{busy ? "Menyimpan…" : "Simpan"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
