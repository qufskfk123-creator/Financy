/**
 * Supabase DB — assets 테이블 CRUD
 *
 * ══ Supabase Dashboard > SQL Editor 에서 실행 ══════════════
 *
 * create table public.assets (
 *   id         text        primary key,
 *   user_id    uuid        not null references auth.users(id) on delete cascade,
 *   name       text        not null,
 *   market     text        not null check (market in ('K-Stock','U-Stock','Crypto','Cash')),
 *   created_at timestamptz not null default now(),
 *   entries    jsonb       not null default '[]'::jsonb,
 *   sells      jsonb       not null default '[]'::jsonb
 * );
 *
 * alter table public.assets enable row level security;
 *
 * create policy "owner_all" on public.assets
 *   for all
 *   using  (auth.uid() = user_id)
 *   with check (auth.uid() = user_id);
 *
 * ══════════════════════════════════════════════════════════
 */

import { supabase } from './supabase'
import type { Asset } from '../pages/Portfolio'

// ── Row ↔ Asset 변환 ────────────────────────────────────────

function rowToAsset(row: Record<string, any>): Asset {
  return {
    id:        row.id,
    name:      row.name,
    market:    row.market,
    createdAt: row.created_at,
    entries:   Array.isArray(row.entries) ? row.entries : [],
    sells:     Array.isArray(row.sells)   ? row.sells   : [],
  }
}

function assetToRow(userId: string, asset: Asset) {
  return {
    id:         asset.id,
    user_id:    userId,
    name:       asset.name,
    market:     asset.market,
    created_at: asset.createdAt,
    entries:    asset.entries,
    sells:      asset.sells,
  }
}

// ── CRUD ────────────────────────────────────────────────────

// Supabase 에러를 콘솔에 상세 출력 (400 원인 추적용)
function logDbError(op: string, error: unknown) {
  const e = error as { code?: string; message?: string; details?: string; hint?: string }
  console.error(
    `[DB] ${op} 실패\n` +
    `  code:    ${e?.code ?? '-'}\n` +
    `  message: ${e?.message ?? String(error)}\n` +
    `  details: ${e?.details ?? '-'}\n` +
    `  hint:    ${e?.hint ?? '-'}`
  )
}

export async function fetchAssets(userId: string): Promise<Asset[]> {
  const { data, error } = await (supabase as any)
    .from('assets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) { logDbError('fetchAssets', error); throw error }
  return (data ?? []).map(rowToAsset)
}

export async function upsertAsset(userId: string, asset: Asset): Promise<void> {
  const row = assetToRow(userId, asset)
  const { error } = await (supabase as any)
    .from('assets')
    .upsert(row, { onConflict: 'id' })

  if (error) { logDbError(`upsertAsset(${asset.name})`, error); throw error }
}

export async function deleteAsset(assetId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('assets')
    .delete()
    .eq('id', assetId)

  if (error) throw error
}

/** localStorage 데이터를 Supabase로 한 번에 마이그레이션 */
export async function migrateLocalToDb(userId: string, assets: Asset[]): Promise<void> {
  if (assets.length === 0) return
  const rows = assets.map(a => assetToRow(userId, a))
  const { error } = await (supabase as any)
    .from('assets')
    .upsert(rows, { onConflict: 'id' })

  if (error) throw error
}
