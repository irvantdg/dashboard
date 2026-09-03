import React, { useEffect, useState } from "react";
import api from "../api";
import { Card, Loading } from "../components/common";

const SECTIONS = [
  {
    title: "Volume Transaksi",
    body: "Jumlah transaksi agregat pada periode terpilih. Bukan jumlah uang. Volume dihitung setelah aturan anti-double-counting diterapkan (lihat bagian Aturan Agregasi).",
  },
  {
    title: "Nominal Transaksi",
    body: "Total nilai uang (Rupiah) dari transaksi agregat pada periode terpilih. Ditampilkan ringkas pada kartu (mis. Rp1,2 Miliar) dan nilai penuh pada tooltip serta tabel detail.",
  },
  {
    title: "Fee / Revenue",
    body: "Pendapatan fee dari transaksi agregat. Akses ke metrik ini dapat dibatasi per pengguna melalui konfigurasi hak akses oleh Administrator.",
  },
  {
    title: "Nilai Rata-rata Transaksi",
    body: "Nominal dibagi Volume pada periode yang sama. Jika volume = 0, nilai rata-rata ditampilkan sebagai 0 dan perbandingan ditandai tidak dapat dibandingkan.",
  },
  {
    title: "Member Aktif",
    body: "Jumlah member unik yang memiliki volume transaksi > 0 pada periode terpilih. Berbeda dengan Total Member yang menghitung seluruh member terdaftar pada master data (dihitung dinamis, tidak pernah hard-code).",
  },
  {
    title: "Pertumbuhan (Growth)",
    body: "(Nilai periode berjalan − nilai periode pembanding) / |nilai pembanding| × 100%. Periode pembanding default adalah periode sebelumnya dengan panjang yang sama. Jika nilai pembanding 0 atau tidak tersedia, sistem menampilkan 'Tidak dapat dibandingkan' — bukan persentase tak terhingga.",
  },
  {
    title: "Aturan Agregasi (Anti Double-Counting)",
    body: "Posisi = Issuer: hanya record issuer. Posisi = Acquirer: hanya record acquirer. Posisi = All: untuk transaksi Single Side digunakan record sisi Issuer; untuk transaksi Cross dihitung satu kali memakai record sisi Issuer (dapat dikonfigurasi pada lapisan metrik backend, bukan di tiap grafik). Seluruh grafik dan KPI menggunakan lapisan metrik terpusat yang sama.",
  },
  {
    title: "Mode Perbandingan Periode",
    body: "MoM: bulan terpilih vs bulan sebelumnya. YoY: bulan terpilih vs bulan yang sama tahun lalu. YTD: Januari s.d. bulan terpilih. YTD vs YTD Tahun Lalu: bulan Januari–bulan terpilih vs rentang bulan yang sama tahun lalu (jumlah bulan identik). QoQ: kuartal terpilih vs kuartal sebelumnya. QoQ YoY: kuartal terpilih vs kuartal yang sama tahun lalu. Kustom: dua rentang bebas (Periode A dan B). Rolling: 3/6/12 bulan terakhir vs periode setara sebelumnya. Bulan vs Rata-rata: bulan terpilih vs rata-rata 3/6/12 bulan sebelumnya.",
  },
  {
    title: "Kontribusi & Driver",
    body: "Kontribusi perubahan per member/produk dihitung sebagai selisih nilai periode A dan B per dimensi. Jumlah seluruh kontribusi selalu sama dengan total perubahan (terekonsiliasi). Persentase kontribusi = selisih dimensi / total perubahan × 100%.",
  },
  {
    title: "Kuadran Pertumbuhan vs Kontribusi",
    body: "Pertumbuhan tinggi = perubahan ≥ ambang perubahan material. Kontribusi tinggi = pangsa ≥ pangsa rata-rata member. Kombinasi keduanya menghasilkan kategori: Pertumbuhan Strategis, Lindungi & Pantau, Peluang Baru, Prioritas Tinjauan. Kategori ini adalah label analitis, bukan keputusan bisnis otomatis.",
  },
  {
    title: "Insight Otomatis",
    body: "Kartu insight dihasilkan oleh aturan deterministik dengan ambang yang dapat dikonfigurasi Administrator. Insight menunjukkan korelasi pada data agregat — bukan klaim kausalitas dan bukan rekomendasi final. Setiap kartu mencantumkan aturan pembangkitnya.",
  },
];

export default function MetricDefinitions() {
  const [cfg, setCfg] = useState(null);
  const [rule, setRule] = useState(null);
  useEffect(() => {
    api.get("/config/thresholds").then((r) => setCfg(r.data.thresholds)).catch(() => {});
    api.get("/meta/options").then((r) => setRule(r.data.agg_rule)).catch(() => {});
  }, []);
  if (!cfg) return <Loading />;
  const LABELS = {
    growth_significant_pct: "Pertumbuhan signifikan (%)",
    decline_significant_pct: "Penurunan signifikan (%)",
    min_volume_insight: "Volume minimum untuk insight",
    max_months_no_trx: "Maks. periode tanpa transaksi (bulan)",
    revenue_concentration_pct: "Ambang konsentrasi revenue (%)",
    product_concentration_pct: "Ambang konsentrasi produk (%)",
    uat_max_days: "Durasi maksimum status UAT (hari)",
    material_change_pct: "Ambang perubahan material (%)",
  };
  return (
    <div className="space-y-4" data-testid="definitions-page">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Metric Definitions</h1>
        <p className="text-sm text-muted-foreground">Definisi resmi seluruh metrik, aturan agregasi, dan ambang insight yang digunakan aplikasi.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {SECTIONS.map((s) => (
          <Card key={s.title} title={s.title} testid={`def-${s.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
            <p className="text-xs leading-relaxed text-slate-600">{s.body}</p>
          </Card>
        ))}
        <Card title="Ambang Insight Aktif" sub="Dapat diubah Administrator pada halaman Pengaturan Threshold" testid="def-thresholds">
          <table className="w-full text-xs">
            <tbody>
              {Object.entries(LABELS).map(([k, label]) => (
                <tr key={k} className="border-b last:border-0">
                  <td className="py-1.5 text-slate-600">{label}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{cfg[k]?.toLocaleString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rule && <p className="mt-3 text-[11px] text-muted-foreground">{rule.deskripsi}</p>}
        </Card>
      </div>
    </div>
  );
}
