import { supabase } from './supabase'
import type {
  InvestmentRow,
  InvestmentInsert,
  InvestmentUpdate,
} from './database.types'

// ──────────────────────────────────────────
// 조회
// ──────────────────────────────────────────

/** 로그인 사용자의 모든 투자 기록 (매수일 최신순) */
export async function getInvestments(): Promise<InvestmentRow[]> {
  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .order('purchase_date', { ascending: false })

  if (error) throw error
  return data
}

/** 단일 투자 기록 조회 */
export async function getInvestmentById(id: string): Promise<InvestmentRow> {
  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/** 티커로 특정 종목의 모든 매수 기록 조회 (분할 매수 분석용) */
export async function getInvestmentsByTicker(ticker: string): Promise<InvestmentRow[]> {
  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .eq('ticker', ticker.toUpperCase())
    .order('purchase_date', { ascending: true })

  if (error) throw error
  return data
}

// ──────────────────────────────────────────
// 생성
// ──────────────────────────────────────────

/** 투자 기록 추가 */
export async function createInvestment(payload: InvestmentInsert): Promise<InvestmentRow> {
  const { data, error } = await supabase
    .from('investments')
    .insert({
      ...payload,
      ticker: payload.ticker.toUpperCase(),  // 티커는 항상 대문자로 저장
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ──────────────────────────────────────────
// 수정
// ──────────────────────────────────────────

/** 투자 기록 수정 */
export async function updateInvestment(
  id: string,
  payload: InvestmentUpdate,
): Promise<InvestmentRow> {
  const { data, error } = await supabase
    .from('investments')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// ──────────────────────────────────────────
// 삭제
// ──────────────────────────────────────────

/** 투자 기록 삭제 */
export async function deleteInvestment(id: string): Promise<void> {
  const { error } = await supabase
    .from('investments')
    .delete()
    .eq('id', id)

  if (error) throw error
}
