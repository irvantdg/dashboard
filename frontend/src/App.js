import React from "react";
import "@/App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, Protected } from "./auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import { ForgotPassword, ResetPassword } from "./pages/ForgotReset";
import Overview from "./pages/Overview";
import MatriksMitra from "./pages/MatriksMitra";
import RekapTransaksi from "./pages/RekapTransaksi";
import DetailMember from "./pages/DetailMember";
import ManagementInsights from "./pages/ManagementInsights";
import DataManagement from "./pages/DataManagement";
import UserManagement from "./pages/UserManagement";
import MetricDefinitions from "./pages/MetricDefinitions";
import AuditLog from "./pages/AuditLog";
import Settings from "./pages/Settings";

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<Protected><Layout /></Protected>}>
              <Route index element={<Overview />} />
              <Route path="/matriks" element={<MatriksMitra />} />
              <Route path="/transaksi" element={<RekapTransaksi />} />
              <Route path="/member" element={<DetailMember />} />
              <Route path="/member/:code" element={<DetailMember />} />
              <Route path="/insights" element={<ManagementInsights />} />
              <Route path="/data" element={<Protected roles={["admin"]}><DataManagement /></Protected>} />
              <Route path="/users" element={<Protected roles={["admin"]}><UserManagement /></Protected>} />
              <Route path="/definisi" element={<MetricDefinitions />} />
              <Route path="/audit" element={<Protected roles={["admin"]}><AuditLog /></Protected>} />
              <Route path="/pengaturan" element={<Protected roles={["admin"]}><Settings /></Protected>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
