// ============================================================
// Database row types (mirrors Supabase schema)
// ============================================================

export type PlayMode = "teams" | "whole_room";

export type RoundPhase =
  | "lobby"
  | "base_applied"
  | "voting_open"
  | "voting_closed"
  | "net_applied"
  | "collapsed"
  | "finished";

export interface Room {
  id: string;
  code: string;
  mode: PlayMode;
  num_teams: number;
  current_round: number; // 0 = lobby
  phase: RoundPhase;
  voting_ends_at: string | null;
  voting_opened_at: string | null;
  host_secret: string;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  room_id: string;
  slot: number;
  name: string;
  economy: number;
  cohesion: number;
  autonomy: number;
  collapsed: boolean;
  created_at: string;
}

export interface Player {
  id: string;
  room_id: string;
  team_id: string | null;
  nickname: string | null;
  session_id: string;
  created_at: string;
}

export interface Vote {
  id: string;
  room_id: string;
  team_id: string | null;
  player_id: string;
  round: number;
  choice: "A" | "B" | "C";
  created_at: string;
}

// ============================================================
// Game / Deck types
// ============================================================

export interface StatDelta {
  economy: number;
  cohesion: number;
  autonomy: number;
}

export interface RoundCard {
  round: number;
  title: string;
  baseEffect: StatDelta;
  options: {
    A: StatDelta;
    B: StatDelta;
    C: StatDelta;
  };
}

export interface VoteTally {
  A: number;
  B: number;
  C: number;
  total: number;
}

export interface WeightedVoteTally extends VoteTally {
  weightedA: number;
  weightedB: number;
  weightedC: number;
}

export interface RoundResult {
  winner: "A" | "B" | "C";
  tally: VoteTally;
  wasTie: boolean;
}

// ============================================================
// UI / state types
// ============================================================

export interface CityStats {
  economy: number;
  cohesion: number;
  autonomy: number;
}
