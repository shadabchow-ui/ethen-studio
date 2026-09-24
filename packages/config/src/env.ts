import {
  isPlaceholderValue as isContractPlaceholder,
  readTrimmedEnv,
} from "./env-contract";

function readEnv(name: string): string | undefined {
  return readTrimmedEnv(name);
}

function isPlaceholderValue(value: string | undefined): boolean {
  return isContractPlaceholder(value);
}

export function getServerEnv(name: string): string | undefined {
  return readEnv(name);
}

export function hasConfiguredServerEnv(name: string): boolean {
  return !isPlaceholderValue(readEnv(name));
}

export function hasConfiguredSupabasePublicEnv(): boolean {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return Boolean(
    url &&
      anonKey &&
      !isPlaceholderValue(url) &&
      !isPlaceholderValue(anonKey) &&
      !url.includes("127.0.0.1"),
  );
}

export function hasConfiguredSupabaseServerEnv(): boolean {
  return hasConfiguredSupabasePublicEnv() && hasConfiguredServerEnv("SUPABASE_SERVICE_ROLE_KEY");
}
