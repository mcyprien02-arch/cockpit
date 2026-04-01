import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Hardcoded fallbacks ensure the app works even if Vercel doesn't inject env vars at runtime
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://bgreukjqujstgzulgabz.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncmV1a2pxdWpzdGd6dWxnYWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDY0NDAsImV4cCI6MjA4OTkyMjQ0MH0.TuiB0xveQ27QWIn_bEW74m3E1heVc4yKY7DQzhZoasY";

export const SUPABASE_CONFIGURED = true; // always true — fallback hardcoded above

// Singleton client
const _client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);

export function getSupabase() {
  return _client;
}

export const supabase = _client;
