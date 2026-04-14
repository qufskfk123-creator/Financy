import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// ──────────────────────────────────────────
// 환경 변수
// ──────────────────────────────────────────

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Supabase 연결 여부.
 * false인 경우 서비스 함수들은 빈 값을 반환하고 DB 쓰기는 건너뜁니다.
 */
export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl?.includes('your-project')

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[Financy] Supabase 환경 변수가 설정되지 않았습니다.\n' +
    '.env.local에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 추가하면 DB 기능이 활성화됩니다.\n' +
    '지금은 데모 모드로 실행됩니다.'
  )
}

// ──────────────────────────────────────────
// Supabase 클라이언트 (싱글톤)
// 환경 변수가 없을 경우 더미 값으로 생성 (API 호출 시 오류 발생하지만 앱은 실행됨)
// ──────────────────────────────────────────

export const supabase = createClient<Database>(
  supabaseUrl  ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession:     true,
      autoRefreshToken:   true,
      detectSessionInUrl: true,
    },
  }
)
