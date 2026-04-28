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
D:\AI study\Financy_v1.0\
├── src/
│   ├── App.tsx                  # 루트: 라우팅, 전역 상태, 인증
│   ├── main.tsx
│   ├── index.css                # 글로벌 CSS (Tailwind + CSS 변수)
│   ├── pages/
│   │   ├── Dashboard.tsx        # 기상도 (시장온도계, 유동성날씨, 환율, 금리, 경제캘린더, 뉴스)
│   │   ├── Portfolio.tsx        # 포트폴리오 관리 (CRUD, 손익)
│   │   ├── RiskCenter.tsx       # 리스크 센터 (방어지표, FX 노출, 집중도)
│   │   ├── Analytics.tsx        # 분석 (파이차트, 실시간평가손익, MDD, 섹터, 배당, 목표가)
│   │   ├── Transactions.tsx     # 거래 내역 (매수/매도 자동 기록)
│   │   ├── Settings.tsx         # 설정 (테마, 닉네임, 이모지, 채팅 설정)
│   │   └── Auth.tsx             # 인증 페이지
│   ├── components/
│   │   ├── Sidebar.tsx          # 사이드바 + 모바일 하단 탭바 (EmojiAvatar 사용)
│   │   ├── TickerTape.tsx       # 상단 실시간 시세 전광판 (CSS GPU 애니메이션)
│   │   ├── FloatingChat.tsx     # 드래그 가능한 플로팅 채팅창 (framer-motion)
│   │   ├── EmojiAvatar.tsx      # 이모지 아바타 컴포넌트 + 유틸
│   │   ├── MoneyTip.tsx         # 금액 축약 표시 + 호버 툴팁 (K/M/B 포맷)
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
type Theme = 'dark' | 'light'

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
// localStorage: 'financy_chat_settings' / Supabase: profiles.settings (JSONB)

// api/ticker-tape.ts (FeedItem — TickerTape.tsx에서 로컬 재선언)
type FeedItem =
  | { kind: 'ticker'; symbol: string; name: string; price: number; change: number; changePct: number; currency: 'KRW' | 'USD' }
  | { kind: 'sep';    label: string }

// api/economic-calendar.ts
interface EconEvent {
  date: string      // "YYYY-MM-DD HH:MM:SS"
  country: string; event: string; currency: string
  impact: string    // "High" | "Medium" | "Low"
  previous: string | null; estimate: string | null; actual: string | null
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
const [userAvatar, setUserAvatar]   = useState<string | null>(...)
const [avatarColor]                 = useState<string>(...)

// userName 결정 우선순위
const userName = user
  ? user.user_metadata?.username ?? user.email?.split('@')[0] ?? null
  : guestName   // 게스트는 localStorage('financy_guest_name')

// 페이지 전환 — portfolio · risk-center · analytics는 로그인 필수
const handleNavigate = (page: Page) => {
  if ((page === 'portfolio' || page === 'risk-center' || page === 'analytics') && !user) {
    setAuthRedirectTo(page); setCurrentPage('auth'); return
  }
  setCurrentPage(page)
}

// 채팅 설정 debounce: pendingSettingsRef + debounceTimerRef + userIdRef (stale closure 방지)
// 채팅창은 chatSettings.chatEnabled 일 때만 렌더
```

---

## 주요 컴포넌트 핵심 사항

### EmojiAvatar (`src/components/EmojiAvatar.tsx`)
- `AVATAR_EMOJIS`: 64개 (투자/동물/자연/사물 4카테고리), `PASTEL_COLORS`: 20개
- `DEFAULT_EMOJI = '🐣'`, `EMPTY_EMOJI = ''` (빈 문자열 = 회색 사람 아이콘)
- `avatarFromUserId(userId)` — 결정론적 타유저 아바타 (채팅에서 사용)
- 저장: 로그인 → `supabase.auth.updateUser({ data: { avatar_emoji } })` / 게스트 → localStorage
- 색상: `localStorage('financy_avatar_color')` — 첫 방문 시 `randomPastel()` 고정

### FloatingChat (`src/components/FloatingChat.tsx`)
- 드래그: `motion.button`, `drag={!isOpen}`, `dragMomentum=false`, `dragElastic=0.08`
- 스냅: `onDragEnd → snapToEdge() → animate(dragX, target, spring{stiffness:380, damping:32})`
- 클릭/드래그 오발 방지: `onTap(framer-motion)` + `didDragRef` 이중 가드
- **익명 채팅**: `guest_session_id`(UUID) → `localStorage('financy_guest_chat_id')` 로드/생성
- **Realtime 채널 4개**:
  1. `badge:messages` — 항상 활성, INSERT 시 unreadCount/todayCount++
  2. `public:messages:chat` — isOpen=true 일 때만 활성
  3. `presence:financy-lobby` — onlineCount + onlineUsers 닉네임 배열
  4. `app_settings:chat` — chatAnon 실시간 반영
- 관리자(`qufskfk123@gmail.com`): 메시지 hover 시 × 버튼 → `deleteMessage(id)`

### TickerTape (`src/components/TickerTape.tsx`)
- 애니메이션: 순수 CSS `@keyframes financy-ticker`, `COPIES=4`, `SHIFT=-25%` (끊김 없는 루프)
- 색상: 상승=빨강(`#ef4444`), 하락=파랑(`#3b82f6`) — 한국 관례, 환율=노랑
- 폴링: 60초 간격 / 테마: CSS 변수 `--ticker-bg/border/fade` 등

### MoneyTip (`src/components/MoneyTip.tsx`)
- KRW: `≥1B→₩1.2B / ≥1M→₩12.3M / ≥1K→₩123K` / USD: `≥1B→$1.2B / ≥1M→$1.2M / ≥1K→$1.2K`
- compact === full 이면 툴팁 없이 `<span>` 렌더, 다르면 hover 시 full 금액 팝업
- JSX 금액 직접 렌더 → `<MoneyTip>` 교체. template literal 안에서는 로컬 fmtXxx 함수 사용

### Dashboard (`src/pages/Dashboard.tsx`)
- **MarketThermometer**: Fear&Greed(0–100) → 온도(-20°C~+50°C) 변환. `indexToTemp(v) = (v/100)*70-20`
- **TEMP_STAGES 5단계** (Icy Blue → Crimson Red 심리 스펙트럼):
  - 동결(0–21) Snowflake — Icy Blue / 냉기(21–41) Wind — Cool Blue
  - 미온(41–61) Minus — Slate Gray / 열기(61–81) Flame — Warm Red
  - 과열(81–101) Zap — Crimson Red
- **온도계 레이아웃**: 좌측 인디케이터 컬럼(width:52px) + 중앙 튜브 컬럼 + 우측 눈금 컬럼(width:68px)
  - 튜브: `TUBE_H=180`, `BULB_D=40`, 튜브 너비 18px (중심 x=21 기준 x:12~30)
  - SVG 케이스 아웃라인: `path="M 12,189 L 12,9 A 9,9 0 0 1 30,9 L 30,189 A 20,20 0 1 1 12,189 Z"` (캡 r=9, 구근 r=20), `stroke=var(--mtp-scale-color)`
  - 현재온도 인디케이터: `flex-row-reverse` → 글로우 라인이 튜브 방향으로 향함
- **MarketTempCard**: 유동성 날씨 5단계 카드 그리드 (`WEATHER_STAGES`: 비/구름/태양/바람/홍수)
  - 5단계 버튼 레이아웃: 모바일=세로(기존 사이즈), 데스크톱=가로(`md:flex-row`) 아이콘 1.5배·텍스트 1.5배·점수 1.2배
  - 헤더 점수: `text-2xl`(숫자) + `text-xs`(pts/sublabel)
- **TodayEconAlert**: `ev.event.replace(/^\d{4}-\d{2}-\d{2}\s+/, '')` — Finnhub 이벤트명 날짜 접두사 제거
  - 시간 컬럼: `time`이 있을 때만 렌더(빈 공간 방지). 방어 파싱: `/^\d{2}:\d{2}/.test(rawT)`
- **투자처방 박스**: `var(--alert-banner-bg)` 배경 + `borderLeft: 3px solid {glowColor}` + Zap 아이콘 `text-brand-400`
- 레이아웃: 데스크톱 `grid-cols-[340px_1fr]`, 좌=온도계+캘린더, 우=유동성날씨→환율→금리→뉴스

---

## 시드머니 시스템

- `SeedData { krw, usd }` — `localStorage('financy_seed')`
- Portfolio·RiskCenter 모두 `seed` prop으로 주입받음
- RiskCenter의 모든 비율 기준: `seedKRW = krw + usd × 환율`

---

## 자산 데이터 로딩 우선순위 ⚠️

**Portfolio · RiskCenter · Analytics 모두 독립적으로 자산을 로드한다** (App.tsx 공유 상태 없음).

```
우선순위 (RiskCenter, Analytics):
  1. localStorage('financy_assets') — 항상 full 구조 (entries + sells 전체)
  2. Supabase DB fetchAssets()     — localStorage 비어있을 때만 폴백
```

> DB `assets` 테이블은 `quantity` + `avg_price`만 저장 → `rowToAsset()`으로 복원하면 entries가 1개로 뭉개지고 sells가 빈 배열이 됨. localStorage가 있으면 절대 DB를 먼저 읽으면 안 된다.

```typescript
// 올바른 패턴 (RiskCenter / Analytics 공통)
const local = loadLocalAssets()
const load = (userId && local.length === 0)
  ? fetchAssets(userId).catch(() => [])
  : Promise.resolve(local)
```

### loadLocalAssets v1→v2 마이그레이션
세 페이지 모두 구버전(단일 `quantity`/`avgBuyPrice`) 처리:
```typescript
if (!Array.isArray(a.entries)) {
  return { ...a, entries: [{ quantity: a.quantity, price: a.avgBuyPrice, ... }], sells: [] }
}
```

---

## RiskCenter.tsx 핵심 로직

```typescript
const MKTCFG = {
  'K-Stock': { beta: 0.85 }, 'U-Stock': { beta: 1.15 },
  'Crypto':  { beta: 2.80 }, 'Cash':    { beta: 0.00 },
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

### 섹션 순서
1. 요약 통계 (4개 StatCard)
2. 도넛 차트 3종 (자산 배분 / 시장별 / 섹터) — `chartsReady` 플래그로 동시 마운트
3. 실시간 평가손익 (ticker 자산만)
4. 역사적 위기 시뮬레이션 MDD — accordion (기본 접힘)
5. 배당 수익률 + 목표가 상승여력
6. 실현손익 내역

### MDD 시나리오
| 이벤트 | K-Stock | U-Stock | Crypto |
|--------|---------|---------|--------|
| 2008 금융위기 | 54% | 56% | — |
| 2020 코로나 | 36% | 34% | 50% |
| 2022 긴축 쇼크 | 26% | 19% | 75% |
| 닷컴버블 | 55% | 49% | — |

### 섹터 fundamentals 로딩
```typescript
// stale 캐시 갱신 시 sector 보존 머지 (FMP가 null 반환해도 기존값 유지)
next.set(ticker, { ...f, sector: f.sector ?? existing?.sector ?? null })
```

---

## localStorage 키 목록

| 키 | 내용 |
|----|------|
| `financy_assets` | Asset[] (포트폴리오 자산) |
| `financy_transactions` | Transaction[] (거래 내역) |
| `financy_tx_init` | 트랜잭션 초기화 여부 플래그 |
| `financy_seed` | SeedData `{ krw, usd }` |
| `financy_theme` | `'dark' \| 'light'` |
| `financy_guest_name` | 게스트 닉네임 |
| `financy_guest_chat_id` | 게스트 채팅 세션 UUID |
| `financy_avatar_emoji` | 이모지 아바타 (`''` = 없음) |
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
| `profiles` | 유저 채팅 설정 JSONB (id=user_id) |
| `messages` | 실시간 채팅 메시지 (Realtime 활성화) |
| `app_settings` | 전역 앱 설정 단일 행 (id=1) |

### messages 스키마
```sql
id               uuid PK
user_id          uuid REFERENCES auth.users(id)  -- nullable (익명=NULL)
guest_session_id text
user_name        text NOT NULL
content          text NOT NULL CHECK (char_length <= 500)
created_at       timestamptz DEFAULT now()
```
- RLS: INSERT = 로그인(uid=user_id) OR 익명(uid IS NULL AND user_id IS NULL)
- INSERT 트리거: 최신 500개 초과 시 오래된 것 자동 삭제 (`trim_old_messages`)

### app_settings 스키마
```sql
id        int PK DEFAULT 1  -- 단일 행 강제 (CHECK id=1)
chat_anon boolean NOT NULL DEFAULT false
```
- RLS: UPDATE = 관리자(jwt email = qufskfk123@gmail.com)
- Realtime 활성화 → 토글 즉시 전체 접속자 반영

---

## 외부 API 데이터 소스

| API | 용도 | 키 필요 |
|-----|------|---------|
| Finnhub | 미국 주식 시세/검색/TickerTape/유동성날씨/경제캘린더 | ✅ FINNHUB_API_KEY |
| Naver 주식 | 한국 주식 시세/검색/TickerTape(KOSPI,KOSDAQ) | ❌ |
| Upbit | 암호화폐 시세/검색/TickerTape(BTC,ETH,SOL) | ❌ |
| FMP | 재무 지표 (PER, 배당, 베타, 섹터) | ✅ FMP_API_KEY |
| Frankfurter | 환율/TickerTape(USD/KRW) + Vercel Cron 캐시 | ❌ |
| alternative.me | Fear & Greed Index | ❌ |
| RSS (Reuters/CNBC/MarketWatch) | 뉴스 | ❌ |

---

## CSS 시스템

### 커스텀 클래스 (index.css)
```css
.card        /* bg-gray-900 border border-gray-800 rounded-2xl p-5 */
.btn-primary /* bg-brand-600 text-white rounded-2xl */
.stat-label  /* text-xs text-gray-500 */
.mono        /* font-mono tabular-nums */
.text-rise   /* 상승색 (다크=cyan, 라이트=파랑) */
.text-fall   /* 하락색 (다크=핑크, 라이트=빨강) */
```

### 주요 CSS 변수
```css
/* MarketTempCard (유동성 날씨) */
--mtp-bg, --mtp-border, --mtp-tank-bg, --mtp-tank-border
--mtp-idx-bg, --mtp-idx-border, --mtp-skel-bg
--mtp-scale-color  /* 온도계 눈금 + SVG 케이스 아웃라인 색 (다크: rgba(148,163,184,0.35), 라이트: rgba(91,85,204,0.30)) */

/* TodayEconAlert / 투자처방 */
--alert-forecast-text  /* 다크: rgba(220,218,255,0.92), 라이트: #2D2970 */
--alert-banner-bg      /* 다크: rgba(108,99,255,0.13), 라이트: rgba(99,99,224,0.09) */

/* TickerTape */
--ticker-bg, --ticker-border, --ticker-fade, --ticker-symbol, --ticker-name

/* @keyframes */
weather-rain-drop, weather-cloud-bob, weather-sun-spin,
weather-wind-blow, weather-flood-pulse  /* 유동성 날씨 카드 아이콘 애니메이션 */
weather-bg-rain, weather-bg-glow, weather-bg-wind, weather-bg-flood  /* 배경 패턴 */
```

### 폰트
- 본문: `Inter` + `Noto Sans KR` / 모노: `JetBrains Mono`
- 기본 크기: `16.5px`, 행간: `1.6`, `tabular-nums` body 전역 적용

---

## 개발 시 주의사항

1. **TypeScript strict** — `npx tsc --project tsconfig.app.json --noEmit` (noUnusedLocals: true)
2. **애니메이션 분리**: framer-motion은 App.tsx 페이지 전환 + FloatingChat + Dashboard 캘린더 accordion에만. TickerTape는 순수 CSS, MarketTempCard는 CSS transition
3. **가격 캐시 두 종류**: `priceCache.ts`(Supabase) vs `price-cache.ts`(localStorage) — 혼동 주의
4. **시드 기준 계산**: RiskCenter의 모든 비율은 `seedKRW = krw + usd × 환율` 기준
5. **모바일 대응**: 하단 탭바(`md:hidden`), 메인 컨텐츠 `pb-20 md:pb-0`
6. **라이트 모드**: `document.documentElement`에 `data-theme="light"` 속성. inline style은 반드시 CSS 변수(`var(--name)`)로만 테마 반응
7. **FeedItem 타입**: `api/ticker-tape.ts` 정의지만 `tsconfig.app.json include:["src"]` 제약으로 `TickerTape.tsx`에서 로컬 재선언
8. **관리자 계정**: `qufskfk123@gmail.com` — 채팅 삭제, 닉네임 예약어 우회, chat_anon 토글
9. **채팅 설정 debounce**: 슬라이더 500ms 후 Supabase 저장, `userIdRef`로 stale closure 방지
10. **Recharts 타입 우회**: `activeIndex`, `activeShape` 등 런타임엔 동작하나 TS 타입 없는 prop은 `{...({ prop: val } as object)}` 패턴
11. **Toggle 썸 위치**: `translate-x` 대신 `left` 사용. 폰트 16.5px로 인해 rem 기반 `w-4`가 16.5px 렌더링 → 썸이 트랙 밖으로 나가는 버그. 썸 크기 `w-[16px] h-[16px]` 명시, 위치 `left-[3px]`(OFF) / `left-[21px]`(ON)
12. **익명 채팅 DB**: `messages.user_id` nullable, `guest_session_id` 컬럼. Supabase 자동생성 타입과 불일치 → insert 시 `as never` 캐스팅
13. **보호 페이지**: `portfolio` + `risk-center` + `analytics` 로그인 필수. `setAuthRedirectTo(page)`로 로그인 후 원래 페이지 자동 이동
14. **fundamentalsCache sector 보존**: `refreshFundamentals` upsert 시 `...(f.sector != null ? { sector: f.sector } : {})` — FMP sector=null 반환 시 DB 기존값 보호. 상태 머지도 `f.sector ?? existing?.sector ?? null`
15. **MoneyTip 사용 원칙**: JSX 금액 직접 렌더 → `<MoneyTip value={v} currency={c} />`. template literal 문자열 컨텍스트는 로컬 `fmtW` / `fmtD` / `fmtMoney` 그대로 사용
16. **자산 데이터 소스 우선순위**: localStorage 우선, DB는 폴백. `rowToAsset()`은 entries/sells 손실하므로 localStorage가 있을 때 DB를 읽으면 포트폴리오 수치가 달라진다
17. **패널 제목 표준**: 모든 메뉴 패널 카드 제목 통일 — 아이콘 `w-5 h-5 text-brand-400` + 텍스트 `text-base font-semibold text-slate-200 tracking-tight`. 의미 색상 아이콘(rose/sky/rc.text)은 색상 유지, 크기만 w-5 h-5로
18. **내부 박스 디자인 통일**: 모든 패널 내 정보 박스는 left-accent-border 스타일 — `borderLeft: '3px solid {color}'` + `var(--alert-banner-bg)` 또는 해당 색상 배경. 동적 색상은 config 객체에 `accent` 프로퍼티로 관리 (MDD_SCENARIOS, INSIGHT_STYLE, LC)
19. **Finnhub 경제캘린더 시간 파싱**: `e.time`이 전체 datetime 형식일 수 있음 → `String(e.time).match(/\d{2}:\d{2}(?::\d{2})?/)` 로 HH:MM:SS만 추출. Dashboard에서도 `/^\d{2}:\d{2}/.test(rawT)` 방어 파싱, 시간 없으면 컬럼 자체 미렌더
20. **경제캘린더 이벤트명**: Finnhub `event` 필드에 날짜 접두사 포함될 수 있음 → `ev.event.replace(/^\d{4}-\d{2}-\d{2}\s+/, '')` 로 제거해서 표시
