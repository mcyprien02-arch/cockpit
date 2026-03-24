import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Lazy client — only created when a valid URL is present
let _client: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabase() {
  if (!_client) {
    if (!supabaseUrl.startsWith("http")) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL manquant ou invalide. " +
          "Vérifiez votre fichier .env.local."
      );
    }
    _client = createClient<Database>(supabaseUrl, supabaseAnonKey);
  }
  return _client;
}

// Convenience re-export for simple usage
export const supabase = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(_target, prop) {
    return (getSupabase() as any)[prop];
  },
});
