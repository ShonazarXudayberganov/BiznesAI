import React from 'react';
import CostChip from './CostChip';

export default function Topbar({
  setSidebarOpen, orgContext, activeDepartmentId,
  pageTitles, page,
  bgTaskCount, bgTasksRef, setPage,
  setCmdOpen, unreadAlerts,
  handleLogout,
  themeToggleNode, liveClockNode
}) {
  return (
    <div className="topbar">
      <div className="flex aic gap10" style={{ flex: 1, minWidth: 0 }}>
        <button className="hamburger-btn" onClick={() => setSidebarOpen(v => !v)}></button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--muted)", letterSpacing: 0.3, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }} className="hide-mobile">
            {(() => {
              const activeDept = orgContext?.departments?.find(d => d.id === activeDepartmentId);
              const ws = activeDept ? activeDept.name : (orgContext?.organization?.name || "Analix");
              return (
                <>
                  <span>{ws}</span>
                  <span style={{ color: "var(--muted2)" }}>/</span>
                  <span>{pageTitles[page] || page}</span>
                </>
              );
            })()}
          </div>
          <div className="page-title" style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3, color: "var(--text)" }}>{pageTitles[page] || page}</div>
        </div>
      </div>

      <div className="topbar-right">
        {bgTaskCount > 0 && (
          <div className="tb-item" onClick={() => { const t = bgTasksRef?.current?.find(t => t.status === "running"); if (t?.page) setPage(t.page); }}
            style={{ borderColor: "var(--teal)30", color: "var(--teal)", fontWeight: 600, animation: "pulse-voice 2s ease infinite" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--teal)", animation: "pulse-voice 1s ease infinite" }} />
            AI ({bgTaskCount})
          </div>
        )}

        <CostChip />

        <div className="tb-item" onClick={() => setPage("alerts")} title="Bildirishnomalar" style={{ padding: "0 10px", position: "relative" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          {unreadAlerts > 0 && (
            <span style={{ position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: "50%", background: "var(--red)", border: "2px solid var(--bg)" }} />
          )}
        </div>
        {themeToggleNode}
        {liveClockNode}
        <div className="tb-item" onClick={handleLogout} title="Chiqish" style={{ borderColor: "var(--red)30", color: "var(--red)", fontWeight: 600 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          <span className="hide-mobile">Chiqish</span>
        </div>
      </div>
    </div>
  );
}
