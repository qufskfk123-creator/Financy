-- ============================================================
-- Financy — Database Schema
-- Supabase SQL Editor 또는 Migration 파일로 실행하세요.
-- ============================================================

-- ──────────────────────────────────────────
-- 1. investments (투자 기록)
-- ──────────────────────────────────────────
create table if not exists public.investments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,

  -- 종목 정보
  name           text        not null,                  -- 종목명 (예: 삼성전자)
  ticker         text        not null,                  -- 티커   (예: 005930)
  exchange       text        not null default 'KRX',    -- 거래소  (KRX | NASDAQ | NYSE | ...)

  -- 매수 정보
  purchase_price numeric(18, 4) not null check (purchase_price > 0),  -- 매수가 (주당)
  quantity       numeric(18, 6) not null check (quantity > 0),        -- 수량 (소수점 지원: 코인/ETF)
  purchase_date  date          not null,

  -- 메모
  memo           text,                                  -- 투자 이유 (nullable)

  -- 메타
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 인덱스
create index if not exists investments_user_id_idx        on public.investments (user_id);
create index if not exists investments_purchase_date_idx  on public.investments (purchase_date desc);
create index if not exists investments_ticker_idx         on public.investments (ticker);

-- updated_at 자동 갱신 트리거
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger investments_set_updated_at
  before update on public.investments
  for each row execute function public.set_updated_at();

-- RLS (Row Level Security)
alter table public.investments enable row level security;

create policy "investments: 본인 데이터만 조회"
  on public.investments for select
  using (auth.uid() = user_id);

create policy "investments: 본인 데이터만 삽입"
  on public.investments for insert
  with check (auth.uid() = user_id);

create policy "investments: 본인 데이터만 수정"
  on public.investments for update
  using (auth.uid() = user_id);

create policy "investments: 본인 데이터만 삭제"
  on public.investments for delete
  using (auth.uid() = user_id);


-- ──────────────────────────────────────────
-- 2. principles (투자 원칙)
-- ──────────────────────────────────────────
create table if not exists public.principles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- 원칙 내용
  title       text    not null,           -- 원칙 제목  (예: "PER 15 이하만 매수")
  description text,                       -- 상세 설명 (nullable)
  category    text    not null default 'general',  -- 분류 (general | risk | entry | exit | ...)

  -- 준수 여부
  is_followed boolean not null default true,  -- 현재 이 원칙을 지키고 있는가
  order_index integer not null default 0,     -- 표시 순서 (드래그 정렬용)

  -- 메타
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 인덱스
create index if not exists principles_user_id_idx on public.principles (user_id);
create index if not exists principles_order_idx   on public.principles (user_id, order_index);

-- updated_at 자동 갱신 트리거
create or replace trigger principles_set_updated_at
  before update on public.principles
  for each row execute function public.set_updated_at();

-- RLS
alter table public.principles enable row level security;

create policy "principles: 본인 데이터만 조회"
  on public.principles for select
  using (auth.uid() = user_id);

create policy "principles: 본인 데이터만 삽입"
  on public.principles for insert
  with check (auth.uid() = user_id);

create policy "principles: 본인 데이터만 수정"
  on public.principles for update
  using (auth.uid() = user_id);

create policy "principles: 본인 데이터만 삭제"
  on public.principles for delete
  using (auth.uid() = user_id);


-- ──────────────────────────────────────────
-- 3. investment_principle_checks (원칙 준수 기록)
--    매수 시점에 각 원칙을 체크했는지 기록
-- ──────────────────────────────────────────
create table if not exists public.investment_principle_checks (
  id             uuid primary key default gen_random_uuid(),
  investment_id  uuid not null references public.investments(id)  on delete cascade,
  principle_id   uuid            references public.principles(id)  on delete set null,
  principle_title text not null,           -- 원칙 제목 (비정규화 — 원칙이 삭제돼도 기록 유지)
  is_checked     boolean not null,         -- true: 준수, false: 위반
  created_at     timestamptz not null default now()
);

create index if not exists ipc_investment_id_idx on public.investment_principle_checks (investment_id);
create index if not exists ipc_principle_id_idx  on public.investment_principle_checks (principle_id);

alter table public.investment_principle_checks enable row level security;

create policy "ipc: 본인 데이터만 조회"
  on public.investment_principle_checks for select
  using (
    investment_id in (
      select id from public.investments where user_id = auth.uid()
    )
  );

create policy "ipc: 본인 데이터만 삽입"
  on public.investment_principle_checks for insert
  with check (
    investment_id in (
      select id from public.investments where user_id = auth.uid()
    )
  );

create policy "ipc: 본인 데이터만 삭제"
  on public.investment_principle_checks for delete
  using (
    investment_id in (
      select id from public.investments where user_id = auth.uid()
    )
  );
