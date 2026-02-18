import React, { useMemo, useState } from "react";

/**
 * LeftHeatmap.jsx
 * - Put this file at: src/components/LeftHeatmap.jsx
 * - Props:
 *    events: array of normalized events (from App.js)
 *    maxRows: number (default 6)
 *    title: optional title string
 *
 * - UI: toggle between Source / Target heatmaps, ranked horizontal bars,
 *   small counts, optional last-seen time.
 */

function palette(t) {
  const x = Math.max(0, Math.min(1, t));
  if (x < 0.5) {
    const g = Math.round(150 + 105 * (x / 0.5));
    return `rgb(34, ${g}, 94)`;
  } else {
    const r = Math.round(34 + 220 * ((x - 0.5) / 0.5));
    return `rgb(${r}, 180, 80)`;
  }
}

function formatTimeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

export default function LeftHeatmap({ events = [], maxRows = 6, title = "Attack heatmap" }) {
  const [mode, setMode] = useState("source"); // 'source' or 'target'

  const stats = useMemo(() => {
    const map = {};
    (events || []).forEach((ev) => {
      const key =
        mode === "source"
          ? (ev.sourceCountry && ev.sourceCountry !== "Unknown" ? ev.sourceCountry : ev.sourceIp || "Unknown")
          : (ev.targetCountry && ev.targetCountry !== "Unknown" ? ev.targetCountry : ev.targetIp || "Unknown");

      if (!map[key]) map[key] = { count: 0, lastSeen: 0 };
      map[key].count += 1;

      const ts = ev.timestamp || ev.time || ev.t || ev.createdAt || ev._time || null;
      if (ts) {
        const tms = new Date(ts).getTime();
        if (!isNaN(tms)) map[key].lastSeen = Math.max(map[key].lastSeen, tms);
      }
    });

    const arr = Object.keys(map).map((k) => ({ label: k, count: map[k].count, lastSeen: map[k].lastSeen }));
    arr.sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen);
    return arr.slice(0, maxRows);
  }, [events, maxRows, mode]);

  const max = stats.length ? Math.max(...stats.map((r) => r.count)) : 1;

  return (
    <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02), 0 8px 30px rgba(2,6,23,0.6)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#e6fff2" }}>{title}</div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            onClick={() => setMode("source")}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.04)",
              background: mode === "source" ? "rgba(34,197,94,0.12)" : "transparent",
              color: mode === "source" ? "#dcfce7" : "#9ca3af",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            SOURCE
          </button>
          <button
            onClick={() => setMode("target")}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.04)",
              background: mode === "target" ? "rgba(34,197,94,0.12)" : "transparent",
              color: mode === "target" ? "#dcfce7" : "#9ca3af",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            TARGET
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {stats.length === 0 && <div style={{ color: "#9ca3af", fontSize: 12 }}>No data yet</div>}

        {stats.map((row) => {
          const ratio = row.count / Math.max(1, max);
          return (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 90, fontSize: 13, color: "#e6fff2", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.label}
              </div>

              <div style={{ flex: 1, height: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)", overflow: "hidden", position: "relative" }}>
                <div style={{ width: `${Math.round(ratio * 100)}%`, height: "100%", background: palette(ratio), transition: "width 300ms cubic-bezier(.2,.8,.2,1)" }} />
              </div>

              <div style={{ width: 46, textAlign: "right", fontSize: 12, color: "#c7f7dd", fontWeight: 700 }}>{row.count}</div>

              <div style={{ width: 44, textAlign: "right", fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>
                {row.lastSeen ? formatTimeAgo(row.lastSeen) : ""}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 4, fontSize: 11, color: "#8b98a5", opacity: 0.9 }}>
        Showing top {maxRows} {mode === "source" ? "sources" : "targets"} • Auto-updates with live events
      </div>
    </div>
  );
}
