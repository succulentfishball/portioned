import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const hasSupabaseConfig = Boolean(url && publishableKey);
export const supabase = hasSupabaseConfig ? createClient(url!, publishableKey!) : null;
