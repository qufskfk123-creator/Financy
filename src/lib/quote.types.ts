/**
 * /api/quote 서버리스 함수와 브라우저 클라이언트가 공유하는 타입
 * tsconfig.app.json 범위 내에 두어 빌드 경계 문제를 방지합니다.
 */
export type QuoteResponse = {
  ticker:        string
  symbol:        string
  price:         number
  currency:      string
  change:        number
  changePercent: number
  marketState:   string
  updatedAt:     string
}
