import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { errMsg } from "../api";
import { Card, Loading } from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

const FIELDS = [
  ["growth_significant_pct", "Pertumbuhan signifikan (%)", "Insight pertumbuhan dibuat bila perubahan ≥ nilai ini"],
  ["decline_significant_pct", "Penurunan signifikan (%)", "Insight penurunan dibuat bila perubahan ≤ nilai ini (negatif)"],
  ["min_volume_insight", "Volume minimum untuk insight", "Member/produk di bawah volume ini diabaikan"],
  ["max_months_no_trx", "Maks. periode tanpa transaksi (bulan)", "Batas periode tanpa transaksi sebelum ditandai"],
  ["revenue_concentration_pct", "Ambang konsentrasi revenue (%)", "Pangsa revenue/kontribusi top-3 member"],
  ["product_concentration_pct", "Ambang konsentrasi produk (%)", "Pangsa produk terbesar dalam satu member"],
  ["uat_max_days", "Durasi maksimum UAT (hari)", "Status UAT melebihi ini akan ditandai"],
  ["material_change_pct", "Ambang perubahan material (%)", "Perubahan di bawah ini dianggap tidak material"],
];

export default function Settings() {
  const [vals, setVals] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/config/thresholds").then((r) => setVals(r.data.thresholds)).catch(() => {}); }, []);
  if (!vals) return <Loading />;
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put("/config/thresholds", { values: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, parseFloat(v)])) });
      setVals(r.data.thresholds);
      toast.success("Threshold disimpan");
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4" data-testid="settings-page">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Pengaturan Threshold</h1>
        <p className="text-sm text-muted-foreground">Ambang aturan insight tersimpan di database dan berlaku untuk seluruh perhitungan. Hanya Administrator.</p>
      </div>
      <Card testid="thresholds-card">
        <div className="grid gap-4 md:grid-cols-2">
          {FIELDS.map(([k, label, hint]) => (
            <div key={k}>
              <Label htmlFor={`th-${k}`}>{label}</Label>
              <Input id={`th-${k}`} data-testid={`threshold-${k}`} type="number" step="any" className="mt-1"
                value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
              <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
            </div>
          ))}
        </div>
        <div className="mt-5">
          <Button data-testid="save-thresholds-btn" onClick={save} disabled={busy} className="bg-[#0F172A] hover:bg-slate-800">
            {busy ? "Menyimpan…" : "Simpan Threshold"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
