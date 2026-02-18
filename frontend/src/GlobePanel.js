// frontend/src/GlobePanel.js
import React, { useEffect, useRef, useMemo, useState } from "react";
import Globe from "react-globe.gl";

/**
 * GlobePanel (improved type extraction + debug)
 * - very defensive extraction of attack type for display
 * - logs clicked arc to console to help identify event shapes
 */

const GLOBE_SIZE = 420;
const ZOOM_CHECK_INTERVAL_MS = 450;
const ZOOM_THRESHOLD_ALTITUDE = 1.35;
const MAX_ARCS = 12;
const MAX_LABELS = 40;

const SEV_WEIGHT = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNKNOWN: 0,
};
const SEARCH_ARC_COLOR = "#a855f7"; // purple for search-matched arcs


function ipToLatLng(ip) {
  if (!ip || typeof ip !== "string") return { lat: 0, lng: 0 };
  const parts = ip.split(".").map((p) => parseInt(p, 10) || 0);
  while (parts.length < 4) parts.push(0);
  const [a, b, c, d] = parts;
  const latNorm = (a * 256 + b) / (256 * 256);
  const lat = latNorm * 140 - 60;
  const lngNorm = (c * 256 + d) / (256 * 256);
  const lng = lngNorm * 360 - 180;
  return { lat, lng };
}

function shortType(t = "") {
  if (t == null) return "Unknown";
  const s = String(t).trim();
  if (!s) return "Unknown";
  const parts = s.split(/\s+/).slice(0, 3);
  return parts.join(" ");
}

// robust helper: try many possible locations for a type string
function extractTypeFrom(thing) {
  if (!thing) return null;

  // if it's a plain string
  if (typeof thing === "string" && thing.trim().length > 0) return thing.trim();

  // if it's an object — check common keys (shallow)
  const keysToTry = [
    "type",
    "attackType",
    "attack",
    "attack_type",
    "name",
    "eventType",
    "payloadType",
    "threatType",
  ];

  for (const k of keysToTry) {
    if (thing[k]) return String(thing[k]);
  }

  // nested possibilities
  if (thing.meta && typeof thing.meta === "object") {
    for (const k of keysToTry) if (thing.meta[k]) return String(thing.meta[k]);
  }
  if (thing._orig && typeof thing._orig === "object") {
    for (const k of keysToTry) if (thing._orig[k]) return String(thing._orig[k]);
    // raw nested
    if (thing._orig.raw && typeof thing._orig.raw === "object") {
      for (const k of keysToTry) if (thing._orig.raw[k]) return String(thing._orig.raw[k]);
    }
  }
  if (thing.raw && typeof thing.raw === "object") {
    for (const k of keysToTry) if (thing.raw[k]) return String(thing.raw[k]);
  }
  // as last resort, search any stringy property values (shallow)
  for (const k of Object.keys(thing)) {
    const v = thing[k];
    if (typeof v === "string" && v.length > 0) {
      // Heuristic: if string contains keywords likely to be attack name
      if (/(ddos|brute|phish|sql|ransom|malware|scan|port|auth)/i.test(v)) return v;
    }
  }

  return null;
}

export default function GlobePanel({ events = [],searchQuery = "" }) {
  const globeRef = useRef();
  const [selectedArc, setSelectedArc] = useState(null);
  const [zoomedIn, setZoomedIn] = useState(false);
  const [arcAnimating, setArcAnimating] = useState(true);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const controls = globe.controls();

    try {
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.35;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.12;
      controls.enableZoom = true;
    } catch (e) {}

    const onControlStart = () => {
      try {
        setArcAnimating(false);
        controls.autoRotate = false;
      } catch (e) {}
    };
    const onControlEnd = () => {
      try {
        setArcAnimating(true);
        controls.autoRotate = true;
      } catch (e) {}
    };

    if (controls.addEventListener) {
      controls.addEventListener("start", onControlStart);
      controls.addEventListener("end", onControlEnd);
    } else {
      const canvas = globeRef.current && globeRef.current.renderer && globeRef.current.renderer.domElement;
      if (canvas) {
        canvas.addEventListener("pointerdown", onControlStart);
        window.addEventListener("pointerup", onControlEnd);
      }
    }

    try {
      if (globe && globe.renderer && typeof globeRef.current.renderer.setPixelRatio === "function") {
        const dpr = window.devicePixelRatio || 1;
        globe.current.renderer.setPixelRatio(Math.min(1, dpr));
      }
    } catch (e) {}

    globeRef.current.pointOfView({ lat: 20, lng: 10, altitude: 2.1 }, 1200);

    return () => {
      try {
        if (controls.removeEventListener) {
          controls.removeEventListener("start", onControlStart);
          controls.removeEventListener("end", onControlEnd);
        } else {
          const canvas = globe && globe.renderer && globe.renderer.domElement;
          if (canvas) {
            canvas.removeEventListener("pointerdown", onControlStart);
            window.removeEventListener("pointerup", onControlEnd);
          }
        }
      } catch (e) {}
    };
  }, []);

  // Prioritise, dedupe, cap arcs
  const arcsData = useMemo(() => {
    if (!Array.isArray(events) || events.length === 0) return [];
        const query = (searchQuery || "").trim().toLowerCase();


    const enriched = events.map((ev, idx) => {
      const start = ipToLatLng(ev.sourceIp || ev.src || "");
      const end = ipToLatLng(ev.targetIp || ev.dst || "");
      const sev = (ev.severity || "UNKNOWN").toUpperCase();
      const weight = SEV_WEIGHT[sev] || 0;
      const time = ev.timestamp ? new Date(ev.timestamp).getTime() : Date.now();
          // Does this event match the current search (IP or country)?
    const srcIp = (ev.sourceIp || ev.src || "").toLowerCase();
    const dstIp = (ev.targetIp || ev.dst || "").toLowerCase();
    const srcCountry = (ev.sourceCountry || ev.srcCountry || "").toLowerCase();
    const dstCountry = (ev.targetCountry || ev.dstCountry || "").toLowerCase();

    const matchesSearch =
      query &&
      (srcIp.includes(query) ||
        dstIp.includes(query) ||
        srcCountry.includes(query) ||
        dstCountry.includes(query));

      return {
        _orig: ev,
        id: ev.id || `evt-${idx}`,
        start,
        end,
        // set type from common event fields (may be undefined)
        type: ev.attackType || ev.type || (ev.raw && ev.raw.attackType) || null,
        severity: sev,
        weight,
        time,
        highlight: matchesSearch, // 👈 new field
      };
    });

    enriched.sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return b.time - a.time;
    });

    const seen = new Set();
    const result = [];
    for (let item of enriched) {
      const key = `${item.start.lat.toFixed(3)}:${item.start.lng.toFixed(3)}->${item.end.lat.toFixed(3)}:${item.end.lng.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
      if (result.length >= MAX_ARCS) break;
    }

    return result.map((r, idx) => {
      let colorFrom = "#22c55e";
      let colorTo = "#4ade80";
      if (r.severity === "MEDIUM") {
        colorFrom = "#facc15";
        colorTo = "#f97316";
      } else if (r.severity === "HIGH") {
        colorFrom = "#f97316";
        colorTo = "#ef4444";
      } else if (r.severity === "CRITICAL") {
        colorFrom = "#f97373";
        colorTo = "#facc15";
      }
      return {
        id: `${r.id}-${idx}`,
        startLat: r.start.lat,
        startLng: r.start.lng,
        endLat: r.end.lat,
        endLng: r.end.lng,
        color: [colorFrom, colorTo],
        severity: r.severity,
        meta: {
          // preserve the original event object so we can inspect nested shapes
          originalEvent: r._orig,
          // also provide convenient flat fields
          sourceIp: r._orig.sourceIp || r._orig.src || "",
          targetIp: r._orig.targetIp || r._orig.dst || "",
          sourceCountry: r._orig.sourceCountry || null,
          targetCountry: r._orig.targetCountry || null,
          type: r.type || r._orig.attackType || r._orig.type || null,
          time: r._orig.timestamp || r.time,
          startLat: r.start.lat,
          startLng: r.start.lng,
          endLat: r.end.lat,
          endLng: r.end.lng,
        },
      };
    });
  }, [events,searchQuery]);

  // labels: show only country when zoomed
  const labelsData = useMemo(() => {
    if (!zoomedIn) return [];
    const arr = [];
    for (let i = 0; i < arcsData.length; i++) {
      const a = arcsData[i];
      const m = a.meta || {};
      if (m.startLat != null && m.startLng != null) {
        arr.push({
          id: `s-${a.id}`,
          lat: m.startLat,
          lng: m.startLng,
          text: m.sourceCountry || m.sourceIp || "Unknown",
          arcId: a.id,
        });
      }
      if (m.endLat != null && m.endLng != null) {
        arr.push({
          id: `t-${a.id}`,
          lat: m.endLat,
          lng: m.endLng,
          text: m.targetCountry || m.targetIp || "Unknown",
          arcId: a.id,
        });
      }
      if (arr.length >= MAX_LABELS) break;
    }
    return arr;
  }, [arcsData, zoomedIn]);

  // zoom detection (only toggle when changes)
  useEffect(() => {
    if (!globeRef.current) return;
    let mounted = true;
    const check = () => {
      try {
        const pov = globeRef.current.pointOfView && globeRef.current.pointOfView();
        const altitude = pov && pov.altitude ? pov.altitude : null;
        let newZoom = false;
        if (altitude != null) newZoom = altitude <= ZOOM_THRESHOLD_ALTITUDE;
        else if (globeRef.current && globeRef.current.controls && globeRef.current.controls().object) {
          const cam = globeRef.current.controls().object.position;
          const dist = Math.sqrt(cam.x * cam.x + cam.y * cam.y + cam.z * cam.z);
          newZoom = dist <= 600;
        }
        if (mounted) setZoomedIn((prev) => (prev === newZoom ? prev : newZoom));
      } catch (err) {}
    };
    const id = setInterval(check, ZOOM_CHECK_INTERVAL_MS);
    check();
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // auto-dismiss selection
  useEffect(() => {
    if (!selectedArc) return;
    const t = setTimeout(() => setSelectedArc(null), 2000);
    return () => clearTimeout(t);
  }, [selectedArc]);

  function computeBadgePositions(meta) {
    const leftSide = (meta.startLng || 0) < (meta.endLng || 0);
    const fromPos = leftSide ? { left: "12%", top: "12%" } : { right: "12%", top: "12%" };
    const toPos = leftSide ? { right: "12%", top: "12%" } : { left: "12%", top: "12%" };
    return { fromPos, toPos };
  }

  // helper: extract display type from selectedArc/meta with many fallbacks
  function getDisplayType(sel) {
    if (!sel) return "Unknown";
    // common direct fields
    const candidates = [
      sel.type,
      sel.attackType,
      sel.attack,
      sel._type,
      sel.meta && sel.meta.type,
      sel.meta && sel.meta.attackType,
      sel.originalEvent && sel.originalEvent.type,
      sel.originalEvent && sel.originalEvent.attackType,
      sel.originalEvent && sel.originalEvent.attack,
      sel.originalEvent && sel.originalEvent.raw && sel.originalEvent.raw.attackType,
      sel.originalEvent && sel.originalEvent.raw && sel.originalEvent.raw.type,
      sel.originalEvent && sel.originalEvent.payload && sel.originalEvent.payload.type,
      sel.originalEvent && sel.originalEvent.event && sel.originalEvent.event.type,
    ];
    for (const v of candidates) {
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    // general fallback search
    const guess = extractTypeFrom(sel) || extractTypeFrom(sel.originalEvent) || extractTypeFrom(sel.meta) || null;
    return guess || "Unknown";
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div style={{ position: "relative", width: GLOBE_SIZE, height: GLOBE_SIZE, maxWidth: "100%", maxHeight: "100%" }}>
        <div style={{ position: "absolute", top: "46%", left: "50%", width: "110%", height: "110%", transform: "translate(-50%, -50%)", borderRadius: "50%", background: "radial-gradient(circle, rgba(34,197,94,0.32), rgba(15,23,42,0))", filter: "blur(26px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "45%", left: "50%", width: GLOBE_SIZE, height: GLOBE_SIZE, maxWidth: "100%", maxHeight: "100%", transform: "translate(-50%, -50%)" }}>
          <Globe
            ref={globeRef}
            width={GLOBE_SIZE}
            height={GLOBE_SIZE}
            backgroundColor="rgba(0,0,0,0)"
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
            bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
            showAtmosphere={true}
            atmosphereColor="#22c55e"
            atmosphereAltitude={0.18}
            arcsData={arcsData}
            arcColor={(d) =>
      d.highlight
        ? [SEARCH_ARC_COLOR, SEARCH_ARC_COLOR] // purple for matching search
        : ["#f97316", "#fb923c"]               // normal orange gradient
    }
            arcAltitude={(d) => {
              if (d.severity === "CRITICAL") return 0.5;
              if (d.severity === "HIGH") return 0.35;
              return 0.28;
            }}
            arcStroke={0.6}
            arcDashLength={0.75}
            arcDashGap={0.03}
            arcDashAnimateTime={arcAnimating ? 1600 : 0}
            labelsData={labelsData}
            labelLat={(d) => d.lat}
            labelLng={(d) => d.lng}
            labelText={(d) => d.text}
            labelSize={(d) => 0.7}
            labelResolution={2}
            labelColor={() => "rgba(255,255,255,0.95)"}
            labelDotRadius={() => 0.14}
            onArcClick={(arc) => {
              // robustly pick meta or arc; keep the original event inside meta.originalEvent
              const sel = (arc && (arc.meta || arc)) || null;
              // log to console for debugging: click payload & detected type
              try {
                // console.debug will be visible in browser devtools
                // eslint-disable-next-line no-console
                console.debug("Globe arc clicked:", { arc, meta: arc && arc.meta, sel });
              } catch (e) {}
              setSelectedArc(sel);
            }}
          />
        </div>

        {selectedArc && (() => {
          const sel = selectedArc || {};
          const { fromPos, toPos } = computeBadgePositions(sel);
          const rawDisplayType = getDisplayType(sel);
          const displayType = shortType(rawDisplayType);

          return (
            <>
              {/* FROM badge: country + small Type line */}
              <div
                style={{
                  position: "absolute",
                  zIndex: 40,
                  pointerEvents: "none",
                  minWidth: 120,
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "rgba(2,6,23,0.9)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  color: "#ffffff",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
                  ...fromPos,
                }}
              >
                <div style={{ fontSize: 10, opacity: 0.7 }}>FROM</div>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {sel && (sel.sourceCountry || sel.sourceIp || (sel.originalEvent && (sel.originalEvent.sourceCountry || sel.originalEvent.sourceIp))) ? (sel.sourceCountry || sel.sourceIp || (sel.originalEvent && (sel.originalEvent.sourceCountry || sel.originalEvent.sourceIp))) : "Unknown"}
                </div>
                <div style={{ marginTop: 4, fontSize: 10, opacity: 0.85, fontWeight: 600, color: "#f3f4f6" }}>
                  Type: {displayType}
                </div>
              </div>

              {/* TO badge: only country */}
              <div
                style={{
                  position: "absolute",
                  zIndex: 40,
                  pointerEvents: "none",
                  minWidth: 96,
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: "rgba(2,6,23,0.9)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  color: "#ffffff",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
                  ...toPos,
                }}
              >
                <div style={{ fontSize: 10, opacity: 0.7 }}>TO</div>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {sel && (sel.targetCountry || sel.targetIp || (sel.originalEvent && (sel.originalEvent.targetCountry || sel.originalEvent.targetIp))) ? (sel.targetCountry || sel.targetIp || (sel.originalEvent && (sel.originalEvent.targetCountry || sel.originalEvent.targetIp))) : "Unknown"}
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
