import { supabase } from './supabase';

export async function ensureAnonSession() {
  if (typeof window === 'undefined') return null; // SSR 방어
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('[anon-session] sign-in failed:', error);
    return null;
  }
  return data.session;
}
