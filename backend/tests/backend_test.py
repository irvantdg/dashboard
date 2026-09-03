"""Backend regression tests for Member & Transaction Intelligence."""
import io
import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://intel-mitra.preview.emergentagent.com").rstrip("/")

ADMIN = {"email": "ignatiusirvantadung@gmail.com", "password": "AdminMTI2026!"}
ANALYST = {"email": "analyst@mti.internal", "password": "AnalystMTI2026!"}
MANAGEMENT = {"email": "management@mti.internal", "password": "ManagementMTI2026!"}


def _client(creds=None):
    s = requests.Session()
    if creds is not None:
        r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
        assert r.status_code == 200, f"Login gagal ({creds['email']}): {r.status_code} {r.text}"
        # Cookie should be set
        assert "access_token" in s.cookies, "Cookie access_token tidak diset"
    return s


@pytest.fixture(scope="session")
def admin_client():
    return _client(ADMIN)


@pytest.fixture(scope="session")
def analyst_client():
    return _client(ANALYST)


@pytest.fixture(scope="session")
def management_client():
    return _client(MANAGEMENT)


# -------- Auth --------
class TestAuth:
    def test_login_admin(self):
        s = _client(ADMIN)
        r = s.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == ADMIN["email"]
        assert data["role"] == "admin"
        assert "password_hash" not in data

    def test_login_analyst(self):
        s = _client(ANALYST)
        assert s.get(f"{BASE_URL}/api/auth/me").json()["role"] == "analyst"

    def test_login_management(self):
        s = _client(MANAGEMENT)
        assert s.get(f"{BASE_URL}/api/auth/me").json()["role"] == "management"

    def test_login_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN["email"], "password": "salah12345"}, timeout=30)
        assert r.status_code == 401

    def test_unauthenticated_denied(self):
        r = requests.get(f"{BASE_URL}/api/meta/options", timeout=30)
        assert r.status_code == 401

    def test_forgot_password_generic(self):
        r1 = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                           json={"email": ADMIN["email"]}, timeout=30)
        r2 = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                           json={"email": "unknown_xyz@example.com"}, timeout=30)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json() == r2.json(), "Respons forgot-password harus identik"

    def test_public_register_denied(self):
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"name": "X", "email": "x@x.com", "password": "abcd1234", "role": "analyst"},
                          timeout=30)
        assert r.status_code == 401


# -------- Meta / Overview --------
class TestCoreEndpoints:
    def test_meta_options(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/meta/options")
        assert r.status_code == 200
        d = r.json()
        assert len(d["members"]) == 24
        assert len(d["products"]) == 14
        assert d["period_min"] == "2024-01"
        assert d["period_max"] == "2026-06"

    def test_overview(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/overview")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("kpis", "volume_trend", "top_members", "top_products",
                  "growing_members", "declining_members", "status_distribution"):
            assert k in d
        assert d["kpis"]["total_members"] == 24
        assert d["kpis"]["total_products"] == 14
        assert d["kpis"]["volume"] > 0

    def test_matrix(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/matrix")
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["rows"]) == 24
        assert len(d["products"]) == 14
        assert d["summary"]["total_members"] == 24

    def test_matrix_cell_and_member_detail(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/matrix/cell", params={"member": "MB001", "product": "QRIS"})
        assert r.status_code == 200
        assert r.json()["member_code"] == "MB001"

        r = admin_client.get(f"{BASE_URL}/api/members/MB005")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["member"]["member_code"] == "MB005"
        assert "performance" in d and "indicators" in d

    def test_transactions_summary_anti_double_counting(self, admin_client):
        """Position=All volume harus < Issuer + Acquirer karena Cross dihitung sekali."""
        params = {"start": "2025-01", "end": "2025-12"}
        all_ = admin_client.get(f"{BASE_URL}/api/transactions/summary",
                                params={**params, "position": "All"}).json()["kpis"]["volume"]
        iss = admin_client.get(f"{BASE_URL}/api/transactions/summary",
                               params={**params, "position": "Issuer"}).json()["kpis"]["volume"]
        acq = admin_client.get(f"{BASE_URL}/api/transactions/summary",
                               params={**params, "position": "Acquirer"}).json()["kpis"]["volume"]
        assert all_ > 0 and iss > 0 and acq > 0
        assert all_ < iss + acq, f"Aturan anti double-counting gagal: All={all_} Iss+Acq={iss+acq}"

    def test_trx_series_breakdown_table(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/transactions/series")
        assert r.status_code == 200 and len(r.json()["series"]) > 0
        r = admin_client.get(f"{BASE_URL}/api/transactions/breakdown", params={"dimension": "product"})
        assert r.status_code == 200 and len(r.json()["rows"]) > 0
        r = admin_client.get(f"{BASE_URL}/api/transactions/table",
                             params={"page": 1, "page_size": 25, "sort_by": "period"})
        assert r.status_code == 200
        d = r.json()
        assert d["total"] > 0 and len(d["rows"]) <= 25

    def test_export_excel(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/export/matrix.xlsx")
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "")
        assert len(r.content) > 500
        r = admin_client.get(f"{BASE_URL}/api/export/transactions.xlsx")
        assert r.status_code == 200 and len(r.content) > 500


# -------- Insights --------
class TestInsights:
    @pytest.mark.parametrize("mode,extra", [
        ("mom", {"month": "2026-06"}),
        ("yoy", {"month": "2026-06"}),
        ("ytd", {"month": "2026-06"}),
        ("ytd_yoy", {"month": "2026-06"}),
        ("qoq", {"month": "2026-06"}),
        ("rolling", {"month": "2026-06", "window": "3"}),
        ("avg", {"month": "2026-06", "window": "6"}),
    ])
    def test_insights_modes(self, admin_client, mode, extra):
        r = admin_client.get(f"{BASE_URL}/api/insights", params={"mode": mode, **extra})
        assert r.status_code == 200, f"{mode}: {r.text}"
        d = r.json()
        assert d["mode"] == mode
        assert "kpis" in d and "waterfall" in d and "quadrant" in d and "heatmap" in d
        assert "insights" in d

    def test_thresholds_get_and_update(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/config/thresholds")
        assert r.status_code == 200
        d = r.json()
        assert "thresholds" in d and "defaults" in d
        old = d["thresholds"]
        new_val = float(old.get("uat_max_days", 90)) + 1
        r = admin_client.put(f"{BASE_URL}/api/config/thresholds",
                             json={"values": {**old, "uat_max_days": new_val}})
        assert r.status_code == 200
        after = admin_client.get(f"{BASE_URL}/api/config/thresholds").json()["thresholds"]
        assert after["uat_max_days"] == new_val
        # restore
        admin_client.put(f"{BASE_URL}/api/config/thresholds",
                        json={"values": {**old}})

    def test_saved_views_crud(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/saved-views",
                              json={"name": "TEST_view", "params": {"mode": "mom", "month": "2026-06"},
                                    "is_default": False})
        assert r.status_code == 200
        vid = r.json()["id"]
        r = admin_client.get(f"{BASE_URL}/api/saved-views")
        assert r.status_code == 200
        assert any(v["id"] == vid for v in r.json()["views"])
        r = admin_client.put(f"{BASE_URL}/api/saved-views/{vid}/default")
        assert r.status_code == 200
        r = admin_client.delete(f"{BASE_URL}/api/saved-views/{vid}")
        assert r.status_code == 200


# -------- Role restrictions --------
class TestRoleRestrictions:
    def test_analyst_cannot_admin(self, analyst_client):
        assert analyst_client.get(f"{BASE_URL}/api/users").status_code == 403
        assert analyst_client.get(f"{BASE_URL}/api/audit").status_code == 403
        assert analyst_client.get(f"{BASE_URL}/api/imports").status_code == 403
        assert analyst_client.put(f"{BASE_URL}/api/config/thresholds",
                                  json={"values": {}}).status_code == 403

    def test_analyst_can_read(self, analyst_client):
        assert analyst_client.get(f"{BASE_URL}/api/overview").status_code == 200
        assert analyst_client.get(f"{BASE_URL}/api/matrix").status_code == 200

    def test_management_can_access_dashboard(self, management_client):
        assert management_client.get(f"{BASE_URL}/api/overview").status_code == 200
        assert management_client.get(f"{BASE_URL}/api/insights",
                                      params={"mode": "mom", "month": "2026-06"}).status_code == 200


# -------- Import CSV --------
class TestImport:
    def test_member_import_flow(self, admin_client):
        csv_content = (
            "member_code,member_name,alias,member_type,pic,status\n"
            "TEST_M01,Bank Test Satu,BTS1,Bank Umum,Andi,Aktif\n"
            "TEST_M02,Bank Test Dua,BTS2,Bank Umum,Budi,Aktif\n"
            ",Bank Tanpa Kode,BTK,Bank Umum,Citra,Aktif\n"
        ).encode("utf-8")
        files = {"file": ("members.csv", io.BytesIO(csv_content), "text/csv")}
        r = admin_client.post(f"{BASE_URL}/api/imports",
                              params={"import_type": "member"}, files=files)
        assert r.status_code == 200, r.text
        d = r.json()
        batch_id = d["batch_id"]
        mapping = d.get("suggested_mapping", {})
        # Ensure all required fields mapped
        for f in ("member_code", "member_name"):
            assert f in mapping

        r = admin_client.post(f"{BASE_URL}/api/imports/{batch_id}/validate",
                              json={"mapping": mapping})
        assert r.status_code == 200, r.text
        v = r.json()
        assert v["accepted"] == 2, f"Expected 2 accepted, got {v}"
        assert v["rejected"] == 1

        r = admin_client.post(f"{BASE_URL}/api/imports/{batch_id}/commit")
        assert r.status_code == 200, r.text
        assert r.json()["committed_rows"] == 2

        # Verify batch history shows committed
        r = admin_client.get(f"{BASE_URL}/api/imports")
        assert r.status_code == 200
        batches = r.json()["batches"]
        b = next((x for x in batches if x["id"] == batch_id), None)
        assert b and b["status"] == "committed"

    def test_transaction_import_rejects_bad_rows(self, admin_client):
        csv_content = (
            "period,member_code,product_code,position,aggregation_type,volume,nominal,fee\n"
            "2026-07,MB001,QRIS,Issuer,Single Side,100,1000000,5000\n"
            "2026-07,ZZ999,QRIS,Issuer,Single Side,50,500000,2500\n"
            "2026-07,MB001,QRIS,Acquirer,Single Side,-10,500000,2500\n"
        ).encode("utf-8")
        files = {"file": ("trx.csv", io.BytesIO(csv_content), "text/csv")}
        r = admin_client.post(f"{BASE_URL}/api/imports",
                              params={"import_type": "transaction"}, files=files)
        assert r.status_code == 200
        batch_id = r.json()["batch_id"]
        mapping = r.json()["suggested_mapping"]
        r = admin_client.post(f"{BASE_URL}/api/imports/{batch_id}/validate",
                              json={"mapping": mapping})
        assert r.status_code == 200
        v = r.json()
        assert v["accepted"] == 1
        assert v["rejected"] == 2
        # Errors should mention unknown member and negative volume
        msgs = " ".join(e["message"] for e in v["errors"])
        assert "tidak dikenal" in msgs
        assert "negatif" in msgs


# -------- User Management --------
class TestUserManagement:
    def test_create_and_login_new_analyst(self, admin_client):
        email = "test_new_analyst@mti.internal"
        # cleanup previous
        users = admin_client.get(f"{BASE_URL}/api/users").json()["users"]
        for u in users:
            if u["email"] == email:
                admin_client.put(f"{BASE_URL}/api/users/{u['id']}",
                                 json={"status": "Nonaktif"})
        # Create
        r = admin_client.post(f"{BASE_URL}/api/users", json={
            "name": "TEST Analyst Baru", "email": email,
            "password": "TestPass123!", "role": "analyst"})
        # If already exists (409), attempt reset
        if r.status_code == 409:
            uid = next(u["id"] for u in admin_client.get(f"{BASE_URL}/api/users").json()["users"] if u["email"] == email)
            admin_client.put(f"{BASE_URL}/api/users/{uid}",
                             json={"status": "Aktif", "role": "analyst", "password": "TestPass123!"})
        else:
            assert r.status_code == 200, r.text

        # login as new user
        s = requests.Session()
        lr = s.post(f"{BASE_URL}/api/auth/login",
                    json={"email": email, "password": "TestPass123!"}, timeout=30)
        assert lr.status_code == 200, lr.text
        me = s.get(f"{BASE_URL}/api/auth/me").json()
        assert me["role"] == "analyst"


# -------- Audit --------
class TestAudit:
    def test_audit_log_has_entries(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/audit")
        assert r.status_code == 200
        d = r.json()
        assert d["total"] > 0
        actions = {row["action"] for row in d["rows"]}
        # login was recorded by our fixtures
        assert "login" in actions or "commit_import" in actions
