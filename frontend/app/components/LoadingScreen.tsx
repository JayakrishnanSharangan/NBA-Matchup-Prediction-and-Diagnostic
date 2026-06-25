"use client";

import { useEffect, useState } from "react";

// All 30 NBA team IDs for CDN logo URLs
const ALL_TEAMS = [
  { abbr: "ATL", id: "1610612737" }, { abbr: "BOS", id: "1610612738" },
  { abbr: "BKN", id: "1610612751" }, { abbr: "CHA", id: "1610612766" },
  { abbr: "CHI", id: "1610612741" }, { abbr: "CLE", id: "1610612739" },
  { abbr: "DAL", id: "1610612742" }, { abbr: "DEN", id: "1610612743" },
  { abbr: "DET", id: "1610612765" }, { abbr: "GSW", id: "1610612744" },
  { abbr: "HOU", id: "1610612745" }, { abbr: "IND", id: "1610612754" },
  { abbr: "LAC", id: "1610612746" }, { abbr: "LAL", id: "1610612747" },
  { abbr: "MEM", id: "1610612763" }, { abbr: "MIA", id: "1610612748" },
  { abbr: "MIL", id: "1610612749" }, { abbr: "MIN", id: "1610612750" },
  { abbr: "NOP", id: "1610612740" }, { abbr: "NYK", id: "1610612752" },
  { abbr: "OKC", id: "1610612760" }, { abbr: "ORL", id: "1610612753" },
  { abbr: "PHI", id: "1610612755" }, { abbr: "PHX", id: "1610612756" },
  { abbr: "POR", id: "1610612757" }, { abbr: "SAC", id: "1610612758" },
  { abbr: "SAS", id: "1610612759" }, { abbr: "TOR", id: "1610612761" },
  { abbr: "UTA", id: "1610612762" }, { abbr: "WAS", id: "1610612764" },
];

// Deterministic (seeded) layout — no Math.random to avoid hydration mismatch
const LOGO_CONFIGS = ALL_TEAMS.map((team, i) => {
  const a = (i * 37 + 13) % 100;
  const b = (i * 53 + 29) % 100;
  const c = (i * 71 + 7)  % 100;
  const d = (i * 83 + 41) % 100;
  const e = (i * 97 + 17) % 100;

  // Spread logos across the full viewport
  const xBand = (i % 6) / 5; // 0–1 in 6 columns
  const yBand = Math.floor(i / 6) / 4; // 0–1 in 5 rows

  return {
    ...team,
    x:    xBand * 85 + (a % 15),        // 0–100%
    y:    yBand * 85 + (b % 15),        // 0–100%
    size: 48 + (c % 40),               // 48–88px
    rotation: ((d % 40) - 20),         // -20 to +20 deg
    opacity: 0.18 + (e % 30) * 0.01,  // 0.18–0.48
    delay:   (i * 0.06) % 1.2,        // stagger in
    floatDuration: 3.5 + (i % 5) * 0.5, // 3.5–6.0s
    floatAmp: 8 + (i % 10) * 2,       // 8–26px float amplitude
  };
});

const LOADING_MESSAGES = [
  "BOOTING INFERENCE ENGINE...",
  "LOADING ELO MODELS...",
  "FETCHING LEAGUE METRICS...",
  "CALIBRATING CLASSIFIERS...",
  "RECONSTRUCTING ELO HISTORY...",
  "SYNCING TEAM ROSTERS...",
  "INITIALIZING XGBOOST...",
  "VALIDATING FEATURE SPACE...",
];

interface LoadingScreenProps {
  onComplete: () => void;
  minDurationMs?: number;
}

export default function LoadingScreen({
  onComplete,
  minDurationMs = 3200,
}: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [msgIdx, setMsgIdx]     = useState(0);
  const [show, setShow]         = useState(false);   // controls logo reveal
  const [exiting, setExiting]   = useState(false);   // controls fade-out

  useEffect(() => {
    // Slight delay so logos animate IN on mount
    const showTimer = setTimeout(() => setShow(true), 80);

    // Progress bar ticks
    const step = minDurationMs / 100;
    let p = 0;
    const progressInterval = setInterval(() => {
      p = Math.min(p + 1, 100);
      setProgress(p);
      if (p >= 100) clearInterval(progressInterval);
    }, step);

    // Cycle loading messages
    const msgInterval = setInterval(() => {
      setMsgIdx(i => (i + 1) % LOADING_MESSAGES.length);
    }, 520);

    // Trigger exit
    const doneTimer = setTimeout(() => {
      clearInterval(msgInterval);
      setExiting(true);
      setTimeout(onComplete, 650); // wait for CSS fade-out
    }, minDurationMs);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(doneTimer);
      clearInterval(progressInterval);
      clearInterval(msgInterval);
    };
  }, [minDurationMs, onComplete]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{
        zIndex: 99999,
        background: "#05070F",
        opacity: exiting ? 0 : 1,
        transition: "opacity 0.65s cubic-bezier(0.4,0,0.2,1)",
        pointerEvents: exiting ? "none" : "auto",
      }}
    >
      {/* ── Scattered NBA team logos ── */}
      {LOGO_CONFIGS.map((cfg, i) => (
        <div
          key={cfg.abbr}
          style={{
            position: "absolute",
            left: `${cfg.x}%`,
            top: `${cfg.y}%`,
            width: cfg.size,
            height: cfg.size,
            transform: `rotate(${cfg.rotation}deg)`,
            opacity: show ? cfg.opacity : 0,
            transition: `opacity 0.8s ease ${cfg.delay}s`,
            animationName: show ? "logo-float" : "none",
            animationDuration: `${cfg.floatDuration}s`,
            animationDelay: `${cfg.delay}s`,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            animationDirection: i % 2 === 0 ? "alternate" : "alternate-reverse",
            // Custom float amplitude via CSS var
          }}
        >
          <img
            src={`https://cdn.nba.com/logos/nba/${cfg.id}/global/L/logo.svg`}
            alt={cfg.abbr}
            width={cfg.size}
            height={cfg.size}
            style={{ objectFit: "contain", width: "100%", height: "100%" }}
          />
        </div>
      ))}

      {/* ── Center loading panel ── */}
      <div
        className="relative flex flex-col items-center gap-6 text-center px-8"
        style={{ zIndex: 10 }}
      >
        {/* Spinning conic gradient ring */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "conic-gradient(from 0deg, #C9082A 0%, #17408B 40%, #F9A01B 70%, #C9082A 100%)",
            WebkitMask:
              "radial-gradient(farthest-side, transparent calc(100% - 4px), #fff 0)",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #fff 0)",
            animationName: "spin-ring",
            animationDuration: "1.2s",
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
          }}
        />

        {/* Wordmark */}
        <div>
          <p
            style={{
              fontSize: 9,
              letterSpacing: "0.3em",
              color: "#64748b",
              fontFamily: "monospace",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            NBA ML INFERENCE ENGINE // V10.0
          </p>
          <h1
            style={{
              fontSize: "clamp(1.6rem, 4vw, 3rem)",
              fontWeight: 900,
              color: "#fff",
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            NBA Matchup
          </h1>
          <p
            style={{
              fontSize: "clamp(1rem, 2.5vw, 1.6rem)",
              fontWeight: 900,
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
              marginTop: 2,
            }}
          >
            Prediction &amp; Diagnostic
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ width: "min(380px, 80vw)" }}>
          <div
            style={{
              height: 2,
              background: "#1e293b",
              borderRadius: 0,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: "100%",
                width: `${progress}%`,
                background: "linear-gradient(to right, #C9082A, #17408B)",
                transition: "width 0.12s linear",
              }}
            />
            {/* Shimmer sweep */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: `${progress - 10}%`,
                width: "10%",
                height: "100%",
                background: "linear-gradient(to right, transparent, rgba(255,255,255,0.6), transparent)",
                transition: "left 0.12s linear",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <p
              key={msgIdx}
              style={{
                fontSize: 9,
                color: "#94a3b8",
                fontFamily: "monospace",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                animationName: "msg-fade",
                animationDuration: "0.3s",
                animationTimingFunction: "ease",
                animationFillMode: "both",
              }}
            >
              {LOADING_MESSAGES[msgIdx]}
            </p>
            <p
              style={{
                fontSize: 9,
                color: "#475569",
                fontFamily: "monospace",
                fontWeight: 700,
              }}
            >
              {progress}%
            </p>
          </div>
        </div>

        {/* Floating logo ticker strip at bottom */}
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            opacity: 0.35,
            marginTop: 12,
            overflow: "hidden",
            maxWidth: "min(500px, 90vw)",
          }}
        >
          {ALL_TEAMS.slice(0, 10).map(t => (
            <img
              key={t.abbr}
              src={`https://cdn.nba.com/logos/nba/${t.id}/global/L/logo.svg`}
              alt={t.abbr}
              style={{
                width: 22,
                height: 22,
                objectFit: "contain",
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
