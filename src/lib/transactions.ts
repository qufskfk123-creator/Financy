/**
 * 거래 내역 — 타입 정의 + localStorage 헬퍼
 */

export type TxType = 'buy' | 'sell'

export interface Transaction {
  id:       string
  date:     string        // ISO 8601
  type:     TxType
  name:     string        // 종목명
  market:   string        // MarketType
  currency: 'KRW' | 'USD'
  quantity: number
  price:    number
  amount:   number        // quantity × price
}

const TX_KEY   = 'financy_transactions'
const INIT_KEY = 'financy_tx_init'

export function loadTransactions(): Transaction[] {
  try { return JSON.parse(localStorage.getItem(TX_KEY) ?? '[]') }
  catch { return [] }
}

export function saveTransactions(txs: Transaction[]): void {
  localStorage.setItem(TX_KEY, JSON.stringify(txs))
}

export function isTxInitialized(): boolean {
  return !!localStorage.getItem(INIT_KEY)
}

export function markTxInitialized(): void {
  localStorage.setItem(INIT_KEY, '1')
}

export function genTxId(): string {
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
}
