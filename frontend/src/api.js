import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const orig = err.config;
    if (err.response?.status === 401 && !orig._retry && !orig.url?.includes("/auth/login") && !orig.url?.includes("/auth/refresh")) {
      orig._retry = true;
      try {
        await api.post("/auth/refresh");
        return api(orig);
      } catch (e) {
        if (!window.location.pathname.startsWith("/login") && !window.location.pathname.includes("password")) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(err);
  }
);

export function errMsg(e) {
  const d = e?.response?.data?.detail;
  if (d == null) return e?.message || "Terjadi kesalahan. Coba lagi.";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ");
  if (d?.msg) return d.msg;
  return String(d);
}

let metaCache = null;
export function fetchMeta() {
  if (!metaCache) metaCache = api.get("/meta/options").then((r) => r.data);
  return metaCache;
}

export default api;
