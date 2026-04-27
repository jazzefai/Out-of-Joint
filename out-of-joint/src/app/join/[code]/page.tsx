"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSessionId } from "@/lib/session";
import { getCard, formatDelta } from "@/lib/classicDeck";
import { CityStatsCard } from "@/components/shared/StatBar";
import { CountdownTimer } from "@/components/shared/CountdownTimer";
import { ParticipationMeter } from "@/components/shared/ParticipationMeter";
import { DeltaBadge } from "@/components/shared/DeltaBadge";
import type { Room, Team, Player, Vote } from "@/types";

export default function PlayerRoomPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();
  const sessionId = typeof window !== "undefined" ? getSessionId() : "";

  const [room, setRoom] = useState<Room | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [player, setPlayer] = useState<Player | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [myVote, setMyVote] = useState<"A" | "B" | "C" | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [voting, setVoting] = useState(false);
  const [selectedOption, setSelectedOption] = useState<"A" | "B" | "C" | null>(null);

  // Get or create player record
  const ensurePlayer = useCallback(
    async (roomId: string): Promise<Player | null> => {
      // Check existing
      const { data: existing } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", roomId)
        .eq("session_id", sessionId)
        .single();

      if (existing) return existing as Player;

      // Create new anonymous player
      const { data: created } = await supabase
        .from("players")
        .insert({ room_id: roomId, session_id: sessionId })
        .select()
        .single();

      return created as Player | null;
    },
    [sessionId]
  );

  // Initial load
  useEffect(() => {
    if (!sessionId) return;
    async function load() {
      const { data: roomData } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code)
        .single();

      if (!roomData) { setLoading(false); return; }
      setRoom(roomData as Room);

      const [{ data: teamsData }] = await Promise.all([
        supabase.from("teams").select("*").eq("room_id", roomData.id).order("slot"),
      ]);
      if (teamsData) setTeams(teamsData as Team[]);

      // Ensure player exists
      const p = await ensurePlayer(roomData.id);
      setPlayer(p);

      // Check existing vote for current round
      if (p && roomData.current_round > 0) {
        const { data: existingVote } = await supabase
          .from("votes")
          .select("choice")
          .eq("player_id", p.id)
          .eq("round", roomData.current_round)
          .single();
        if (existingVote) setMyVote(existingVote.choice as "A" | "B" | "C");
      }

      setLoading(false);
    }
    load();
  }, [code, sessionId, ensurePlayer]);

  // Realtime subscriptions
  useEffect(() => {
    if (!room) return;
    const roomId = room.id;

    const chan = supabase
      .channel(`player-room-${roomId}-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          setRoom((prev) => ({ ...prev, ...payload.new } as Room));
          // Reset vote state on new round
          const newRoom = payload.new as Room;
          if (newRoom.current_round !== room.current_round) {
            setMyVote(null);
            setSelectedOption(null);
          }
        }
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
        { event: "*", schema: "public", table: "votes", filter: `room_id=eq.${roomId}` },
        () => {
          supabase.from("votes").select("*").eq("room_id", roomId).eq("round", room.current_round)
            .then(({ data }) => { if (data) setVotes(data as Vote[]); });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(chan); };
  }, [room?.id, room?.current_round, sessionId]);

  // Fetch votes when round changes
  useEffect(() => {
    if (!room || room.current_round === 0) { setVotes([]); return; }
    supabase.from("votes").select("*")
      .eq("room_id", room.id)
      .eq("round", room.current_round)
      .then(({ data }) => { if (data) setVotes(data as Vote[]); });
  }, [room?.id, room?.current_round]);

  // Join a team
  async function joinTeam(teamId: string) {
    if (!player) return;
    setJoining(true);
    await supabase
      .from("players")
      .update({ team_id: teamId })
      .eq("id", player.id);
    setPlayer((p) => p ? { ...p, team_id: teamId } : p);
    setJoining(false);
  }

  // Cast vote
  async function castVote(choice: "A" | "B" | "C") {
    if (!player || !room || myVote) return;
    setVoting(true);
    setSelectedOption(choice);
    const { error } = await supabase.from("votes").insert({
      room_id: room.id,
      team_id: room.mode === "teams" ? player.team_id : null,
      player_id: player.id,
      round: room.current_round,
      choice,
    });
    if (!error) setMyVote(choice);
    setVoting(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-ink flex items-center justify-center">
        <p className="font-display text-muted uppercase tracking-widest text-sm animate-pulse">
          Connecting…
        </p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="min-h-screen bg-ink flex flex-col items-center justify-center px-4 gap-4">
        <p className="font-display text-red-400 text-center">Room not found: {code}</p>
        <a href="/join" className="btn-secondary">Try again</a>
      </main>
    );
  }

  const myTeam = teams.find((t) => t.id === player?.team_id);
  const card = room.current_round > 0 ? getCard(room.current_round) : null;
  const totalPlayers = votes.length; // approximate
  const myTeamVotes = myTeam
    ? votes.filter((v) => v.team_id === myTeam.id)
    : votes;

  return (
    <main className="min-h-screen bg-ink flex flex-col">
      {/* Top bar */}
      <div className="border-b border-white/10 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <span className="font-display text-accent tracking-widest text-sm">{code}</span>
        {myTeam && (
          <span className="font-display text-xs text-muted">{myTeam.name}</span>
        )}
        {room.current_round > 0 && (
          <span className="round-badge">{room.current_round}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 max-w-sm mx-auto w-full space-y-5">

        {/* ============ LOBBY / TEAM SELECT ============ */}
        {room.phase === "lobby" && room.current_round === 0 && (
          <TeamSelectPanel
            room={room}
            teams={teams}
            player={player}
            myTeam={myTeam}
            joining={joining}
            onJoin={joinTeam}
          />
        )}

        {/* ============ WAITING FOR ROUND TO START ============ */}
        {room.current_round === 0 && room.phase !== "lobby" && (
          <WaitingScreen message="Waiting for host to start…" />
        )}

        {/* ============ ROUND ACTIVE ============ */}
        {room.current_round > 0 && card && (
          <>
            {/* Need to pick team still */}
            {room.mode === "teams" && !player?.team_id && (
              <TeamSelectPanel
                room={room}
                teams={teams}
                player={player}
                myTeam={undefined}
                joining={joining}
                onJoin={joinTeam}
              />
            )}

            {/* Waiting for base effect */}
            {room.phase === "lobby" && (
              <WaitingScreen message="Host is applying base effect…" />
            )}

            {/* Waiting for voting */}
            {room.phase === "base_applied" && (
              <div className="space-y-4">
                <div>
                  <p className="section-label mb-1">Round {room.current_round}</p>
                  <h2 className="font-display text-2xl text-paper">{card.title}</h2>
                </div>
                <div className="card-dark">
                  <DeltaBadge delta={card.baseEffect} label="Base effect applied" />
                </div>
                {myTeam && (
                  <CityStatsCard
                    economy={myTeam.economy}
                    cohesion={myTeam.cohesion}
                    autonomy={myTeam.autonomy}
                    teamName={myTeam.name}
                  />
                )}
                <WaitingScreen message="Waiting for voting to open…" inline />
              </div>
            )}

            {/* Voting open! */}
            {room.phase === "voting_open" && (
              <VotingPanel
                card={card}
                myVote={myVote}
                selectedOption={selectedOption}
                voting={voting}
                room={room}
                myTeam={myTeam}
                onVote={castVote}
              />
            )}

            {/* Voting closed — waiting for host */}
            {room.phase === "voting_closed" && (
              <div className="space-y-4">
                <div className="card-dark text-center py-6">
                  <p className="font-display text-lg text-paper mb-1">Votes locked</p>
                  {myVote ? (
                    <p className="text-sm text-muted">
                      You voted <span className="text-accent font-display">{myVote}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted">You didn&apos;t vote this round</p>
                  )}
                </div>
                <WaitingScreen message="Host is reviewing results…" inline />
              </div>
            )}

            {/* Net effect applied */}
            {room.phase === "net_applied" && (
              <div className="space-y-4">
                <p className="section-label">Effects applied</p>
                {myTeam && (
                  <CityStatsCard
                    economy={myTeam.economy}
                    cohesion={myTeam.cohesion}
                    autonomy={myTeam.autonomy}
                    teamName={myTeam.name}
                  />
                )}
                {myTeam?.collapsed && (
                  <div className="border border-red-500 px-4 py-3 text-center">
                    <p className="font-display text-red-400 uppercase tracking-wider">City Collapsed</p>
                  </div>
                )}
                <WaitingScreen message="Next round starting soon…" inline />
              </div>
            )}
          </>
        )}

        {/* ============ COLLAPSED ============ */}
        {room.phase === "collapsed" && (
          <div className="text-center space-y-4 py-8">
            <p className="font-display text-3xl text-red-400">City Collapsed</p>
            <p className="text-sm text-muted">Listen to the host reveal the meltdown ending.</p>
          </div>
        )}

        {/* ============ FINISHED ============ */}
        {room.phase === "finished" && (
          <FinishedPanel teams={teams} myTeamId={myTeam?.id} />
        )}
      </div>
    </main>
  );
}

// ============================================================
// Sub-components
// ============================================================

function TeamSelectPanel({
  room,
  teams,
  player,
  myTeam,
  joining,
  onJoin,
}: {
  room: Room;
  teams: Team[];
  player: Player | null;
  myTeam: Team | undefined;
  joining: boolean;
  onJoin: (teamId: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="section-label mb-1">Room {room.code}</p>
        <h2 className="font-display text-2xl text-paper">
          {room.mode === "teams" ? "Pick Your City" : "Welcome"}
        </h2>
      </div>

      {room.mode === "teams" ? (
        <div className="space-y-2">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => onJoin(t.id)}
              disabled={joining || myTeam?.id === t.id}
              className={`w-full p-4 border-2 text-left transition-all ${
                myTeam?.id === t.id
                  ? "border-accent bg-accent/10 text-paper"
                  : "border-white/15 text-muted hover:border-white/40 hover:text-paper"
              }`}
            >
              <span className="font-display text-sm uppercase tracking-wider">{t.name}</span>
              {myTeam?.id === t.id && (
                <span className="text-xs text-accent ml-2">✓ Joined</span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="card-dark text-center py-4">
          <p className="text-sm text-muted">One city mode — you&apos;re all in this together.</p>
        </div>
      )}

      {myTeam && (
        <p className="text-xs text-muted text-center">
          Waiting for the host to start the game…
        </p>
      )}
    </div>
  );
}

function VotingPanel({
  card,
  myVote,
  selectedOption,
  voting,
  room,
  myTeam,
  onVote,
}: {
  card: ReturnType<typeof getCard>;
  myVote: "A" | "B" | "C" | null;
  selectedOption: "A" | "B" | "C" | null;
  voting: boolean;
  room: Room;
  myTeam: Team | undefined;
  onVote: (choice: "A" | "B" | "C") => void;
}) {
  const voted = !!myVote;

  return (
    <div className="space-y-5">
      <div>
        <p className="section-label mb-1">Round {room.current_round} — Vote Now</p>
        <h2 className="font-display text-xl text-paper">{card.title}</h2>
      </div>

      {room.voting_ends_at && (
        <CountdownTimer endsAt={room.voting_ends_at} />
      )}

      {voted ? (
        <div className="card-dark text-center py-6">
          <p className="font-display text-xl text-accent mb-1">Option {myVote}</p>
          <p className="text-sm text-muted">Vote locked in. Waiting for results…</p>
          <div className="mt-3">
            <DeltaBadge delta={card.options[myVote!]} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">Choose one:</p>
          {(["A", "B", "C"] as const).map((opt) => {
            const isSelected = selectedOption === opt;
            return (
              <button
                key={opt}
                onClick={() => onVote(opt)}
                disabled={voting || voted}
                className={`w-full p-4 border-2 text-left transition-all active:scale-[0.98] ${
                  isSelected
                    ? "border-accent bg-accent/15 vote-selected"
                    : "border-white/15 hover:border-white/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="font-display text-xl text-accent">{opt}</span>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <DeltaBadge delta={card.options[opt]} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {myTeam && (
        <CityStatsCard
          economy={myTeam.economy}
          cohesion={myTeam.cohesion}
          autonomy={myTeam.autonomy}
          teamName={myTeam.name}
          compact
        />
      )}
    </div>
  );
}

function WaitingScreen({
  message,
  inline = false,
}: {
  message: string;
  inline?: boolean;
}) {
  const content = (
    <p className="font-display text-sm text-muted uppercase tracking-widest animate-pulse text-center">
      {message}
    </p>
  );

  if (inline) return content;

  return (
    <div className="flex items-center justify-center py-12">{content}</div>
  );
}

function FinishedPanel({
  teams,
  myTeamId,
}: {
  teams: Team[];
  myTeamId?: string;
}) {
  const sorted = [...teams].sort(
    (a, b) => b.economy + b.cohesion + b.autonomy - (a.economy + a.cohesion + a.autonomy)
  );

  return (
    <div className="space-y-5 py-4">
      <div className="text-center">
        <p className="section-label mb-1">Game Over</p>
        <h2 className="font-display text-2xl text-paper">Final Standings</h2>
      </div>

      <div className="space-y-2">
        {sorted.map((t, i) => {
          const total = t.economy + t.cohesion + t.autonomy;
          const isMe = t.id === myTeamId;
          return (
            <div
              key={t.id}
              className={`card-dark flex items-center gap-3 ${
                isMe ? "border-accent/50" : ""
              }`}
            >
              <span className="font-display text-xl text-muted">{i + 1}</span>
              <div className="flex-1">
                <p className={`font-display text-sm ${isMe ? "text-accent" : "text-paper"}`}>
                  {t.name} {isMe && "(You)"}
                </p>
                <p className="text-xs text-muted">
                  E{t.economy} · C{t.cohesion} · A{t.autonomy}
                </p>
              </div>
              <span className="font-display text-lg text-paper">{total}</span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted text-center">
        Thanks for playing Out of Joint!
      </p>
    </div>
  );
}
