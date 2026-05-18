"use client";

import { useState, useEffect, useCallback } from "react";

interface PredictionResult {
  team: string;
  prediction: string;
  win_probability: number;
  accuracy: number;
  opponent: string;
  game_date: string;
  model: string;
  training_samples: number;
  features_used: number;
}

export default function Home() {
  const [data, setData] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<"online" | "offline" | "checking">("checking");

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("http://localhost:8000/predict");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const json = await response.json();
      setData(json);
      setError(null);
      setServiceStatus("online");
    } catch (err: any) {
      console.error("Failed to fetch prediction:", err);
      setError("Unable to connect to the FastAPI prediction service.");
      setServiceStatus("offline");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Keep checking API status
  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:8000/predict");
      if (response.ok) {
        setServiceStatus("online");
      } else {
        setServiceStatus("offline");
      }
    } catch {
      setServiceStatus("offline");
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(checkStatus, 15000);
    return () => clearInterval(timer);
  }, [checkStatus]);

  const isWin = data?.prediction === "WIN";

  return (
    <div className="relative min-h-screen bg-[#08070d] text-zinc-100 font-sans flex flex-col items-center justify-between p-4 md:p-8 overflow-hidden select-none">
      
      {/* ── AMBIENT GRADIENT SHADOWS ── */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-purple-900/10 rounded-full blur-[120px] pointer-events-none -z-10 animate-pulse duration-10000" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-yellow-950/10 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* ── HEADER ── */}
      <header className="w-full max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4 py-6 border-b border-zinc-800/60 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          {/* Cybernetic Lakers Badge Logo */}
          <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-[#552583] to-[#FDB927] p-[1.5px] shadow-[0_0_20px_rgba(85,37,131,0.3)]">
            <div className="w-full h-full bg-[#0a0910] rounded-[11px] flex items-center justify-center">
              <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FDB927] to-yellow-300">L</span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400">
                Lakers ML Predictor
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-semibold text-purple-400 bg-purple-950/50 rounded-full border border-purple-800/40">
                v7.0.0
              </span>
            </div>
            <p className="text-xs text-zinc-500 font-medium">Random Forest Inference Engine</p>
          </div>
        </div>

        {/* Microservice Endpoint Telemetry */}
        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Service URI</span>
            <span className="text-xs text-purple-400 font-mono">http://localhost:8000/predict</span>
          </div>

          {/* Status Pill */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border bg-zinc-900/80 backdrop-blur-md ${
            serviceStatus === "online" 
              ? "border-emerald-500/20 text-emerald-400" 
              : serviceStatus === "offline"
              ? "border-rose-500/20 text-rose-400"
              : "border-zinc-800 text-zinc-400"
          }`}>
            <span className={`relative flex h-2 w-2`}>
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                serviceStatus === "online" ? "bg-emerald-400" : serviceStatus === "offline" ? "bg-rose-400" : "bg-zinc-400"
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                serviceStatus === "online" ? "bg-emerald-500" : serviceStatus === "offline" ? "bg-rose-500" : "bg-zinc-500"
              }`}></span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider">
              {serviceStatus === "online" ? "Microservice Online" : serviceStatus === "offline" ? "Service Offline" : "Checking..."}
            </span>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="w-full max-w-6xl flex-1 flex flex-col justify-center py-8 md:py-12 gap-8 z-10">
        
        {loading ? (
          <div className="w-full py-24 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin" />
            <p className="text-sm font-semibold tracking-widest text-zinc-500 uppercase animate-pulse">Running ML Pipeline...</p>
          </div>
        ) : error ? (
          <div className="w-full max-w-xl mx-auto p-6 md:p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-md text-center flex flex-col items-center gap-6 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-zinc-200">Connection Error</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{error}</p>
            </div>
            <button
              onClick={fetchData}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold tracking-wide bg-gradient-to-r from-[#552583] to-[#7f3db8] text-white shadow-lg hover:shadow-purple-900/30 hover:scale-105 active:scale-95 transition-all duration-300 border border-purple-500/20"
            >
              Retry Connection
            </button>
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            
            {/* LEFT COLUMN: PRIMARY PREDICTION VERDICT */}
            <div className="lg:col-span-7 flex flex-col">
              <div className="relative flex-1 rounded-3xl bg-[#0e0d16]/75 border border-zinc-800/70 p-6 md:p-8 flex flex-col justify-between overflow-hidden shadow-2xl group hover:border-zinc-700/50 transition-all duration-500">
                
                {/* Visual Glow Indicator */}
                <div className={`absolute top-0 right-0 w-80 h-80 rounded-full blur-[100px] pointer-events-none opacity-20 transition-all duration-700 -translate-y-12 translate-x-12 ${
                  isWin ? "bg-emerald-500" : "bg-rose-500"
                }`} />

                {/* Card Title */}
                <div className="flex items-center justify-between z-10">
                  <span className="text-[11px] font-extrabold tracking-widest text-zinc-500 uppercase">
                    Primary Verdict Profile
                  </span>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isWin ? "bg-emerald-950/60 border border-emerald-800/40 text-emerald-400" : "bg-rose-950/60 border border-rose-800/40 text-rose-400"
                  }`}>
                    <span className="relative flex h-1.5 w-1.5">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        isWin ? "bg-emerald-400" : "bg-rose-400"
                      }`}></span>
                      <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                        isWin ? "bg-emerald-500" : "bg-rose-500"
                      }`}></span>
                    </span>
                    {data.prediction}
                  </div>
                </div>

                {/* Team & Opponent Block */}
                <div className="my-8 z-10 space-y-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-yellow-400/90 tracking-widest uppercase">Target Franchise</span>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-white">
                      {data.team}
                    </h2>
                  </div>
                  
                  <div className="flex items-center gap-4 py-3 px-4 rounded-2xl bg-zinc-950/60 border border-zinc-900/80 max-w-md">
                    <div className="p-2 rounded-lg bg-zinc-900 text-zinc-400 font-bold text-xs uppercase tracking-wider">vs</div>
                    <div>
                      <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Upcoming Opponent</p>
                      <p className="text-sm font-bold text-zinc-100">{data.opponent}</p>
                    </div>
                  </div>
                </div>

                {/* Primary Metric Outcome Indicator */}
                <div className="flex flex-col sm:flex-row items-end sm:items-center justify-between gap-6 z-10 border-t border-zinc-800/50 pt-6">
                  <div>
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                      Forecast Win probability
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-5xl font-black tracking-tight ${
                        isWin ? "text-emerald-400" : "text-rose-400"
                      }`}>
                        {data.win_probability}%
                      </span>
                      <span className="text-xs font-semibold text-zinc-400">confidence</span>
                    </div>
                  </div>

                  {/* Circular Radial Gauge */}
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="40"
                        cy="40"
                        r="34"
                        className="stroke-zinc-800"
                        strokeWidth="5"
                        fill="transparent"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="34"
                        className={`transition-all duration-1000 ${
                          isWin ? "stroke-emerald-500" : "stroke-rose-500"
                        }`}
                        strokeWidth="6"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 34}
                        strokeDashoffset={2 * Math.PI * 34 * (1 - data.win_probability / 100)}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute text-xs font-black text-white">
                      {Math.round(data.win_probability)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Performance Cards & Telemetry */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              
              {/* Stat Card 1: Accuracy */}
              <div className="relative rounded-2xl bg-[#0e0d16]/75 border border-zinc-800/70 p-6 flex flex-col justify-between overflow-hidden shadow-xl hover:border-zinc-700/50 transition-all duration-300">
                <div className="flex items-center justify-between text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                  <span>Model Accuracy</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-yellow-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="my-4 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-white tracking-tight">
                    {data.accuracy}%
                  </span>
                  <span className="text-xs text-zinc-400">on test data</span>
                </div>
                <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-yellow-500 h-1.5 rounded-full transition-all duration-1000"
                    style={{ width: `${data.accuracy}%` }}
                  />
                </div>
              </div>

              {/* Stat Card 2: Training Samples */}
              <div className="relative rounded-2xl bg-[#0e0d16]/75 border border-zinc-800/70 p-6 flex flex-col justify-between overflow-hidden shadow-xl hover:border-zinc-700/50 transition-all duration-300">
                <div className="flex items-center justify-between text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                  <span>Data Ingestion</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                </div>
                <div className="my-4">
                  <div className="text-3xl font-extrabold text-white tracking-tight">
                    {data.training_samples.toLocaleString()}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">Lakers games trained from historic ELO CSV dataset</p>
                </div>
              </div>

              {/* Stat Card 3: Model details & Config */}
              <div className="relative rounded-2xl bg-[#0e0d16]/75 border border-zinc-800/70 p-6 flex flex-col justify-between overflow-hidden shadow-xl hover:border-zinc-700/50 transition-all duration-300">
                <div className="flex items-center justify-between text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                  <span>Architecture Config</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  </svg>
                </div>
                <div className="mt-4 space-y-2.5 font-mono text-[11px] text-zinc-400">
                  <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                    <span className="text-zinc-500">Estimators:</span>
                    <span className="text-zinc-200">200 Decision Trees</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                    <span className="text-zinc-500">Features:</span>
                    <span className="text-zinc-200">{data.features_used} Ingested Sensors</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Game Target Date:</span>
                    <span className="text-zinc-200">{data.game_date}</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        ) : null}

        {/* ── ACTION CONTROLS ── */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <button
            onClick={fetchData}
            disabled={isRefreshing || serviceStatus !== "online"}
            className={`px-8 py-3.5 rounded-2xl font-bold tracking-wider text-sm shadow-xl flex items-center gap-3 transition-all duration-300 uppercase border ${
              serviceStatus !== "online"
                ? "bg-zinc-900/50 border-zinc-800/80 text-zinc-600 cursor-not-allowed"
                : "bg-gradient-to-r from-[#552583] via-purple-700 to-[#FDB927] hover:to-yellow-500 text-white hover:scale-105 active:scale-95 border-purple-500/20 hover:shadow-[0_0_30px_rgba(85,37,131,0.4)] cursor-pointer"
            }`}
          >
            {isRefreshing ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L22 4" />
              </svg>
            )}
            {isRefreshing ? "Re-fitting Estimators..." : "Re-Run Prediction Inference"}
          </button>
          
          <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest text-center">
            Clicking initiates zero-touch telemetry pull & random forest training sequence.
          </p>
        </div>

      </main>

      {/* ── FOOTER ── */}
      <footer className="w-full max-w-6xl py-6 border-t border-zinc-900/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-zinc-500 z-10">
        <div>
          © {new Date().getFullYear()} NBA Lakers Microservice Portfolio. All ELO Data pulled from FiveThirtyEight.
        </div>
        <div className="flex gap-4">
          <a href="#" className="hover:text-zinc-300 transition-colors">API Specs</a>
          <a href="#" className="hover:text-zinc-300 transition-colors">Documentation</a>
          <a href="#" className="hover:text-zinc-300 transition-colors">Support</a>
        </div>
      </footer>

    </div>
  );
}
