"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";
import { getHostSecret } from "@/lib/session";
import {
  applyBaseEffect,
  openVoting,
  closeVoting,
  applyNetEffect,
  advanceRound,
  endGame,
  startRound,
} from "@/lib/actions";
import { getCard, resolveRound, tallyVotes, weightedTallyVotes, resolveWeightedRound } from "@/lib/classicDeck";
import type { WeightedVoteTally } from "@/types";
import { CityStatsCard } from "@/components/shared/StatBar";
import { ParticipationMeter } from "@/components/shared/ParticipationMeter";
import { CountdownTimer } from "@/components/shared/CountdownTimer";
import { DeltaBadge } from "@/components/shared/DeltaBadge";
import type { Room, Team, Player, Vote } from "@/types";

export default function HostRoomPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [allVotes, setAllVotes] = useState<Vote[]>([]);
  const [hostSecret, setHostSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{
    winner: "A" | "B" | "C";
    wasTie: boolean;
  } | null>(null);

  // Load host secret from localStorage
  useEffect(() => {
    setHostSecret(getHostSecret(code));
  }, [code]);

  // Initial data fetch
  useEffect(() => {
    async function load() {
      const [{ data: roomData }, { data: teamsData }, { data: playersData }] =
        await Promise.all([
          supabase.from("rooms").select("*").eq("code", code).single(),
          supabase
            .from("teams")
            .select("*")
            .eq("room_id", (await supabase.from("rooms").select("id").eq("code", code).single()).data?.id)
            .order("slot"),
          supabase
            .from("players")
            .select("*")
            .eq("room_id", (await supabase.from("rooms").select("id").eq("code", code).single()).data?.id),
        ]);
      if (roomData) setRoom(roomData as Room);
      if (teamsData) setTeams(teamsData as Team[]);
      if (playersData) setPlayers(playersData as Player[]);
      setLoading(false);
    }
    load();
  }, [code]);

  // Realtime subscriptions
  useEffect(() => {
    if (!room) return;
    const roomId = room.id;

    const roomSub = supabase
      .channel(`host-room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => setRoom((prev) => ({ ...prev, ...payload.new } as Room))
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teams", filter: `room_id=eq.${roomId}` },
        () => {
          supabase.from("teams").select("*").eq("room_id", roomId).order("slot")
            .then(({ data }) => { if (data) setTeams(data as Team[]); });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        () => {
          supabase.from("players").select("*").eq("room_id", roomId)
            .then(({ data }) => { if (data) setPlayers(data as Player[]); });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes", filter: `room_id=eq.${roomId}` },
        () => {
          supabase.from("votes").select("*").eq("room_id", roomId).eq("round", room.current_round)
            .then(({ data }) => { if (data) setVotes(data as Vote[]); });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(roomSub); };
  }, [room?.id, room?.current_round]);

  // Fetch votes for current round
  useEffect(() => {
    if (!room || room.current_round === 0) { setVotes([]); return; }
    supabase.from("votes").select("*")
      .eq("room_id", room.id).eq("round", room.current_round)
      .then(({ data }) => { if (data) setVotes(data as Vote[]); });
  }, [room?.id, room?.current_round]);

  // Fetch ALL votes when game ends (for stats)
  useEffect(() => {
    if (!room || (room.phase !== "finished" && room.phase !== "collapsed")) return;
    supabase.from("votes").select("*").eq("room_id", room.id)
      .then(({ data }) => { if (data) setAllVotes(data as Vote[]); });
  }, [room?.id, room?.phase]);

  const doAction = useCallback(
    async (fn: () => Promise<{ error?: string; winner?: "A" | "B" | "C"; wasTie?: boolean }>) => {
      if (!hostSecret) return;
      setActionLoading(true);
      const result = await fn();
      if (result.winner) {
        setLastResult({ winner: result.winner, wasTie: result.wasTie ?? false });
      }
      setActionLoading(false);
    },
    [hostSecret]
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-ink flex items-center justify-center">
        <p className="font-display text-muted uppercase tracking-widest text-sm animate-pulse">
          Loading room…
        </p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="min-h-screen bg-ink flex items-center justify-center px-4">
        <p className="font-display text-red-400">Room not found: {code}</p>
      </main>
    );
  }

  if (!hostSecret) {
    return (
      <main className="min-h-screen bg-ink flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-display text-muted mb-2">Not the host of this room.</p>
          <p className="text-xs text-muted">Open on the device that created this room.</p>
        </div>
      </main>
    );
  }

  const joinUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/join/${code}`;
  const card = room.current_round > 0 ? getCard(room.current_round) : null;

  // Vote tallies
  const roundVotes = votes.filter((v) => v.round === room.current_round);
  const totalPlayers = players.length;
  const votedCount = roundVotes.length;

  // Per-team vote tallies (teams mode)
  function teamVoteTally(teamId: string) {
    const tv = roundVotes.filter((v) => v.team_id === teamId);
    return tallyVotes(tv);
  }

  function teamWeightedVoteTally(teamId: string): WeightedVoteTally | null {
    if (!room || !room.voting_opened_at) return null;
    const votingOpenedAt = room.voting_opened_at;
    const tv = roundVotes.filter((v) => v.team_id === teamId);
    return weightedTallyVotes(tv, votingOpenedAt);
  }

  // Global tally (whole_room mode)
  const globalTally = tallyVotes(roundVotes);
  const globalResult = roundVotes.length > 0 ? resolveRound(globalTally) : null;

  // Weighted global tally
  const globalWeightedTally =
    room.voting_opened_at && roundVotes.length > 0
      ? weightedTallyVotes(roundVotes, room.voting_opened_at)
      : null;
  const globalWeightedResult = globalWeightedTally
    ? resolveWeightedRound(globalWeightedTally)
    : null;

  return (
    <main className="min-h-screen bg-ink">
      {/* Top bar */}
      <div className="border-b border-[#2A2A2A] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="live-dot" />
          <span className="font-display text-xs text-muted uppercase tracking-widest">
            Out of Joint
          </span>
          <span className="font-display text-xs text-muted">·</span>
          <span className="font-display text-sm text-accent tracking-widest">{code}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-display text-xs text-muted tabular-nums">{players.length} players</span>
          {room.current_round > 0 && (
            <span className="round-badge">{room.current_round}</span>
          )}
        </div>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">

        {/* ============ LOBBY ============ */}
        {room.phase === "lobby" && room.current_round === 0 && (
          <LobbyPanel
            code={code}
            joinUrl={joinUrl}
            mode={room.mode}
            players={players}
            teams={teams}
            onStart={() =>
              doAction(() => startRound(code, hostSecret!, 1))
            }
            actionLoading={actionLoading}
          />
        )}

        {/* ============ ACTIVE ROUND ============ */}
        {room.current_round > 0 && card && room.phase !== "finished" && room.phase !== "collapsed" && (
          <RoundPanel
            room={room}
            card={card}
            teams={teams}
            players={players}
            votes={roundVotes}
            votedCount={votedCount}
            totalPlayers={totalPlayers}
            globalTally={globalTally}
            globalResult={globalResult}
            globalWeightedTally={globalWeightedTally}
            globalWeightedResult={globalWeightedResult}
            teamVoteTally={teamVoteTally}
            teamWeightedVoteTally={teamWeightedVoteTally}
            lastResult={lastResult}
            actionLoading={actionLoading}
            onApplyBase={() => doAction(() => applyBaseEffect(code, hostSecret!))}
            onOpenVoting={() => doAction(() => openVoting(code, hostSecret!))}
            onCloseVoting={() => doAction(() => closeVoting(code, hostSecret!))}
            onApplyNet={() =>
              doAction(async () => {
                const r = await applyNetEffect(code, hostSecret!);
                return r;
              })
            }
            onNextRound={() => {
              setLastResult(null);
              doAction(() => advanceRound(code, hostSecret!));
            }}
            onEndGame={() => doAction(() => endGame(code, hostSecret!))}
          />
        )}

        {/* ============ COLLAPSED ============ */}
        {room.phase === "collapsed" && (
          <CollapsedPanel teams={teams} />
        )}

        {/* ============ FINISHED ============ */}
        {room.phase === "finished" && (
          <FinishedPanel teams={teams} />
        )}

        {/* ============ SESSION STATS ============ */}
        {(room.phase === "finished" || room.phase === "collapsed") && (
          <SessionStatsPanel
            allVotes={allVotes}
            players={players}
            room={room}
          />
        )}

        {/* Stats always visible during play */}
        {room.current_round > 0 && (
          <div className="space-y-2">
            <p className="section-label">City Stats</p>
            <div className="grid grid-cols-1 gap-2">
              {teams.map((t) => (
                <CityStatsCard
                  key={t.id}
                  economy={t.economy}
                  cohesion={t.cohesion}
                  autonomy={t.autonomy}
                  teamName={room.mode === "teams" ? t.name : "The City"}
                  compact
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ============================================================
// Sub-panels
// ============================================================

function LobbyPanel({
  code,
  joinUrl,
  mode,
  players,
  teams,
  onStart,
  actionLoading,
}: {
  code: string;
  joinUrl: string;
  mode: string;
  players: Player[];
  teams: Team[];
  onStart: () => void;
  actionLoading: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-4 py-4">
        <p className="section-label">Join at</p>
        <p className="font-display text-5xl tracking-[0.3em] text-accent">{code}</p>
        <div className="p-3 bg-white">
          <QRCodeSVG value={joinUrl} size={160} level="M" />
        </div>
        <p className="text-xs text-muted">{joinUrl}</p>
      </div>

      <div className="card-dark">
        <p className="section-label mb-3">
          Mode: {mode === "teams" ? "Teams as Cities" : "One City"}
        </p>
        {mode === "teams" && (
          <div className="space-y-1">
            {teams.map((t) => {
              const teamPlayers = players.filter((p) => p.team_id === t.id);
              return (
                <div key={t.id} className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-sm text-paper">{t.name}</span>
                  <span className="text-xs text-muted">{teamPlayers.length} players</span>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted mt-3">{players.length} total joined</p>
      </div>

      <button
        onClick={onStart}
        disabled={actionLoading || players.length === 0}
        className="btn-primary w-full"
      >
        {actionLoading ? "Starting…" : "Start Round 1 →"}
      </button>
      {players.length === 0 && (
        <p className="text-xs text-muted text-center">
          Waiting for players to join…
        </p>
      )}
    </div>
  );
}

function RoundPanel({
  room,
  card,
  teams,
  players,
  votes,
  votedCount,
  totalPlayers,
  globalTally,
  globalResult,
  globalWeightedTally,
  globalWeightedResult,
  teamVoteTally,
  teamWeightedVoteTally,
  lastResult,
  actionLoading,
  onApplyBase,
  onOpenVoting,
  onCloseVoting,
  onApplyNet,
  onNextRound,
  onEndGame,
}: {
  room: Room;
  card: ReturnType<typeof getCard>;
  teams: Team[];
  players: Player[];
  votes: Vote[];
  votedCount: number;
  totalPlayers: number;
  globalTally: ReturnType<typeof tallyVotes>;
  globalResult: ReturnType<typeof resolveRound> | null;
  globalWeightedTally: WeightedVoteTally | null;
  globalWeightedResult: ReturnType<typeof resolveWeightedRound> | null;
  teamVoteTally: (teamId: string) => ReturnType<typeof tallyVotes>;
  teamWeightedVoteTally: (teamId: string) => WeightedVoteTally | null;
  lastResult: { winner: "A" | "B" | "C"; wasTie: boolean } | null;
  actionLoading: boolean;
  onApplyBase: () => void;
  onOpenVoting: () => void;
  onCloseVoting: () => void;
  onApplyNet: () => void;
  onNextRound: () => void;
  onEndGame: () => void;
}) {
  const anyCollapsed = teams.some((t) => t.collapsed);

  return (
    <div className="space-y-5">
      {/* Card header */}
      <div className="flex items-start gap-4">
        <span className="round-badge mt-1">{room.current_round}</span>
        <div>
          <h2 className="title-serif text-2xl text-paper">{card.title}</h2>
          <p className="font-display text-xs text-muted mt-1.5 tracking-widest uppercase">Round {room.current_round} of 4</p>
        </div>
      </div>

      {/* Base effect */}
      <div className="card-dark">
        <DeltaBadge delta={card.baseEffect} label="Base Effect" />
      </div>

      {/* Phase: lobby → show Apply Base Effect */}
      {room.phase === "lobby" && (
        <button onClick={onApplyBase} disabled={actionLoading} className="btn-primary w-full">
          Apply Base Effect
        </button>
      )}

      {/* Phase: base_applied → show Open Voting */}
      {room.phase === "base_applied" && (
        <div className="space-y-4">
          <div className="card-dark space-y-2">
            <p className="section-label">Voting Options</p>
            {(["A", "B", "C"] as const).map((opt) => (
              <div key={opt} className="flex items-center gap-3 py-1">
                <span className="font-display text-sm text-accent w-5">{opt}</span>
                <DeltaBadge delta={card.options[opt]} />
              </div>
            ))}
          </div>
          <button onClick={onOpenVoting} disabled={actionLoading} className="btn-primary w-full">
            Open Voting
          </button>
        </div>
      )}

      {/* Phase: voting_open → show participation + close button */}
      {room.phase === "voting_open" && (
        <div className="space-y-4">
          {room.voting_ends_at && (
            <div className="card-dark">
              <CountdownTimer endsAt={room.voting_ends_at} onExpired={onCloseVoting} />
              <p className="font-display text-[10px] text-accent uppercase tracking-wider mt-2">
                ⚡ Velocity-weighted — early votes count more
              </p>
            </div>
          )}

          <div className="card-dark">
            <ParticipationMeter
              voted={votedCount}
              total={totalPlayers}
              label={`Votes in: ${votedCount}/${totalPlayers}`}
            />
            {room.mode === "teams" && (
              <div className="mt-3 space-y-1">
                {teams.map((t) => {
                  const teamPlayers = players.filter((p) => p.team_id === t.id);
                  const tv = teamVoteTally(t.id);
                  return (
                    <div key={t.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted">{t.name}</span>
                      <span className="font-display text-paper">{tv.total}/{teamPlayers.length}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button onClick={onCloseVoting} disabled={actionLoading} className="btn-secondary w-full">
            Close Voting
          </button>
        </div>
      )}

      {/* Phase: voting_closed → show results + Apply Net Effect */}
      {room.phase === "voting_closed" && (
        <div className="space-y-4">
          <div className="card-dark space-y-3">
            <div className="flex items-center justify-between">
              <p className="section-label">Results</p>
              {globalWeightedTally && (
                <span className="font-display text-[10px] text-accent uppercase tracking-wider border border-accent/30 px-2 py-0.5">
                  Velocity-weighted
                </span>
              )}
            </div>
            {room.mode === "whole_room" ? (
              <VoteSummary tally={globalTally} weightedTally={globalWeightedTally ?? undefined} />
            ) : (
              <div className="space-y-3">
                {teams.map((t) => (
                  <div key={t.id}>
                    <p className="text-xs text-muted mb-1">{t.name}</p>
                    <VoteSummary
                      tally={teamVoteTally(t.id)}
                      weightedTally={teamWeightedVoteTally(t.id) ?? undefined}
                    />
                  </div>
                ))}
              </div>
            )}
            {lastResult?.wasTie && (
              <p className="text-xs text-amber-400 font-display border border-amber-500/30 px-2 py-1">
                ⚡ Tie broken by coin flip — {lastResult.winner} wins
              </p>
            )}
          </div>

          <button onClick={onApplyNet} disabled={actionLoading} className="btn-primary w-full">
            Apply Net Effect ({(globalWeightedResult ?? globalResult)?.winner ?? "?"})
          </button>
        </div>
      )}

      {/* Phase: net_applied → show next round or end */}
      {room.phase === "net_applied" && (
        <div className="space-y-4">
          {lastResult && (
            <div className="card-dark">
              <p className="section-label mb-2">Winner: Option {lastResult.winner}</p>
              <DeltaBadge delta={card.options[lastResult.winner]} />
              {lastResult.wasTie && (
                <p className="text-xs text-amber-400 mt-2 font-display">
                  ⚡ Tie-break: coin flip selected {lastResult.winner}
                </p>
              )}
            </div>
          )}

          {anyCollapsed && (
            <div className="border border-red-500/50 bg-red-500/5 px-4 py-3">
              <p className="text-red-400 font-display text-sm uppercase tracking-wider">
                ⚠ City Collapsed
              </p>
              <p className="text-xs text-muted mt-1">
                {teams.filter((t) => t.collapsed).map((t) => t.name).join(", ")} — reveal meltdown card
              </p>
            </div>
          )}

          {room.current_round < 4 ? (
            <button onClick={onNextRound} disabled={actionLoading} className="btn-primary w-full">
              Next Round ({room.current_round + 1}) →
            </button>
          ) : (
            <button onClick={onEndGame} disabled={actionLoading} className="btn-primary w-full">
              End Game →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function VoteSummary({
  tally,
  weightedTally,
}: {
  tally: ReturnType<typeof tallyVotes>;
  weightedTally?: WeightedVoteTally;
}) {
  const useWeighted = !!weightedTally && weightedTally.total > 0;
  const wScores = {
    A: weightedTally?.weightedA ?? 0,
    B: weightedTally?.weightedB ?? 0,
    C: weightedTally?.weightedC ?? 0,
  };
  const rawMax = Math.max(tally.A, tally.B, tally.C);
  const wMax = Math.max(wScores.A, wScores.B, wScores.C);

  return (
    <div className="space-y-1.5">
      {(["A", "B", "C"] as const).map((opt) => {
        const count = tally[opt];
        const wScore = wScores[opt];
        const barPct = useWeighted
          ? wMax > 0 ? (wScore / wMax) * 100 : 0
          : tally.total > 0 ? (count / tally.total) * 100 : 0;
        const isWinner = useWeighted
          ? wScore === wMax && wMax > 0
          : count === rawMax && rawMax > 0;

        return (
          <div key={opt} className="flex items-center gap-2">
            <span className={`font-display text-xs w-4 ${isWinner ? "text-accent" : "text-muted"}`}>
              {opt}
            </span>
            <div className="flex-1 stat-bar-track h-2">
              <div
                className={`h-full transition-all duration-500 ${isWinner ? "bg-accent" : "bg-white/30"}`}
                style={{ width: `${barPct}%` }}
              />
            </div>
            <span className="font-display text-xs text-muted w-5 text-right tabular-nums">
              {count}
            </span>
            {useWeighted && (
              <span className="font-display text-xs text-muted w-10 text-right tabular-nums">
                {wScore.toFixed(2)}
              </span>
            )}
          </div>
        );
      })}
      {useWeighted && (
        <p className="text-[10px] text-muted pt-0.5">
          raw votes · weighted pts — bars show weighted power
        </p>
      )}
    </div>
  );
}

function CollapsedPanel({ teams }: { teams: Team[] }) {
  const collapsed = teams.filter((t) => t.collapsed);
  return (
    <div className="space-y-6 text-center py-8">
      <div className="inline-block border border-red-500 px-6 py-3">
        <p className="title-serif text-2xl text-red-400">
          City Collapsed
        </p>
      </div>
      <div className="space-y-1">
        {collapsed.map((t) => (
          <p key={t.id} className="text-sm text-muted">{t.name} — {t.economy}E / {t.cohesion}C / {t.autonomy}A</p>
        ))}
      </div>
      <div className="card-dark text-left">
        <p className="section-label mb-2">Meltdown Ending</p>
        <p className="text-sm text-muted leading-relaxed">
          Reveal the meltdown ending card from the physical deck. Read it aloud to the table.
        </p>
      </div>
    </div>
  );
}

function SessionStatsPanel({
  allVotes,
  players,
  room,
}: {
  allVotes: Vote[];
  players: Player[];
  room: Room;
}) {
  const totalPlayers = players.length;
  const rounds = [1, 2, 3, 4];
  const roundsPlayed = room.current_round;

  const stats = rounds.map((r) => {
    const roundVotes = allVotes.filter((v) => v.round === r);
    const pct = totalPlayers > 0 ? Math.round((roundVotes.length / totalPlayers) * 100) : 0;
    return { round: r, votes: roundVotes.length, pct, played: r <= roundsPlayed };
  });

  const avgParticipation = stats.filter((s) => s.played && totalPlayers > 0).reduce((sum, s) => sum + s.pct, 0) / Math.max(1, stats.filter((s) => s.played).length);
  const completed = room.phase === "finished";

  return (
    <div className="space-y-4 border-t border-[#2A2A2A] pt-6 mt-2">
      <p className="section-label">Session Metrics</p>

      {/* Metric 1: Avg participation */}
      <div className="card-dark space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-paper font-body">Vote participation</span>
          <span
            className={`font-display text-xl tabular-nums ${
              avgParticipation >= 80 ? "text-green-400" : avgParticipation >= 50 ? "text-yellow-400" : "text-red-400"
            }`}
          >
            {Math.round(avgParticipation)}%
          </span>
        </div>
        <p className="text-xs text-muted">Average across rounds played · Target: 80%+</p>

        {/* Per-round breakdown */}
        <div className="space-y-2 pt-1">
          {stats.filter((s) => s.played).map((s) => (
            <div key={s.round} className="flex items-center gap-3">
              <span className="font-display text-xs text-muted w-5">R{s.round}</span>
              <div className="flex-1 stat-bar-track h-1.5">
                <div
                  className={`h-full transition-all duration-700 ${s.pct >= 80 ? "bg-green-500" : s.pct >= 50 ? "bg-yellow-500" : "bg-accent"}`}
                  style={{ width: `${s.pct}%` }}
                />
              </div>
              <span className="font-display text-xs tabular-nums text-muted w-16 text-right">
                {s.votes}/{totalPlayers} · {s.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Metric 2: Session completion */}
      <div className="card-dark flex items-center justify-between">
        <div>
          <p className="text-sm text-paper font-body">Session outcome</p>
          <p className="text-xs text-muted mt-0.5">
            {completed
              ? `All 4 rounds completed`
              : `Ended at round ${roundsPlayed} — city collapsed`}
          </p>
        </div>
        <span
          className={`font-display text-xs uppercase tracking-wider px-3 py-1.5 border ${
            completed
              ? "border-green-500/40 text-green-400"
              : "border-red-500/40 text-red-400"
          }`}
        >
          {completed ? "Complete" : "Collapsed"}
        </span>
      </div>

      <p className="text-xs text-muted text-center">{totalPlayers} players · {allVotes.length} total votes cast</p>
    </div>
  );
}

function FinishedPanel({ teams }: { teams: Team[] }) {
  const sorted = [...teams].sort(
    (a, b) => b.economy + b.cohesion + b.autonomy - (a.economy + a.cohesion + a.autonomy)
  );
  return (
    <div className="space-y-6 py-6">
      <div className="text-center">
        <p className="section-label mb-2">Game Over</p>
        <h2 className="title-serif text-3xl text-paper">Final Standings</h2>
      </div>
      <div className="space-y-2">
        {sorted.map((t, i) => {
          const total = t.economy + t.cohesion + t.autonomy;
          return (
            <div key={t.id} className="card-dark flex items-center gap-4">
              <span className="font-display text-2xl text-muted">{i + 1}</span>
              <div className="flex-1">
                <p className="font-display text-sm text-paper">{t.name}</p>
                <p className="text-xs text-muted">E{t.economy} C{t.cohesion} A{t.autonomy}</p>
              </div>
              <span className="font-display text-xl text-accent">{total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
