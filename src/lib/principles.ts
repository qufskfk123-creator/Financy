import { supabase } from './supabase'
import type {
  PrincipleRow,
  PrincipleInsert,
  PrincipleUpdate,
} from './database.types'

// ──────────────────────────────────────────
// 조회
// ──────────────────────────────────────────

/** 로그인 사용자의 모든 투자 원칙 (order_index 순) */
export async function getPrinciples(): Promise<PrincipleRow[]> {
  const { data, error } = await supabase
    .from('principles')
    .select('*')
    .order('order_index', { ascending: true })

  if (error) throw error
  return data
}

/** 준수 여부로 필터링 */
export async function getPrinciplesByFollowed(isFollowed: boolean): Promise<PrincipleRow[]> {
  const { data, error } = await supabase
    .from('principles')
    .select('*')
    .eq('is_followed', isFollowed)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data
}

// ──────────────────────────────────────────
// 생성
// ──────────────────────────────────────────

/** 투자 원칙 추가 (order_index 자동 계산: 현재 최댓값 + 1) */
export async function createPrinciple(
  payload: Omit<PrincipleInsert, 'order_index'>,
): Promise<PrincipleRow> {
  // 현재 최대 order_index 조회
  const { data: existing } = await supabase
    .from('principles')
    .select('order_index')
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = existing ? existing.order_index + 1 : 0

  const { data, error } = await supabase
    .from('principles')
    .insert({ ...payload, order_index: nextOrder })
    .select()
    .single()

  if (error) throw error
  return data
}

// ──────────────────────────────────────────
// 수정
// ──────────────────────────────────────────

/** 투자 원칙 수정 */
export async function updatePrinciple(
  id: string,
  payload: PrincipleUpdate,
): Promise<PrincipleRow> {
  const { data, error } = await supabase
    .from('principles')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/** 준수 여부 토글 (단축 헬퍼) */
export async function togglePrincipleFollowed(
  id: string,
  isFollowed: boolean,
): Promise<PrincipleRow> {
  return updatePrinciple(id, { is_followed: isFollowed })
}

/** 드래그 정렬: order_index 일괄 업데이트 */
export async function reorderPrinciples(
  orderedIds: string[],
): Promise<void> {
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('principles')
      .update({ order_index: index })
      .eq('id', id),
  )

  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

// ──────────────────────────────────────────
// 삭제
// ──────────────────────────────────────────

/** 투자 원칙 삭제 */
export async function deletePrinciple(id: string): Promise<void> {
  const { error } = await supabase
    .from('principles')
    .delete()
    .eq('id', id)

  if (error) throw error
}
