/**
 * supabaseClient.ts — Supabase 클라이언트 진입점
 *
 * VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 환경 변수를 읽어
 * 싱글톤 클라이언트를 생성합니다.
 *
 * 내부 구현은 src/lib/supabase.ts에 있으며, 이 파일은
 * 프로젝트 전역에서 일관된 import 경로를 제공합니다.
 */

export { supabase, isSupabaseConfigured } from './supabase'
