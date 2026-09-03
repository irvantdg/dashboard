const nf = new Intl.NumberFormat("id-ID");

export const fmtNum = (v) => (v == null ? "—" : nf.format(Math.round(v)));

export function fmtIDR(v) {
  if (v == null) return "—";
  return `Rp${nf.format(Math.round(v))}`;
}

export function fmtCompactIDR(v) {
  if (v == null) return "—";
  const a = Math.abs(v);
  const opt = { maximumFractionDigits: 1 };
  if (a >= 1e12) return `Rp${(v / 1e12).toLocaleString("id-ID", opt)} Triliun`;
  if (a >= 1e9) return `Rp${(v / 1e9).toLocaleString("id-ID", opt)} Miliar`;
  if (a >= 1e6) return `Rp${(v / 1e6).toLocaleString("id-ID", opt)} Juta`;
  if (a >= 1e3) return `Rp${(v / 1e3).toLocaleString("id-ID", opt)} Ribu`;
  return `Rp${nf.format(Math.round(v))}`;
}

export function fmtCompactNum(v) {
  if (v == null) return "—";
  const a = Math.abs(v);
  const opt = { maximumFractionDigits: 1 };
  if (a >= 1e9) return `${(v / 1e9).toLocaleString("id-ID", opt)} M`;
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("id-ID", opt)} Jt`;
  if (a >= 1e3) return `${(v / 1e3).toLocaleString("id-ID", opt)} Rb`;
  return nf.format(Math.round(v));
}

export function fmtPct(v, signed = true) {
  if (v == null) return "Tidak dapat dibandingkan";
  const s = signed && v > 0 ? "+" : "";
  return `${s}${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function monthShort(ym) {
  if (!ym) return "—";
  const [y, m] = ym.split("-");
  return `${BULAN[parseInt(m, 10) - 1]} ${y}`;
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
