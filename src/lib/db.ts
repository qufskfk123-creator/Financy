/**
 * Supabase DB — assets 테이블 CRUD
 *
 * ══ 실제 Supabase 테이블 스키마 ══════════════════════════════
 *
 * create table public.assets (
 *   ticker     text        not null,
 *   name       text        not null,
 *   quantity   numeric     not null default 0,
 *   avg_price  numeric     not null default 0,
 *   market     text        not null,
 *   user_id    uuid        not null references auth.users(id) on delete cascade,
 *   primary key (user_id, ticker)
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

// ── 계산 헬퍼 (Portfolio.tsx와 동일 로직, 순환 import 방지) ──

function _totalBuyQty(asset: Asset): number {
  return asset.entries.reduce((s, e) => s + e.quantity, 0)
}
function _totalSellQty(asset: Asset): number {
  return asset.sells.reduce((s, e) => s + e.quantity, 0)
}
function _holdingQty(asset: Asset): number {
  return _totalBuyQty(asset) - _totalSellQty(asset)
}
function _avgBuyPrice(asset: Asset): number {
  const qty = _totalBuyQty(asset)
  const invested = asset.entries.reduce((s, e) => s + e.quantity * e.price, 0)
  return qty > 0 ? invested / qty : 0
}

// ── Row ↔ Asset 변환 ────────────────────────────────────────

function rowToAsset(row: Record<string, any>): Asset {
  const now = new Date().toISOString()
  return {
    id:        row.ticker,
    name:      row.name,
    market:    row.market,
    createdAt: now,
    // DB는 합산값(quantity, avg_price)만 저장 — 단일 entries로 복원
    entries: Number(row.quantity) > 0
      ? [{ id: row.ticker, quantity: Number(row.quantity), price: Number(row.avg_price), date: now }]
      : [],
    sells: [],
  }
}

function assetToRow(userId: string, asset: Asset) {
  return {
    ticker:    asset.id,
    name:      asset.name,
    quantity:  _holdingQty(asset),
    avg_price: _avgBuyPrice(asset),
    market:    asset.market,
    user_id:   userId,
  }
}

// ── 에러 로깅 ────────────────────────────────────────────────

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

// ── CRUD ────────────────────────────────────────────────────

export async function fetchAssets(userId: string): Promise<Asset[]> {
  if (!userId) return []
  const { data, error } = await (supabase as any)
    .from('assets')
    .select('ticker, name, quantity, avg_price, market, user_id')
    .eq('user_id', userId)
    .order('name', { ascending: true })

  if (error) { logDbError('fetchAssets', error); throw error }
  return (data ?? []).map(rowToAsset)
}

export async function upsertAsset(userId: string, asset: Asset): Promise<void> {
  if (!userId) return
  const row = assetToRow(userId, asset)
  const { error } = await (supabase as any)
    .from('assets')
    .upsert(row, { onConflict: 'ticker,user_id' })

  if (error) { logDbError(`upsertAsset(${asset.name})`, error); throw error }
}

export async function deleteAsset(assetId: string, userId: string): Promise<void> {
  if (!userId) return
  const { error } = await (supabase as any)
    .from('assets')
    .delete()
    .eq('ticker', assetId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function deleteAllAssets(userId: string): Promise<void> {
  if (!userId) return
  const { error } = await (supabase as any)
    .from('assets')
    .delete()
    .eq('user_id', userId)

  if (error) throw error
}

/** localStorage 데이터를 Supabase로 한 번에 마이그레이션 */
export async function migrateLocalToDb(userId: string, assets: Asset[]): Promise<void> {
  if (!userId || assets.length === 0) return
  const rows = assets.map(a => assetToRow(userId, a))
  const { error } = await (supabase as any)
    .from('assets')
    .upsert(rows, { onConflict: 'ticker,user_id' })

  if (error) throw error
}
