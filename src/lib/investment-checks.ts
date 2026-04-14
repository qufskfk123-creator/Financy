import { supabase, isSupabaseConfigured } from './supabase'
import { createInvestment } from './investments'
import type { InvestmentInsert, InvestmentRow, InvestmentPrincipleCheckRow } from './database.types'

// ──────────────────────────────────────────
// 타입
// ──────────────────────────────────────────

export type PrincipleCheckPayload = {
  principle_id:    string | null  // demo 원칙은 null
  principle_title: string
  is_checked:      boolean
}

export type InvestmentWithChecks = InvestmentRow & {
  principle_checks: InvestmentPrincipleCheckRow[]
}

// ──────────────────────────────────────────
// 투자 기록 + 원칙 체크 일괄 저장
// ──────────────────────────────────────────

/**
 * 투자 기록과 원칙 체크 내역을 함께 저장합니다.
 *
 * - Supabase 미설정 시: 투자 기록 저장을 건너뛰고 성공으로 처리 (데모 모드)
 * - principle_id가 null인 항목(데모 원칙)도 title은 기록됩니다.
 */
export async function createInvestmentWithChecks(
  investment: InvestmentInsert,
  checks: PrincipleCheckPayload[],
): Promise<InvestmentRow | null> {
  if (!isSupabaseConfigured) {
    // 데모 모드: 실제 저장 없이 성공 반환
    return null
  }

  // 1) 투자 기록 생성
  const newInvestment = await createInvestment(investment)

  // 2) 원칙 체크 기록 생성 (실패해도 투자 기록은 보존)
  if (checks.length > 0) {
    const rows = checks.map((c) => ({
      investment_id:   newInvestment.id,
      principle_id:    c.principle_id,
      principle_title: c.principle_title,
      is_checked:      c.is_checked,
    }))

    const { error } = await supabase
      .from('investment_principle_checks')
      .insert(rows)

    if (error) {
      // 원칙 체크 저장 실패는 경고 수준 — 투자 기록은 이미 저장됨
      console.error('[Financy] 원칙 체크 기록 저장 실패:', error.message)
    }
  }

  return newInvestment
}

// ──────────────────────────────────────────
// 특정 투자에 연결된 원칙 체크 조회
// ──────────────────────────────────────────

export async function getChecksForInvestment(
  investmentId: string,
): Promise<InvestmentPrincipleCheckRow[]> {
  if (!isSupabaseConfigured) return []

  const { data, error } = await supabase
    .from('investment_principle_checks')
    .select('*')
    .eq('investment_id', investmentId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}
