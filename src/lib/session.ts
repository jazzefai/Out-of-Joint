"use client";

const SESSION_KEY = "ooj_session_id";
const HOST_KEY_PREFIX = "ooj_host_";

/** Get or create a stable anonymous session ID stored in localStorage */
export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** Store the host secret for a room (so the host can authenticate updates) */
export function saveHostSecret(code: string, secret: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${HOST_KEY_PREFIX}${code}`, secret);
}

/** Retrieve the host secret for a room */
export function getHostSecret(code: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`${HOST_KEY_PREFIX}${code}`);
}

/** Check if the current session is the host for this room */
export function isHost(code: string, roomHostSecret: string): boolean {
  return getHostSecret(code) === roomHostSecret;
}
