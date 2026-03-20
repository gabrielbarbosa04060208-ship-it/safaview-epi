// SafeView 4.0 - v49 | Feito por Gabriel Madureira em 14/03/2026
import { useEffect, useState } from "react";

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="50,5 90,22 90,52 50,95 10,52 10,22" fill="#1e3a5f" stroke="#3b6cb7" strokeWidth="4"/>
      <rect x="33" y="28" width="34" height="7"  fill="white" rx="2"/>
      <rect x="33" y="28" width="8"  height="20" fill="white" rx="2"/>
      <rect x="33" y="45" width="34" height="7"  fill="white" rx="2"/>
      <rect x="59" y="45" width="8"  height="20" fill="white" rx="2"/>
      <rect x="33" y="65" width="34" height="7"  fill="white" rx="2"/>
    </svg>
  );
}

const DRAG   = { WebkitAppRegion: "drag"    } as unknown as React.CSSProperties;
const NODRAG = { WebkitAppRegion: "no-drag" } as unknown as React.CSSProperties;

export function TitleBar() {
  const api = (window as any).electronAPI;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    document.body.style.paddingTop = "28px";
    const style = document.createElement("style");
    style.id = "titlebar-height-fix";
    style.textContent = `.min-h-screen { min-height: calc(100vh - 28px) !important; } html, body { overflow-x: hidden; }`;
    document.head.appendChild(style);
    api?.isMaximized?.().then((m: boolean) => setMaximized(m));
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { api?.isMaximized?.().then((m: boolean) => setMaximized(m)); }, 100);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (debounceTimer) clearTimeout(debounceTimer);
      document.body.style.paddingTop = "";
      document.getElementById("titlebar-height-fix")?.remove();
    };
  }, []);

  const minimize = () => api?.windowControls?.minimize();
  const maximize = () => api?.windowControls?.maximizeToggle?.()?.then((m: boolean) => setMaximized(m));
  const close    = () => api?.windowControls?.close();

  const btnBase: React.CSSProperties = {
    ...NODRAG,
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 46, height: 28, border: "none", background: "transparent",
    color: "#64748b", cursor: "pointer", fontSize: 16, transition: "background 0.15s",
  };

  return (
    <div style={{ ...DRAG, position: "fixed", top: 0, left: 0, right: 0, height: 28,
      backgroundColor: "#ffffff", borderBottom: "1px solid #e2e8f0",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      zIndex: 99999, userSelect: "none" }}>
      <div style={{ ...NODRAG, display: "flex", alignItems: "center", gap: 8, paddingLeft: 12 }}>
        <ShieldIcon />
        <span style={{ color: "#0f172a", fontSize: 13, fontWeight: 600, letterSpacing: "0.02em" }}>
          SafeView Dashboard
        </span>
      </div>
      <div style={{ display: "flex" }}>
        <button style={btnBase} onClick={minimize} title="Minimizar"
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="#64748b"/></svg>
        </button>
        <button style={btnBase} onClick={maximize} title={maximized ? "Restaurar" : "Maximizar"}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
          {maximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11">
              <rect x="2" y="0" width="9" height="9" stroke="#64748b" strokeWidth="1.2" fill="none"/>
              <rect x="0" y="2" width="9" height="9" stroke="#64748b" strokeWidth="1.2" fill="white"/>
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect width="10" height="10" stroke="#64748b" strokeWidth="1.2" fill="none"/>
            </svg>
          )}
        </button>
        <button style={btnBase} onClick={close} title="Fechar"
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#fee2e2")}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="#64748b" strokeWidth="1.4"/>
            <line x1="10" y1="0" x2="0"  y2="10" stroke="#64748b" strokeWidth="1.4"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
