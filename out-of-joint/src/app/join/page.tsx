"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    const clean = code.trim().toUpperCase();
    if (clean.length !== 6) {
      setError("Enter the 6-character room code");
      return;
    }
    setLoading(true);
    setError(null);
    const { data } = await supabase
      .from("rooms")
      .select("id, code, phase")
      .eq("code", clean)
      .single();

    if (!data) {
      setError("Room not found. Check the code and try again.");
      setLoading(false);
      return;
    }
    router.push(`/join/${clean}`);
  }

  return (
    <main className="min-h-screen bg-ink flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Branding */}
        <div className="text-center space-y-1">
          <p className="section-label">Out of Joint — Classic</p>
          <h1 className="font-display text-4xl text-paper leading-tight">
            Join a Room
          </h1>
        </div>

        {/* Code input */}
        <div className="space-y-3">
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().slice(0, 6));
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="ENTER CODE"
            className="w-full bg-grid border-2 border-white/20 text-accent text-center
                       font-display text-3xl tracking-[0.4em] py-4
                       focus:outline-none focus:border-accent transition-colors
                       placeholder:text-muted/40 placeholder:text-xl"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={6}
          />

          {error && (
            <p className="text-red-400 text-sm font-display text-center">{error}</p>
          )}

          <button
            onClick={handleJoin}
            disabled={loading || code.length !== 6}
            className="btn-primary w-full"
          >
            {loading ? "Finding room…" : "Join →"}
          </button>
        </div>

        <p className="text-xs text-muted text-center">
          Ask the host for the room code, or scan the QR code on the host screen.
        </p>

        {/* Host link */}
        <div className="border-t border-white/10 pt-6 text-center">
          <a
            href="/host/new"
            className="text-xs text-muted hover:text-paper transition-colors font-display uppercase tracking-widest"
          >
            I'm the host →
          </a>
        </div>
      </div>
    </main>
  );
}
