# Financy — Claude 인계 문서

> 새 채팅에서 이 파일을 읽으면 프로젝트 전체 맥락을 즉시 파악할 수 있습니다.

---

## 프로젝트 개요

**Financy** — 한국 개인 투자자를 위한 투자 기상도 & 포트폴리오 관리 앱  
스택: React 19 + TypeScript + Vite + Tailwind CSS + Supabase + Vercel  
배포: Vercel (서버리스 함수) + Supabase (PostgreSQL + RLS)

---

## 디렉토리 구조

```
D:\AI study\Financy\
├── src/
│   ├── App.tsx                  # 루트: 라우팅, 전역 상태, 인증
│   ├── main.tsx
│   ├── index.css                # 글로벌 CSS (Tailwind + CSS 변수)
│   ├── pages/
│   │   ├── Dashboard.tsx        # 기상도 (Fear&Greed, 유동성날씨, 환율, 금리, 경제캘린더, 뉴스)
│   │   ├── Portfolio.tsx        # 포트폴리오 관리 (CRUD, 손익)
│   │   ├── RiskCenter.tsx       # 리스크 센터 (방어지표, FX 노출, 집중도)
│   │   ├── Analytics.tsx        # 분석 (파이차트, 실시간평가손익, MDD, 섹터, 배당, 목표가)
│   │   ├── Settings.tsx         # 설정 (테마, 닉네임, 이모지, 채팅 설정)
│   │   └── Auth.tsx             # 인증 페이지
│   ├── components/
│   │   ├── Sidebar.tsx          # 사이드바 + 모바일 하단 탭바 (EmojiAvatar 사용)
│   │   ├── TickerTape.tsx       # 상단 실시간 시세 전광판 (CSS GPU 애니메이션)
│   │   ├── FloatingChat.tsx     # 드래그 가능한 플로팅 채팅창 (framer-motion)
│   │   ├── EmojiAvatar.tsx      # 이모지 아바타 컴포넌트 + 유틸
│   │   ├── AuthModal.tsx        # 인증 모달 (레거시)
│   │   ├── Toast.tsx            # 알림 토스트
│   │   └── ErrorBoundary.tsx    # React 에러 경계
│   └── lib/
│       ├── supabase.ts          # Supabase 클라이언트 싱글톤
│       ├── db.ts                # Asset CRUD (localStorage ↔ Supabase)
│       ├── transactions.ts      # 거래 내역 localStorage 헬퍼
│       ├── seed.ts              # 투자 시드(KRW/USD) localStorage 헬퍼
│       ├── chatSettings.ts      # 채팅 설정 (localStorage + Supabase profiles)
│       ├── priceCache.ts        # Supabase ticker_cache (15분 TTL)
│       ├── price-cache.ts       # localStorage 가격 캐시 (1h fresh / 24h valid)
│       ├── fundamentalsCache.ts # PER/배당/베타 일일 캐시
│       └── useShare.ts          # 공유 hook
├── api/                         # Vercel 서버리스 함수
│   ├── quote.ts                 # 주가/코인 시세
│   ├── search.ts                # 종목 검색
│   ├── fundamentals.ts          # 재무 지표
│   ├── exchange-rates.ts        # 환율 (Frankfurter)
│   ├── update-exchange-rates.ts # Vercel Cron — 매일 00:05 UTC 환율 캐시 갱신
│   ├── fear-greed.ts            # Fear & Greed Index
│   ├── liquidity.ts             # 자금 흐름 (QQQ vs UUP)
│   ├── market-status.ts         # 유동성 날씨 점수 + 지수 3개
│   ├── market-news.ts           # 뉴스 RSS
│   ├── economic-calendar.ts     # 경제 캘린더 (Finnhub)
│   ├── ticker-tape.ts           # TickerTape 시세 (FeedItem 타입)
│   └── lib/cache.ts             # Supabase market_cache 유틸
├── vite.config.ts               # 개발 서버 API 미들웨어 포함
├── tailwind.config.js           # brand.* 컬러 (보라 6C63FF), gray.850
└── vercel.json
```

---

## 핵심 타입

```typescript
// src/App.tsx
type Page = 'dashboard' | 'portfolio' | 'risk-center' | 'analytics' | 'settings' | 'auth'
type Theme = 'dark' | 'light'   // src/pages/Settings.tsx

// src/pages/Portfolio.tsx
type MarketType = 'K-Stock' | 'U-Stock' | 'Crypto' | 'Cash'
interface Asset {
  id: string; name: string; market: MarketType; createdAt: string
  entries: Array<{ id: string; quantity: number; price: number; date: string }>
  sells:   Array<{ id: string; quantity: number; price: number; date: string }>
}

// src/lib/transactions.ts
type TxType = 'buy' | 'sell'
interface Transaction {
  id: string; date: string; type: TxType
  name: string; market: MarketType; currency: 'KRW' | 'USD'
  quantity: number; price: number; amount: number
}

// src/lib/seed.ts
interface SeedData { krw: number; usd: number }

// src/lib/chatSettings.ts
interface ChatSettings { chatEnabled: boolean; badgeEnabled: boolean; opacity: number }
// DEFAULT_SETTINGS = { chatEnabled: true, badgeEnabled: true, opacity: 0.45 }
// localStorage: 'financy_chat_settings'
// Supabase: profiles 테이블 JSONB settings 컬럼

// api/ticker-tape.ts (FeedItem — 프론트에서 로컬 재선언으로 사용)
type FeedItem =
  | { kind: 'ticker'; symbol: string; name: string; price: number; change: number; changePct: number; currency: 'KRW' | 'USD' }
  | { kind: 'sep';    label: string }

// api/economic-calendar.ts
interface EconEvent {
  date: string      // "YYYY-MM-DD HH:MM:SS"
  country: string
  event: string
  currency: string
  impact: string    // "High" | "Medium" | "Low"
  previous: string | null
  estimate: string | null
  actual: string | null
}
```

---

## App.tsx 전역 상태 & 흐름

```typescript
// 주요 상태
const [currentPage, setCurrentPage] = useState<Page>('dashboard')
const [user, setUser]               = useState<User | null>(null)   // Supabase User
const [guestName, setGuestName]     = useState<string | null>(...)  // localStorage
const [theme, setTheme]             = useState<Theme>('dark')
const [transactions, setTransactions] = useState<Transaction[]>(...)
const [seed, setSeed]               = useState<SeedData>(...)        // { krw, usd }
const [chatSettings, setChatSettings] = useState<ChatSettings>(...)
const [userAvatar, setUserAvatar]   = useState<string | null>(...)  // localStorage 'financy_avatar_emoji'
const [avatarColor]                 = useState<string>(...)          // localStorage 'financy_avatar_color'

// debounce refs (채팅 설정 슬라이더 DB 요청 제한)
const pendingSettingsRef = useRef<ChatSettings | null>(null)
const debounceTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
const userIdRef          = useRef<string | undefined>(undefined)

// userName 결정 우선순위
const userName = user
  ? user.user_metadata?.username ?? user.email?.split('@')[0] ?? null
  : guestName   // 게스트는 localStorage('financy_guest_name')

// 페이지 전환 — portfolio · risk-center · analytics는 로그인 필수
const handleNavigate = (page: Page) => {
  if ((page === 'portfolio' || page === 'risk-center' || page === 'analytics') && !user) {
    setAuthRedirectTo(page)
    setCurrentPage('auth')
    return
  }
  setCurrentPage(page)
}

// 채팅창은 chatSettings.chatEnabled 일 때만 렌더
// {chatSettings.chatEnabled && <FloatingChat ... />}
```

---

## EmojiAvatar 시스템

```typescript
// src/components/EmojiAvatar.tsx
export const AVATAR_EMOJIS = [ /* 64개 이모지 — 투자/동물/자연/사물 4 카테고리 */ ]
export const PASTEL_COLORS  = [ /* 20개 파스텔 색상 */ ]
export const DEFAULT_EMOJI  = '🐣'
export const EMPTY_EMOJI    = ''   // 이모지 없음 sentinel → 회색 사람 아이콘

// 결정론적 타유저 아바타 (채팅에서 사용)
export function avatarFromUserId(userId: string): { emoji: string; color: string }

// 사용법
// emoji === ''   → 회색 원 + 사람 SVG
// emoji === null → DEFAULT_EMOJI ('🐣')
// emoji === '🚀' → 해당 이모지 + color 배경

// 저장: 로그인 → supabase.auth.updateUser({ data: { avatar_emoji: emoji } })
//       게스트 → localStorage.setItem('financy_avatar_emoji', emoji)
// 색상: localStorage('financy_avatar_color') — 첫 방문 시 randomPastel() 고정
```

---

## FloatingChat 시스템

```typescript
// src/components/FloatingChat.tsx
// props: user, userName, theme, userAvatar, avatarColor, chatSettings

// 드래그: motion.button, drag={!isOpen}, dragMomentum=false, dragElastic=0.08
// 스냅: onDragEnd → snapToEdge() → animate(dragX, target, spring{stiffness:380, damping:32})
// 클릭 감지: onTap(framer-motion) + didDragRef 이중 가드 (드래그 후 오발 방지)
// 열기: openChat() → dragX→0, dragY→0, snappedLeft=false, isOpen=true

// ── 익명 채팅 ──────────────────────────────────────────────
// 로그인 없이도 채팅 가능. 비로그인 사용자는 guest_session_id(UUID)로 식별
// - guestSessionId: useMemo → localStorage('financy_guest_chat_id') 에서 로드/생성
// - 로그인: messages.user_id = user.id, guest_session_id = null
// - 비로그인: messages.user_id = null, guest_session_id = guestSessionId
// - isOwn 판별: user ? user.id === msg.user_id : guestSessionId === msg.guest_session_id

// ── Supabase Realtime 채널 3개 ──────────────────────────────
// 1. 'badge:messages'     — 항상 활성 (앱 시작~종료). INSERT 시 unreadCount++, todayCount++
// 2. 'public:messages:chat' — isOpen=true 일 때만 활성. 메시지 목록 실시간 수신
// 3. 'presence:financy-lobby' — Presence. onlineCount + onlineUsers(닉네임 배열) 관리
//    → ch.track({ online_at, user_name }) / userNameRef로 닉네임 최신 유지(재연결 없음)
// 4. 'app_settings:chat'  — app_settings UPDATE 구독. chatAnon 실시간 반영

// ── 접속자 배지 & 닉네임 팝업 ──────────────────────────────
// - 배지: 모든 사용자에게 표시 (N명 접속 중)
// - 클릭 시 showUserList 토글 → onlineUsers 닉네임 드롭다운
// - 외부 클릭 감지: userListRef + document mousedown 이벤트

// ── Today 카운터 ─────────────────────────────────────────
// - 채팅창 최하단 "today N" 표시
// - 앱 시작 시 DB에서 오늘 0시 이후 메시지 수 조회
// - 이후 badge 채널 INSERT마다 +1

// ── 관리자 ────────────────────────────────────────────────
// user.email === 'qufskfk123@gmail.com'
// → 메시지 hover 시 × 버튼 표시, deleteMessage(id) 호출

// ── 채팅 익명 모드 (chatAnon) ────────────────────────────
// app_settings.chat_anon = true 이면 타인 닉네임 숨김
// 관리자가 Settings에서 토글 → Realtime으로 전체 사용자 즉시 반영

// 채팅창 투명도: animate={{ opacity: isOpen ? 1 : chatSettings.opacity }}
// 배지: AnimatePresence spring(stiffness:650, damping:18)
```

---

## TickerTape 시스템

```typescript
// api/ticker-tape.ts
// 섹션: 🇰🇷 국장(KOSPI/KOSDAQ) | 🇺🇸 미장(S&P500/NASDAQ/NVDA/AAPL/TSLA) | ₿ 코인(BTC/ETH/SOL) | 💱 외환(USD/KRW)
// 데이터 소스: Naver Finance(국장) | market_cache+Finnhub(미장) | Upbit(코인) | Frankfurter(환율)
// 캐시: Cache-Control s-maxage=30, stale-while-revalidate=60
// 응답: { items: FeedItem[], updatedAt: string }

// src/components/TickerTape.tsx
// 애니메이션: 순수 CSS @keyframes financy-ticker, COPIES=4, SHIFT=-25% (끊김 없는 루프)
// Hover: paused state → animationPlayState: 'paused'
// 색상: 상승=빨강(#ef4444), 하락=파랑(#3b82f6) — 한국 관례, 환율=노랑(#eab308)
// SepChip: 제거됨 (섹션 구분자 없음)
// TickerChip: symbol(12px bold) + name(9px 2줄) + 가격 + ▲/▼ 변동률
// 폴링: 60초 간격
// 테마: CSS 변수 --ticker-bg/border/fade/symbol/name/price/sep
//   dark:  배경 rgba(3,7,18,0.92), 라이트: rgba(248,248,255,0.97) + 인디고 테두리
```

---

## 시드머니 시스템 (이중 통화)

- **SeedData**: `{ krw: number, usd: number }` — localStorage(`financy_seed`)
- Portfolio와 RiskCenter 모두 `seed` prop으로 주입받음
- KRW 시드: 국내주식/현금 기준, USD 시드: 미국주식/코인 기준
- 환율 적용 후 전체 KRW 환산 비교

---

## RiskCenter.tsx 핵심 로직

### 3대 방어 지표 (DefenseScoreDashboard)

```typescript
const MKTCFG = {
  'K-Stock': { beta: 0.85 },
  'U-Stock': { beta: 1.15 },
  'Crypto':  { beta: 2.80 },
  'Cash':    { beta: 0.00 },
}

// 유동성 지수: (현금 + 주식×0.5) / 시드 × 100 (코인 제외)
// 변동성 내성: max(0, 100 - 포트폴리오베타 × 33)
// 집중도 리스크: max(0, 100 - top3자산비중)

function riskColor(score: number) {
  if (score >= 65) return { text: 'text-emerald-400', label: '안전' }
  if (score >= 35) return { text: 'text-amber-400',   label: '주의' }
  return              { text: 'text-rose-400',    label: '위험' }
}
```

---

## Analytics.tsx 핵심 로직

### 섹션 순서 (위→아래)
1. 요약 통계 (4개 StatCard)
2. 도넛 차트 3종 (자산 배분 / 시장별 분포 / 섹터 분포) — 동시 로딩
3. **실시간 평가손익** (ticker 자산만)
4. **역사적 위기 시뮬레이션 MDD** — 접힘/펼침 accordion
5. 배당 수익률 + 목표가 상승여력
6. 실현손익 내역

### MDD 역사적 위기 시뮬레이션

```typescript
// MddSection props: { assets, krwRate, open, onToggle }
// - open/onToggle: 접힘/펼침 accordion. mddOpen 상태는 Analytics 메인 컴포넌트에 있음
// - 헤더 버튼 클릭 → ChevronDown 180° 회전 + {open && <>...content...</>}
// - portfolioKRW <= 0 이면 null 반환

const MDD_SCENARIOS = [
  {
    name: '2008 금융위기',    sub: 'Global Financial Crisis', year: '2008–09',
    emoji: '🏦', barColor: 'bg-rose-500', color: 'text-rose-500',
    drawdowns: { 'K-Stock': 54, 'U-Stock': 56, 'Crypto': 0,  'Cash': 0 },
  },
  {
    name: '2020 코로나 충격', sub: 'COVID-19 Crash',          year: '2020.02–03',
    emoji: '🦠', barColor: 'bg-orange-400', color: 'text-orange-400',
    drawdowns: { 'K-Stock': 36, 'U-Stock': 34, 'Crypto': 50, 'Cash': 0 },
  },
  {
    name: '2022 긴축 쇼크',   sub: 'Fed Rate Hike Crisis',    year: '2022.01–12',
    emoji: '📈', barColor: 'bg-amber-400', color: 'text-amber-400',
    drawdowns: { 'K-Stock': 26, 'U-Stock': 19, 'Crypto': 75, 'Cash': 0 },
  },
  {
    name: '닷컴버블 붕괴',    sub: 'Dot-com Bubble',          year: '2000–02',
    emoji: '💻', barColor: 'bg-violet-400', color: 'text-violet-400',
    drawdowns: { 'K-Stock': 55, 'U-Stock': 49, 'Crypto': 0,  'Cash': 0 },
  },
]
```

### 섹터 분포 차트 & fundamentals 로딩

```typescript
const hasSectorData = Array.from(fundamentals.values()).some(f => f.sector)
const showSectorCol = hasTickerAssets && (fundLoading || hasSectorData)
// chartsReady (IIFE 내부):
const chartsReady = !fundLoading || !showSectorCol

// getCachedFundamentals → setFundamentals(data)
// stale 있으면 refreshFundamentals → sector 보존 머지:
setFundamentals(prev => {
  const next = new Map(prev)
  for (const [ticker, f] of fresh) {
    const existing = next.get(ticker)
    next.set(ticker, { ...f, sector: f.sector ?? existing?.sector ?? null })
  }
  return next
})
// 이유: FMP API가 sector를 null로 반환할 때 기존 캐시된 값을 덮어쓰지 않기 위함
```

---

## Settings.tsx 주요 기능

```typescript
// 닉네임 편집
// 예약어 검사 (qufskfk123@gmail.com 계정은 우회)
const RESERVED = ['admin', 'administrator', 'root', ... '관리자', '운영자', ...]

// 이모지 아바타 피커
// EmojiPickerPopup: "없음" 버튼(EMPTY_EMOJI) + 8열 64이모지 그리드

// 채팅 설정 (ChatSettings)
// - chatEnabled 토글, badgeEnabled 토글(chat off시 비활성화)
// - opacity 슬라이더 (min:10, max:100, step:5, accentColor:#6C63FF)

// 관리자 전용 — 채팅 익명 모드 (userEmail === 'qufskfk123@gmail.com' 일 때만 표시)
// - app_settings.chat_anon 을 Supabase에서 읽고 실시간 구독
// - 토글 시 supabase.from('app_settings').update({ chat_anon: v }).eq('id', 1)
// - Realtime UPDATE로 모든 접속자에 즉시 반영

// Toggle 컴포넌트
// - 트랙: w-10 h-[22px] rounded-full overflow-hidden
// - 썸: absolute w-[16px] h-[16px] (rem 아닌 px 명시 — 16.5px 기본 폰트 보정)
// - 위치: left-[3px](OFF) / left-[21px](ON)  ← translate-x 대신 left 사용
//   (translate-x는 static position 기준이라 브라우저마다 오프셋 달라짐)

// 저장: 로그인 → supabase.auth.updateUser({ data: { username, avatar_emoji } })
//       게스트 → localStorage
```

---

## localStorage 키 목록

| 키 | 내용 |
|----|------|
| `financy_assets` | Asset[] (포트폴리오 자산) |
| `financy_transactions` | Transaction[] (거래 내역) |
| `financy_tx_init` | 트랜잭션 초기화 여부 플래그 |
| `financy_seed` | SeedData JSON { krw, usd } |
| `financy_theme` | 'dark' \| 'light' |
| `financy_guest_name` | 게스트 닉네임 |
| `financy_guest_chat_id` | 게스트 채팅 세션 UUID (익명 메시지 소유 판별) |
| `financy_avatar_emoji` | 이모지 아바타 문자열 ('' = 없음) |
| `financy_avatar_color` | 파스텔 배경색 HEX |
| `financy_chat_settings` | ChatSettings JSON |
| `financy_prices` | 가격 캐시 (price-cache.ts) |
| `financy_fundamentals_cache` | 재무 지표 캐시 |

---

## Supabase 테이블

| 테이블 | 용도 |
|--------|------|
| `assets` | 포트폴리오 자산 (RLS: user_id) |
| `ticker_cache` | 실시간 시세 캐시 (15분 TTL) |
| `market_cache` | 시장 지표 캐시 (TTL 가변) |
| `profiles` | 유저 채팅 설정 JSONB (id=user_id, settings=ChatSettings) |
| `messages` | 실시간 채팅 메시지 (Realtime 활성화) |
| `app_settings` | 전역 앱 설정 단일 행 (id=1, chat_anon boolean) |

### messages 스키마 (현재)
```sql
id               uuid PK
user_id          uuid REFERENCES auth.users(id)  -- nullable (익명=NULL)
guest_session_id text                             -- 익명 세션 식별자
user_name        text NOT NULL
content          text NOT NULL CHECK (char_length <= 500)
created_at       timestamptz DEFAULT now()
```
- RLS: SELECT=모두, INSERT=로그인(uid=user_id) OR 익명(uid IS NULL AND user_id IS NULL)
- DELETE=본인(user_id 기준) + 관리자 정책
- INSERT 트리거: 최신 500개 초과 시 오래된 것 자동 삭제 (`trim_old_messages`)

### app_settings 스키마
```sql
id        int PK DEFAULT 1  (단일 행 강제: CHECK id=1)
chat_anon boolean NOT NULL DEFAULT false
```
- RLS: SELECT=모두, UPDATE=관리자(jwt email = qufskfk123@gmail.com)
- Realtime 활성화 — 토글 즉시 전체 접속자 반영

---

## 외부 API 데이터 소스

| API | 용도 | 키 필요 |
|-----|------|---------|
| Finnhub | 미국 주식 시세/검색/TickerTape(NVDA,AAPL,TSLA)/유동성날씨/경제캘린더 | ✅ FINNHUB_API_KEY |
| Naver 주식 | 한국 주식 시세/검색/TickerTape(KOSPI,KOSDAQ) | ❌ |
| Upbit | 암호화폐 시세/검색/TickerTape(BTC,ETH,SOL) | ❌ |
| FMP | 재무 지표 (PER, 배당, 베타) | ✅ FMP_API_KEY |
| Frankfurter | 환율/TickerTape(USD/KRW) + Vercel Cron 캐시 | ❌ |
| alternative.me | Fear & Greed Index | ❌ |
| RSS (Reuters/CNBC/MarketWatch) | 뉴스 | ❌ |

---

## CSS 커스텀 클래스 (index.css)

```css
.card           /* bg-gray-900 border border-gray-800 rounded-2xl p-5 */
.btn-primary    /* bg-brand-600 text-white rounded-2xl 등 */
.stat-label     /* text-xs text-gray-500 */
.mono           /* font-mono tabular-nums */
.text-rise      /* 상승색 (다크=cyan, 라이트=파랑) */
.text-fall      /* 하락색 (다크=핑크, 라이트=빨강) */
```

### CSS 변수 전체 목록 (index.css :root / [data-theme="light"])

```css
/* Gauge SVG */
--gauge-panel-fill, --gauge-text-rect, --gauge-halo
--gauge-sub-color, --gauge-baseline, --gauge-tick-dim, --gauge-edge-label

/* MarketTempCard (유동성 날씨) */
--mtp-bg, --mtp-border
--mtp-tank-bg, --mtp-tank-border, --mtp-tank-shadow
--mtp-idx-bg, --mtp-idx-border
--mtp-skel-bg, --mtp-scale-color

/* TickerTape */
--ticker-bg, --ticker-border, --ticker-fade
--ticker-symbol, --ticker-name, --ticker-price, --ticker-sep
```

---

## 폰트 시스템

- **본문 폰트**: `Inter` (Latin/숫자) + `Noto Sans KR` (한글) — Google Fonts
- **모노 폰트**: `JetBrains Mono` — 숫자/코드
- **기본 크기**: `16.5px` (Tailwind base × 스케일)
- **행간**: `line-height: 1.6`
- **Tabular nums**: `font-variant-numeric: tabular-nums` body 전역 적용 → 숫자 흔들림 방지
- **tailwind.config.js** fontFamily.sans: `['Inter', 'Noto Sans KR', 'system-ui', 'sans-serif']`

---

## 개발 시 주의사항

1. **TypeScript strict** — `npx tsc --project tsconfig.app.json --noEmit`으로 검증 (tsconfig.app.json에 noUnusedLocals: true)
2. **애니메이션 분리**: framer-motion은 App.tsx 페이지 전환 + FloatingChat 드래그 + Dashboard 경제캘린더 모바일 accordion에만 사용. TickerTape는 순수 CSS, FearGreedGauge는 SVG + CSS transform, MarketTempCard는 CSS transition
3. **가격 캐시 두 종류**: `priceCache.ts`(Supabase 기반)와 `price-cache.ts`(localStorage 기반) 혼용 — 혼동 주의
4. **시드 기준 계산**: RiskCenter의 모든 비율은 `seedKRW`(원화시드 + USD시드×환율) 기준
5. **모바일 대응**: 하단 탭바(`md:hidden`), 메인 컨텐츠 `pb-20 md:pb-0`
6. **라이트 모드**: `document.documentElement`에 `data-theme="light"` 속성으로 제어. inline style={{}}은 CSS 변수(var(--name))로만 테마 반응
7. **FeedItem 타입**: `api/ticker-tape.ts`에 정의되나 `tsconfig.app.json`의 `include: ["src"]` 제약으로 `TickerTape.tsx`에서 로컬 재선언하여 사용
8. **관리자 계정**: `qufskfk123@gmail.com` — 채팅 메시지 삭제, 닉네임 예약어 우회, chat_anon 토글
9. **채팅 설정 debounce**: 슬라이더 변경은 500ms 후 Supabase 저장 (userIdRef 패턴으로 stale closure 방지)
10. **Recharts 타입 우회**: `activeIndex`, `activeShape`, `cornerRadius` 등 런타임엔 작동하나 TS 타입에 없는 prop은 `{...({ prop: val } as object)}` 패턴으로 전달
11. **Toggle 썸 위치**: `translate-x` 대신 `left` 사용 — 기본 폰트 16.5px로 인해 rem 기반 `w-4`가 16.5px로 렌더링되어 썸이 트랙 밖으로 나가는 문제 방지. 썸 크기는 `w-[16px] h-[16px]` 명시
12. **익명 채팅 DB**: `messages.user_id` nullable, `guest_session_id` 컬럼 추가. Supabase 타입 자동생성과 불일치하므로 insert 시 `as never` 캐스팅 사용
13. **보호 페이지**: `portfolio` + `risk-center` + `analytics` 모두 로그인 필수. `setAuthRedirectTo(page)` 로 로그인 후 원래 페이지로 자동 이동
14. **fundamentalsCache sector 보존**: `refreshFundamentals` upsert 시 `...(f.sector != null ? { sector: f.sector } : {})` 조건부 스프레드 — FMP가 sector=null 반환해도 DB 기존값 보호. 상태 머지도 동일하게 `f.sector ?? existing?.sector ?? null`

---

## UI 리팩토링 이력

### FearGreedGauge (Dashboard.tsx)
- 바늘(needle) 완전 제거
- 중앙: 점수 숫자 제거 → 상태명만 표시 (극단 공포/공포/중립/탐욕/극단 탐욕)
  - 큰 점수 숫자는 카드 아래 `text-6xl`로 별도 표시
- 세그먼트 활성화: `transform: scale(1.07)` + `cubic-bezier(0.34,1.56,0.64,1)` 스프링 애니메이션
- SVG `feGaussianBlur` 필터로 활성 구간 네온 글로우
- 베이스라인(가로선) 제거, 중앙 배경 rect 제거
- 공포/탐욕 레이블 위치: `mt-5`

### MarketTempCard / 유동성 날씨 (Dashboard.tsx)
수위 탱크 방식에서 **5단계 기상 카드 그리드** 방식으로 완전 재설계됨.

```typescript
// 5단계 (WEATHER_STAGES):
// 비(0–20) / 구름(21–40) / 태양(41–60) / 바람(61–80) / 홍수(81–100)
// 각 단계: { from, to, name, sublabel, icon(lucide), desc, action,
//            glowColor, activeBg, borderGlow, iconColor, iconAnim }
```

- 카드 그리드: `grid grid-cols-5 gap-1.5`, 클릭 시 previewIdx 토글 (미리보기 모드)
- 활성 카드: `scale(1.04)` + `glowColor` border + boxShadow, 비활성: `opacity:0.48`
- `WeatherBgPattern`: 각 단계별 CSS 배경 애니메이션 (빗줄기/방사형글로우/햇살/시머/홍수)
- 아이콘 애니메이션: `weather-rain-drop`, `weather-cloud-bob`, `weather-sun-spin`, `weather-wind-blow`, `weather-flood-pulse` (@keyframes in index.css)
- 헤더: 좌=유동성 날씨 라벨, 우=점수(4xl mono)+sublabel — 항상 표시
- 단계 설명 + action 권고문 + 지수 3개 그리드(S&P500/NASDAQ/KOSPI)
- 레이아웃: 수직 스택 (`p-4 space-y-4`), 모바일/데스크톱 동일

### Dashboard 전체 레이아웃 (Dashboard.tsx)
```
모바일: space-y-4 세로 스택
데스크톱(lg+): grid grid-cols-[340px_1fr] gap-6
  좌(340px fixed): 공포&탐욕 게이지 카드 + 경제 캘린더(lg:flex lg:flex-col flex-1 overflow scroll)
  우(flex-1):      유동성 날씨 → 환율 → 금리 → 뉴스(lg:flex-1 overflow-y-auto)

경제 캘린더:
  - 데스크톱: 좌 컬럼 하단에 상시 표시 (hidden lg:flex)
  - 모바일: 접힘 accordion (lg:hidden), calMobileOpen 상태, framer-motion height/opacity 애니메이션
  - EconCalendarView: 이달 캘린더 그리드 + 날짜 클릭 → 해당 일 이벤트 목록
  - EconCalendarList: impact 배지(고/중/저) + 실제값/예측/이전 비교
  - 데이터: Finnhub /api/economic-calendar, 1시간 캐시
```

### Analytics.tsx 도넛 차트 3종
| 차트 | outerRadius | innerRadius | 비고 |
|------|-------------|-------------|------|
| 섹터 분포 | 70 | 54 | ring 16px |
| 자산 배분 | 82 | 62 | ring 20px |
| 시장별 분포 | 82 | 62 | ring 20px |
- `cornerRadius={4}`, `paddingAngle={4}` 전체 적용
- activeShape: 반투명 글로우 레이어(opacity 0.18) + 확장 레이어 2중 구조
- 툴팁: `backdropFilter: blur(16px)` 유리 질감 + drop-shadow
- `animationDuration={1200}`, `animationEasing="ease-out"` 통일
- 3개 차트는 `fundLoading` 해제 시 동시 마운트 (`chartsReady` 플래그로 제어)

### Analytics.tsx MDD 섹션
- accordion 구조: 헤더 버튼 클릭으로 펼침/접힘 (`mddOpen` 상태)
- 기본 상태: 접힘 (closed). 사용자가 클릭해야 내용 표시
- ChevronDown 아이콘 `rotate-180` 트랜지션으로 상태 표시

### Dashboard 폰트/여백 시스템
- 페이지 제목: `text-2xl`, 날짜: `text-sm text-slate-500`
- SectionTitle: `text-base tracking-tight`, 아이콘 `w-5 h-5`
- 환율·금리 핵심 수치: `text-lg font-bold tracking-tight`
- 금리 항목 간격: `space-y-4`, 환율 행 높이: `py-3`
- 뉴스: `text-slate-200`, 출처 `text-slate-500`

### RiskCenter.tsx ScoreGauge 폰트
- 지표명(유동성 지수 등): `text-[10px]` → `text-xs`
- 위험 레벨(주의/안전/위험): `text-[10px]` → `text-xs`
- 보조 수치(64% 등): `text-[9px]` → `text-[11px] text-gray-500`
- 하단 기준 설명: `text-[9px]` → `text-[11px] text-gray-600`
- 종합 점수 배지: `text-[10px]` → `text-xs`
