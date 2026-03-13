// frontend/src/App.js
import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

import GlobePanel from "./GlobePanel";
import LeftHeatmap from "./components/LeftHeatmap";


// ----------------------- Helpers -----------------------
const FAKE_COUNTRIES = [
  "United States",
  "India",
  "Germany",
  "United Kingdom",
  "Brazil",
  "Japan",
  "Australia",
  "Canada",
  "Singapore",
  "Netherlands",
];

function fakeCountryFromIp(ip = "") {
  const s = (ip || "").toString();
  if (!s) return "Unknown";
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return FAKE_COUNTRIES[sum % FAKE_COUNTRIES.length];
}

function formatLocation(ip, countryFromServer) {
  const ipStr = ip || "Unknown IP";
  const country =
    countryFromServer && countryFromServer !== "Unknown"
      ? countryFromServer
      : fakeCountryFromIp(ipStr);
  return `${ipStr} (${country})`;
}

// Map backend attackType to friendly label (Option B)
function friendlyAttackType(raw) {
  if (!raw) return "Unknown";
  const r = raw.toString().toLowerCase();
  if (r.includes("brute")) return "Brute Force Attack";
  if (r.includes("ddos")) return "DDoS Attack";
  if (r.includes("phish")) return "Phishing Attempt";
  if (r.includes("sql")) return "SQL Injection";
  if (r.includes("ransom")) return "Ransomware";
  if (r.includes("malware")) return "Malware";
  if (r.includes("port")) return "Port Scan";
  if (r.includes("auth")) return "Authentication Abuse";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); // fallback nice-case
}

// ----------------------- Socket -----------------------
const socket = io("http://localhost:4000"); // keep same as your backend

// ----------------------- Small UI bits -----------------------
function ThreatBadge({ score }) {
  let label = "NORMAL";
  let bg = "linear-gradient(90deg,#10b981,#34d399)";
  let color = "#042917";

  if (score >= 75) {
    label = "CRITICAL";
    bg = "linear-gradient(90deg,#ef4444,#f97373)";
    color = "#2b0606";
  } else if (score >= 40) {
    label = "ELEVATED";
    bg = "linear-gradient(90deg,#f59e0b,#fb923c)";
    color = "#2b1400";
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        marginTop: 12,
      }}
    >
      <div
        style={{
          minWidth: 108,
          padding: "6px 12px",
          borderRadius: 999,
          background: bg,
          color,
          fontWeight: 700,
          letterSpacing: "0.06em",
          fontSize: 12,
          boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, opacity: 0.78 }}>
        {score === 0
          ? "System idle. Waiting for attack events..."
          : score < 40
            ? "Low activity detected."
            : score < 75
              ? "Elevated hostile activity detected."
              : "CRITICAL: High volume of hostile activity!"}
      </div>
    </div>
  );
}



// ----------------------- Main App -----------------------
export default function App() {
  // UI states
  const [events, setEvents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredEvents, setFilteredEvents] = useState([]);

  const [threatScore, setThreatScore] = useState(0);
  const [totalAttacks, setTotalAttacks] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [highCount, setHighCount] = useState(0);



  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authMode, setAuthMode] = useState("login");

  // timeline state (last 60 ticks)
  const TIMELINE_SECONDS = 60;
  const [timeline, setTimeline] = useState(() =>
    Array(TIMELINE_SECONDS).fill(0)
  );
  const eventCountRef = useRef(0);

  // clusters
  const [clusters, setClusters] = useState([]);

  // threat decay settings
  const THREAT_DECAY_PER_TICK = 3;
  const THREAT_DECAY_INTERVAL_MS = 1000;

  // Dummy auth handler
  const handleAuth = async ({ email, password, mode }) => {
    email = (email || "").trim();
    password = (password || "").trim();
    setAuthLoading(true);
    setAuthError("");

    try {
      // Simulate network request
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setIsAuthenticated(true);
    } catch (err) {
      console.error("Auth error:", err);
      setAuthError(err?.message || "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  // ------------------ SOCKET HANDLER EFFECT ------------------
  useEffect(() => {
    if (!isAuthenticated) return;

    const handler = (rawEvent) => {
      // rawEvent is what backend emitted. Normalize it.
      // Backend uses attackEvent with fields like: attackType, severity, sourceIp, targetIp, timestamp
      const normalized = {
        id:
          rawEvent.id ||
          rawEvent.eventId ||
          Math.random().toString(36).slice(2, 9),
        timestamp: rawEvent.timestamp || Date.now(),
        sourceIp: rawEvent.sourceIp || rawEvent.src || "0.0.0.0",
        targetIp: rawEvent.targetIp || rawEvent.dst || "0.0.0.0",
        type: friendlyAttackType(
          rawEvent.attackType || rawEvent.type || "Unknown"
        ),
        severity: (rawEvent.severity || "LOW").toUpperCase(),
        sourceCountry:
          rawEvent.sourceCountry ||
          fakeCountryFromIp(rawEvent.sourceIp || rawEvent.src),
        targetCountry:
          rawEvent.targetCountry ||
          fakeCountryFromIp(rawEvent.targetIp || rawEvent.dst),
        raw: rawEvent,
        time: new Date(rawEvent.timestamp || Date.now()).toLocaleTimeString(),
      };

      // increment per-second counter
      if (typeof eventCountRef.current !== "number") eventCountRef.current = 0;
      eventCountRef.current = Number(eventCountRef.current) + 1;

      // update aggregates and UI
      setTotalAttacks((prev) => prev + 1);
      if (normalized.severity === "CRITICAL") setCriticalCount((p) => p + 1);
      else if (normalized.severity === "HIGH") setHighCount((p) => p + 1);

      setEvents((prev) => [normalized, ...prev].slice(0, 200));

      setThreatScore((prev) => {
        let delta = 3;
        if (normalized.severity === "CRITICAL") delta = 20;
        else if (normalized.severity === "HIGH") delta = 10;
        else if (normalized.severity === "MEDIUM") delta = 5;
        return Math.min(100, (prev || 0) + delta);
      });

      // debug log (remove if noisy)
      console.log("🔴 New attack event received (normalized):", normalized);
      console.log("DEBUG: eventCountRef now:", eventCountRef.current);
    };

    // register handler (backend emits 'attackEvent')
    if (socket && socket.on) {
      socket.on("attackEvent", handler);
      console.log("DEBUG: registered handler for attackEvent");
    } else {
      console.warn("WARN: socket not available to register handler");
    }

    return () => {
      try {
        if (socket && socket.off) {
          socket.off("attackEvent", handler);
          console.log("DEBUG: unregistered handler for attackEvent");
        }
      } catch (err) {
        console.error("Error during socket cleanup:", err);
      }
    };
  }, [isAuthenticated]);

  // ------------------ TIMELINE TICK / THREAT DECAY EFFECT ------------------
  useEffect(() => {
    if (!isAuthenticated) return;

    const intervalId = setInterval(() => {
      // decay threat score
      setThreatScore((prev) => {
        if (!prev || prev <= 0) return 0;
        return prev - THREAT_DECAY_PER_TICK;
      });

      // push the per-second counter into timeline
      const pushed = Number(eventCountRef.current || 0);
      console.log("⏱️ TIMELINE PUSH:", pushed);

      setTimeline((prev) => {
        const next = [...prev.slice(1), pushed];
        return next;
      });

      // reset counter for next tick
      eventCountRef.current = 0;
      //console.log("DEBUG: reset eventCountRef ->", eventCountRef.current);
    }, THREAT_DECAY_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isAuthenticated]);

  // ------------------ CLUSTER DETECTION ------------------
  useEffect(() => {
    if (!isAuthenticated) return;

    const recent = events.slice(0, 120);
    const now = Date.now();
    const buckets = {};

    recent.forEach((ev) => {
      const src =
        ev.sourceCountry && ev.sourceCountry !== "Unknown"
          ? ev.sourceCountry
          : ev.sourceIp || "unknown";
      let key = src;
      if (/^\d+\.\d+\.\d+\.\d+$/.test(src)) {
        const parts = src.split(".");
        key = `${parts[0]}.${parts[1]}.x.x`;
      }
      if (!buckets[key])
        buckets[key] = { key, events: [], firstSeen: now, lastSeen: now };
      buckets[key].events.push(ev);
      buckets[key].lastSeen = now;
    });

    const CLUSTER_THRESHOLD = 3; // reasonable default
    const detected = Object.values(buckets)
      .filter((b) => b.events.length >= CLUSTER_THRESHOLD)
      .map((b) => {
        const sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
        b.events.forEach((e) => {
          const s = (e.severity || "LOW").toUpperCase();
          if (sevCounts[s] !== undefined) sevCounts[s]++;
        });
        let severitySummary = "LOW";
        if (sevCounts.CRITICAL > 0) severitySummary = "CRITICAL";
        else if (sevCounts.HIGH > 0) severitySummary = "HIGH";
        else if (sevCounts.MEDIUM > 0) severitySummary = "MEDIUM";

        return {
          title: `Cluster: ${b.key}`,
          subtitle: `${b.events.length} attacks · ${b.events
            .slice(0, 3)
            .map((ev) => ev.type || ev.severity || ev.sourceIp)
            .join(", ")}${b.events.length > 3 ? " ..." : ""}`,
          count: b.events.length,
          severitySummary,
          firstSeen: b.events[b.events.length - 1]?.timestamp
            ? new Date(b.events[b.events.length - 1].timestamp)
            : now,
          lastSeen: b.lastSeen,
        };
      })
      .sort((a, b) => b.count - a.count);

    setClusters(detected.slice(0, 6));
  }, [events, isAuthenticated]);

  // --- helpers for cluster cards ---

  const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

  function getClusterSeverity(sevCounts = {}) {
    for (const level of severityOrder) {
      if ((sevCounts[level] || 0) > 0) return level;
    }
    return "LOW";
  }

  function formatClusterTime(ts) {
    if (!ts) return "Unknown";
    const d = new Date(ts);
    // HH:MM:SS
    return d.toTimeString().slice(0, 8);
  }

  function summarizeAttackTypes(cluster) {
    if (!cluster || !Array.isArray(cluster.events)) return "Multiple attack types";
    const counts = {};
    for (const ev of cluster.events) {
      const name = ev.attackType || ev.type || "Attack";
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3) // top 3 types
      .map(([name]) => name)
      .join(", ");
  }

  // ---------------------- SEARCH FILTER FOR EVENTS ----------------------
  useEffect(() => {
    if (!searchQuery.trim()) {
      // No search -> show all events
      setFilteredEvents(events);
      return;
    }

    const q = searchQuery.trim().toLowerCase();

    const next = events.filter((ev) => {
      const srcIp = (ev.sourceIp || ev.src || "").toLowerCase();
      const dstIp = (ev.targetIp || ev.dst || "").toLowerCase();
      const srcCountry = (ev.sourceCountry || "").toLowerCase();
      const dstCountry = (ev.targetCountry || "").toLowerCase();

      return (
        srcIp.includes(q) ||
        dstIp.includes(q) ||
        srcCountry.includes(q) ||
        dstCountry.includes(q)
      );
    });

    setFilteredEvents(next);
  }, [events, searchQuery]);

  const activeEvents = searchQuery.trim() ? filteredEvents : events;

  // Helper: Check if event matches search text (IP or country)
  function isEventMatchSearch(ev, query) {
    if (!query) return false;
    const q = query.toLowerCase();

    const srcIp = ev.sourceIp?.toLowerCase() || "";
    const dstIp = ev.targetIp?.toLowerCase() || "";
    const srcCountry = ev.sourceCountry?.toLowerCase() || "";
    const dstCountry = ev.targetCountry?.toLowerCase() || "";

    return (
      srcIp.includes(q) ||
      dstIp.includes(q) ||
      srcCountry.includes(q) ||
      dstCountry.includes(q)
    );
  }




  // ------------------ AUTH GATED UI ------------------
  if (!isAuthenticated) {
    return (
      <LoginScreen
        mode={authMode}
        onSubmit={handleAuth}
        onSwitchMode={() =>
          setAuthMode((prev) => (prev === "login" ? "signup" : "login"))
        }
        loading={authLoading}
        error={authError}
      />
    );
  }

  // ------------------ DASHBOARD UI ------------------
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #0f172a 0%, #020617 45%, #000000 100%)",
        color: "#e5e7eb",
        padding: "24px 32px",
        boxSizing: "border-box",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <header style={{ marginBottom: 14 }}>
        <h1
          style={{
            fontSize: 32,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            margin: 0,
            color: "#e5f9ff",
          }}
        >
          Real Time - Threat Visualizer
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 8,
          }}
        >
          <p style={{ margin: 0, opacity: 0.75 }}>
            Live simulated cyberattack feed with dynamic threat level.
          </p>
          <div style={{ marginLeft: 12 }} />
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(280px, 380px) minmax(420px, 1fr) minmax(260px, 320px)",
          gridTemplateRows: "minmax(320px, 420px) minmax(220px, 260px)",
          gridGap: "20px",
          height: "calc(100vh - 24px - 24px - 40px)",
        }}
      >


        {/* Threat panel */}
        <div
          style={{
            gridColumn: "1 / 2",
            gridRow: "1 / 2",
            background: "rgba(15,23,42,0.95)",
            borderRadius: 16,
            border: "1px solid #22c55e33",
            padding: "16px 20px",
            boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
          }}
        >
          <h2 style={{ margin: 0, marginBottom: 12, fontSize: 16 }}>
            Threat Level
          </h2>
          <div
            style={{
              marginTop: 16,
              height: 10,
              borderRadius: 999,
              background: "#0f172a",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(threatScore, 100)}%`,
                height: "100%",
                background:
                  "linear-gradient(90deg, #22c55e, #a3e635, #f97316, #ef4444)",
                boxShadow: "0 0 12px rgba(34,197,94,0.8)",
              }}
            />
          </div>
          <ThreatBadge score={threatScore} />
          {/* Heatmap panel */}
          <div style={{ marginTop: 20 }}>
            <LeftHeatmap events={activeEvents} maxRows={6} title="Attack Heatmap" />
          </div>

        </div>


        {/* Globe */}
        <div
          style={{
            gridColumn: "2 / 3",
            gridRow: "1 / 2",
            background: "rgba(15,23,42,0.9)",
            borderRadius: 22,
            border: "1px solid #22c55e33",
            boxShadow: "0 30px 80px rgba(0,0,0,0.8)",
            position: "relative",
            overflow: "hidden",
            transform: "translateX(8px)",
          }}
        >
          {/* Numbers-only timeline (top-left) */}
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              zIndex: 6,
              textAlign: "left",
              pointerEvents: "none",
              color: "#94f99f",
              fontSize: 12,
              background: "rgba(0,0,0,0.18)",
              padding: "2px 4px",
              borderRadius: 8,
              border: "0.5px solid rgba(16,185,129,0.06)",
              minWidth: 100,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.95 }}>
              Last 6s:
            </div>
            <div
              style={{
                marginTop: 6,
                fontFamily: "monospace",
                fontSize: 12,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {timeline
                .slice(-6)
                .map((v) => Number(v) || 0)
                .join(", ")}
            </div>
            <div style={{ marginTop: 8, fontWeight: 700, color: "#b6f8c2" }}>
              Total (6s):{" "}
              {timeline.slice(-6).reduce((s, v) => s + (Number(v) || 0), 0)}
            </div>
          </div>

          <GlobePanel events={activeEvents} searchQuery={searchQuery} />
        </div>




        {/* Right stats */}
        <div
          style={{
            gridColumn: "3 / 4",
            gridRow: "1 / 2",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            background: "transparent",
            border: "none",
            boxShadow: "none",
            padding: 0,
          }}
        >
          {/* Search bar ABOVE the System Stats card */}

          <div
            style={{
              marginBottom: 4,
              alignSelf: "flex-start", // move bar towards the left side of the column
              width: "80%",            // make it a bit shorter
              maxWidth: 380,           // hard cap so it doesn't get too wide
              position: "relative",
            }}
          >
            {/* search icon */}
            <span
              style={{
                position: "absolute",
                left: 14,
                top: "33%",
                transform: "translateY(-54%)",
                fontSize: 15,
                color: "#9ca3af",
                opacity: 0.85,
                pointerEvents: "none",
                zIndex: 1,
              }}
            >
              🔍
            </span>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by IP or country..."
              style={{
                width: "100%",
                borderRadius: 999,
                padding: "10px 20px 10px 38px", // extra left room for icon
                border: "1px solid rgba(148,163,184,0.35)",
                background: "rgba(15,23,42,0.75)",
                color: "#e5e7eb",
                fontSize: 13,
                outline: "none",
                backdropFilter: "blur(10px)",
              }}
            />

            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                opacity: 0.75,
              }}
            >
              Filters globe &amp; live attack feed by IP or country.
            </div>
          </div>


          {/* System Stats card */}
          <div
            style={{
              background: "rgba(15,23,42,0.95)",
              borderRadius: 16,
              border: "1px solid #22c55e33",
              padding: "16px 20px 20px",
              boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
              overflowY: "auto",
            }}
          >
            <h2 style={{ margin: 0, marginBottom: 12, fontSize: 16 }}>
              System Stats
            </h2>

            <div style={{ fontSize: 14, lineHeight: 1.8 }}>
              <div>
                <span style={{ opacity: 0.75 }}>Total Attacks</span>
                <div style={{ fontSize: 28, fontWeight: 600 }}>
                  {totalAttacks}
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <span style={{ opacity: 0.75 }}>High Severity</span>
                <div style={{ fontSize: 22, fontWeight: 500 }}>
                  {highCount}
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <span style={{ opacity: 0.75 }}>Critical</span>
                <div style={{ fontSize: 22, fontWeight: 500 }}>
                  {criticalCount}
                </div>
              </div>
            </div>

            {/* Emerging Clusters – rich card layout like before */}
            {clusters.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ opacity: 0.75, marginBottom: 6 }}>
                  Emerging Clusters
                </div>
                {clusters.map((cl) => (
                  <div
                    key={cl.key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "stretch",
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: "rgba(15,118,110,0.25)",
                      marginBottom: 8,
                      fontSize: 12,
                    }}
                  >
                    {/* left: text details */}
                    <div style={{ flex: 1, paddingRight: 10 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        Cluster: {cl.country || "Unknown"}
                      </div>

                      <div style={{ opacity: 0.85 }}>
                        {cl.count} attacks · {summarizeAttackTypes(cl)}
                      </div>

                      <div style={{ opacity: 0.7, marginTop: 4 }}>
                        First seen: {formatClusterTime(cl.firstSeen)} · Last
                        seen: {formatClusterTime(cl.lastSeen)}
                      </div>
                    </div>

                    {/* right: big count + severity label */}
                    <div
                      style={{
                        minWidth: 60,
                        textAlign: "right",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                      }}
                    >
                      <div style={{ fontSize: 20, fontWeight: 700 }}>
                        {cl.count}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          letterSpacing: 0.5,
                          marginTop: 2,
                          opacity: 0.9,
                        }}
                      >
                        {getClusterSeverity(cl.sevCounts)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom feed */}

        <div
          style={{
            gridColumn: "1 / 4",
            gridRow: "2 / 3",
            background: "rgba(15,23,42,0.95)",
            borderRadius: 16,
            border: "1px solid #22c55e33",
            padding: "16px 20px",
            boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
            overflow: "hidden",
          }}
        >
          <h2 style={{ margin: 0, marginBottom: 12, fontSize: 16 }}>
            Live Attack Feed
          </h2>
          <div
            style={{
              height: "100%",
              overflowY: "auto",
              fontFamily: "monospace",
              fontSize: 13,
            }}
          >
            {activeEvents.map((event, idx) => {
              const isMatch = isEventMatchSearch(event, searchQuery);

              return (
                <div
                  key={event.id || idx}
                  style={{
                    marginBottom: 4,
                    background: isMatch ? "rgba(56,189,248,0.12)" : "transparent",
                    padding: isMatch ? "6px 8px" : "0px",
                    borderRadius: isMatch ? 6 : 0,
                    transition: "background 0.2s ease",
                  }}
                >
                  [{event.time}]{" "}
                  <span
                    style={{
                      color:
                        event.severity === "CRITICAL"
                          ? "#f97373"
                          : event.severity === "HIGH"
                            ? "#facc15"
                            : "#22c55e",
                      fontWeight: isMatch ? 700 : 400,
                    }}
                  >
                    {event.type}
                  </span>{" "}
                  ({event.severity}) from{" "}
                  <span
                    style={{
                      color: isMatch ? "#60a5fa" : "#38bdf8",
                      fontWeight: isMatch ? 700 : 400,
                    }}
                  >
                    {formatLocation(event.sourceIp, event.sourceCountry)}
                  </span>{" "}
                  →{" "}
                  <span
                    style={{
                      color: isMatch ? "#60a5fa" : "#38bdf8",
                      fontWeight: isMatch ? 700 : 400,
                    }}
                  >
                    {formatLocation(event.targetIp, event.targetCountry)}
                  </span>
                </div>
              );
            })}

          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------- LoginScreen (kept friendly) -----------------------
function LoginScreen({ mode, onSubmit, onSwitchMode, loading, error }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [localError, setLocalError] = React.useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email || !password) {
      setLocalError("Please enter both username and password.");
      return;
    }
    setLocalError("");
    onSubmit({ email, password, mode });
  };

  const titleText = "SOC DASHBOARD";
  const statusText = mode === "login" ? "LOGIN" : "SIGN UP";
  const buttonText =
    mode === "login" ? "ACCESS SOC DASHBOARD" : "CREATE ACCOUNT";
  const switchText =
    mode === "login"
      ? "Don't have an account? Sign up"
      : "Already have an account? Log in";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          background: "rgba(15,23,42,0.95)",
          borderRadius: 16,
          padding: "32px 40px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
          border: "1px solid #22c55e33",
          maxWidth: 420,
          width: "100%",
        }}
      >
        <h1
          style={{
            fontSize: 24,
            margin: 0,
            marginBottom: 8,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#a5b4fc",
            textAlign: "center",
          }}
        >
          {titleText}
        </h1>
        <p
          style={{
            margin: 0,
            marginBottom: 8,
            opacity: 0.75,
            textAlign: "center",
          }}
        >
          Secure Operations Center – authorized access only.
        </p>
        <div
          style={{
            marginBottom: 20,
            fontSize: 12,
            letterSpacing: "0.18em",
            textAlign: "center",
            textTransform: "uppercase",
            opacity: 0.8,
          }}
        >
          {statusText}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, opacity: 0.8 }}>Username</label>
            <input
              type="text"
              placeholder="analyst@yoursec.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                marginTop: 4,
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #1f2937",
                background: "#020617",
                color: "#e5e7eb",
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, opacity: 0.8 }}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                marginTop: 4,
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #1f2937",
                background: "#020617",
                color: "#e5e7eb",
                outline: "none",
              }}
            />
          </div>

          {(localError || error) && (
            <div style={{ marginBottom: 10, fontSize: 12, color: "#f97373" }}>
              {localError || error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 999,
              border: "none",
              background: loading
                ? "#16a34a99"
                : "linear-gradient(135deg, #22c55e, #16a34a, #22c55e)",
              color: "#020617",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "PROCESSING..." : buttonText}
          </button>
        </form>

        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            opacity: 0.8,
            textAlign: "center",
          }}
        >
          <span
            style={{ cursor: "pointer", color: "#4ade80" }}
            onClick={() => {
              setLocalError("");
              onSwitchMode();
            }}
          >
            {switchText}
          </span>
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            opacity: 0.6,
            textAlign: "center",
          }}
        >
          Admin / Analyst access only. All activity is monitored.
        </div>
      </div>
    </div>
  );
}
