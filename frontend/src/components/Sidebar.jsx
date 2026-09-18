import React from "react";
import {
  LayoutDashboard,
  Clock,
  CalendarDays,
  FileCheck,
  CalendarClock,
  PlaneTakeoff,
  FileSpreadsheet,
  CreditCard,
  LogOut,
  Search,
  Circle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { UserAvatar } from "./UserAvatar";

export const Sidebar = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const { user, userRole, logout, isSdm, isBaum } = useAuth();
  const isAdminRole =
    isSdm || isBaum || userRole === "sdm" || userRole === "baum";

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(17, 24, 39, 0.4)",
            backdropFilter: "blur(4px)",
            zIndex: 99,
          }}
        />
      )}

      <aside
        className={`sidebar-container ${isMobileOpen ? "mobile-open" : ""}`}
        style={{
          width: isCollapsed ? "80px" : "260px",
          backgroundColor: "#F7F8F6",
          borderRight: "1px solid #E5E7EB",
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                backgroundColor: "#111827",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: "0.85rem",
                flexShrink: 0,
              }}
            >
              HR
            </div>
            {!isCollapsed && (
              <span
                style={{
                  fontWeight: 800,
                  fontSize: "0.95rem",
                  color: "#111827",
                  letterSpacing: "-0.02em",
                }}
              >
                HR Portal UNPAK
              </span>
            )}
          </div>
        </div>

        {/* Navigation List */}
        <nav
          style={{
            flex: 1,
            padding: "16px 12px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          {/* Main Section */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <button
              onClick={() => {
                onSelectTab("dashboard");
                onCloseMobile();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: isCollapsed ? "10px" : "8px 12px",
                justifyContent: isCollapsed ? "center" : "flex-start",
                borderRadius: "8px",
                border: "none",
                backgroundColor:
                  activeTab === "dashboard" ? "#FFFFFF" : "transparent",
                color: activeTab === "dashboard" ? "#111827" : "#6B7280",
                fontWeight: activeTab === "dashboard" ? 700 : 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                boxShadow:
                  activeTab === "dashboard"
                    ? "0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px #E5E7EB"
                    : "none",
              }}
            >
              <LayoutDashboard
                size={18}
                color={activeTab === "dashboard" ? "#10B981" : "#6B7280"}
              />
              {!isCollapsed && <span>Dashboard &amp; Presensi</span>}
            </button>

            <button
              onClick={() => {
                onSelectTab("cuti");
                onCloseMobile();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: isCollapsed ? "10px" : "8px 12px",
                justifyContent: isCollapsed ? "center" : "flex-start",
                borderRadius: "8px",
                border: "none",
                backgroundColor:
                  activeTab === "cuti" ? "#FFFFFF" : "transparent",
                color: activeTab === "cuti" ? "#111827" : "#6B7280",
                fontWeight: activeTab === "cuti" ? 700 : 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                boxShadow:
                  activeTab === "cuti"
                    ? "0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px #E5E7EB"
                    : "none",
              }}
            >
              <CalendarClock
                size={18}
                color={activeTab === "cuti" ? "#10B981" : "#6B7280"}
              />
              {!isCollapsed && <span>Pengajuan Cuti</span>}
            </button>

            <button
              onClick={() => {
                onSelectTab("izin");
                onCloseMobile();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: isCollapsed ? "10px" : "8px 12px",
                justifyContent: isCollapsed ? "center" : "flex-start",
                borderRadius: "8px",
                border: "none",
                backgroundColor:
                  activeTab === "izin" ? "#FFFFFF" : "transparent",
                color: activeTab === "izin" ? "#111827" : "#6B7280",
                fontWeight: activeTab === "izin" ? 700 : 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                boxShadow:
                  activeTab === "izin"
                    ? "0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px #E5E7EB"
                    : "none",
              }}
            >
              <FileCheck
                size={18}
                color={activeTab === "izin" ? "#10B981" : "#6B7280"}
              />
              {!isCollapsed && <span>Pengajuan Izin</span>}
            </button>

            <button
              onClick={() => {
                onSelectTab("sppd");
                onCloseMobile();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: isCollapsed ? "10px" : "8px 12px",
                justifyContent: isCollapsed ? "center" : "flex-start",
                borderRadius: "8px",
                border: "none",
                backgroundColor:
                  activeTab === "sppd" ? "#FFFFFF" : "transparent",
                color: activeTab === "sppd" ? "#111827" : "#6B7280",
                fontWeight: activeTab === "sppd" ? 700 : 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                boxShadow:
                  activeTab === "sppd"
                    ? "0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px #E5E7EB"
                    : "none",
              }}
            >
              <PlaneTakeoff
                size={18}
                color={activeTab === "sppd" ? "#10B981" : "#6B7280"}
              />
              {!isCollapsed && <span>Pengajuan SPPD</span>}
            </button>

            {!isAdminRole &&
            (
              <button
                onClick={() => {
                  onSelectTab("slip-gaji");
                  onCloseMobile();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  width: "100%",
                  padding: isCollapsed ? "10px" : "8px 12px",
                  justifyContent: isCollapsed ? "center" : "flex-start",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor:
                    activeTab === "slip-gaji" ? "#FFFFFF" : "transparent",
                  color: activeTab === "slip-gaji" ? "#111827" : "#6B7280",
                  fontWeight: activeTab === "slip-gaji" ? 700 : 500,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  boxShadow:
                    activeTab === "slip-gaji"
                      ? "0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px #E5E7EB"
                      : "none",
                }}
              >
                <CreditCard
                  size={18}
                  color={activeTab === "slip-gaji" ? "#10B981" : "#6B7280"}
                />
                {!isCollapsed && <span>Slip Gaji Pegawai</span>}
              </button>
            )}
          </div>

          {/* Admin Section (SDM / BAUM Active Role) */}
          {isAdminRole && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "2px" }}
            >
              <button
                onClick={() => {
                  onSelectTab("libur");
                  onCloseMobile();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  width: "100%",
                  padding: isCollapsed ? "10px" : "8px 12px",
                  justifyContent: isCollapsed ? "center" : "flex-start",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor:
                    activeTab === "libur" ? "#FFFFFF" : "transparent",
                  color: activeTab === "libur" ? "#111827" : "#6B7280",
                  fontWeight: activeTab === "libur" ? 700 : 500,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  boxShadow:
                    activeTab === "libur"
                      ? "0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px #E5E7EB"
                      : "none",
                }}
              >
                <CalendarDays
                  size={18}
                  color={activeTab === "libur" ? "#10B981" : "#6B7280"}
                />
                {!isCollapsed && <span>Master Libur</span>}
              </button>

              <button
                onClick={() => {
                  onSelectTab("laporan");
                  onCloseMobile();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  width: "100%",
                  padding: isCollapsed ? "10px" : "8px 12px",
                  justifyContent: isCollapsed ? "center" : "flex-start",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor:
                    activeTab === "laporan" ? "#FFFFFF" : "transparent",
                  color: activeTab === "laporan" ? "#111827" : "#6B7280",
                  fontWeight: activeTab === "laporan" ? 700 : 500,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  boxShadow:
                    activeTab === "laporan"
                      ? "0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px #E5E7EB"
                      : "none",
                }}
              >
                <FileSpreadsheet
                  size={18}
                  color={activeTab === "laporan" ? "#10B981" : "#6B7280"}
                />
                {!isCollapsed && <span>Laporan Presensi</span>}
              </button>
            </div>
          )}
        </nav>

        {/* Footer User Profile Card */}
        <div
          style={{
            padding: "14px 16px",
            borderTop: "1px solid #E5E7EB",
            backgroundColor: "#FFFFFF",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <UserAvatar user={user} size={36} />
            {!isCollapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "0.825rem",
                      color: "#111827",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {user?.name || "ADAM FURQON"}
                  </span>
                  <span
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 800,
                      color: "#059669",
                      background: "#dcfce7",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      border: "1px solid #86efac",
                    }}
                  >
                    {userRole.toUpperCase()}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "#6B7280",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user?.email || "adamilkom00@gmail.com"}
                </div>
              </div>
            )}
            <button
              onClick={logout}
              title="Logout"
              style={{
                background: "none",
                border: "none",
                color: "#6B7280",
                cursor: "pointer",
                padding: "4px",
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
