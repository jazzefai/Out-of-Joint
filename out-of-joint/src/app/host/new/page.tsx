"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom } from "@/lib/actions";
import { saveHostSecret } from "@/lib/session";
import type { PlayMode } from "@/types";

const DEFAULT_TEAM_NAMES = [
  "Ironholm",
  "Verano",
  "Caldera",
  "Orvast",
  "Pelmar",
  "Dunwick",
  "Saltreach",
  "Coldmere",
];

export default function NewRoomPage() {
  const router = useRouter();
  const [mode, setMode] = useState<PlayMode>("teams");
  const [numTeams, setNumTeams] = useState(2);
  const [teamNames, setTeamNames] = useState<string[]>(
    DEFAULT_TEAM_NAMES.slice(0, 2)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNumTeamsChange(n: number) {
    setNumTeams(n);
    setTeamNames(
      Array.from({ length: n }, (_, i) => teamNames[i] ?? DEFAULT_TEAM_NAMES[i] ?? `Team ${i + 1}`)
    );
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const result = await createRoom(
        mode === "whole_room" ? "whole_room" : "teams",
        mode === "whole_room" ? 1 : numTeams,
        teamNames
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      saveHostSecret(result.code, result.hostSecret);
      router.push(`/host/room/${result.code}`);
    } catch (e) {
      setError("Failed to create room. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-10">
        <p className="section-label mb-2">Out of Joint — Classic</p>
        <h1 className="font-display text-3xl text-paper leading-tight">
          New Room
        </h1>
      </div>

      {/* Play mode */}
      <div className="mb-8">
        <p className="section-label mb-3">Play Mode</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode("teams")}
            className={`p-4 border-2 text-left transition-all ${
              mode === "teams"
                ? "border-accent bg-accent/10 text-paper"
                : "border-white/10 text-muted hover:border-white/30"
            }`}
          >
            <p className="font-display text-sm uppercase tracking-wider mb-1">
              Teams as Cities
            </p>
            <p className="text-xs text-muted leading-snug">
              Each team votes independently, manages their own city stats
            </p>
          </button>
          <button
            onClick={() => setMode("whole_room")}
            className={`p-4 border-2 text-left transition-all ${
              mode === "whole_room"
                ? "border-accent bg-accent/10 text-paper"
                : "border-white/10 text-muted hover:border-white/30"
            }`}
          >
            <p className="font-display text-sm uppercase tracking-wider mb-1">
              One City
            </p>
            <p className="text-xs text-muted leading-snug">
              Everyone votes together, shares one set of stats
            </p>
          </button>
        </div>
      </div>

      {/* Number of teams (only for teams mode) */}
      {mode === "teams" && (
        <div className="mb-8">
          <p className="section-label mb-3">Number of Teams</p>
          <div className="flex gap-2 flex-wrap">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => handleNumTeamsChange(n)}
                className={`w-12 h-12 font-display text-sm border-2 transition-all ${
                  numTeams === n
                    ? "border-accent bg-accent text-white"
                    : "border-white/20 text-muted hover:border-white/50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Team names */}
      {mode === "teams" && (
        <div className="mb-8">
          <p className="section-label mb-3">Team / City Names</p>
          <div className="flex flex-col gap-2">
            {teamNames.map((name, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="font-display text-xs text-muted w-6 text-right">
                  {i + 1}
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    const next = [...teamNames];
                    next[i] = e.target.value;
                    setTeamNames(next);
                  }}
                  className="flex-1 bg-grid border border-white/20 text-paper px-3 py-2 font-display text-sm
                             focus:outline-none focus:border-accent transition-colors"
                  placeholder={`City ${i + 1}`}
                  maxLength={24}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm font-display mb-4 border border-red-500/30 px-3 py-2">
          {error}
        </p>
      )}

      <button
        onClick={handleCreate}
        disabled={loading}
        className="btn-primary w-full"
      >
        {loading ? "Creating..." : "Create Room →"}
      </button>

      <p className="text-xs text-muted text-center mt-6">
        Rounds 1–4 only · No accounts needed
      </p>
    </main>
  );
}
