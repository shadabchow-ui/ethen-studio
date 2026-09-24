/**
 * Supabase browser client — CLIENT-ONLY.
 * Uses @supabase/ssr's createBrowserClient for client-side Supabase access.
 * DO NOT import this module in server components, route handlers, or server utilities.
 * For server-side use, see @ethen/database/server.ts or ./service.ts.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error("Supabase public environment variables are not configured in the browser.");
  }

  return createBrowserClient(url, anonKey);
}
