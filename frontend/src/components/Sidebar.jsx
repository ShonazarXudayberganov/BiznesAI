import React from 'react';
import { GlobalAI } from '../utils';

export default function Sidebar({
  sidebarOpen, setSidebarOpen,
  orgContext, activeDepartmentId, setActiveDepartmentId,
  workspaceOpen, setWorkspaceOpen,
  connCount, sources,
  setCmdOpen, page, setPage,
  unreadAlerts, isCeoOrAbove, user,
  setSuperAdminMode, aiConfig, prov
}) {
  return (
    <div className={`sidebar ${sidebarOpen ? "" : "sidebar-closed"}`}>
      {/* Brand */}
      <div className="logo-wrap">
        <div className="logo-main">ANA<span>LIX</span></div>
        <div className="logo-sub">Strategik Agent</div>
        <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>✕</button>
      </div>

      {/* Workspace selector */}
      {orgContext?.organization && (() => {
        const activeDept = orgContext.departments?.find(d => d.id === activeDepartmentId);
        const displayName = activeDept ? activeDept.name : orgContext.organization.name;
        const displayIcon = activeDept?.icon || orgContext.organization.name?.charAt(0).toUpperCase() || "?";
        const totalRows = sources.reduce((a, s) => a + (s.data?.length || 0), 0);
        return (
          <div
            onClick={() => setWorkspaceOpen(v => !v)}
            style={{
              margin: "10px 10px 8px", padding: "10px 12px",
              borderRadius: 12,
              background: "linear-gradient(135deg, var(--gold-glow), var(--s2))",
              border: "1px solid var(--border)",
              display: "flex", alignItems: "center", gap: 10,
              cursor: "pointer", transition: "all .18s var(--ease)",
              position: "relative",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-hi)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "linear-gradient(135deg, var(--gold), var(--accent2))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--fh)", fontSize: 13, fontWeight: 800,
              color: "#fff", flexShrink: 0,
              boxShadow: "var(--shadow-sm)",
            }}>{displayIcon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--fh)", fontSize: 12.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: -0.1 }}>
                {displayName}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1, fontFamily: "var(--fm)" }}>
                {connCount} manba · {totalRows.toLocaleString()} qator
              </div>
            </div>
            <span style={{ color: "var(--muted)", fontSize: 10 }}>▾</span>

            {workspaceOpen && (
              <div onClick={e => e.stopPropagation()}
                style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 100, background: "var(--s1)", border: "1px solid var(--border-hi)", borderRadius: 12, padding: 6, boxShadow: "var(--shadow-lg)" }}>
                <button onClick={() => { setActiveDepartmentId(null); setWorkspaceOpen(false); }}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", background: activeDepartmentId === null ? "var(--gold-glow)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: activeDepartmentId === null ? "var(--gold)" : "var(--text)", fontWeight: activeDepartmentId === null ? 700 : 500, fontFamily: "var(--fh)", textAlign: "left", marginBottom: 2 }}>
                  <span>🏢</span>
                  <span style={{ flex: 1 }}>Umumiy (barchasi)</span>
                  {activeDepartmentId === null && <span style={{ color: "var(--gold)" }}>✓</span>}
                </button>
                {(orgContext.departments || []).filter(d => d.name !== "Umumiy").map(d => (
                  <button key={d.id} onClick={() => { setActiveDepartmentId(d.id); setWorkspaceOpen(false); }}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", background: activeDepartmentId === d.id ? "var(--gold-glow)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: activeDepartmentId === d.id ? "var(--gold)" : "var(--text)", fontWeight: activeDepartmentId === d.id ? 700 : 500, fontFamily: "var(--fh)", textAlign: "left", marginBottom: 2 }}>
                    <span>{d.icon || "📁"}</span>
                    <span style={{ flex: 1 }}>{d.name}</span>
                    {activeDepartmentId === d.id && <span style={{ color: "var(--gold)" }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}



      {/* Flat nav */}
      <div className="nav">
        {[
          { id: "dashboard", lbl: "Bosh sahifa",       icon: "🏠" },
          { id: "datahub",   lbl: "Manbalar",          icon: "📁", badge: connCount },
          { id: "chat",      lbl: "AI Maslahatchi",    icon: "💬", hot: true },
          { id: "analytics", lbl: "Tahlil",            icon: "📊" },
          { id: "charts",    lbl: "Grafiklar",         icon: "📈" },
          { id: "reports",   lbl: "Hisobotlar",        icon: "📋" },
          { id: "alerts",    lbl: "Ogohlantirishlar",  icon: "🔔", badge: unreadAlerts, badgeAlert: true },
          { id: "instagram", lbl: "Instagram",         icon: "📸" },
          { id: "amocrm",    lbl: "AmoCRM",            icon: "🟡" },
          { id: "facebook_ads", lbl: "Facebook Ads",   icon: "📣" },
        ].concat(
          (sources || [])
            .filter(s => s.show_in_sidebar && !["instagram","amocrm","facebook_ads","crm","bitrix24"].includes(s.type))
            .map(s => ({
              id: `source:${s.id}`,
              lbl: s.name,
              icon: s.type === "google_sheets" ? "📊" : s.type === "excel" ? "📗" : s.type === "json" ? "📄" : s.type === "telegram" ? "✈️" : "📁",
              isSource: true,
              srcId: s.id,
            }))
        ).map(item => (
          <div key={item.id}
            className={`ni ${page === item.id ? "active" : ""}`}
            onClick={() => {
              if (item.isSource) {
                // Sidebar'ga pin qilingan custom manba — Grafiklar sahifasiga o'tib, source filter bilan
                setPage("charts");
                window.dispatchEvent(new CustomEvent('charts-source-filter', { detail: item.srcId }));
              } else {
                setPage(item.id);
              }
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ fontSize: 14, opacity: 0.9, width: 18, display: "inline-flex", justifyContent: "center" }}>{item.icon}</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.lbl}</span>
            {item.hot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent2)", boxShadow: "0 0 8px var(--accent2)" }} />}
            {item.badge != null && item.badge > 0 && (
              <span className={`ni-badge ${item.badgeAlert ? "warn" : ""}`}>{item.badge}</span>
            )}
          </div>
        ))}

        {/* Boshqaruv */}
        {isCeoOrAbove && (
          <div style={{ marginTop: 14 }}>
            <div className="nav-group-label">Boshqaruv</div>
            <div className={`ni ${page === "team" ? "active" : ""}`}
              onClick={() => { setPage("team"); if (window.innerWidth < 768) setSidebarOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ fontSize: 14, opacity: 0.9, width: 18, display: "inline-flex", justifyContent: "center" }}>👥</span>
              <span>Jamoam</span>
            </div>
            <div className={`ni ${page === "settings" ? "active" : ""}`}
              onClick={() => { setPage("settings"); if (window.innerWidth < 768) setSidebarOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ fontSize: 14, opacity: 0.9, width: 18, display: "inline-flex", justifyContent: "center" }}>⚙️</span>
              <span>Sozlamalar</span>
            </div>
          </div>
        )}

        {/* Super-admin */}
        {(user.role === "super_admin" || user.role === "admin" || orgContext?.permissions?.is_super_admin) && (
          <div style={{ marginTop: 10 }}>
            <div className="nav-group-label">Tizim</div>
            <div className="ni" style={{ color: "var(--gold)", borderColor: "rgba(212,168,83,0.2)", background: "rgba(212,168,83,0.04)", display: "flex", alignItems: "center", gap: 11 }}
              onClick={() => setSuperAdminMode(true)}>
              <span style={{ fontSize: 14, width: 18, display: "inline-flex", justifyContent: "center" }}>⭐</span>
              <span>Super Admin</span>
            </div>
          </div>
        )}
      </div>

      {/* AI Status — pulse */}
      {isCeoOrAbove && (
        <div onClick={() => setPage("settings")}
          style={{
            margin: "8px 10px", padding: "9px 11px",
            background: (aiConfig?.apiKey || GlobalAI.get()?.apiKey) ? "var(--teal-glow)" : "rgba(232,97,77,0.08)",
            border: `1px solid ${(aiConfig?.apiKey || GlobalAI.get()?.apiKey) ? "var(--teal)" : "var(--red)"}30`,
            borderRadius: 10, display: "flex", alignItems: "center", gap: 10,
            cursor: "pointer", transition: "all .15s var(--ease)",
          }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: (aiConfig?.apiKey || GlobalAI.get()?.apiKey) ? "var(--teal)" : "var(--red)",
            boxShadow: `0 0 8px ${(aiConfig?.apiKey || GlobalAI.get()?.apiKey) ? "var(--teal)" : "var(--red)"}`,
            flexShrink: 0, animation: "pulse-voice 2s ease infinite",
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: (aiConfig?.apiKey || GlobalAI.get()?.apiKey) ? "var(--teal)" : "var(--red)", fontFamily: "var(--fh)" }}>{prov?.name || "AI"}</div>
            <div style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--fm)" }}>
              {(aiConfig?.apiKey || GlobalAI.get()?.apiKey) ? "✓ Ulangan" : "Kalit kerak"}
            </div>
          </div>
          <span style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--fm)" }}>almashtirish</span>
        </div>
      )}

      {/* User footer */}
      <div className="sidebar-footer" style={{ cursor: "pointer" }} onClick={() => setPage("profile")}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--gold), var(--accent2))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--fh)", fontSize: 13, fontWeight: 800,
            color: "#fff", flexShrink: 0,
          }}>{user?.name?.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontFamily: "var(--fh)", fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</div>
            <div style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--fm)", textTransform: "uppercase", letterSpacing: 1 }}>
              {user?.role === "super_admin" ? "Super-Admin" : user?.role === "ceo" ? "CEO" : user?.role === "employee" ? "Xodim" : user?.role}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
