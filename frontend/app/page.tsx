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
  algorithm_used?: string;
  telemetry?: {
    computed_team_elo?: number;
    opponent_elo?: number;
    elo_diff?: number;
    dynamic_hca?: number;
    is_confident_pick?: boolean;
    conf_win_rate_home?: number;
    div_win_rate_home?: number;
    is_division_leader?: boolean;
  };
}

interface StandingRecord {
  TeamName: string;
  TeamCity: string;
  Conference: string;
  WINS: number;
  LOSSES: number;
  WinPCT: number;
  strCurrentStreak: string;
}

interface RecentGameRecord {
  game_id: string;
  matchup: string;
  game_date: string;
  wl: string;
}

// NBA Team Colors mapping for rich visual cues (NBA 2K style)
const TEAM_COLORS: Record<string, { primary: string; secondary: string; text: string }> = {
  ATL: { primary: "#C1D32F", secondary: "#E03A3E", text: "#FFFFFF" },
  BOS: { primary: "#007A33", secondary: "#BA9653", text: "#FFFFFF" },
  BKN: { primary: "#000000", secondary: "#FFFFFF", text: "#FFFFFF" },
  CHA: { primary: "#1D1160", secondary: "#00788C", text: "#FFFFFF" },
  CHI: { primary: "#CE1141", secondary: "#000000", text: "#FFFFFF" },
  CLE: { primary: "#860038", secondary: "#FDBB30", text: "#FFFFFF" },
  DAL: { primary: "#00538C", secondary: "#B8C4CA", text: "#FFFFFF" },
  DEN: { primary: "#0E2240", secondary: "#FEC524", text: "#FFFFFF" },
  DET: { primary: "#C8102E", secondary: "#1D428A", text: "#FFFFFF" },
  GSW: { primary: "#1D428A", secondary: "#FFC72C", text: "#FFFFFF" },
  HOU: { primary: "#CE1141", secondary: "#000000", text: "#FFFFFF" },
  IND: { primary: "#002D62", secondary: "#FDBB30", text: "#FFFFFF" },
  LAC: { primary: "#C8102E", secondary: "#1D428A", text: "#FFFFFF" },
  LAL: { primary: "#552583", secondary: "#FDB927", text: "#FFFFFF" },
  MEM: { primary: "#5D76A9", secondary: "#12173F", text: "#FFFFFF" },
  MIA: { primary: "#98002E", secondary: "#F9A01B", text: "#FFFFFF" },
  MIL: { primary: "#00471B", secondary: "#EEE1C6", text: "#FFFFFF" },
  MIN: { primary: "#0C2340", secondary: "#236192", text: "#FFFFFF" },
  NOP: { primary: "#0C2340", secondary: "#C8102E", text: "#FFFFFF" },
  NYK: { primary: "#006BB6", secondary: "#F58426", text: "#FFFFFF" },
  OKC: { primary: "#007AC1", secondary: "#EF3B24", text: "#FFFFFF" },
  ORL: { primary: "#0077C0", secondary: "#C4CED4", text: "#FFFFFF" },
  PHI: { primary: "#006BB6", secondary: "#ED174C", text: "#FFFFFF" },
  PHX: { primary: "#1D1160", secondary: "#E56020", text: "#FFFFFF" },
  POR: { primary: "#E03A3E", secondary: "#000000", text: "#FFFFFF" },
  SAC: { primary: "#5A2D81", secondary: "#63727A", text: "#FFFFFF" },
  SAS: { primary: "#C4CED4", secondary: "#000000", text: "#000000" },
  TOR: { primary: "#CE1141", secondary: "#000000", text: "#FFFFFF" },
  UTA: { primary: "#002B5C", secondary: "#F9A01B", text: "#FFFFFF" },
  WAS: { primary: "#002B5C", secondary: "#E31837", text: "#FFFFFF" }
};

const TEAM_IDS: Record<string, string> = {
  ATL: "1610612737", BOS: "1610612738", BKN: "1610612751", CHA: "1610612766", CHI: "1610612741",
  CLE: "1610612739", DAL: "1610612742", DEN: "1610612743", DET: "1610612765", GSW: "1610612744",
  HOU: "1610612745", IND: "1610612754", LAC: "1610612746", LAL: "1610612747", MEM: "1610612763",
  MIA: "1610612748", MIL: "1610612749", MIN: "1610612750", NOP: "1610612740", NYK: "1610612752",
  OKC: "1610612760", ORL: "1610612753", PHI: "1610612755", PHX: "1610612756", POR: "1610612757",
  SAC: "1610612758", SAS: "1610612759", TOR: "1610612761", UTA: "1610612762", WAS: "1610612764"
};

const NBA_TEAMS = [
  { id: 'ATL', name: 'Atlanta Hawks', conf: 'East' },
  { id: 'BOS', name: 'Boston Celtics', conf: 'East' },
  { id: 'BKN', name: 'Brooklyn Nets', conf: 'East' },
  { id: 'CHA', name: 'Charlotte Hornets', conf: 'East' },
  { id: 'CHI', name: 'Chicago Bulls', conf: 'East' },
  { id: 'CLE', name: 'Cleveland Cavaliers', conf: 'East' },
  { id: 'DAL', name: 'Dallas Mavericks', conf: 'West' },
  { id: 'DEN', name: 'Denver Nuggets', conf: 'West' },
  { id: 'DET', name: 'Detroit Pistons', conf: 'East' },
  { id: 'GSW', name: 'Golden State Warriors', conf: 'West' },
  { id: 'HOU', name: 'Houston Rockets', conf: 'West' },
  { id: 'IND', name: 'Indiana Pacers', conf: 'East' },
  { id: 'LAC', name: 'Los Angeles Clippers', conf: 'West' },
  { id: 'LAL', name: 'Los Angeles Lakers', conf: 'West' },
  { id: 'MEM', name: 'Memphis Grizzlies', conf: 'West' },
  { id: 'MIA', name: 'Miami Heat', conf: 'East' },
  { id: 'MIL', name: 'Milwaukee Bucks', conf: 'East' },
  { id: 'MIN', name: 'Minnesota Timberwolves', conf: 'West' },
  { id: 'NOP', name: 'New Orleans Pelicans', conf: 'West' },
  { id: 'NYK', name: 'New York Knicks', conf: 'East' },
  { id: 'OKC', name: 'Oklahoma Thunder', conf: 'West' },
  { id: 'ORL', name: 'Orlando Magic', conf: 'East' },
  { id: 'PHI', name: 'Philadelphia 76ers', conf: 'East' },
  { id: 'PHX', name: 'Phoenix Suns', conf: 'West' },
  { id: 'POR', name: 'Portland Trail Blazers', conf: 'West' },
  { id: 'SAC', name: 'Sacramento Kings', conf: 'West' },
  { id: 'SAS', name: 'San Antonio Spurs', conf: 'West' },
  { id: 'TOR', name: 'Toronto Raptors', conf: 'East' },
  { id: 'UTA', name: 'Utah Jazz', conf: 'West' },
  { id: 'WAS', name: 'Washington Wizards', conf: 'East' }
];

const TEAM_NAME_TO_ID: Record<string, string> = {
  "Hawks": "ATL", "Celtics": "BOS", "Nets": "BKN", "Hornets": "CHA", "Bulls": "CHI",
  "Cavaliers": "CLE", "Mavericks": "DAL", "Nuggets": "DEN", "Pistons": "DET", "Warriors": "GSW",
  "Rockets": "HOU", "Pacers": "IND", "Clippers": "LAC", "Lakers": "LAL", "Grizzlies": "MEM",
  "Heat": "MIA", "Bucks": "MIL", "Timberwolves": "MIN", "Pelicans": "NOP", "Knicks": "NYK",
  "Thunder": "OKC", "Magic": "ORL", "76ers": "PHI", "Suns": "PHX", "Trail Blazers": "POR",
  "Kings": "SAC", "Spurs": "SAS", "Raptors": "TOR", "Jazz": "UTA", "Wizards": "WAS"
};

export default function Home() {
  const [data, setData] = useState<PredictionResult | null>(null);
  const [standings, setStandings] = useState<StandingRecord[]>([]);
  const [recentGames, setRecentGames] = useState<RecentGameRecord[]>([]);
  const [rawRecentGames, setRawRecentGames] = useState<RecentGameRecord[]>([]);
  const [gamesDisplayMode, setGamesDisplayMode] = useState<"random" | "recent">("random");
  const [upcomingGames, setUpcomingGames] = useState<any[]>([]);
  const [nbaStatus, setNbaStatus] = useState<string>("OFF-SEASON");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<"online" | "offline" | "checking">("online");
  const [standingsSeason, setStandingsSeason] = useState<string>("2025-26");

  // Selection states
  const [awayTeam, setAwayTeam] = useState<string>("BOS");
  const [homeTeam, setHomeTeam] = useState<string>("LAL");

  // Custom Dropdown states
  const [awayDropdownOpen, setAwayDropdownOpen] = useState(false);
  const [homeDropdownOpen, setHomeDropdownOpen] = useState(false);

  // Fetch prediction and other details
  const fetchData = useCallback(async (overrideHome?: string, overrideAway?: string) => {
    setIsRefreshing(true);
    const finalHome = overrideHome || homeTeam;
    const finalAway = overrideAway || awayTeam;
    try {
      const url = `http://127.0.0.1:8000/predict?home_team=${finalHome}&away_team=${finalAway}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const json = await response.json();
      if (json.error) {
        throw new Error(json.error);
      }
      setData(json as PredictionResult);
      setError(null);
      setServiceStatus("online");
    } catch (err: any) {
      console.error("Failed to fetch prediction:", err);
      setError(err.message || "Unable to connect to the FastAPI prediction service.");
      setServiceStatus("offline");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [homeTeam, awayTeam]);

  // Fetch schedule
  const fetchScheduleData = useCallback(async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/schedule?season=2025-26&test_season=2024-25");
      if (response.ok) {
        const json = await response.json();
        if (json.status === "success" && json.games) {
          setUpcomingGames(json.games);
          const isSeasonActive = json.games.some((g: any) => g.status === "LIVE" || g.status === "UPCOMING");
          setNbaStatus(isSeasonActive ? "IN-SEASON" : "OFF-SEASON");
        }
      }
    } catch (err) {
      console.error("Failed to fetch schedule:", err);
    }
  }, []);

  const handlePredictUpcoming = (home: string, away: string) => {
    setHomeTeam(home);
    setAwayTeam(away);
    fetchData(home, away);
  };

  // Fetch standings
  const fetchStandingsData = useCallback(async (season: string) => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/standings?season=${season}`);
      if (response.ok) {
        const json = await response.json();
        if (json.status === "success" && json.standings) {
          setStandings(json.standings);
        }
      }
    } catch (err) {
      console.error("Failed to fetch standings:", err);
    }
  }, []);

  // Fetch recent games
  const fetchRecentGamesData = useCallback(async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/recent_games?num_games=80&season=2025-26");
      if (response.ok) {
        const json = await response.json();
        if (json.status === "success" && json.games) {
          setRawRecentGames(json.games);
          // Keep it randomized/shuffled by default as requested
          const shuffled = [...json.games].sort(() => Math.random() - 0.5);
          setRecentGames(shuffled);
          setGamesDisplayMode("random");
        }
      }
    } catch (err) {
      console.error("Failed to fetch recent games:", err);
    }
  }, []);

  const handleShowRandomGames = () => {
    const shuffled = [...rawRecentGames].sort(() => Math.random() - 0.5);
    setRecentGames(shuffled);
    setGamesDisplayMode("random");
  };

  const handleShowRecentGames = () => {
    setRecentGames(rawRecentGames);
    setGamesDisplayMode("recent");
  };

  // Check API health periodically
  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/schedule?num_games=1");
      if (response.ok) {
        setServiceStatus("online");
      } else {
        setServiceStatus("offline");
      }
    } catch {
      setServiceStatus("offline");
    }
  }, []);

  const handleSwapTeams = () => {
    const temp = homeTeam;
    setHomeTeam(awayTeam);
    setAwayTeam(temp);
  };

  // Fetch prediction automatically whenever teams change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch general league data once on mount
  useEffect(() => {
    fetchRecentGamesData();
    fetchScheduleData();
  }, [fetchRecentGamesData, fetchScheduleData]);

  useEffect(() => {
    fetchStandingsData(standingsSeason);
  }, [standingsSeason, fetchStandingsData]);

  useEffect(() => {
    const timer = setInterval(checkStatus, 30000);
    return () => clearInterval(timer);
  }, [checkStatus]);

  const getStandingForTeam = (teamAbbr: string) => {
    const teamNameKey = Object.keys(TEAM_NAME_TO_ID).find(key => TEAM_NAME_TO_ID[key] === teamAbbr);
    if (!teamNameKey) return null;
    return standings.find(s => s.TeamName === teamNameKey);
  };

  // Calculations for probabilities
  let homeProb = 50;
  let awayProb = 50;
  let predictedWinner = "";
  let confidenceVal = 0;

  if (data) {
    confidenceVal = data.win_probability;
    if (data.prediction === "WIN") {
      predictedWinner = homeTeam;
      homeProb = data.win_probability;
      awayProb = Math.round((100 - data.win_probability) * 100) / 100;
    } else {
      predictedWinner = awayTeam;
      awayProb = data.win_probability;
      homeProb = Math.round((100 - data.win_probability) * 100) / 100;
    }
  }

  // Find team colors
  const homeColors = TEAM_COLORS[homeTeam] || { primary: "#1D428A", secondary: "#C9082A", text: "#FFFFFF" };
  const awayColors = TEAM_COLORS[awayTeam] || { primary: "#C9082A", secondary: "#1D428A", text: "#FFFFFF" };

  const getTeamName = (id: string) => {
    return NBA_TEAMS.find(t => t.id === id)?.name || id;
  };

  // Standings split
  const eastStandings = standings
    .filter(s => s.Conference === "East")
    .sort((a, b) => b.WinPCT - a.WinPCT);
  const westStandings = standings
    .filter(s => s.Conference === "West")
    .sort((a, b) => b.WinPCT - a.WinPCT);

  return (
    <div className="relative min-h-screen bg-[#07070a] text-zinc-100 font-sans flex flex-col items-center justify-between p-4 md:p-8 select-none">

      {/* Ambient background glows */}
      <div className="absolute top-[-100px] left-1/4 w-[600px] h-[600px] bg-blue-900/5 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-100px] right-1/4 w-[600px] h-[600px] bg-red-900/5 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* ── HEADER ── */}
      <header className="w-full max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4 py-5 border-b border-zinc-800/80 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              NBA: Prediction and Analysis
              <span className="px-2 py-0.5 text-[10px] font-extrabold text-blue-400 bg-blue-950/60 rounded-full border border-blue-800/40">
                v10.0
              </span>
            </h1>
            <p className="text-xs text-zinc-500 font-semibold tracking-wider uppercase">Zero-API Inference Engine & Diagnostic Interface</p>
          </div>
        </div>

        {/* Minimal status indicator */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-800 bg-[#0f0f13] text-zinc-400">
            <span className={`relative flex h-2 w-2`}>
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${serviceStatus === "online" ? "bg-emerald-400" : "bg-red-400"
                }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${serviceStatus === "online" ? "bg-emerald-500" : "bg-red-500"
                }`}></span>
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest">
              {serviceStatus === "online" ? "API Connection Online" : "API Connection Offline"}
            </span>
          </div>
        </div>
      </header>

      {/* ── MAIN LAYOUT ── */}
      <main className="w-full max-w-7xl flex-1 flex flex-col justify-start py-6 md:py-8 gap-8 z-10">

        {/* Sleek Matchup Selector Bar (Always visible, positioned right above the forecast/results grid) */}
        <div className="w-full bg-[#111116] border border-zinc-800/80 rounded-2xl p-4 md:p-6 shadow-2xl relative z-30">
          <div className="grid grid-cols-1 md:grid-cols-7 gap-6 items-center">

            {/* AWAY TEAM COLUMN */}
            <div className="md:col-span-3 relative">
              <div className="text-[10px] text-zinc-500 font-black tracking-widest uppercase mb-1.5">Away Franchise</div>
              <div className="relative w-full">
                <button
                  onClick={() => { setAwayDropdownOpen(!awayDropdownOpen); setHomeDropdownOpen(false); }}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-2xl px-6 py-4.5 text-base md:text-lg font-black text-zinc-100 flex items-center justify-between hover:bg-zinc-800/80 transition-colors"
                >
                  <span className="flex items-center gap-4">
                    {TEAM_IDS[awayTeam] ? (
                      <img
                        src={`https://cdn.nba.com/logos/nba/${TEAM_IDS[awayTeam]}/global/L/logo.svg`}
                        alt={`${awayTeam} Logo`}
                        className="w-14 h-14 object-contain transition-transform duration-300 hover:scale-110"
                      />
                    ) : (
                      <span className="w-14 h-14 rounded-full flex items-center justify-center font-black text-lg text-white" style={{ backgroundColor: awayColors.primary }}>{awayTeam}</span>
                    )}
                    <span>{getTeamName(awayTeam)} ({awayTeam})</span>
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-zinc-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>

                {awayDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-xl max-h-60 overflow-y-auto z-30 shadow-2xl">
                    {NBA_TEAMS.map((team) => (
                      <button
                        key={`away-sel-${team.id}`}
                        onClick={() => {
                          setAwayTeam(team.id);
                          setAwayDropdownOpen(false);
                        }}
                        disabled={team.id === homeTeam}
                        className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-zinc-800 transition-colors flex items-center justify-between ${team.id === awayTeam ? "bg-zinc-800 text-white" : "text-zinc-400"
                          } ${team.id === homeTeam ? "opacity-30 cursor-not-allowed" : ""}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TEAM_COLORS[team.id]?.primary }} />
                          {team.name}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">{team.conf}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* VS & ACTION CONTROLS */}
            <div className="md:col-span-1 flex flex-col items-center justify-center gap-2">
              <button
                onClick={() => fetchData()}
                disabled={isRefreshing || serviceStatus !== "online" || homeTeam === awayTeam}
                className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-blue-700 to-red-600 hover:from-blue-600 hover:to-red-500 text-white shadow-xl disabled:opacity-40 transition-all active:scale-95 duration-200 w-full text-center"
              >
                {isRefreshing ? "SIMULATING..." : "SIMULATE"}
              </button>
              <button
                onClick={handleSwapTeams}
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 text-zinc-400 hover:text-white transition-all duration-200 flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-wider active:scale-95 cursor-pointer w-full"
              >
                SWAP
              </button>
            </div>

            {/* HOME TEAM COLUMN */}
            <div className="md:col-span-3 relative">
              <div className="text-[10px] text-zinc-500 font-black tracking-widest uppercase mb-1.5">Home Franchise</div>
              <div className="relative w-full">
                <button
                  onClick={() => { setHomeDropdownOpen(!homeDropdownOpen); setAwayDropdownOpen(false); }}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-2xl px-6 py-4.5 text-base md:text-lg font-black text-zinc-100 flex items-center justify-between hover:bg-zinc-800/80 transition-colors"
                >
                  <span className="flex items-center gap-4">
                    {TEAM_IDS[homeTeam] ? (
                      <img
                        src={`https://cdn.nba.com/logos/nba/${TEAM_IDS[homeTeam]}/global/L/logo.svg`}
                        alt={`${homeTeam} Logo`}
                        className="w-14 h-14 object-contain transition-transform duration-300 hover:scale-110"
                      />
                    ) : (
                      <span className="w-14 h-14 rounded-full flex items-center justify-center font-black text-lg text-white" style={{ backgroundColor: homeColors.primary }}>{homeTeam}</span>
                    )}
                    <span>{getTeamName(homeTeam)} ({homeTeam})</span>
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-zinc-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>

                {homeDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-xl max-h-60 overflow-y-auto z-30 shadow-2xl">
                    {NBA_TEAMS.map((team) => (
                      <button
                        key={`home-sel-${team.id}`}
                        onClick={() => {
                          setHomeTeam(team.id);
                          setHomeDropdownOpen(false);
                        }}
                        disabled={team.id === awayTeam}
                        className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-zinc-800 transition-colors flex items-center justify-between ${team.id === homeTeam ? "bg-zinc-800 text-white" : "text-zinc-400"
                          } ${team.id === awayTeam ? "opacity-30 cursor-not-allowed" : ""}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TEAM_COLORS[team.id]?.primary }} />
                          {team.name}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">{team.conf}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── PREDICTION RESULTS & TELEMETRY SECTION ── */}
        {loading ? (
          <div className="w-full py-16 flex flex-col items-center justify-center gap-4 bg-[#111116] border border-zinc-800/80 rounded-2xl">
            <div className="w-10 h-10 rounded-full border-2 border-zinc-800 border-t-blue-500 animate-spin" />
            <p className="text-[10px] font-black tracking-widest text-zinc-500 uppercase animate-pulse">Fitting estimators & reconstructing EMA rolling metrics...</p>
          </div>
        ) : error ? (
          <div className="w-full p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-md text-center flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-zinc-200">Prediction Pipeline Error</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">{error}</p>
            </div>
            <button
              onClick={fetchData}
              className="px-5 py-2 rounded-lg text-xs font-bold bg-zinc-800 text-white hover:bg-zinc-700 transition-colors border border-zinc-700/80"
            >
              Retry Prediction
            </button>
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">

            {/* OVERALL MATCHUP PREDICTION CARD & JUSTIFICATION (8 COLS) */}
            <div className="lg:col-span-8 flex flex-col gap-6">

              {/* Main Prediction Graph Card */}
              <div className="relative rounded-2xl bg-gradient-to-br from-[#0c0c11] to-[#12121b] border border-zinc-800/80 p-5 md:p-6 flex flex-col justify-between overflow-hidden shadow-2xl">

                {/* Ambient Dual-Team Corner Glows */}
                <div
                  className="absolute top-0 left-0 w-80 h-80 rounded-full blur-[90px] pointer-events-none opacity-[0.16] transition-all duration-700 -translate-y-24 -translate-x-24"
                  style={{
                    backgroundColor: awayColors.primary
                  }}
                />
                <div
                  className="absolute bottom-0 right-0 w-80 h-80 rounded-full blur-[90px] pointer-events-none opacity-[0.16] transition-all duration-700 translate-y-24 translate-x-24"
                  style={{
                    backgroundColor: homeColors.primary
                  }}
                />

                <div className="flex items-center justify-between border-b border-zinc-850 pb-4 z-10">
                  <span className="text-[10px] font-black tracking-widest text-zinc-500 uppercase">
                    PROBABILITY FORECAST
                  </span>

                  {/* High Confidence Pick indicator */}
                  {data.telemetry?.is_confident_pick ? (
                    <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded-full animate-pulse">
                      ★ High Confidence Pick
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 rounded-full">
                      Standard Variance
                    </span>
                  )}
                </div>

                {/* Tug-Of-War Dynamic Bar Graph */}
                <div className="my-8 z-10 space-y-4">
                  <div className="flex justify-between items-baseline text-xs font-black uppercase tracking-wider text-zinc-300">
                    <span style={{ color: awayColors.primary }}>{getTeamName(awayTeam)}</span>
                    <span style={{ color: homeColors.primary }}>{getTeamName(homeTeam)}</span>
                  </div>

                  <div className="w-full bg-[#1e1e24] rounded-full h-8 overflow-hidden flex relative border border-zinc-800/80 p-[2px]">
                    <div
                      className="h-full rounded-l-full transition-all duration-700 flex items-center justify-start pl-3 text-xs font-black"
                      style={{
                        width: `${awayProb}%`,
                        backgroundColor: awayColors.primary,
                        color: awayColors.text
                      }}
                    >
                      {awayProb >= 20 && <span>{awayProb.toFixed(1)}%</span>}
                    </div>
                    <div
                      className="h-full rounded-r-full transition-all duration-700 flex items-center justify-end pr-3 text-xs font-black"
                      style={{
                        width: `${homeProb}%`,
                        backgroundColor: homeColors.primary,
                        color: homeColors.text
                      }}
                    >
                      {homeProb >= 20 && <span>{homeProb.toFixed(1)}%</span>}
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-zinc-500 font-bold tracking-wider">
                    <span>AWAY WIN RATIO: {awayProb.toFixed(1)}%</span>
                    <span>HOME WIN RATIO: {homeProb.toFixed(1)}%</span>
                  </div>
                </div>

                {/* Matchup telemetry details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-zinc-850 pt-5 z-10 text-xs">
                  <div className="space-y-1">
                    <span className="text-zinc-500 font-black text-[9px] uppercase tracking-wider block">PREDICTED WINNER</span>
                    <span className="font-extrabold text-sm flex items-center gap-1.5" style={{ color: TEAM_COLORS[predictedWinner]?.primary }}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TEAM_COLORS[predictedWinner]?.primary }} />
                      {predictedWinner}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-zinc-500 font-black text-[9px] uppercase tracking-wider block">ELO GAP</span>
                    <span className="font-extrabold text-sm text-zinc-200">
                      {data.telemetry?.elo_diff !== undefined ? `${data.telemetry.elo_diff > 0 ? "+" : ""}${data.telemetry.elo_diff.toFixed(1)}` : "N/A"}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-zinc-500 font-black text-[9px] uppercase tracking-wider block">EST. ACCURACY</span>
                    <span className="font-extrabold text-sm text-blue-400">{data.accuracy}%</span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-zinc-500 font-black text-[9px] uppercase tracking-wider block">TARGET DATE</span>
                    <span className="font-extrabold text-sm text-zinc-400 font-mono">{data.game_date}</span>
                  </div>
                </div>

              </div>

              {/* Justification & Stats Comparison Card */}
              <div className="rounded-2xl bg-[#0f0f14] border border-zinc-800/80 p-5 md:p-6 flex flex-col gap-5 shadow-2xl relative">
                <div className="border-b border-zinc-850 pb-3 flex items-center justify-between">
                  <h2 className="text-xs font-black tracking-widest uppercase text-zinc-400 flex items-center gap-2">
                    <span className="w-1.5 h-3 bg-red-600 rounded-sm" />
                    Prediction Breakdown & Justification
                  </h2>
                  <span className="text-[9px] font-black uppercase text-zinc-500">Inference Analysis</span>
                </div>



                {/* Graphical Comparison Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">

                  {/* Wins / Record Comparison */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] text-zinc-500 font-black uppercase tracking-wider">
                      <span>{awayTeam} Record</span>
                      <span>Season Win Rate</span>
                      <span>{homeTeam} Record</span>
                    </div>
                    {(() => {
                      const homeRecord = getStandingForTeam(homeTeam);
                      const awayRecord = getStandingForTeam(awayTeam);
                      const homeWinPCT = homeRecord ? homeRecord.WinPCT * 100 : 50;
                      const awayWinPCT = awayRecord ? awayRecord.WinPCT * 100 : 50;
                      return (
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-xs font-bold text-zinc-200">
                            <span>{awayRecord ? `${awayRecord.WINS}-${awayRecord.LOSSES}` : "N/A"}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">{(awayWinPCT).toFixed(1)}% vs {(homeWinPCT).toFixed(1)}%</span>
                            <span>{homeRecord ? `${homeRecord.WINS}-${homeRecord.LOSSES}` : "N/A"}</span>
                          </div>
                          <div className="w-full bg-[#1e1e24] h-2 rounded-full overflow-hidden flex p-[1px]">
                            <div className="h-full rounded-l-full" style={{ width: `${awayWinPCT}%`, backgroundColor: awayColors.primary }} />
                            <div className="h-full rounded-r-full" style={{ width: `${homeWinPCT}%`, backgroundColor: homeColors.primary }} />
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* ELO Rating Comparison (with Home Court Highlight) */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] text-zinc-500 font-black uppercase tracking-wider">
                      <span>{awayTeam} ELO</span>
                      <span>ELO with Home Boost (+80)</span>
                      <span>{homeTeam} ELO</span>
                    </div>
                    {(() => {
                      const awayElo = data.telemetry?.opponent_elo || 1500;
                      const homeEloRaw = data.telemetry?.computed_team_elo || 1500;
                      const homeEloBoosted = homeEloRaw + (data.telemetry?.dynamic_hca || 80);

                      // Normalize for bar (min 1300, max 1800)
                      const norm = (v: number) => Math.min(Math.max((v - 1300) / 500 * 100, 5), 95);

                      return (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center font-bold text-zinc-200">
                            <span>{Math.round(awayElo)}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              Raw: {Math.round(homeEloRaw)} ELO
                            </span>
                            <span style={{ color: homeColors.primary }} className="font-extrabold">
                              {Math.round(homeEloBoosted)} ELO ★
                            </span>
                          </div>

                          <div className="space-y-1">
                            {/* Away Elo Bar */}
                            <div className="flex items-center gap-2">
                              <span className="w-8 text-[9px] text-zinc-500 font-bold uppercase tracking-wider font-mono">{awayTeam}</span>
                              <div className="flex-1 bg-zinc-900 h-1.5 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${norm(awayElo)}%`, backgroundColor: awayColors.primary }} />
                              </div>
                            </div>
                            {/* Home Elo Boosted Bar */}
                            <div className="flex items-center gap-2">
                              <span className="w-8 text-[9px] text-zinc-500 font-bold uppercase tracking-wider font-mono">{homeTeam}</span>
                              <div className="flex-1 bg-zinc-900 h-1.5 rounded-full overflow-hidden relative">
                                <div className="h-full rounded-full" style={{ width: `${norm(homeEloBoosted)}%`, backgroundColor: homeColors.primary }} />
                                {/* Highlight the +80 portion */}
                                <div
                                  className="absolute top-0 bottom-0 bg-yellow-500/80 animate-pulse"
                                  style={{
                                    left: `${norm(homeEloRaw)}%`,
                                    width: `${norm(homeEloBoosted) - norm(homeEloRaw)}%`
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                </div>

                {/* Additional contextual factors */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-zinc-900 text-[10px] font-mono text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Streak: <strong className="text-zinc-300 font-black">{getStandingForTeam(homeTeam)?.strCurrentStreak || "N/A"} (Home)</strong> vs <strong className="text-zinc-300 font-black">{getStandingForTeam(awayTeam)?.strCurrentStreak || "N/A"} (Away)</strong></span>
                  </div>
                  <div>
                    <span>* ELO Rating is dynamic and updates using exponential moving averages.</span>
                  </div>
                </div>

              </div>

            </div>

            {/* QUICK TELEMETRY PANEL (4 COLS) */}
            <div className="lg:col-span-4 flex flex-col gap-6">

              {/* Elo Metrics */}
              <div className="rounded-2xl bg-[#0f0f14] border border-zinc-800/80 p-5 flex flex-col justify-between shadow-xl">
                <div className="text-zinc-500 font-black uppercase tracking-widest text-[9px] border-b border-zinc-850 pb-2.5 mb-4">
                  COMPUTED ELO RATINGS
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: awayColors.primary }} />
                      {awayTeam}
                    </span>
                    <span className="text-sm font-black text-white font-mono">
                      {data.telemetry?.opponent_elo !== undefined ? Math.round(data.telemetry.opponent_elo) : "N/A"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: homeColors.primary }} />
                      {homeTeam}
                    </span>
                    <span className="text-sm font-black text-white font-mono">
                      {data.telemetry?.computed_team_elo !== undefined ? Math.round(data.telemetry.computed_team_elo) : "N/A"}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 transition-all duration-700"
                        style={{
                          width: `${Math.min(Math.max(((data.telemetry?.elo_diff || 0) + 150) / 300 * 100, 10), 90)}%`,
                          background: `linear-gradient(to right, ${awayColors.primary}, ${homeColors.primary})`
                        }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[8px] text-zinc-500 font-black uppercase tracking-wider font-mono">
                      <span>← {awayTeam} Adv</span>
                      <span>Elo Diff Balance</span>
                      <span>{homeTeam} Adv →</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Factors */}
              <div className="rounded-2xl bg-[#0f0f14] border border-zinc-800/80 p-5 flex flex-col justify-between shadow-xl">
                <div className="text-zinc-500 font-black uppercase tracking-widest text-[9px] border-b border-zinc-850 pb-2.5 mb-4">
                  DECISION TREE INFLUENCERS
                </div>

                <div className="space-y-2.5 text-xs text-zinc-400 font-mono">
                  <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                    <span className="text-zinc-500">Home Court Adv:</span>
                    <span className="text-zinc-200 font-bold">+{data.telemetry?.dynamic_hca ?? 80} Elo</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                    <span className="text-zinc-500">Conf. Win Rate:</span>
                    <span className="text-zinc-200 font-bold">
                      {data.telemetry?.conf_win_rate_home !== undefined ? `${(data.telemetry.conf_win_rate_home * 100).toFixed(0)}%` : "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Division Leader:</span>
                    <span className="text-zinc-200 font-bold">{data.telemetry?.is_division_leader ? "TRUE" : "FALSE"}</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        ) : null}

        {/* ── NBA SEASON STATUS & SCHEDULE BLOCK ── */}
        <div className="bg-[#0f0f14] border border-zinc-800/80 rounded-2xl p-5 md:p-6 shadow-xl flex flex-col">
          <div className="flex items-center justify-between border-b border-zinc-850 pb-3.5 mb-4">
            <h2 className="text-sm font-black tracking-widest uppercase text-white flex items-center gap-2">
              <span className="w-1.5 h-3 bg-indigo-600 rounded-sm" />
              NBA Season Status
            </h2>
            <div className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${nbaStatus === "IN-SEASON"
                ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/30"
                : "bg-amber-950/60 text-amber-400 border border-amber-800/30"
              }`}>
              {nbaStatus === "IN-SEASON" ? "In-Season (Active)" : "Off-Season"}
            </div>
          </div>

          <p className="text-xs text-zinc-400 mb-4 leading-relaxed font-semibold">
            {nbaStatus === "IN-SEASON"
              ? "The current NBA season is active. Real-time scheduled and upcoming games are shown below. Use the Predict button to simulate a matchup."
              : "The NBA is currently in the off-season. Showing historical simulation matches & fallback schedulers. You can still test predictions on any game!"}
          </p>

          {upcomingGames.length === 0 ? (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs font-semibold">
              <span>No scheduled games available.</span>
            </div>
          ) : (
            <div className="space-y-2.5 overflow-y-auto max-h-[300px] pr-1">
              {upcomingGames.slice(0, 5).map((game, idx) => {
                const awayColors = TEAM_COLORS[game.away_team] || { primary: "#555" };
                const homeColors = TEAM_COLORS[game.home_team] || { primary: "#555" };
                return (
                  <div
                    key={`upcoming-${game.game_id}-${idx}`}
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-zinc-950/40 border border-zinc-850/80 hover:border-zinc-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-zinc-500 font-mono">{game.game_date}</span>
                      <div className="flex items-center gap-1.5 text-xs font-black">
                        <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: `${awayColors.primary}20`, color: awayColors.primary }}>
                          {game.away_team}
                        </span>
                        <span className="text-zinc-600">@</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: `${homeColors.primary}20`, color: homeColors.primary }}>
                          {game.home_team}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handlePredictUpcoming(game.home_team, game.away_team)}
                      className="px-3 py-1 rounded-lg bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-all text-[9px] font-black uppercase tracking-widest cursor-pointer"
                    >
                      Predict
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── REAL LIFE STANDINGS & RECENT GAMES PANEL ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">

          {/* LEAGUE STANDINGS BLOCK */}
          <div className="bg-[#0f0f14] border border-zinc-800/80 rounded-2xl p-5 md:p-6 shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-3.5 mb-4">
              <h2 className="text-sm font-black tracking-widest uppercase text-white flex items-center gap-2">
                <span className="w-1.5 h-3 bg-blue-600 rounded-sm" />
                League Standings
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-zinc-500 font-black uppercase tracking-wider">Season:</span>
                <select
                  value={standingsSeason}
                  onChange={(e) => setStandingsSeason(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-[10px] font-black text-zinc-300 outline-none focus:border-zinc-750 cursor-pointer"
                >
                  <option value="2025-26">2025-26</option>
                  <option value="2024-25">2024-25</option>
                  <option value="2023-24">2023-24</option>
                </select>
              </div>
            </div>

            {standings.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-8 text-zinc-500 text-xs font-semibold">
                No standings data available. Make sure the API stands server is running.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* East Conference */}
                <div>
                  <h3 className="text-xs font-black text-zinc-400 mb-3 border-b border-zinc-900 pb-1.5 flex justify-between items-center">
                    <span>EAST CONFERENCE</span>
                    <span className="text-[10px] text-zinc-500">W-L</span>
                  </h3>
                  <div className="space-y-1.5 pr-1">
                    {eastStandings.map((team, idx) => {
                      const id = TEAM_NAME_TO_ID[team.TeamName] || "UNK";
                      const colors = TEAM_COLORS[id] || { primary: "#555" };
                      const isSelected = id === homeTeam || id === awayTeam;
                      return (
                        <div
                          key={`east-${idx}`}
                          className={`flex items-center justify-between py-1.5 px-2 rounded-lg text-xs transition-colors ${isSelected ? "bg-zinc-800/80 border border-zinc-700/50" : "hover:bg-zinc-900/60"
                            }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-bold text-zinc-500 w-4">{idx + 1}</span>
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors.primary }} />
                            <span className="font-extrabold text-zinc-300 truncate">{team.TeamName}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-zinc-400">{team.WINS}-{team.LOSSES}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-500 font-mono w-10 text-center">
                              {team.strCurrentStreak}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* West Conference */}
                <div>
                  <h3 className="text-xs font-black text-zinc-400 mb-3 border-b border-zinc-900 pb-1.5 flex justify-between items-center">
                    <span>WEST CONFERENCE</span>
                    <span className="text-[10px] text-zinc-500">W-L</span>
                  </h3>
                  <div className="space-y-1.5 pr-1">
                    {westStandings.map((team, idx) => {
                      const id = TEAM_NAME_TO_ID[team.TeamName] || "UNK";
                      const colors = TEAM_COLORS[id] || { primary: "#555" };
                      const isSelected = id === homeTeam || id === awayTeam;
                      return (
                        <div
                          key={`west-${idx}`}
                          className={`flex items-center justify-between py-1.5 px-2 rounded-lg text-xs transition-colors ${isSelected ? "bg-zinc-800/80 border border-zinc-700/50" : "hover:bg-zinc-900/60"
                            }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-bold text-zinc-500 w-4">{idx + 1}</span>
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors.primary }} />
                            <span className="font-extrabold text-zinc-300 truncate">{team.TeamName}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-zinc-400">{team.WINS}-{team.LOSSES}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-500 font-mono w-10 text-center">
                              {team.strCurrentStreak}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* RECENT LEAGUE GAMES BLOCK */}
          <div className="bg-[#0f0f14] border border-zinc-800/80 rounded-2xl p-5 md:p-6 shadow-xl flex flex-col gap-4 max-h-[580px]">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-3.5 mb-2">
              <h2 className="text-sm font-black tracking-widest uppercase text-white flex items-center gap-2">
                <span className="w-1.5 h-3 bg-red-600 rounded-sm" />
                Recent League Games
              </h2>
              <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-900">
                <button
                  onClick={handleShowRandomGames}
                  className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                    gamesDisplayMode === "random"
                      ? "bg-zinc-800 text-white shadow-sm"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Randomize
                </button>
                <button
                  onClick={handleShowRecentGames}
                  className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                    gamesDisplayMode === "recent"
                      ? "bg-zinc-800 text-white shadow-sm"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Recent Games
                </button>
              </div>
            </div>

            {recentGames.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-8 text-zinc-500 text-xs font-semibold">
                No recent game data available.
              </div>
            ) : (
              <div className="space-y-2.5 overflow-y-auto pr-1 flex-1 min-h-0">
                {recentGames.map((game, idx) => {
                  // Matchup e.g. "LAL @ GSW" or "CLE vs. DET"
                  const isAt = game.matchup.includes(" @ ");
                  const separator = isAt ? " @ " : " vs. ";
                  const parts = game.matchup.split(separator);
                  const team1 = parts[0]?.trim() || "UNK";
                  const team2 = parts[1]?.trim() || "UNK";

                  const awayAbbr = isAt ? team1 : team2;
                  const homeAbbr = isAt ? team2 : team1;

                  const awayColors = TEAM_COLORS[awayAbbr] || { primary: "#555" };
                  const homeColors = TEAM_COLORS[homeAbbr] || { primary: "#555" };

                  return (
                    <div
                      key={`game-${idx}`}
                      className="flex items-center justify-between py-2 px-3 rounded-xl bg-zinc-950/60 border border-zinc-850 hover:border-zinc-800 transition-colors"
                    >
                      <div className="flex items-center gap-4 text-xs font-black">
                        <span className="text-[10px] font-bold text-zinc-500 font-mono">{game.game_date}</span>

                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: `${awayColors.primary}20`, color: awayColors.primary }}>
                            {awayAbbr}
                          </span>
                          <span className="text-[10px] text-zinc-600">@</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: `${homeColors.primary}20`, color: homeColors.primary }}>
                            {homeAbbr}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-black ${game.wl === 'W'
                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/50'
                            : 'bg-rose-950/60 text-rose-400 border border-rose-900/50'
                          }`}>
                          {game.wl === 'W' ? 'HOME WIN' : 'AWAY WIN'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </main>

      {/* ── SYSTEM DIAGNOSTICS & TELEMETRY FOOTER ── */}
      <footer className="w-full max-w-7xl mt-8 pt-6 border-t border-zinc-900/60 flex flex-col gap-6 z-20">

        {/* Technical drawer panel */}
        <div className="w-full bg-[#0a0a0f] border border-zinc-900 rounded-xl p-4">
          <div className="text-[10px] font-black tracking-widest text-zinc-500 uppercase border-b border-zinc-900 pb-2 mb-3">
            ▲ SYSTEM DIAGNOSTICS & TELEMETRY CONSOLE
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-[10px] font-mono text-zinc-400">
            <div className="space-y-1">
              <span className="text-zinc-600 block font-bold">ALGORITHM</span>
              <span className="text-zinc-300 font-extrabold">{data?.algorithm_used || "XGBoost Classifier"}</span>
            </div>
            <div className="space-y-1">
              <span className="text-zinc-600 block font-bold">ESTIMATORS</span>
              <span className="text-zinc-300 font-extrabold">200 Decision Trees</span>
            </div>
            <div className="space-y-1">
              <span className="text-zinc-600 block font-bold">SENSORS INGESTED</span>
              <span className="text-zinc-300 font-extrabold">{data?.features_used || 0} columns</span>
            </div>
            <div className="space-y-1">
              <span className="text-zinc-600 block font-bold">TRAINING BASELINE</span>
              <span className="text-zinc-300 font-extrabold">{data?.training_samples.toLocaleString() || "0"} periods</span>
            </div>
            <div className="space-y-1">
              <span className="text-zinc-600 block font-bold">THRESHOLD LIMIT</span>
              <span className="text-zinc-300 font-extrabold">0.62 Conf.</span>
            </div>
            <div className="space-y-1">
              <span className="text-zinc-600 block font-bold">INFERENCE TYPE</span>
              <span className="text-zinc-300 font-extrabold">Zero-API Inference</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-zinc-500">
          <div>
            © {new Date().getFullYear()} NBA ML Analytical Engine. Standings & Schedule fetched live via nba_api.
          </div>
        </div>
      </footer>

    </div>
  );
}
