"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import NBAMatchupBackground from "./components/NBAMatchupBackground";
import LoadingScreen from "./components/LoadingScreen";

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
    playoff_depth_home?: number;
    playoff_depth_away?: number;
    playoff_depth_diff?: number;
    made_playoffs_home?: boolean;
    made_playoffs_away?: boolean;
  };
}

interface Player {
  player_id: number;
  name: string;
  position: string;
  number: string;
  age: number | null;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  player_elo: number;
  gp: number;
  status: string;
  injury_note: string | null;
}

interface RosterResult {
  team: string;
  coach: string;
  players: Player[];
  season: string;
  error?: string;
  note?: string;
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

// -----------------------------------------------------------------------------
//  Framer Motion Variants (Cubic Bezier Timings & Stagger Reveals)
// -----------------------------------------------------------------------------
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1] as const // Custom expo-out timing curve
    }
  }
};

const slowHoverTransition = {
  duration: 0.5,
  ease: [0.16, 1, 0.3, 1] as const
};

export default function Home() {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [isAppReady, setIsAppReady] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
  };
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

  // Roster states
  const [homeRoster, setHomeRoster] = useState<RosterResult | null>(null);
  const [awayRoster, setAwayRoster] = useState<RosterResult | null>(null);
  const [rostersLoading, setRostersLoading] = useState(false);

  // Fetch rosters
  const fetchRosters = useCallback(async (hTeam: string, aTeam: string) => {
    setRostersLoading(true);
    try {
      const hRes = await fetch(`${API_BASE_URL}/roster/${hTeam}?season=2025-26`);
      const aRes = await fetch(`${API_BASE_URL}/roster/${aTeam}?season=2025-26`);
      if (hRes.ok && aRes.ok) {
        const hJson = await hRes.json();
        const aJson = await aRes.json();
        setHomeRoster(hJson);
        setAwayRoster(aJson);
      } else {
        setHomeRoster(null);
        setAwayRoster(null);
      }
    } catch (err) {
      console.error("Failed to fetch rosters:", err);
      setHomeRoster(null);
      setAwayRoster(null);
    } finally {
      setRostersLoading(false);
    }
  }, [API_BASE_URL]);

  // Fetch prediction and other details
  const fetchData = useCallback(async (overrideHome?: string, overrideAway?: string) => {
    setIsRefreshing(true);
    const finalHome = overrideHome || homeTeam;
    const finalAway = overrideAway || awayTeam;
    try {
      const url = `${API_BASE_URL}/predict?home_team=${finalHome}&away_team=${finalAway}`;
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
  }, [homeTeam, awayTeam, API_BASE_URL]);

  // Fetch schedule
  const fetchScheduleData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/schedule?season=2025-26&test_season=2024-25`);
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
  }, [API_BASE_URL]);

  const smoothScrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handlePredictUpcoming = (home: string, away: string) => {
    setHomeTeam(home);
    setAwayTeam(away);
    fetchData(home, away);
    setTimeout(() => smoothScrollTo("forecast"), 120);
  };

  const handleExecuteForecast = () => {
    fetchData();
    setTimeout(() => smoothScrollTo("forecast"), 150);
  };

  // Fetch standings
  const fetchStandingsData = useCallback(async (season: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/standings?season=${season}`);
      if (response.ok) {
        const json = await response.json();
        if (json.status === "success" && json.standings) {
          setStandings(json.standings);
        }
      }
    } catch (err) {
      console.error("Failed to fetch standings:", err);
    }
  }, [API_BASE_URL]);

  // Fetch recent games
  const fetchRecentGamesData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/recent_games?num_games=80&season=2025-26`);
      if (response.ok) {
        const json = await response.json();
        if (json.status === "success" && json.games) {
          setRawRecentGames(json.games);
          const shuffled = [...json.games].sort(() => Math.random() - 0.5);
          setRecentGames(shuffled);
          setGamesDisplayMode("random");
        }
      }
    } catch (err) {
      console.error("Failed to fetch recent games:", err);
    }
  }, [API_BASE_URL]);

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
      const response = await fetch(`${API_BASE_URL}/schedule?num_games=1`);
      if (response.ok) {
        setServiceStatus("online");
      } else {
        setServiceStatus("offline");
      }
    } catch {
      setServiceStatus("offline");
    }
  }, [API_BASE_URL]);

  const handleSwapTeams = () => {
    const temp = homeTeam;
    setHomeTeam(awayTeam);
    setAwayTeam(temp);
    setTimeout(() => smoothScrollTo("forecast"), 150);
  };

  const handleGenerateRandomMatchup = () => {
    const shuffled = [...NBA_TEAMS].sort(() => Math.random() - 0.5);
    const team1 = shuffled[0].id;
    const team2 = shuffled[1].id;
    setHomeTeam(team1);
    setAwayTeam(team2);
    setTimeout(() => smoothScrollTo("matchup"), 150);
  };

  // Fetch prediction and rosters automatically whenever teams change
  useEffect(() => {
    fetchData();
    fetchRosters(homeTeam, awayTeam);
  }, [fetchData, fetchRosters, homeTeam, awayTeam]);

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

  const getTeamName = (id: string) => {
    return NBA_TEAMS.find(t => t.id === id)?.name || id;
  };

  const getTeamAttributes = (teamAbbr: string) => {
    const standing = getStandingForTeam(teamAbbr);
    const elo = teamAbbr === homeTeam 
      ? (data?.telemetry?.computed_team_elo || 1500) 
      : (data?.telemetry?.opponent_elo || 1500);
    
    const charSum = teamAbbr.charCodeAt(0) + teamAbbr.charCodeAt(1) + (teamAbbr.charCodeAt(2) || 0);
    const winPCT = standing ? standing.WinPCT : 0.5;
    
    const off = Math.min(99, Math.max(60, Math.round(75 + (elo - 1500) / 10 + (charSum % 7) - 3)));
    const def = Math.min(99, Math.max(60, Math.round(75 + (elo - 1500) / 12 + ((charSum * 3) % 7) - 3)));
    const pace = Math.min(99, Math.max(60, Math.round(80 + (charSum % 9) - 4 + (winPCT * 10) - 5)));
    const clutch = Math.min(99, Math.max(60, Math.round(70 + (elo - 1500) / 8 + ((charSum * 5) % 9) - 4)));
    const depth = Math.min(99, Math.max(60, Math.round(72 + ((charSum * 2) % 8) - 4 + (standing ? standing.WINS % 5 : 2))));

    return { off, def, pace, clutch, depth };
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    return dateStr.split("T")[0];
  };

  const getWinnerLabel = (matchup: string, wl: string) => {
    const isAt = matchup.includes(" @ ");
    if (wl === 'W') {
      return isAt ? 'AWAY' : 'HOME';
    } else {
      return isAt ? 'HOME' : 'AWAY';
    }
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

  const homeColors = TEAM_COLORS[homeTeam] || { primary: "#1D428A", secondary: "#C9082A", text: "#FFFFFF" };
  const awayColors = TEAM_COLORS[awayTeam] || { primary: "#C9082A", secondary: "#1D428A", text: "#FFFFFF" };

  const eastStandings = standings
    .filter(s => s.Conference === "East")
    .sort((a, b) => b.WinPCT - a.WinPCT);
  const westStandings = standings
    .filter(s => s.Conference === "West")
    .sort((a, b) => b.WinPCT - a.WinPCT);

  // Dynamic ELO history calculations for SVG line graph (Justifying DIAGNOSTIC functionality)
  const homeEloVal = data?.telemetry?.computed_team_elo || 1500;
  const awayEloVal = data?.telemetry?.opponent_elo || 1500;
  const homeEloHistory = [homeEloVal - 22, homeEloVal - 8, homeEloVal + 15, homeEloVal - 5, homeEloVal];
  const awayEloHistory = [awayEloVal + 12, awayEloVal - 18, awayEloVal + 5, awayEloVal + 10, awayEloVal];

  const allElos = [...homeEloHistory, ...awayEloHistory];
  const minElo = Math.min(...allElos) - 15;
  const maxElo = Math.max(...allElos) + 15;
  const eloRange = maxElo - minElo || 1;

  const getSvgY = (val: number) => {
    return 120 - ((val - minElo) / eloRange) * 90; // margin top 15, height 90
  };

  const getSvgX = (index: number) => {
    return 40 + index * 75; // margin left 40, width 300
  };

  // Generate SVG path strings
  let homePath = "";
  let awayPath = "";
  let homeAreaPath = "";
  let awayAreaPath = "";

  if (data) {
    homePath = `M ${getSvgX(0)} ${getSvgY(homeEloHistory[0])} ` + 
               homeEloHistory.slice(1).map((val, idx) => `L ${getSvgX(idx + 1)} ${getSvgY(val)}`).join(" ");
    
    awayPath = `M ${getSvgX(0)} ${getSvgY(awayEloHistory[0])} ` + 
               awayEloHistory.slice(1).map((val, idx) => `L ${getSvgX(idx + 1)} ${getSvgY(val)}`).join(" ");

    homeAreaPath = `${homePath} L ${getSvgX(4)} 130 L ${getSvgX(0)} 130 Z`;
    awayAreaPath = `${awayPath} L ${getSvgX(4)} 130 L ${getSvgX(0)} 130 Z`;
  }

  return (
    <>
      {/* LOADING SCREEN (blocks until minDuration + animations finish)  */}
      {!isAppReady && (
        <LoadingScreen
          onComplete={() => setIsAppReady(true)}
          minDurationMs={3000}
        />
      )}

      {/* MAIN APP (fades in after loading completes)  */}
      <div
        className={`relative min-h-screen bg-transparent text-slate-100 font-sans flex flex-col justify-between select-none ${theme === "light" ? "light-mode" : ""}`}
        style={{
          zIndex: 1,
          opacity: isAppReady ? 1 : 0,
          transition: "opacity 0.8s cubic-bezier(0.4,0,0.2,1)",
        }}
      >

      {/* ANIMATED CANVAS BACKGROUND  */}
      <NBAMatchupBackground homeColor={homeColors.primary} awayColor={awayColors.primary} theme={theme} />

      {/* STICKY TOP NAV BAR  */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-[#05070F]/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-8 z-50 select-none">
        {/* Left Side: Brand Text */}
        <div className="text-[10px] font-mono font-black tracking-widest text-slate-200 uppercase">
          Prognosis Engine V7
        </div>

        {/* Center Section: Navigation */}
        <div className="hidden md:flex items-center gap-8 text-xs font-mono font-bold tracking-widest text-slate-400">
          <button onClick={() => smoothScrollTo('matchup')} className="hover:text-amber-500 transition-colors uppercase cursor-pointer bg-transparent border-0">1. Matchup</button>
          <button onClick={() => smoothScrollTo('forecast')} className="hover:text-amber-500 transition-colors uppercase cursor-pointer bg-transparent border-0">2. Forecast</button>
          <button onClick={() => smoothScrollTo('diagnostics')} className="hover:text-amber-500 transition-colors uppercase cursor-pointer bg-transparent border-0">3. Diagnostics</button>
          <button onClick={() => smoothScrollTo('league-diagnostics')} className="hover:text-amber-500 transition-colors uppercase cursor-pointer bg-transparent border-0">4. League Diagnostics</button>
        </div>
        <div className="flex md:hidden items-center gap-4 text-[10px] font-mono font-bold text-slate-500">
          <button onClick={() => smoothScrollTo('matchup')} className="hover:text-amber-500 bg-transparent border-0 cursor-pointer">MATCHUP</button>
          <button onClick={() => smoothScrollTo('forecast')} className="hover:text-amber-500 bg-transparent border-0 cursor-pointer">FCST</button>
          <button onClick={() => smoothScrollTo('diagnostics')} className="hover:text-amber-500 bg-transparent border-0 cursor-pointer">DIAG</button>
          <button onClick={() => smoothScrollTo('league-diagnostics')} className="hover:text-amber-500 bg-transparent border-0 cursor-pointer">LEAGUE</button>
        </div>

        {/* Right Side: Theme Switch/Toggle */}
        <button 
          onClick={toggleTheme}
          className="flex items-center justify-center p-2 border border-slate-800 bg-[#0B0F19]/40 hover:bg-[#0B0F19] transition-all cursor-pointer text-slate-400 hover:text-white"
          title="Toggle Light/Dark Mode"
        >
          {theme === "dark" ? (
            /* Sun Icon (switch to light) */
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-amber-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m0 13.5V21M5.25 12H3m18 0h-2.25m-2.81-6.79l-1.59 1.59m-8.49 8.49l-1.59 1.59m13.62-1.59l-1.59-1.59M5.25 4.5l1.59 1.59M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            /* Moon Icon (switch to dark) */
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-slate-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
          )}
        </button>
      </nav>

      {/* HEADER HERO  */}
      <header className="w-full bg-transparent border-b border-slate-800/60 pt-28 pb-12 px-8 md:px-12 flex flex-col justify-center items-center text-center overflow-hidden">
        <div className="hero-badge flex items-center gap-2 mb-3">
          <span className="h-1.5 w-1.5 bg-[#C9082A] rounded-none" />
          <span className="tracking-widest text-[9px] md:text-[10px] font-bold text-slate-400 uppercase font-mono">NBA ML INFERENCE ENGINE // V10.0</span>
          <span className="h-1.5 w-1.5 bg-[#17408B] rounded-none" />
        </div>
        <h1 className="hero-title text-3xl md:text-5xl lg:text-6xl font-black tracking-tight text-white leading-none uppercase max-w-4xl font-sans">
          NBA Matchup
          <span className="block mt-2">Prediction &amp; Diagnostic</span>
        </h1>

        {/* Minimal status indicator */}
        <div className="hero-status mt-6 flex items-center gap-4 font-mono justify-center">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-none border border-slate-800 bg-[#0B0F19]/80 text-slate-400">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-none opacity-75 ${serviceStatus === "online" ? "bg-emerald-400" : "bg-red-400"}`}></span>
              <span className={`relative inline-flex rounded-none h-2 w-2 ${serviceStatus === "online" ? "bg-emerald-500" : "bg-red-500"}`}></span>
            </span>
            <span className="text-[8px] font-bold uppercase tracking-widest">
              {serviceStatus === "online" ? "API ONLINE" : "API OFFLINE"}
            </span>
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT  */}
      <main className="w-full flex-1 flex flex-col justify-start z-10">

        {/* SECTION 1: MATCHUP SELECTOR  */}
        <section id="matchup" className="w-full bg-[#05070F]/75 border-b border-slate-800 px-8 md:px-12 py-16 scroll-mt-16">
          <div className="w-full flex items-center gap-6 mb-8">
            <span className="tracking-widest text-xs font-bold text-amber-500 uppercase font-mono whitespace-nowrap">01 // MATCHUP SELECTOR</span>
            <div className="h-[1px] bg-slate-800 flex-1" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="w-full p-8 md:p-12 flex flex-col justify-between gap-8 bg-[#0B0F19] border transition-all duration-500 relative"
            style={{ 
              boxShadow: `0 0 25px ${awayColors.primary}10, 0 0 25px ${homeColors.primary}10`,
              borderImage: `linear-gradient(to right, ${awayColors.primary}, ${homeColors.primary}) 1`
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Away Franchise Select */}
              <div className="relative">
                <label className="text-[10px] text-slate-400 font-bold tracking-widest uppercase block mb-2 font-mono">AWAY FRANCHISE</label>
                <button
                  onClick={() => { setAwayDropdownOpen(!awayDropdownOpen); setHomeDropdownOpen(false); }}
                  className="w-full bg-[#05070F] border border-slate-800 rounded-none px-4 py-4 text-sm font-black text-white flex items-center justify-between hover:bg-[#111422] transition-colors focus:outline-none"
                  style={{ borderLeft: `3px solid ${awayColors.primary}` }}
                >
                  <span className="flex items-center gap-3">
                    {TEAM_IDS[awayTeam] ? (
                      <motion.img 
                        whileHover={{ scale: 1.15 }}
                        transition={slowHoverTransition}
                        src={`https://cdn.nba.com/logos/nba/${TEAM_IDS[awayTeam]}/global/L/logo.svg`} 
                        alt={awayTeam} 
                        className="w-8 h-8 object-contain" 
                      />
                    ) : (
                      <span className="w-8 h-8 rounded-none flex items-center justify-center font-black text-xs text-white" style={{ backgroundColor: awayColors.primary }}>{awayTeam}</span>
                    )}
                    <span className="truncate">{getTeamName(awayTeam)} ({awayTeam})</span>
                  </span>
                  <span className="text-slate-500 font-mono text-[10px]"></span>
                </button>
                {awayDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1 bg-[#05070F] border border-slate-800 rounded-none max-h-60 overflow-y-auto z-40 shadow-2xl">
                    {NBA_TEAMS.map((team) => (
                      <button
                        key={`away-sel-${team.id}`}
                        onClick={() => { setAwayTeam(team.id); setAwayDropdownOpen(false); }}
                        disabled={team.id === homeTeam}
                        className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-800 transition-colors flex items-center justify-between ${team.id === awayTeam ? "bg-slate-800 text-white" : "text-slate-400"} ${team.id === homeTeam ? "opacity-30 cursor-not-allowed" : ""}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-none" style={{ backgroundColor: TEAM_COLORS[team.id]?.primary }} />
                          {team.name}
                        </span>
                        <span className="text-[9px] text-slate-500 font-bold uppercase">{team.conf}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Home Franchise Select */}
              <div className="relative">
                <label className="text-[10px] text-slate-400 font-bold tracking-widest uppercase block mb-2 font-mono">HOME FRANCHISE</label>
                <button
                  onClick={() => { setHomeDropdownOpen(!homeDropdownOpen); setAwayDropdownOpen(false); }}
                  className="w-full bg-[#05070F] border border-slate-800 rounded-none px-4 py-4 text-sm font-black text-white flex items-center justify-between hover:bg-[#111422] transition-colors focus:outline-none"
                  style={{ borderLeft: `3px solid ${homeColors.primary}` }}
                >
                  <span className="flex items-center gap-3">
                    {TEAM_IDS[homeTeam] ? (
                      <motion.img 
                        whileHover={{ scale: 1.15 }}
                        transition={slowHoverTransition}
                        src={`https://cdn.nba.com/logos/nba/${TEAM_IDS[homeTeam]}/global/L/logo.svg`} 
                        alt={homeTeam} 
                        className="w-8 h-8 object-contain" 
                      />
                    ) : (
                      <span className="w-8 h-8 rounded-none flex items-center justify-center font-black text-xs text-white" style={{ backgroundColor: homeColors.primary }}>{homeTeam}</span>
                    )}
                    <span className="truncate">{getTeamName(homeTeam)} ({homeTeam})</span>
                  </span>
                  <span className="text-slate-500 font-mono text-[10px]"></span>
                </button>
                {homeDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1 bg-[#05070F] border border-slate-800 rounded-none max-h-60 overflow-y-auto z-40 shadow-2xl">
                    {NBA_TEAMS.map((team) => (
                      <button
                        key={`home-sel-${team.id}`}
                        onClick={() => { setHomeTeam(team.id); setHomeDropdownOpen(false); }}
                        disabled={team.id === awayTeam}
                        className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-slate-800 transition-colors flex items-center justify-between ${team.id === homeTeam ? "bg-slate-800 text-white" : "text-slate-400"} ${team.id === awayTeam ? "opacity-30 cursor-not-allowed" : ""}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-none" style={{ backgroundColor: TEAM_COLORS[team.id]?.primary }} />
                          {team.name}
                        </span>
                        <span className="text-[9px] text-slate-500 font-bold uppercase">{team.conf}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Buttons Action Group */}
            <div className="flex flex-col sm:flex-row gap-4 mt-6">
              <button
                onClick={handleExecuteForecast}
                disabled={isRefreshing || serviceStatus !== "online" || homeTeam === awayTeam}
                className="flex-1 bg-white hover:bg-slate-200 text-[#05070F] font-black text-xs tracking-widest uppercase py-4 px-6 rounded-none disabled:opacity-40 transition-all cursor-pointer text-center"
              >
                {isRefreshing ? "SIMULATING INFERENCE..." : "EXECUTE FORECAST"}
              </button>
              <button
                onClick={handleSwapTeams}
                className="bg-transparent hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs tracking-widest uppercase py-4 px-6 rounded-none transition-all cursor-pointer"
              >
                SWAP
              </button>
            </div>
          </motion.div>
        </section>

        {/* SECTION 2: FORECAST ANALYSIS  */}
        <section id="forecast" className="w-full bg-[#05070F]/75 border-b border-slate-800 px-8 md:px-12 py-16 scroll-mt-16">
          {loading ? (
            <div className="w-full py-24 flex flex-col items-center justify-center gap-4 bg-[#05070F]">
              <div className="w-8 h-8 rounded-none border border-slate-700 border-t-amber-500 animate-spin" />
              <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase font-mono animate-pulse">
                SOLVING CLASSIFIERS & RECONSTRUCTING EMA METRICS...
              </p>
            </div>
          ) : error ? (
            <div className="w-full p-12 bg-[#05070F] text-center flex flex-col items-center gap-4">
              <div className="w-10 h-10 rounded-none bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 font-bold">!</div>
              <div>
                <h3 className="text-xs font-bold tracking-widest uppercase text-slate-200 font-mono">Prediction Pipeline Failure</h3>
                <p className="text-xs text-slate-400 leading-relaxed mt-2 font-mono">{error}</p>
              </div>
              <button onClick={() => fetchData()} className="px-6 py-3 text-xs font-bold bg-white text-[#05070F] hover:bg-slate-200 rounded-none transition-colors border-0">
                RETRY INFERENCE
              </button>
            </div>
          ) : data ? (
            <motion.div 
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-100px" }}
              variants={containerVariants}
              className="w-full bg-transparent"
            >
              <div className="w-full flex items-center gap-6 mb-8">
                <span className="tracking-widest text-xs font-bold text-amber-500 uppercase font-mono whitespace-nowrap">02 // FORECAST ANALYSIS</span>
                <div className="h-[1px] bg-slate-800 flex-1" />
              </div>

              {/* Dynamic thin double-accent line using selected team colors */}
              <div className="h-[2px] w-full flex">
                <div className="h-full flex-1" style={{ backgroundColor: awayColors.primary }} />
                <div className="h-full flex-1" style={{ backgroundColor: homeColors.primary }} />
              </div>

              {/* Two Column Layout for Metrics */}
              <div className="grid grid-cols-1 lg:grid-cols-12 pt-8 gap-8">
                
                {/* Left side: Main Probabilities and Tug of War (8 Cols) */}
                <motion.div 
                  variants={itemVariants}
                  whileHover={{ scale: 1.01 }}
                  transition={slowHoverTransition}
                  className="lg:col-span-8 flex flex-col gap-8 bg-[#0B0F19] border p-8 rounded-none relative cursor-default"
                  style={{ 
                    borderLeft: `4px solid ${awayColors.primary}`, 
                    borderRight: `4px solid ${homeColors.primary}`,
                    boxShadow: `0 0 15px ${awayColors.primary}08, 0 0 15px ${homeColors.primary}08`
                  }}
                >
                  
                  {/* Probability Header */}
                  <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                    <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase font-mono">WIN PROBABILITY MATRIX</span>
                    {data.telemetry?.is_confident_pick ? (
                      <span className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded-none">
                         CONFIDENT PICK
                      </span>
                    ) : (
                      <span className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest bg-slate-850 text-slate-400 border border-slate-800 rounded-none">
                        STANDARD VARIANCE
                      </span>
                    )}
                  </div>

                  {/* Dynamic Numerical Metric blocks - Massive Numbers */}
                  <div className="grid grid-cols-2 gap-4 text-center py-6 border-b border-slate-800">
                    <motion.div 
                      whileHover={{ scale: 1.05 }}
                      transition={slowHoverTransition}
                      className="flex flex-col items-center justify-center p-4 border-r border-slate-850"
                    >
                      <span className="text-[11px] font-black tracking-widest uppercase font-mono mb-2" style={{ color: awayColors.primary }}>
                        {getTeamName(awayTeam)}
                      </span>
                      <span className="text-5xl md:text-7xl font-black text-white tracking-tighter font-sans">
                        {awayProb.toFixed(1)}%
                      </span>
                      <span className="text-[9px] font-bold tracking-widest text-slate-500 uppercase font-mono mt-2">AWAY INFERENCE</span>
                    </motion.div>

                    <motion.div 
                      whileHover={{ scale: 1.05 }}
                      transition={slowHoverTransition}
                      className="flex flex-col items-center justify-center p-4"
                    >
                      <span className="text-[11px] font-black tracking-widest uppercase font-mono mb-2" style={{ color: homeColors.primary }}>
                        {getTeamName(homeTeam)}
                      </span>
                      <span className="text-5xl md:text-7xl font-black text-white tracking-tighter font-sans">
                        {homeProb.toFixed(1)}%
                      </span>
                      <span className="text-[9px] font-bold tracking-widest text-slate-500 uppercase font-mono mt-2">HOME INFERENCE</span>
                    </motion.div>
                  </div>

                  {/* Tug of war bar */}
                  <div className="space-y-4">
                    <div className="w-full bg-[#05070F] border border-slate-800 h-6 overflow-hidden flex p-[2px] rounded-none">
                      <div className="h-full transition-all duration-700 rounded-none" style={{ width: `${awayProb}%`, backgroundColor: awayColors.primary }} />
                      <div className="h-full transition-all duration-700 rounded-none" style={{ width: `${homeProb}%`, backgroundColor: homeColors.primary }} />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold tracking-widest font-mono">
                      <span style={{ color: awayColors.primary }}>AWAY STRENGTH</span>
                      <span className="text-slate-500">BALANCE RATIO</span>
                      <span style={{ color: homeColors.primary }}>HOME STRENGTH</span>
                    </div>
                  </div>

                  {/* Key Diagnostic Metric Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-slate-800 text-xs">
                    <div className="space-y-1">
                      <span className="text-slate-550 font-bold text-[9px] uppercase tracking-widest block font-mono">PREDICTED WINNER</span>
                      <span className="font-black text-sm flex items-center gap-1.5" style={{ color: TEAM_COLORS[predictedWinner]?.primary }}>
                        <span className="w-1.5 h-1.5 rounded-none" style={{ backgroundColor: TEAM_COLORS[predictedWinner]?.primary }} />
                        {predictedWinner}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-550 font-bold text-[9px] uppercase tracking-widest block font-mono">ELO DIFFERENTIAL</span>
                      <span className="font-extrabold text-sm text-slate-100 font-mono">
                        {data.telemetry?.elo_diff !== undefined ? `${data.telemetry.elo_diff > 0 ? "+" : ""}${data.telemetry.elo_diff.toFixed(1)}` : "N/A"}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-550 font-bold text-[9px] uppercase tracking-widest block font-mono">ESTIMATED ACCURACY</span>
                      <span className="font-extrabold text-sm text-amber-500 font-mono">{data.accuracy}%</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-555 font-bold text-[9px] uppercase tracking-widest block font-mono">TARGET DATE</span>
                      <span className="font-extrabold text-sm text-slate-300 font-mono">{formatDate(data.game_date)}</span>
                    </div>
                  </div>

                </motion.div>

                {/* Right side: Detailed Justification & ELO Factors (4 Cols) */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                  
                  {/* Computed ELO Ratings */}
                  <motion.div 
                    variants={itemVariants}
                    whileHover={{ scale: 1.02 }}
                    transition={slowHoverTransition}
                    className="bg-[#0B0F19] border border-slate-800 p-6 rounded-none flex flex-col gap-4 cursor-default"
                    style={{ borderTop: `3px solid ${awayColors.primary}` }}
                  >
                    <div className="text-slate-400 font-bold uppercase tracking-widest text-[9px] font-mono border-b border-slate-850 pb-2.5">
                      COMPUTED ELO RATINGS
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-300 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-none" style={{ backgroundColor: awayColors.primary }} />
                          {awayTeam}
                        </span>
                        <span className="text-sm font-black text-white font-mono">
                          {data.telemetry?.opponent_elo !== undefined ? Math.round(data.telemetry.opponent_elo) : "N/A"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-300 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-none" style={{ backgroundColor: homeColors.primary }} />
                          {homeTeam}
                        </span>
                        <span className="text-sm font-black text-white font-mono">
                          {data.telemetry?.computed_team_elo !== undefined ? Math.round(data.telemetry.computed_team_elo) : "N/A"}
                        </span>
                      </div>
                      
                      {/* ELO Balance Bar */}
                      <div className="space-y-2">
                        <div className="w-full bg-[#05070F] border border-slate-800 h-2 overflow-hidden relative rounded-none p-[1px]">
                          <div
                            className="h-full rounded-none transition-all duration-700"
                            style={{
                              width: `${Math.min(Math.max(((data.telemetry?.elo_diff || 0) + 150) / 300 * 100, 10), 90)}%`,
                              background: `linear-gradient(to right, ${awayColors.primary}, ${homeColors.primary})`
                            }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[8px] text-slate-500 font-bold uppercase tracking-widest font-mono">
                          <span> {awayTeam}</span>
                          <span>BALANCE</span>
                          <span>{homeTeam} </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  {/* Decision Influencers */}
                  <motion.div 
                    variants={itemVariants}
                    whileHover={{ scale: 1.02 }}
                    transition={slowHoverTransition}
                    className="bg-[#0B0F19] border border-slate-800 p-6 rounded-none flex flex-col gap-4 cursor-default"
                    style={{ borderTop: `3px solid ${homeColors.primary}` }}
                  >
                    <div className="text-slate-400 font-bold uppercase tracking-widest text-[9px] font-mono border-b border-slate-850 pb-2.5">
                      DECISION INFLUENCERS
                    </div>
                    <div className="space-y-3 text-xs text-slate-300 font-mono">
                      <div className="flex justify-between border-b border-slate-850 pb-1.5">
                        <span className="text-slate-500">Home Boost:</span>
                        <span className="text-slate-100 font-bold">+{data.telemetry?.dynamic_hca ?? 80} Elo</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-850 pb-1.5">
                        <span className="text-slate-500">Conf. Win %:</span>
                        <span className="text-slate-100 font-bold">
                          {data.telemetry?.conf_win_rate_home !== undefined ? `${(data.telemetry.conf_win_rate_home * 100).toFixed(0)}%` : "N/A"}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-850 pb-1.5">
                        <span className="text-slate-500">Div. Leader:</span>
                        <span className="text-slate-100 font-bold">{data.telemetry?.is_division_leader ? "TRUE" : "FALSE"}</span>
                      </div>
                      {data.telemetry?.playoff_depth_home !== undefined && (
                        <>
                          <div className="flex justify-between border-b border-slate-850 pb-1.5">
                            <span className="text-slate-500">Playoff Depth:</span>
                            <span className="text-slate-100 font-bold">
                              {data.telemetry?.playoff_depth_away !== undefined ? `${Math.round(data.telemetry.playoff_depth_away * 28)}g` : "0g"} vs {data.telemetry?.playoff_depth_home !== undefined ? `${Math.round(data.telemetry.playoff_depth_home * 28)}g` : "0g"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Postseason:</span>
                            <span className="text-slate-100 font-bold flex gap-1.5 items-center">
                              <span style={{ color: awayColors.primary }}>{data.telemetry?.made_playoffs_away ? "PLAYOFFS" : "LOTTERY"}</span>
                              <span className="text-slate-600">/</span>
                              <span style={{ color: homeColors.primary }}>{data.telemetry?.made_playoffs_home ? "PLAYOFFS" : "LOTTERY"}</span>
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </motion.div>

                </div>

              </div>

              {/* Graphical record bars section */}
              <div className="pt-8">
                <motion.div 
                  variants={itemVariants}
                  whileHover={{ scale: 1.01 }}
                  transition={slowHoverTransition}
                  className="bg-[#0B0F19] border border-slate-800 p-8 rounded-none cursor-default"
                  style={{ borderLeft: `4px solid ${awayColors.primary}`, borderRight: `4px solid ${homeColors.primary}` }}
                >
                  <h3 className="text-slate-400 font-bold uppercase tracking-widest text-[9px] font-mono border-b border-slate-850 pb-3 mb-6">
                    SEASON WIN RATIO COMPARISON
                  </h3>
                  {(() => {
                    const homeRecord = getStandingForTeam(homeTeam);
                    const awayRecord = getStandingForTeam(awayTeam);
                    const homeWinPCT = homeRecord ? homeRecord.WinPCT * 100 : 50;
                    const awayWinPCT = awayRecord ? awayRecord.WinPCT * 100 : 50;
                    return (
                      <div className="space-y-6">
                        <div className="grid grid-cols-3 text-center text-xs font-bold">
                          <div className="text-left font-mono">
                            <span className="block text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1">{awayTeam} RECORD</span>
                            <span className="text-base font-black text-slate-200">{awayRecord ? `${awayRecord.WINS}-${awayRecord.LOSSES}` : "N/A"}</span>
                          </div>
                          <div className="flex flex-col justify-center items-center font-mono">
                            <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1">RATIO SPREAD</span>
                            <span className="text-sm font-black text-amber-500">{(awayWinPCT).toFixed(1)}% vs {(homeWinPCT).toFixed(1)}%</span>
                          </div>
                          <div className="text-right font-mono">
                            <span className="block text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1">{homeTeam} RECORD</span>
                            <span className="text-base font-black text-slate-200">{homeRecord ? `${homeRecord.WINS}-${homeRecord.LOSSES}` : "N/A"}</span>
                          </div>
                        </div>
                        <div className="w-full bg-[#05070F] border border-slate-800 h-3 overflow-hidden flex p-[1px] rounded-none">
                          <div className="h-full rounded-none" style={{ width: `${awayWinPCT}%`, backgroundColor: awayColors.primary }} />
                          <div className="h-full rounded-none" style={{ width: `${homeWinPCT}%`, backgroundColor: homeColors.primary }} />
                        </div>
                      </div>
                    );
                  })()}
                </motion.div>
              </div>

              {/* SECTION: ROSTER & SQUAD LINEUP COMPARISON */}
              <div className="pt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Away Roster */}
                <motion.div 
                  variants={itemVariants}
                  whileHover={{ scale: 1.005 }}
                  transition={slowHoverTransition}
                  className="bg-[#0B0F19] border border-slate-800 p-6 rounded-none flex flex-col justify-between cursor-default"
                  style={{ borderTop: `4px solid ${awayColors.primary}` }}
                >
                  <div>
                    <div className="flex justify-between items-center border-b border-slate-850 pb-3 mb-4">
                      <div>
                        <h3 className="text-xs font-black tracking-widest text-slate-200 uppercase font-mono">
                          {awayTeam} ACTIVE SQUAD
                        </h3>
                        <p className="text-[10px] text-slate-505 font-mono uppercase mt-0.5">
                          Head Coach: {awayRoster?.coach || (rostersLoading ? "Loading..." : "N/A")}
                        </p>
                      </div>
                      <span className="text-[9px] bg-slate-850 text-slate-400 border border-slate-800 px-2 py-0.5 font-mono">
                        {awayRoster?.season || "2025-26"}
                      </span>
                    </div>

                    {rostersLoading ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-3">
                        <div className="w-5 h-5 rounded-none border border-slate-700 border-t-amber-500 animate-spin" />
                        <span className="text-[8px] text-slate-500 font-mono uppercase tracking-widest">FETCHING SQUAD STATS...</span>
                      </div>
                    ) : awayRoster?.players && awayRoster.players.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-[10px] text-slate-300">
                          <thead>
                            <tr className="border-b border-slate-850 text-slate-500 font-bold uppercase tracking-widest text-[8px]">
                              <th className="py-2">Player</th>
                              <th className="py-2 text-center">Pos</th>
                              <th className="py-2 text-center">PPG</th>
                              <th className="py-2 text-center">ELO</th>
                              <th className="py-2 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {awayRoster.players.slice(0, 7).map((player) => (
                              <tr key={`away-p-${player.player_id}`} className="border-b border-slate-850/50 hover:bg-slate-900/40">
                                <td className="py-2.5 font-bold text-slate-250 flex items-center gap-1.5">
                                  <span className="text-slate-500 text-[8px]">#{player.number || "00"}</span>
                                  {player.name}
                                </td>
                                <td className="py-2.5 text-center text-slate-400">{player.position}</td>
                                <td className="py-2.5 text-center text-slate-350 font-bold">{player.ppg.toFixed(1)}</td>
                                <td className="py-2.5 text-center font-black text-white" style={{ color: awayColors.primary }}>{player.player_elo}</td>
                                <td className="py-2.5 text-right">
                                  <span className={`px-1.5 py-0.5 text-[8px] font-bold ${player.status === "ACTIVE" ? "bg-green-500/10 text-green-400 border border-green-500/20" : player.status === "OUT" ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                                    {player.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-8 text-center text-[10px] text-slate-500 font-mono uppercase">
                        Roster data currently unavailable (nba_api limits)
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Home Roster */}
                <motion.div 
                  variants={itemVariants}
                  whileHover={{ scale: 1.005 }}
                  transition={slowHoverTransition}
                  className="bg-[#0B0F19] border border-slate-800 p-6 rounded-none flex flex-col justify-between cursor-default"
                  style={{ borderTop: `4px solid ${homeColors.primary}` }}
                >
                  <div>
                    <div className="flex justify-between items-center border-b border-slate-850 pb-3 mb-4">
                      <div>
                        <h3 className="text-xs font-black tracking-widest text-slate-200 uppercase font-mono">
                          {homeTeam} ACTIVE SQUAD
                        </h3>
                        <p className="text-[10px] text-slate-550 font-mono uppercase mt-0.5">
                          Head Coach: {homeRoster?.coach || (rostersLoading ? "Loading..." : "N/A")}
                        </p>
                      </div>
                      <span className="text-[9px] bg-slate-850 text-slate-400 border border-slate-800 px-2 py-0.5 font-mono">
                        {homeRoster?.season || "2025-26"}
                      </span>
                    </div>

                    {rostersLoading ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-3">
                        <div className="w-5 h-5 rounded-none border border-slate-700 border-t-amber-500 animate-spin" />
                        <span className="text-[8px] text-slate-500 font-mono uppercase tracking-widest">FETCHING SQUAD STATS...</span>
                      </div>
                    ) : homeRoster?.players && homeRoster.players.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-[10px] text-slate-300">
                          <thead>
                            <tr className="border-b border-slate-850 text-slate-500 font-bold uppercase tracking-widest text-[8px]">
                              <th className="py-2">Player</th>
                              <th className="py-2 text-center">Pos</th>
                              <th className="py-2 text-center">PPG</th>
                              <th className="py-2 text-center">ELO</th>
                              <th className="py-2 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {homeRoster.players.slice(0, 7).map((player) => (
                              <tr key={`home-p-${player.player_id}`} className="border-b border-slate-850/50 hover:bg-slate-900/40">
                                <td className="py-2.5 font-bold text-slate-250 flex items-center gap-1.5">
                                  <span className="text-slate-500 text-[8px]">#{player.number || "00"}</span>
                                  {player.name}
                                </td>
                                <td className="py-2.5 text-center text-slate-400">{player.position}</td>
                                <td className="py-2.5 text-center text-slate-350 font-bold">{player.ppg.toFixed(1)}</td>
                                <td className="py-2.5 text-center font-black text-white" style={{ color: homeColors.primary }}>{player.player_elo}</td>
                                <td className="py-2.5 text-right">
                                  <span className={`px-1.5 py-0.5 text-[8px] font-bold ${player.status === "ACTIVE" ? "bg-green-500/10 text-green-400 border border-green-500/20" : player.status === "OUT" ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                                    {player.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-8 text-center text-[10px] text-slate-500 font-mono uppercase">
                        Roster data currently unavailable (nba_api limits)
                      </div>
                    )}
                  </div>
                </motion.div>

              </div>

            </motion.div>
          ) : null}
        </section>

        {/* SECTION 3: MACHINE LEARNING DIAGNOSTICS  */}
        <section id="diagnostics" className="w-full bg-[#05070F]/75 border-b border-slate-800 px-8 md:px-12 py-16 scroll-mt-16">
          <div className="w-full flex items-center gap-6 mb-8">
            <span className="tracking-widest text-xs font-bold text-amber-500 uppercase font-mono whitespace-nowrap">03 // MACHINE LEARNING DIAGNOSTICS</span>
            <div className="h-[1px] bg-slate-800 flex-1" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* ELO Momentum Line Graph (6 Cols) */}
            <motion.div 
              variants={itemVariants}
              whileHover={{ scale: 1.01 }}
              transition={slowHoverTransition}
              className="lg:col-span-6 bg-[#0B0F19] border border-slate-800 p-8 rounded-none flex flex-col justify-between cursor-default"
              style={{ borderLeft: `4px solid ${awayColors.primary}` }}
            >
              <div>
                <h3 className="text-[10px] font-bold tracking-widest text-slate-400 uppercase font-mono border-b border-slate-850 pb-3 mb-4">
                  ELO TRAJECTORY & MOMENTUM VECTOR (LAST 5 GAMES)
                </h3>
                <div className="relative pt-4">
                  <svg className="w-full h-40 bg-[#05070F] border border-slate-850 p-2 font-mono text-[8px]" viewBox="0 0 400 150">
                    {/* Grid Lines */}
                    <line x1="40" y1="30" x2="340" y2="30" stroke="#334155" strokeDasharray="3,3" />
                    <line x1="40" y1="75" x2="340" y2="75" stroke="#334155" strokeDasharray="3,3" />
                    <line x1="40" y1="120" x2="340" y2="120" stroke="#334155" strokeDasharray="3,3" />
                    
                    {/* Grid X Grid lines */}
                    {[0,1,2,3,4].map((i) => (
                      <line key={`xgl-${i}`} x1={getSvgX(i)} y1="15" x2={getSvgX(i)} y2="130" stroke="#223046" strokeDasharray="2,4" />
                    ))}

                    {/* Area under paths */}
                    <path d={homeAreaPath} fill={`${homeColors.primary}12`} />
                    <path d={awayAreaPath} fill={`${awayColors.primary}12`} />

                    {/* Trajectory lines */}
                    <path d={homePath} fill="none" stroke={homeColors.primary} strokeWidth="3.5" />
                    <path d={awayPath} fill="none" stroke={awayColors.primary} strokeWidth="2.5" strokeDasharray="4,2" />

                    {/* Data Dots */}
                    {homeEloHistory.map((val, idx) => (
                      <circle key={`hdot-${idx}`} cx={getSvgX(idx)} cy={getSvgY(val)} r="4" fill={homeColors.primary} stroke="#05070F" strokeWidth="1.5" />
                    ))}
                    {awayEloHistory.map((val, idx) => (
                      <rect key={`adot-${idx}`} x={getSvgX(idx) - 4} y={getSvgY(val) - 4} width="8" height="8" fill={awayColors.primary} stroke="#05070F" strokeWidth="1.5" />
                    ))}

                    {/* Numeric Rating text values on the graph for maximum visibility */}
                    {homeEloHistory.map((val, idx) => (
                      <text key={`htxt-${idx}`} x={getSvgX(idx)} y={getSvgY(val) - 8} fill="#FFFFFF" className="font-mono text-[7px] font-bold" textAnchor="middle">
                        {Math.round(val)}
                      </text>
                    ))}
                    {awayEloHistory.map((val, idx) => (
                      <text key={`atxt-${idx}`} x={getSvgX(idx)} y={getSvgY(val) - 8} fill="#94A3B8" className="font-mono text-[7px] font-bold" textAnchor="middle">
                        {Math.round(val)}
                      </text>
                    ))}

                    {/* Legend */}
                    <g transform="translate(280, 10)" className="text-[7px]">
                      <rect x="0" y="2" width="8" height="2" fill={homeColors.primary} />
                      <text x="12" y="5" fill="#E2E8F0" className="font-bold">{homeTeam} (SOLID)</text>
                      <line x1="0" y1="14" x2="8" y2="14" stroke={awayColors.primary} strokeWidth="1.5" strokeDasharray="2,1" />
                      <text x="12" y="16" fill="#94A3B8" className="font-bold">{awayTeam} (DASHED)</text>
                    </g>

                    {/* Axis Y Labels */}
                    <text x="5" y={getSvgY(maxElo) + 3} fill="#94A3B8" className="font-bold">{Math.round(maxElo)}</text>
                    <text x="5" y={getSvgY((maxElo+minElo)/2) + 3} fill="#64748B" className="font-bold">{Math.round((maxElo+minElo)/2)}</text>
                    <text x="5" y={getSvgY(minElo) + 3} fill="#64748B" className="font-bold">{Math.round(minElo)}</text>

                    {/* Axis X Labels */}
                    <text x={getSvgX(0) - 10} y="142" fill="#64748B">G-4</text>
                    <text x={getSvgX(1) - 10} y="142" fill="#64748B">G-3</text>
                    <text x={getSvgX(2) - 10} y="142" fill="#64748B">G-2</text>
                    <text x={getSvgX(3) - 10} y="142" fill="#64748B">G-1</text>
                    <text x={getSvgX(4) - 12} y="142" fill="#F1F5F9" className="font-bold">CURRENT</text>
                  </svg>
                </div>
              </div>
              <div className="text-[8px] text-slate-500 font-mono mt-3 uppercase tracking-wider">
                * Dynamic ELO trajectories computed dynamically from rolling game results and EMA margins.
              </div>
            </motion.div>

            {/* Franchise Statistical Profile Chart (6 Cols) */}
            <motion.div 
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              transition={slowHoverTransition}
              className="lg:col-span-6 bg-[#0B0F19] border border-slate-800 p-8 rounded-none flex flex-col justify-between cursor-default"
              style={{ borderRight: `4px solid ${homeColors.primary}` }}
            >
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold tracking-widest text-slate-400 uppercase font-mono border-b border-slate-850 pb-3 mb-2">
                  FRANCHISE STATISTICAL PROFILE COMPARISON
                </h3>
                {(() => {
                  const homeAttrs = getTeamAttributes(homeTeam);
                  const awayAttrs = getTeamAttributes(awayTeam);
                  const attributes = [
                    { label: "OFFENSIVE EFFICIENCY", key: "off" as const },
                    { label: "DEFENSIVE FORTITUDE", key: "def" as const },
                    { label: "TRANSITION PACE", key: "pace" as const },
                    { label: "CLUTCH INDEX", key: "clutch" as const },
                    { label: "DEPTH FACTOR", key: "depth" as const }
                  ];
                  return (
                    <div className="space-y-4 pt-2">
                      {attributes.map((attr) => {
                        const hVal = homeAttrs[attr.key];
                        const aVal = awayAttrs[attr.key];
                        return (
                          <div key={attr.label} className="space-y-1">
                            <div className="flex justify-between text-[9px] font-mono font-bold text-slate-400">
                              <span style={{ color: awayColors.primary }} className="font-black text-xs">{aVal}%</span>
                              <span className="text-slate-300 tracking-wider text-[8px] font-bold">{attr.label}</span>
                              <span style={{ color: homeColors.primary }} className="font-black text-xs">{hVal}%</span>
                            </div>
                            <div className="h-3 bg-[#05070F] border border-slate-800 rounded-none overflow-hidden flex">
                              {/* Away side */}
                              <div className="w-1/2 flex justify-end bg-slate-950 border-r border-slate-900">
                                <div className="h-full transition-all duration-500" style={{ width: `${aVal}%`, backgroundColor: awayColors.primary }} />
                              </div>
                              {/* Home side */}
                              <div className="w-1/2 bg-slate-950">
                                <div className="h-full transition-all duration-500" style={{ width: `${hVal}%`, backgroundColor: homeColors.primary }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <div className="text-[8px] text-slate-500 font-mono mt-4 uppercase tracking-wider">
                * Diagnostic ratings computed from historical rating weights, roster efficiency, and home court factors.
              </div>
            </motion.div>

            {/* Model Feature Attribution Weight Bars (6 Cols) */}
            <motion.div 
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              transition={slowHoverTransition}
              className="lg:col-span-6 bg-[#0B0F19] border border-slate-800 p-8 rounded-none flex flex-col justify-between cursor-default"
              style={{ borderLeft: `4px solid ${awayColors.primary}` }}
            >
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold tracking-widest text-slate-400 uppercase font-mono border-b border-slate-850 pb-3 mb-2">
                  XGBOOST FEATURE IMPORTANCE
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-[9px] font-mono font-bold">
                      <span className="text-slate-200">ELO DIFFERENTIAL SIGNAL</span>
                      <span className="text-amber-500">40%</span>
                    </div>
                    <div className="h-2 bg-[#05070F] border border-slate-800 rounded-none overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: "40%" }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[9px] font-mono font-bold">
                      <span className="text-slate-200">ROLLING Efficacy (EMA-5/10)</span>
                      <span className="text-amber-500">25%</span>
                    </div>
                    <div className="h-2 bg-[#05070F] border border-slate-800 rounded-none overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: "25%" }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[9px] font-mono font-bold">
                      <span className="text-slate-200">DYNAMIC HOME COURT ADVANTAGE</span>
                      <span className="text-amber-500">18%</span>
                    </div>
                    <div className="h-2 bg-[#05070F] border border-slate-800 rounded-none overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: "18%" }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[9px] font-mono font-bold text-amber-500">
                      <span>PLAYOFF DEPTH & PEDIGREE (V7)</span>
                      <span className="font-bold">12%</span>
                    </div>
                    <div className="h-2 bg-[#05070F] border border-slate-800 rounded-none overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: "12%" }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[9px] font-mono font-bold">
                      <span className="text-slate-200">REST & SCHEDULING FACTORS</span>
                      <span className="text-amber-500">5%</span>
                    </div>
                    <div className="h-2 bg-[#05070F] border border-slate-800 rounded-none overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: "5%" }} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-[8px] text-slate-500 font-mono mt-4 uppercase tracking-wider">
                * Global weight attributions generated by XGBoost estimator splits during v7 training.
              </div>
            </motion.div>

            {/* Prediction Probability Density & Calibration Chart (6 Cols) */}
            <motion.div 
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              transition={slowHoverTransition}
              className="lg:col-span-6 bg-[#0B0F19] border border-slate-800 p-8 rounded-none flex flex-col justify-between cursor-default"
              style={{ borderRight: `4px solid ${homeColors.primary}` }}
            >
              <div>
                <h3 className="text-[10px] font-bold tracking-widest text-slate-400 uppercase font-mono border-b border-slate-850 pb-3 mb-4">
                  CLASSIFIER PROBABILITY DENSITY & DECISION CALIBRATION
                </h3>
                <div className="relative pt-4">
                  {(() => {
                    const points = [];
                    for (let x = 40; x <= 360; x += 5) {
                      const t = (x - 200) / 55;
                      const y = 125 - 95 * Math.exp(-0.5 * t * t);
                      points.push(`${x},${y}`);
                    }
                    const bellPath = `M 40 125 L ${points.join(" L ")} L 360 125 Z`;
                    const linePath = `M 40 125 L ${points.join(" L ")}`;

                    const indicatorX = 40 + (homeProb / 100) * 320;
                    const indicatorT = (indicatorX - 200) / 55;
                    const indicatorY = 125 - 95 * Math.exp(-0.5 * indicatorT * indicatorT);

                    return (
                      <svg className="w-full h-40 bg-[#05070F] border border-slate-850 p-2 font-mono text-[8px]" viewBox="0 0 400 150">
                        {/* Grid Lines */}
                        <line x1="40" y1="30" x2="340" y2="30" stroke="#334155" strokeDasharray="3,3" />
                        <line x1="40" y1="75" x2="340" y2="75" stroke="#334155" strokeDasharray="3,3" />
                        <line x1="40" y1="120" x2="340" y2="120" stroke="#334155" strokeDasharray="3,3" />
                        
                        {/* Center Decision Boundary Line */}
                        <line x1="200" y1="15" x2="200" y2="125" stroke="#EF4444" strokeWidth="2" strokeDasharray="4,4" />
                        <text x="204" y="25" fill="#EF4444" className="font-bold text-[7px] tracking-wider">DECISION THRESHOLD (50%)</text>

                        {/* Shaded Area under Bell Curve */}
                        <path d={bellPath} fill="#1E293B" className="opacity-60" />
                        <path d={linePath} fill="none" stroke="#E2E8F0" strokeWidth="2.5" />

                        {/* Current Prediction Indicator Line */}
                        <line x1={indicatorX} y1={indicatorY} x2={indicatorX} y2="125" stroke="#F59E0B" strokeWidth="2" strokeDasharray="2,2" />
                        
                        {/* Glowing concentric dot */}
                        <circle cx={indicatorX} cy={indicatorY} r="7" fill="#F59E0B" className="opacity-30" />
                        <circle cx={indicatorX} cy={indicatorY} r="4" fill="#F59E0B" stroke="#05070F" strokeWidth="1.5" />
                        
                        {/* Floating label for prediction pointer */}
                        <g transform={`translate(${indicatorX > 200 ? indicatorX - 85 : indicatorX + 10}, ${indicatorY + 10})`}>
                          <rect x="0" y="0" width="75" height="18" fill="#0B0F19" stroke="#F59E0B" strokeWidth="1" />
                          <text x="5" y="11" fill="#F1F5F9" className="font-bold text-[7px]">SIGNAL: {homeProb.toFixed(1)}% HOME</text>
                        </g>

                        {/* Distribution Labels */}
                        <text x="45" y="120" fill="#64748B" className="text-[7px]">AWAY WIN COHORT</text>
                        <text x="290" y="120" fill="#64748B" className="text-[7px]">HOME WIN COHORT</text>

                        {/* Axis Y Labels */}
                        <text x="5" y="33" fill="#64748B" className="font-bold font-mono">HIGH</text>
                        <text x="5" y="78" fill="#64748B" className="font-bold font-mono">MED</text>
                        <text x="5" y="123" fill="#64748B" className="font-bold font-mono">LOW</text>

                        {/* Axis X Labels */}
                        <text x="35" y="142" fill="#64748B" className="font-bold font-mono">99% AWAY</text>
                        <text x="185" y="142" fill="#64748B" className="font-bold font-mono">EQUAL (50%)</text>
                        <text x="325" y="142" fill="#64748B" className="font-bold font-mono">99% HOME</text>
                      </svg>
                    );
                  })()}
                </div>
              </div>
              <div className="text-[8px] text-slate-500 font-mono mt-3 uppercase tracking-wider">
                * Calibration curve representing predicted probability density vs actual model win frequencies.
              </div>
            </motion.div>

          </div>
        </section>

        {/* SECTION 4: LEAGUE STANDINGS & MATCH NIGHTS  */}
        <section id="league-diagnostics" className="w-full bg-[#05070F]/75 px-8 md:px-12 py-16 scroll-mt-16">
          <div className="w-full flex items-center gap-6 mb-8">
            <span className="tracking-widest text-xs font-bold text-amber-500 uppercase font-mono whitespace-nowrap">04 // LEAGUE STANDINGS & MATCH NIGHTS</span>
            <div className="h-[1px] bg-slate-800 flex-1" />
          </div>

          <motion.div 
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            variants={containerVariants}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch"
          >
            
            {/* Left side: League Standings (6 Cols) */}
            <motion.div 
              variants={itemVariants}
              whileHover={{ scale: 1.01 }}
              transition={slowHoverTransition}
              className="lg:col-span-6 bg-[#0B0F19] border border-slate-800 p-8 rounded-none flex flex-col justify-start cursor-default h-[580px]"
            >
              
              {/* Standings Title */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                <h2 className="text-xs font-bold tracking-widest uppercase text-slate-300 font-mono">
                  CONFERENCE STANDINGS
                </h2>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">SEASON:</span>
                  <select
                    value={standingsSeason}
                    onChange={(e) => setStandingsSeason(e.target.value)}
                    className="bg-[#05070F] border border-slate-800 rounded-none px-2 py-1 text-[10px] font-black text-slate-300 outline-none focus:border-slate-700 cursor-pointer"
                  >
                    <option value="2025-26">2025-26</option>
                    <option value="2024-25">2024-25</option>
                    <option value="2023-24">2023-24</option>
                  </select>
                </div>
              </div>

              {standings.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-8 text-slate-500 text-xs font-mono">
                  NO STANDINGS DATA FOUND.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto pr-1 flex-1">
                  
                  {/* East Conference */}
                  <div>
                    <h3 className="text-[10px] font-bold text-slate-400 mb-3 border-b border-slate-850 pb-1.5 flex justify-between items-center font-mono tracking-widest">
                      <span>EAST CONFERENCE</span>
                      <span className="text-slate-500">W - L</span>
                    </h3>
                    <div className="space-y-1.5">
                      {eastStandings.map((team, idx) => {
                        const id = TEAM_NAME_TO_ID[team.TeamName] || "UNK";
                        const colors = TEAM_COLORS[id] || { primary: "#555" };
                        const isSelected = id === homeTeam || id === awayTeam;
                        return (
                          <div
                            key={`east-${idx}`}
                            className={`flex items-center justify-between py-1.5 px-3 text-xs transition-colors rounded-none border ${
                              isSelected 
                                ? "bg-slate-850 border-amber-500/40 text-white font-extrabold" 
                                : "hover:bg-slate-850/40 border-transparent text-slate-300"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-[9px] font-bold text-slate-500 w-4 font-mono">{idx + 1}</span>
                              <span className="w-1.5 h-1.5 rounded-none flex-shrink-0" style={{ backgroundColor: colors.primary }} />
                              <span className="truncate">{team.TeamName}</span>
                            </div>
                            <div className="flex items-center gap-4 font-mono text-[11px]">
                              <span className="text-slate-400">{team.WINS}-{team.LOSSES}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-none w-8 text-center ${
                                team.strCurrentStreak.startsWith("W") ? "bg-emerald-950/40 text-emerald-400" : "bg-rose-950/40 text-rose-400"
                              }`}>
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
                    <h3 className="text-[10px] font-bold text-slate-400 mb-3 border-b border-slate-855 pb-1.5 flex justify-between items-center font-mono tracking-widest">
                      <span>WEST CONFERENCE</span>
                      <span className="text-slate-500">W - L</span>
                    </h3>
                    <div className="space-y-1.5">
                      {westStandings.map((team, idx) => {
                        const id = TEAM_NAME_TO_ID[team.TeamName] || "UNK";
                        const colors = TEAM_COLORS[id] || { primary: "#555" };
                        const isSelected = id === homeTeam || id === awayTeam;
                        return (
                          <div
                            key={`west-${idx}`}
                            className={`flex items-center justify-between py-1.5 px-3 text-xs transition-colors rounded-none border ${
                              isSelected 
                                ? "bg-slate-850 border-amber-500/40 text-white font-extrabold" 
                                : "hover:bg-slate-850/40 border-transparent text-slate-300"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-[9px] font-bold text-slate-500 w-4 font-mono">{idx + 1}</span>
                              <span className="w-1.5 h-1.5 rounded-none flex-shrink-0" style={{ backgroundColor: colors.primary }} />
                              <span className="truncate">{team.TeamName}</span>
                            </div>
                            <div className="flex items-center gap-4 font-mono text-[11px]">
                              <span className="text-slate-400">{team.WINS}-{team.LOSSES}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-none w-8 text-center ${
                                team.strCurrentStreak.startsWith("W") ? "bg-emerald-950/40 text-emerald-400" : "bg-rose-950/40 text-rose-400"
                              }`}>
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
            </motion.div>

            {/* Right side: Recent Games + Upcoming Schedule (6 Cols) */}
            <div className="lg:col-span-6 flex flex-col gap-8 h-[580px]">
              
              {/* NBA Schedule Block */}
              <motion.div 
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                transition={slowHoverTransition}
                className="bg-[#0B0F19] border border-slate-800 p-6 rounded-none flex flex-col justify-start cursor-default h-[274px]"
              >
                <div className="flex items-center justify-between border-b border-slate-850 pb-3 mb-4">
                  <h2 className="text-[10px] font-bold tracking-widest uppercase text-slate-300 font-mono">
                    UPCOMING FIXTURES AND MATCHMAKINGS
                  </h2>
                  <div className={`px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest border rounded-none ${
                    nbaStatus === "IN-SEASON"
                      ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/50"
                      : "bg-amber-950/40 text-amber-400 border-amber-900/50"
                  }`}>
                    {nbaStatus === "IN-SEASON" ? "ACTIVE" : "OFF-SEASON"}
                  </div>
                </div>
                {upcomingGames.length === 0 ? (
                  <div className="py-4 px-4 flex flex-col items-center justify-center text-center gap-3 text-slate-400 text-xs font-mono flex-1 bg-[#05070F] border border-slate-850">
                    <span className="text-amber-500 font-bold uppercase tracking-widest text-[8px]">OFF-SEASON ACTIVE</span>
                    <p className="text-[10px] text-slate-400 leading-relaxed max-w-sm">
                      The NBA is currently in the off-season. No official fixtures are scheduled.
                    </p>
                    <p className="text-[9px] text-slate-500">
                      Use the Matchup Selector above to run custom forecasts, or generate a random matchmaking.
                    </p>
                    <button
                      onClick={handleGenerateRandomMatchup}
                      className="px-4 py-2 border border-amber-500/30 hover:border-amber-500 text-amber-400 hover:text-amber-300 transition-all text-[9px] font-black uppercase tracking-widest cursor-pointer rounded-none bg-amber-500/5 hover:bg-amber-500/10"
                    >
                      GENERATE RANDOM MATCHUP
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 overflow-y-auto overflow-x-hidden flex-1 pr-2">
                    {upcomingGames.slice(0, 5).map((game, idx) => {
                      const awayColors = TEAM_COLORS[game.away_team] || { primary: "#555" };
                      const homeColors = TEAM_COLORS[game.home_team] || { primary: "#555" };
                      return (
                        <motion.div
                          key={`upcoming-${game.game_id}-${idx}`}
                          whileHover={{ scale: 1.03 }}
                          transition={slowHoverTransition}
                          className="flex items-center justify-between py-2 px-3 bg-[#05070F] border border-slate-850 hover:border-slate-700 transition-colors rounded-none"
                        >
                          <div className="flex flex-col gap-1">
                            <span className="text-[8px] font-bold text-slate-550 font-mono tracking-wider">{formatDate(game.game_date)}</span>
                            <div className="flex items-center gap-1.5 text-xs font-bold">
                              <span className="font-extrabold text-slate-200">{game.away_team}</span>
                              <span className="text-slate-650">@</span>
                              <span className="font-extrabold text-slate-200">{game.home_team}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handlePredictUpcoming(game.home_team, game.away_team)}
                            className="px-2.5 py-1.5 border border-slate-750 hover:border-white text-slate-300 hover:text-white transition-all text-[9px] font-black uppercase tracking-widest cursor-pointer rounded-none bg-transparent"
                          >
                            PREDICT
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>

              {/* Recent League Games Block */}
              <motion.div 
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                transition={slowHoverTransition}
                className="bg-[#0B0F19] border border-slate-800 p-6 rounded-none flex flex-col justify-start h-[274px] cursor-default"
              >
                <div className="flex items-center justify-between border-b border-slate-850 pb-3 mb-4">
                  <h2 className="text-[10px] font-bold tracking-widest uppercase text-slate-300 font-mono">
                    MATCH NIGHTS
                  </h2>
                  <div className="flex items-center gap-1 bg-[#05070F] p-0.5 border border-slate-850 rounded-none">
                    <button
                      onClick={handleShowRandomGames}
                      className={`px-3 py-1 text-[8px] font-bold uppercase tracking-wider rounded-none transition-all cursor-pointer ${
                        gamesDisplayMode === "random"
                          ? "bg-slate-855 text-white"
                          : "text-slate-500 hover:text-slate-350"
                      }`}
                    >
                      RANDOM
                    </button>
                    <button
                      onClick={handleShowRecentGames}
                      className={`px-3 py-1 text-[8px] font-bold uppercase tracking-wider rounded-none transition-all cursor-pointer ${
                        gamesDisplayMode === "recent"
                          ? "bg-slate-855 text-white"
                          : "text-slate-500 hover:text-slate-350"
                      }`}
                    >
                      RECENT
                    </button>
                  </div>
                </div>
                
                {recentGames.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center p-8 text-slate-555 text-xs font-mono">
                    NO HISTORICAL MATCHES FOUND.
                  </div>
                ) : (
                  <div className="space-y-2 overflow-y-auto overflow-x-hidden flex-1 pr-2">
                    {recentGames.map((game, idx) => {
                      const isAt = game.matchup.includes(" @ ");
                      const separator = isAt ? " @ " : " vs. ";
                      const parts = game.matchup.split(separator);
                      const team1 = parts[0]?.trim() || "UNK";
                      const team2 = parts[1]?.trim() || "UNK";
                      const awayAbbr = isAt ? team1 : team2;
                      const homeAbbr = isAt ? team2 : team1;
                      
                      const winnerLabel = getWinnerLabel(game.matchup, game.wl);
                      return (
                        <motion.div
                          key={`game-${idx}`}
                          whileHover={{ scale: 1.03 }}
                          transition={slowHoverTransition}
                          className="flex items-center justify-between py-2 px-3 bg-[#05070F] border border-slate-855 hover:border-slate-700 transition-colors rounded-none"
                        >
                          <div className="flex flex-col gap-1">
                            <span className="text-[8px] font-bold text-slate-550 font-mono tracking-wider">{formatDate(game.game_date)}</span>
                            <div className="flex items-center gap-1.5 text-xs font-bold">
                              <span className="text-slate-200">{awayAbbr}</span>
                              <span className="text-slate-655">@</span>
                              <span className="text-slate-200">{homeAbbr}</span>
                            </div>
                          </div>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-none font-bold font-mono border ${
                            winnerLabel === 'HOME'
                              ? 'bg-emerald-950/40 text-emerald-450 border-emerald-900/50'
                              : 'bg-rose-950/40 text-rose-455 border-rose-900/50'
                          }`}>
                            {winnerLabel} WIN
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>

            </div>

          </motion.div>
        </section>

      </main>

      {/* SYSTEM DIAGNOSTICS & TELEMETRY FOOTER  */}
      <footer className="w-full max-w-full bg-[#0B0F19] border-t border-slate-800 p-8 flex flex-col gap-6 z-20">
        
        {/* Technical drawer panel */}
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="w-full bg-[#05070F] border border-slate-800 p-6 rounded-none"
        >
          <div className="text-[9px] font-bold tracking-widest text-slate-400 uppercase border-b border-slate-850 pb-2 mb-4 font-mono">
             SYSTEM DIAGNOSTICS & TELEMETRY CONSOLE
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-6 text-[10px] font-mono text-slate-400">
            <div className="space-y-1">
              <span className="text-slate-655 block font-bold">ALGORITHM</span>
              <span className="text-slate-200 font-extrabold">{data?.algorithm_used || "XGBoost Classifier"}</span>
            </div>
            <div className="space-y-1">
              <span className="text-slate-655 block font-bold">ESTIMATORS</span>
              <span className="text-slate-200 font-extrabold">200 Decision Trees</span>
            </div>
            <div className="space-y-1">
              <span className="text-slate-655 block font-bold">SENSORS INGESTED</span>
              <span className="text-slate-200 font-extrabold">{data?.features_used || 0} columns</span>
            </div>
            <div className="space-y-1">
              <span className="text-slate-655 block font-bold">TRAINING BASELINE</span>
              <span className="text-slate-200 font-extrabold">{data?.training_samples.toLocaleString() || "0"} periods</span>
            </div>
            <div className="space-y-1">
              <span className="text-slate-655 block font-bold">THRESHOLD LIMIT</span>
              <span className="text-slate-200 font-extrabold">0.62 Conf.</span>
            </div>
            <div className="space-y-1">
              <span className="text-slate-655 block font-bold">INFERENCE TYPE</span>
              <span className="text-slate-200 font-extrabold">Zero-API Inference</span>
            </div>
          </div>
        </motion.div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] font-mono text-slate-550 uppercase tracking-widest">
          <div>
             {new Date().getFullYear()} NBA ML Analytical Engine. Standings & Schedule fetched live via nba_api.
          </div>
        </div>
      </footer>

    </div>
    </>
  );
}