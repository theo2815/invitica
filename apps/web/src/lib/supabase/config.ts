interface SupabaseConfig {
  publishableKey: string;
  url: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Copy apps/web/.env.example to apps/web/.env.local and add the project URL and publishable key.",
    );
  }

  return { publishableKey, url };
}
