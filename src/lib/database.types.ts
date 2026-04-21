// ============================================================
// Supabase Database Types — Financy
// 테이블 스키마를 그대로 반영하는 타입 정의입니다.
// ============================================================

// ──────────────────────────────────────────
// Enum / Union 타입
// ──────────────────────────────────────────

/** 거래소 식별자 */
export type Exchange = 'KRX' | 'NASDAQ' | 'NYSE' | 'KOSDAQ' | 'CRYPTO' | string

/** 투자 원칙 카테고리 */
export type PrincipleCategory =
  | 'general'   // 일반
  | 'risk'      // 리스크 관리
  | 'entry'     // 진입 조건
  | 'exit'      // 청산 조건
  | 'mindset'   // 투자 마인드셋
  | string      // 사용자 정의

// ──────────────────────────────────────────
// Row 타입 (DB → App, 읽기 전용)
// ──────────────────────────────────────────

export type InvestmentRow = {
  id:             string       // uuid
  user_id:        string       // uuid
  name:           string       // 종목명
  ticker:         string       // 티커
  exchange:       Exchange     // 거래소
  purchase_price: number       // 매수가 (주당)
  quantity:       number       // 수량
  purchase_date:  string       // ISO date string (YYYY-MM-DD)
  memo:           string | null
  created_at:     string       // ISO timestamptz
  updated_at:     string
}

export type PrincipleRow = {
  id:          string
  user_id:     string
  title:       string
  description: string | null
  category:    PrincipleCategory
  is_followed: boolean
  order_index: number
  created_at:  string
  updated_at:  string
}

// ──────────────────────────────────────────
// Insert 타입 (App → DB, user_id·id·타임스탬프 제외)
// ──────────────────────────────────────────

export type InvestmentInsert = Omit<InvestmentRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>

export type PrincipleInsert = Omit<PrincipleRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>

// ──────────────────────────────────────────
// Update 타입 (부분 수정, id·user_id·타임스탬프 제외)
// ──────────────────────────────────────────

export type InvestmentUpdate = Partial<InvestmentInsert>

export type PrincipleUpdate = Partial<PrincipleInsert>

// ──────────────────────────────────────────
// 파생 타입 (UI 계산용)
// ──────────────────────────────────────────

/** 현재 시세가 포함된 투자 기록 (API fetch 후 가공) */
export type InvestmentWithMetrics = InvestmentRow & {
  current_price:   number        // 현재 시세
  total_cost:      number        // 매수가 × 수량
  current_value:   number        // 현재가 × 수량
  profit_loss:     number        // 평가손익
  profit_loss_pct: number        // 수익률 (%)
}

/** 매수 시점 원칙 체크 기록 */
export type InvestmentPrincipleCheckRow = {
  id:              string
  investment_id:   string
  principle_id:    string | null  // 원칙이 삭제된 경우 null
  principle_title: string         // 비정규화 — 원칙 삭제 후에도 기록 유지
  is_checked:      boolean        // true: 준수 / false: 위반
  created_at:      string
}

export type InvestmentPrincipleCheckInsert = Omit<InvestmentPrincipleCheckRow, 'id' | 'created_at'>

// ──────────────────────────────────────────
// Chat 메시지 Row 타입
// ──────────────────────────────────────────

export type ChatMessageRow = {
  id:         string
  user_id:    string
  user_name:  string
  content:    string
  created_at: string
}

// ──────────────────────────────────────────
// Supabase Database 제네릭 타입 (client 추론용)
// ──────────────────────────────────────────

export interface Database {
  public: {
    Views:     { [_ in never]: never }
    Functions: { [_ in never]: never }
    Tables: {
      investments: {
        Row: InvestmentRow
        Insert: {
          id?:             string
          user_id?:        string        // RLS가 auth.uid()로 자동 설정
          name:            string
          ticker:          string
          exchange?:       Exchange
          purchase_price:  number
          quantity:        number
          purchase_date:   string
          memo?:           string | null
          created_at?:     string
          updated_at?:     string
        }
        Update: {
          id?:             string
          user_id?:        string
          name?:           string
          ticker?:         string
          exchange?:       Exchange
          purchase_price?: number
          quantity?:       number
          purchase_date?:  string
          memo?:           string | null
          created_at?:     string
          updated_at?:     string
        }
        Relationships: []
      }
      principles: {
        Row: PrincipleRow
        Insert: {
          id?:          string
          user_id?:     string
          title:        string
          description?: string | null
          category?:    PrincipleCategory
          is_followed?: boolean
          order_index?: number
          created_at?:  string
          updated_at?:  string
        }
        Update: {
          id?:          string
          user_id?:     string
          title?:       string
          description?: string | null
          category?:    PrincipleCategory
          is_followed?: boolean
          order_index?: number
          created_at?:  string
          updated_at?:  string
        }
        Relationships: []
      }
      investment_principle_checks: {
        Row: InvestmentPrincipleCheckRow
        Insert: {
          id?:              string
          investment_id:    string
          principle_id?:    string | null
          principle_title:  string
          is_checked:       boolean
          created_at?:      string
        }
        Update: {
          id?:              string
          investment_id?:   string
          principle_id?:    string | null
          principle_title?: string
          is_checked?:      boolean
          created_at?:      string
        }
        Relationships: []
      }
      messages: {
        Row: ChatMessageRow
        Insert: {
          id?:        string
          user_id:    string
          user_name:  string
          content:    string
          created_at?: string
        }
        Update: {
          id?:        string
          user_id?:   string
          user_name?: string
          content?:   string
          created_at?: string
        }
        Relationships: []
      }
    }
  }
}
