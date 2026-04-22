/**
 * 채팅 설정 — Supabase profiles 테이블 JSONB 저장
 *
 * ─── Supabase SQL (처음 한 번만 실행) ──────────────────────────
 *
 * CREATE TABLE IF NOT EXISTS profiles (
 *   id         uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
 *   settings   jsonb NOT NULL DEFAULT
 *     '{"chatEnabled":true,"badgeEnabled":true,"opacity":0.45}'::jsonb,
 *   updated_at timestamptz DEFAULT now()
 * );
 *
 * ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "profiles_own" ON profiles
 *   FOR ALL
 *   USING (auth.uid() = id)
 *   WITH CHECK (auth.uid() = id);
 *
 * ──────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase'

export interface ChatSettings {
  chatEnabled:  boolean
  badgeEnabled: boolean
  opacity:      number   // 0.10 ~ 1.00
}

export const DEFAULT_SETTINGS: ChatSettings = {
  chatEnabled:  true,
  badgeEnabled: true,
  opacity:      0.45,
}

const LS_KEY = 'financy_chat_settings'

export function loadLocalSettings(): ChatSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULT_SETTINGS }
}

export function saveLocalSettings(s: ChatSettings): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch {}
}

export async function fetchRemoteSettings(userId: string): Promise<ChatSettings | null> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('settings')
      .eq('id', userId)
      .maybeSingle()
    if (data) {
      const raw = (data.settings || {}) as Partial<ChatSettings>
      return { ...DEFAULT_SETTINGS, ...raw }
    }
  } catch {}
  return null
}

export async function saveRemoteSettings(userId: string, settings: ChatSettings): Promise<void> {
  try {
    await supabase
      .from('profiles')
      .upsert(
        { id: userId, settings: settings as unknown as Record<string, unknown>, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      )
  } catch {}
}
