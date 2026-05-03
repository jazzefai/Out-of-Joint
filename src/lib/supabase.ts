import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _browser: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_browser) {
    _browser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { realtime: { params: { eventsPerSecond: 10 } } }
    );
  }
  return _browser;
}

// Proxy so existing `supabase.from(...)` calls keep working unchanged
export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const client = getSupabase();
    const val = client[prop as keyof SupabaseClient];
    return typeof val === "function" ? val.bind(client) : val;
  },
});

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
