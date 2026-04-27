"use server";

import { createServiceClient } from "@/lib/supabase";
import { applyDelta, getCard, resolveRound, tallyVotes } from "@/lib/classicDeck";
import type { PlayMode, RoundPhase, StatDelta } from "@/types";

const db = () => createServiceClient();

// ============================================================
// Create room
// ============================================================
export async function createRoom(
  mode: PlayMode,
  numTeams: number,
  teamNames: string[]
): Promise<{ code: string; hostSecret: string } | { error: string }> {
  const client = db();

  // Generate room code via DB function
  const { data: codeData, error: codeError } = await client.rpc(
    "generate_room_code"
  );
  if (codeError) return { error: codeError.message };

  const code: string = codeData;
  const hostSecret = crypto.randomUUID();

  const { data: room, error: roomError } = await client
    .from("rooms")
    .insert({
      code,
      mode,
      num_teams: numTeams,
      host_secret: hostSecret,
    })
    .select()
    .single();

  if (roomError) return { error: roomError.message };

  // Create team rows
  const teamsPayload = Array.from({ length: numTeams }, (_, i) => ({
    room_id: room.id,
    slot: i + 1,
    name: teamNames[i] ?? `Team ${i + 1}`,
  }));

  const { error: teamsError } = await client.from("teams").insert(teamsPayload);
  if (teamsError) return { error: teamsError.message };

  return { code, hostSecret };
}

// ============================================================
// Authenticate host action — all mutations require this
// ============================================================
async function assertHost(code: string, hostSecret: string) {
  const client = db();
  const { data, error } = await client
    .from("rooms")
    .select("id, host_secret")
    .eq("code", code)
    .single();

  if (error || !data) throw new Error("Room not found");
  if (data.host_secret !== hostSecret) throw new Error("Unauthorized");
  return data.id as string;
}

// ============================================================
// Start a round
// ============================================================
export async function startRound(
  code: string,
  hostSecret: string,
  round: number
): Promise<{ error?: string }> {
  try {
    const roomId = await assertHost(code, hostSecret);
    const client = db();
    await client
      .from("rooms")
      .update({ current_round: round, phase: "lobby" })
      .eq("id", roomId);
    return {};
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

// ============================================================
// Apply base effect
// ============================================================
export async function applyBaseEffect(
  code: string,
  hostSecret: string
): Promise<{ error?: string }> {
  try {
    const roomId = await assertHost(code, hostSecret);
    const client = db();

    const { data: room } = await client
      .from("rooms")
      .select("current_round, mode")
      .eq("id", roomId)
      .single();

    if (!room) throw new Error("Room not found");

    const card = getCard(room.current_round);
    const delta: StatDelta = card.baseEffect;

    // Apply to all non-collapsed teams
    const { data: teams } = await client
      .from("teams")
      .select("*")
      .eq("room_id", roomId)
      .eq("collapsed", false);

    if (teams) {
      for (const team of teams) {
        const updated = applyDelta(team, delta);
        const collapsed =
          updated.economy <= 0 ||
          updated.cohesion <= 0 ||
          updated.autonomy <= 0;
        await client
          .from("teams")
          .update({ ...updated, collapsed })
          .eq("id", team.id);
      }
    }

    // Check if all teams collapsed
    const { data: allTeams } = await client
      .from("teams")
      .select("collapsed")
      .eq("room_id", roomId);

    const anyAlive = allTeams?.some((t) => !t.collapsed);
    const nextPhase: RoundPhase = anyAlive ? "base_applied" : "collapsed";

    await client.from("rooms").update({ phase: nextPhase }).eq("id", roomId);
    return {};
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

// ============================================================
// Open voting (with 60-second countdown)
// ============================================================
export async function openVoting(
  code: string,
  hostSecret: string,
  durationSeconds = 60
): Promise<{ error?: string }> {
  try {
    const roomId = await assertHost(code, hostSecret);
    const votingEndsAt = new Date(
      Date.now() + durationSeconds * 1000
    ).toISOString();
    await db()
      .from("rooms")
      .update({ phase: "voting_open", voting_ends_at: votingEndsAt })
      .eq("id", roomId);
    return {};
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

// ============================================================
// Close voting
// ============================================================
export async function closeVoting(
  code: string,
  hostSecret: string
): Promise<{ error?: string }> {
  try {
    const roomId = await assertHost(code, hostSecret);
    await db()
      .from("rooms")
      .update({ phase: "voting_closed", voting_ends_at: null })
      .eq("id", roomId);
    return {};
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

// ============================================================
// Apply net effect (winner)
// ============================================================
export async function applyNetEffect(
  code: string,
  hostSecret: string
): Promise<{ winner?: "A" | "B" | "C"; wasTie?: boolean; error?: string }> {
  try {
    const roomId = await assertHost(code, hostSecret);
    const client = db();

    const { data: room } = await client
      .from("rooms")
      .select("current_round, mode")
      .eq("id", roomId)
      .single();

    if (!room) throw new Error("Room not found");

    const { data: teams } = await client
      .from("teams")
      .select("*")
      .eq("room_id", roomId)
      .eq("collapsed", false);

    if (!teams) throw new Error("No teams found");

    const card = getCard(room.current_round);
    let globalWinner: "A" | "B" | "C" = "A";
    let globalWasTie = false;

    if (room.mode === "whole_room") {
      // All votes across room
      const { data: votes } = await client
        .from("votes")
        .select("choice")
        .eq("room_id", roomId)
        .eq("round", room.current_round);

      const tally = tallyVotes(votes ?? []);
      const result = resolveRound(tally);
      globalWinner = result.winner;
      globalWasTie = result.wasTie;

      // Apply winner delta to all teams
      const delta = card.options[result.winner];
      for (const team of teams) {
        const updated = applyDelta(team, delta);
        const collapsed =
          updated.economy <= 0 ||
          updated.cohesion <= 0 ||
          updated.autonomy <= 0;
        await client
          .from("teams")
          .update({ ...updated, collapsed })
          .eq("id", team.id);
      }
    } else {
      // Each team votes independently
      for (const team of teams) {
        const { data: votes } = await client
          .from("votes")
          .select("choice")
          .eq("team_id", team.id)
          .eq("round", room.current_round);

        const tally = tallyVotes(votes ?? []);
        const result = resolveRound(tally);
        globalWinner = result.winner;
        globalWasTie = result.wasTie;

        const delta = card.options[result.winner];
        const updated = applyDelta(team, delta);
        const collapsed =
          updated.economy <= 0 ||
          updated.cohesion <= 0 ||
          updated.autonomy <= 0;
        await client
          .from("teams")
          .update({ ...updated, collapsed })
          .eq("id", team.id);
      }
    }

    // Check if any team collapsed
    const { data: allTeams } = await client
      .from("teams")
      .select("collapsed")
      .eq("room_id", roomId);

    const anyCollapsed = allTeams?.some((t) => t.collapsed);
    const allCollapsed = allTeams?.every((t) => t.collapsed);

    let nextPhase: RoundPhase;
    if (allCollapsed) {
      nextPhase = "collapsed";
    } else if (room.current_round >= 4) {
      nextPhase = "finished";
    } else {
      nextPhase = "net_applied";
    }

    // If some (not all) teams collapsed, still mark them individually
    if (anyCollapsed && !allCollapsed) {
      nextPhase = "net_applied"; // host can see warnings per team
    }

    await client.from("rooms").update({ phase: nextPhase }).eq("id", roomId);

    return { winner: globalWinner, wasTie: globalWasTie };
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

// ============================================================
// Advance to next round
// ============================================================
export async function advanceRound(
  code: string,
  hostSecret: string
): Promise<{ error?: string }> {
  try {
    const roomId = await assertHost(code, hostSecret);
    const client = db();

    const { data: room } = await client
      .from("rooms")
      .select("current_round")
      .eq("id", roomId)
      .single();

    if (!room) throw new Error("Room not found");

    const nextRound = room.current_round + 1;
    await client
      .from("rooms")
      .update({ current_round: nextRound, phase: "lobby", voting_ends_at: null })
      .eq("id", roomId);

    return {};
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

// ============================================================
// End game
// ============================================================
export async function endGame(
  code: string,
  hostSecret: string
): Promise<{ error?: string }> {
  try {
    const roomId = await assertHost(code, hostSecret);
    await db().from("rooms").update({ phase: "finished" }).eq("id", roomId);
    return {};
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}
