import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Grid3X3, BarChart3, Building2, Lightbulb, Database, Users, BookOpen, ScrollText, SlidersHorizontal, LogOut, Bell, RefreshCw } from "lucide-react";
import { useAuth, ROLE_LABELS } from "../auth";
import api, { fetchMeta } from "../api";
import { fmtDateTime } from "../format";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";

const NAV = [
  { to: "/", label: "Overview", Icon: LayoutDashboard, end: true },
  { to: "/matriks", label: "Matriks Mitra", Icon: Grid3X3 },
  { to: "/transaksi", label: "Rekap Transaksi", Icon: BarChart3 },
  { to: "/member", label: "Detail Member", Icon: Building2 },
  { to: "/insights", label: "Management Insights", Icon: Lightbulb },
  { to: "/data", label: "Data Management", Icon: Database, roles: ["admin"] },
  { to: "/users", label: "User Management", Icon: Users, roles: ["admin"] },
  { to: "/definisi", label: "Metric Definitions", Icon: BookOpen },
  { to: "/audit", label: "Audit Log", Icon: ScrollText, roles: ["admin"] },
  { to: "/pengaturan", label: "Pengaturan Threshold", Icon: SlidersHorizontal, roles: ["admin"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [meta, setMeta] = useState(null);
  const [notif, setNotif] = useState(null);
  useEffect(() => { fetchMeta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => {
    api.get("/overview").then((r) => setNotif({
      declining: r.data.declining_members?.length || 0,
      liveNoTrx: r.data.live_no_trx_count || 0,
      decliningList: r.data.declining_members || [],
      liveList: r.data.live_no_trx || [],
    })).catch(() => {});
  }, []);
  const notifCount = (notif?.declining || 0) + (notif?.liveNoTrx || 0);

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-[#0F172A] text-slate-300" data-testid="sidebar">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#0284C7] text-white font-extrabold text-sm">MTI</div>
          <div>
            <div className="text-[13px] font-bold text-white leading-tight">Member & Transaction</div>
            <div className="text-[13px] font-bold text-white leading-tight">Intelligence</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV.filter((n) => !n.roles || n.roles.includes(user.role)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} data-testid={`nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
              className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${isActive ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"}`}>
              <n.Icon size={16} strokeWidth={2} />{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400" data-testid="data-freshness">
            <RefreshCw size={11} />
            <span>Data per {meta?.data_updated_at ? fmtDateTime(meta.data_updated_at) : "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold text-white" data-testid="current-user-name">{user.name}</div>
              <div className="text-[11px] text-slate-400" data-testid="current-user-role">{ROLE_LABELS[user.role]}</div>
            </div>
            <button data-testid="logout-btn" onClick={async () => { await logout(); nav("/login"); }}
              className="rounded-md p-2 text-slate-400 hover:bg-white/10 hover:text-white" title="Keluar">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-12 items-center justify-end gap-3 border-b bg-white/90 px-6 backdrop-blur">
          <Popover>
            <PopoverTrigger asChild>
              <button data-testid="notification-btn" className="relative rounded-md p-2 text-slate-500 hover:bg-secondary">
                <Bell size={17} />
                {notifCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">{notifCount}</span>}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end" data-testid="notification-panel">
              <div className="text-sm font-semibold mb-2">Notifikasi</div>
              {notifCount === 0 && <p className="text-xs text-muted-foreground">Tidak ada notifikasi.</p>}
              {notif?.declining > 0 && (
                <div className="mb-2">
                  <div className="text-xs font-semibold text-red-700">{notif.declining} member dengan volume menurun</div>
                  <div className="text-[11px] text-muted-foreground">{notif.decliningList.map((m) => m.name).join(", ")}</div>
                </div>
              )}
              {notif?.liveNoTrx > 0 && (
                <div>
                  <div className="text-xs font-semibold text-amber-700">{notif.liveNoTrx} kombinasi Live tanpa transaksi</div>
                  <div className="text-[11px] text-muted-foreground">{notif.liveList.slice(0, 4).map((z) => `${z.member_alias} – ${z.product_code}`).join(", ")}{notif.liveNoTrx > 4 ? "…" : ""}</div>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </header>
        <main className="flex-1 p-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
