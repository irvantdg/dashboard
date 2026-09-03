# PRD — Member & Transaction Intelligence (MTI)

## Problem Statement (ringkasan)
Aplikasi web internal perusahaan payment switching untuk (1) memonitor status implementasi produk/layanan di member bank (Matriks Mitra) dan (2) menganalisis kinerja transaksi agregat (Rekap Transaksi), ditambah halaman Management Insights (perbandingan periode + insight berbasis aturan). Interface Bahasa Indonesia, format angka Indonesia, RBAC (Administrator/Business Analyst/Management), audit log, import CSV/Excel dengan staging, export Excel/PDF, tanpa embed BI pihak ketiga, tanpa data nasabah sensitif.

## Arsitektur
- **Backend**: FastAPI (port 8001, prefix /api) — `server.py`, `auth.py` (JWT httpOnly cookie + Bearer, bcrypt, brute-force lockout, reset password), `metrics.py` (lapisan metrik terpusat: aturan anti double-counting + semua mode perbandingan periode), `insights_engine.py` (aturan insight + driver analysis), `routes_core.py`, `routes_insights.py`, `routes_admin.py`, `demo_data.py` (seed deterministik).
- **Frontend**: React 19 + Tailwind + shadcn/ui + Recharts; halaman di `/app/frontend/src/pages/`; filter persist via sessionStorage.
- **DB**: MongoDB — users, members, products, member_products, transactions (period sebagai date), import_batches, import_staging, audit_logs, config (threshold), saved_views.
- **Kredensial**: /app/memory/test_credentials.md (admin: ignatiusirvantadung@gmail.com).

## User Personas
- Administrator: kelola user/role/akses fee, master data, import, threshold, audit.
- Business Analyst: dashboard, filter, drill-down, export, fee visible.
- Management: ringkasan eksekutif, insights, export.

## Terimplementasi (2026-09-03)
- Auth JWT lengkap (login/logout/me/refresh/forgot/reset; register admin-only; lockout 5x/15 mnt; token_version invalidasi).
- Overview: 8 KPI + growth, tren volume, tren nominal+revenue, distribusi status, top-5 member/produk, growing/declining, Live tanpa transaksi, filter global + chips.
- Matriks Mitra: 24×14 sticky matrix, badge status berlabel, 6 summary card, search/filter/sort, dialog detail sel + edit (admin), legenda, export xlsx, list view mobile.
- Rekap Transaksi: 8 KPI, switch metrik, tren, komposisi produk (klik=filter), issuer vs acquirer, top member (klik=detail), kontribusi, tabel sortable+paginasi, export xlsx + PDF.
- Detail Member: header, KPI, tren, komposisi, issuer/acquirer, PoP, partisipasi produk, indikator otomatis.
- Management Insights: 10 mode perbandingan (MoM/YoY/YTD/YTD-vs-YTD/QoQ/QoQ-YoY/kustom/rolling 3-6-12/bulan-vs-rata-rata/benchmark member&produk), KPI A/B/Δ/%, penanganan pembanding nol ("Tidak dapat dibandingkan"), kartu insight berbasis aturan dengan severity + transparansi aturan, waterfall terekonsiliasi, dual-trend, kuadran, heatmap, driver per member/produk/posisi/domestik-lintas negara, saved views + default, export PDF.
- Data Management: wizard 4 langkah (pilih file → pratinjau → pemetaan kolom → validasi → commit) untuk 4 tipe import, validasi lengkap, staging, riwayat upload.
- User Management, Metric Definitions (definisi + ambang aktif), Audit Log, Pengaturan Threshold (admin, tersimpan di DB).
- Demo data: 24 member fiktif, 14 produk, 30 bulan, campuran posisi/agregasi, member tumbuh & menurun, produk Live tanpa transaksi.
- Testing: 30/30 backend pytest pass + seluruh flow frontend pass (test_reports/iteration_1.json).

## Backlog Prioritas
- P1: Notifikasi terjadwal (digest insight berkala), template unduhan CSV per tipe import.
- P2: Undo/rollback batch import, kustomisasi aturan agregasi via UI, multi-select member/produk pada filter.
- P3: Ekspor PNG grafik, komentar/anotasi pada insight.

## Catatan
- Anti double-counting diisolasi di `metrics.py::AGGREGATION_RULE`.
- Akses fee/revenue per-user (`permissions.view_fee`) — backend menyembunyikan nilai fee bila dibatasi.
