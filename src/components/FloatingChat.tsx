/**
 * FloatingChat — 드래그 가능한 실시간 플로팅 채팅창
 *
 * ─── Supabase 초기 설정 (처음 한 번만 실행) ──────────────────────
 * Supabase 대시보드 → SQL Editor 에서 아래 SQL을 실행하세요.
 *
 * -- 1. 메시지 테이블
 * CREATE TABLE IF NOT EXISTS messages (
 *   id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
 *   user_name    text NOT NULL,
 *   content      text NOT NULL CHECK (char_length(content) <= 500),
 *   created_at   timestamptz DEFAULT now() NOT NULL
 * );
 * CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at DESC);
 *
 * -- 2. RLS 정책
 * ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "messages_select" ON messages FOR SELECT USING (true);
 * CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (auth.uid() = user_id);
 * CREATE POLICY "messages_delete_own" ON messages FOR DELETE USING (auth.uid() = user_id);
 *
 * -- 관리자 삭제 권한 (qufskfk123@gmail.com 계정)
 * CREATE POLICY "messages_delete_admin" ON messages
 *   FOR DELETE USING (auth.jwt()->>'email' = 'qufskfk123@gmail.com');
 *
 * -- 3. Realtime 활성화
 * ALTER PUBLICATION supabase_realtime ADD TABLE messages;
 *
 * ─── DB 자동 정리 ──────────────────────────────────────────────
 * CREATE OR REPLACE FUNCTION trim_messages() RETURNS TRIGGER AS $$
 * BEGIN
 *   DELETE FROM messages WHERE id IN (
 *     SELECT id FROM messages ORDER BY created_at ASC OFFSET 500
 *   );
 *   RETURN NEW;
 * END;
 * $$ LANGUAGE plpgsql SECURITY DEFINER;
 *
 * CREATE TRIGGER trim_messages_trigger
 * AFTER INSERT ON messages
 * FOR EACH STATEMENT EXECUTE PROCEDURE trim_messages();
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, useMotionValue, animate, AnimatePresence } from 'framer-motion'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { avatarFromUserId, DEFAULT_EMOJI } from './EmojiAvatar'
import type { Theme } from '../pages/Settings'
import type { ChatSettings } from '../lib/chatSettings'

interface ChatMessage {
  id: string
  user_id: string | null
  guest_session_id?: string | null
  user_name: string
  content: string
  created_at: string
}

interface Props {
  user: User | null
  userName: string | null
  theme: Theme
  userAvatar?: string | null
  avatarColor: string
  chatSettings: ChatSettings
}

const BUTTON_SIZE = 52
const EDGE_GAP    = 16

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

export default function FloatingChat({ user, userName, theme, userAvatar, avatarColor, chatSettings }: Props) {
  const [isOpen,       setIsOpen]       = useState(false)
  const [messages,     setMessages]     = useState<ChatMessage[]>([])
  const [input,        setInput]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [sending,      setSending]      = useState(false)
  const [snappedLeft,  setSnappedLeft]  = useState(false)
  const [onlineCount,  setOnlineCount]  = useState(1)
  const [unreadCount,  setUnreadCount]  = useState(0)
  const [chatAnon,     setChatAnon]     = useState(false)

  const bottomRef    = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const channelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const presenceRef  = useRef<ReturnType<typeof supabase.channel> | null>(null)
  // 드래그 중인지 여부 — onTap이 드래그 후에 발화되지 않도록 보호
  const didDragRef   = useRef(false)

  const isLight = theme === 'light'
  const isAdmin = user?.email === 'qufskfk123@gmail.com'

  // 게스트 세션 ID — 로그인하지 않은 사용자의 메시지 소유 판별용
  const guestSessionId = useMemo<string | null>(() => {
    if (user) return null
    let id = localStorage.getItem('financy_guest_chat_id')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('financy_guest_chat_id', id)
    }
    return id
  }, [user])

  // ── 드래그 모션 값 (CSS 기준 위치에서의 오프셋) ────────────────
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)

  const dragConstraints = useMemo(() => {
    const w   = window.innerWidth
    const h   = window.innerHeight
    const navH = w < 768 ? 88 : EDGE_GAP
    return {
      left:   -(w - 2 * EDGE_GAP - BUTTON_SIZE),
      right:  0,
      top:    -(h - navH - BUTTON_SIZE - 80),
      bottom: 0,
    }
  }, [])

  // 가장 가까운 좌/우 가장자리로 스냅
  const snapToEdge = useCallback(() => {
    const w              = window.innerWidth
    const initialCenterX = w - EDGE_GAP - BUTTON_SIZE / 2
    const currentCenterX = initialCenterX + dragX.get()
    const snapLeftDX     = -(w - 2 * EDGE_GAP - BUTTON_SIZE)

    if (currentCenterX < w / 2) {
      animate(dragX, snapLeftDX, { type: 'spring', stiffness: 380, damping: 32 })
      setSnappedLeft(true)
    } else {
      animate(dragX, 0, { type: 'spring', stiffness: 380, damping: 32 })
      setSnappedLeft(false)
    }
  }, [dragX])

  // 채팅 열기 — 버튼을 오른쪽 기본 위치로 복귀시킨 후 즉시 열기
  const openChat = useCallback(() => {
    animate(dragX, 0, { type: 'spring', stiffness: 420, damping: 36 })
    animate(dragY, 0, { type: 'spring', stiffness: 420, damping: 36 })
    setSnappedLeft(false)
    setIsOpen(true)
    setUnreadCount(0)  // 배지 초기화
  }, [dragX, dragY])

  const closeChat = useCallback(() => {
    setIsOpen(false)
    setUnreadCount(0)
  }, [])

  // ── app_settings 구독 — 관리자 익명 모드 실시간 반영 ────────────
  useEffect(() => {
    supabase.from('app_settings' as never)
      .select('chat_anon')
      .eq('id', 1)
      .single()
      .then(({ data, error }: { data: { chat_anon: boolean } | null; error: unknown }) => {
        if (!error && data) setChatAnon(data.chat_anon)
      })
      .catch(() => {})

    const ch = supabase
      .channel('app_settings:chat')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_settings' },
        (payload: { new: { chat_anon: boolean } }) => setChatAnon(payload.new.chat_anon)
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [])

  // ── 배지용 상시 구독 — 채팅창 닫혀있어도 새 메시지 감지 ──────────
  useEffect(() => {
    const ch = supabase
      .channel('badge:messages')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {
          setIsOpen(prev => {
            if (!prev) setUnreadCount(c => c + 1)
            return prev
          })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // ── Presence — 실시간 접속자 수 ────────────────────────────────
  useEffect(() => {
    const presenceKey = user?.id ?? `anon_${Math.random().toString(36).slice(2)}`
    const ch = supabase.channel('presence:financy-lobby', {
      config: { presence: { key: presenceKey } },
    })

    ch.on('presence', { event: 'sync' }, () => {
      const count = Object.keys(ch.presenceState()).length
      setOnlineCount(Math.max(1, count))
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ online_at: new Date().toISOString() })
      }
    })

    presenceRef.current = ch
    return () => {
      ch.untrack()
      supabase.removeChannel(ch)
    }
  }, [user?.id])

  // ── 메시지 구독 (채팅창 열릴 때만) ────────────────────────────
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior })
  }, [])

  useEffect(() => {
    if (!isOpen) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      return
    }

    setLoading(true)
    supabase
      .from('messages')
      .select('id, user_id, user_name, content, created_at')
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data }) => {
        setMessages(data ? ([...data].reverse() as ChatMessage[]) : [])
        setLoading(false)
        setTimeout(() => scrollToBottom('auto'), 60)
      })

    channelRef.current = supabase
      .channel('public:messages:chat')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages(prev => [...prev, payload.new as ChatMessage])
        }
      )
      .subscribe()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [isOpen, scrollToBottom])

  useEffect(() => {
    if (isOpen && messages.length > 0) scrollToBottom()
  }, [messages, isOpen, scrollToBottom])

  const deleteMessage = useCallback(async (id: string) => {
    // 낙관적 업데이트 — 즉시 목록에서 제거
    setMessages(prev => prev.filter(m => m.id !== id))
    await supabase.from('messages').delete().eq('id', id)
  }, [])

  const sendMessage = useCallback(async () => {
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    setInput('')
    if (user) {
      await supabase.from('messages').insert({
        user_id:   user.id,
        user_name: userName || user.email?.split('@')[0] || '익명',
        content,
      })
    } else {
      await (supabase.from('messages') as ReturnType<typeof supabase.from>).insert({
        user_id:          null,
        guest_session_id: guestSessionId,
        user_name:        userName || '익명',
        content,
      } as never)
    }
    setSending(false)
    inputRef.current?.focus()
  }, [input, user, userName, sending, guestSessionId])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // ── 스타일 ──────────────────────────────────────────────────
  const windowStyle: React.CSSProperties = {
    background:           isLight ? 'rgba(255,255,255,0.88)' : 'rgba(13,13,31,0.84)',
    backdropFilter:       'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border:               isLight ? '1px solid rgba(91,85,204,0.15)' : '1px solid rgba(108,99,255,0.18)',
    borderRadius:         '1.25rem',
    boxShadow:            isLight
      ? '0 20px 60px rgba(91,85,204,0.14), 0 1px 2px rgba(0,0,0,0.06)'
      : '0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(108,99,255,0.08)',
  }

  const otherBubbleStyle: React.CSSProperties = {
    background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
    border:     isLight ? '1px solid rgba(91,85,204,0.12)' : '1px solid rgba(108,99,255,0.12)',
  }

  const inputStyle: React.CSSProperties = {
    background:   isLight ? 'rgba(91,85,204,0.06)' : 'rgba(19,19,48,0.60)',
    border:       isLight ? '1px solid rgba(91,85,204,0.14)' : '1px solid rgba(108,99,255,0.10)',
    color:        isLight ? '#0A0A18' : '#E8E8F6',
    borderRadius: '0.75rem',
    padding:      '0.5rem 0.75rem',
    fontSize:     '0.875rem',
    outline:      'none',
    flex:         1,
    transition:   'border-color 0.15s ease',
  }

  // 채팅창 위치 — 버튼 스냅 방향과 동일
  const chatPositionStyle: React.CSSProperties = snappedLeft
    ? { left: EDGE_GAP, right: 'auto' }
    : { right: EDGE_GAP, left: 'auto' }

  return (
    <>
      {/* ── 채팅창 ── */}
      <div
        aria-label="실시간 채팅창"
        className={`fixed z-50 w-80 md:w-96 flex flex-col
          bottom-[9.5rem] md:bottom-[4.5rem]
          transition-all duration-300 ease-out
          ${isOpen
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        style={{ ...windowStyle, ...chatPositionStyle, height: '420px' }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: isLight ? '1px solid rgba(91,85,204,0.10)' : '1px solid rgba(108,99,255,0.10)' }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <span className={`text-sm font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>
              실시간 채팅
            </span>
            {/* 접속 인원 배지 */}
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              <span className="text-[10px] font-semibold text-emerald-400 tabular-nums">
                {onlineCount}명 접속 중
              </span>
            </div>
          </div>
          <button
            onClick={closeChat}
            className="text-gray-500 hover:text-gray-400 transition-colors p-0.5"
            aria-label="채팅창 닫기"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-500">
              <svg className="w-9 h-9 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-xs opacity-70">첫 메시지를 보내보세요!</span>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = user
                ? user.id === msg.user_id
                : (guestSessionId !== null && guestSessionId === msg.guest_session_id)
              const otherAvatarId = msg.user_id ?? msg.guest_session_id ?? 'unknown'
              const otherAvatar = avatarFromUserId(otherAvatarId)
              const ownEmoji    = userAvatar || DEFAULT_EMOJI
              return (
                <div key={msg.id} className={`group flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base"
                    style={{ backgroundColor: isOwn ? avatarColor : otherAvatar.color }}
                  >
                    {isOwn ? ownEmoji : otherAvatar.emoji}
                  </div>

                  <div className={`flex flex-col max-w-[72%] gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
                    {!isOwn && !chatAnon && (
                      <span className="text-xs text-gray-500 ml-1">{msg.user_name}</span>
                    )}

                    {/* 버블 + 삭제 버튼 래퍼 */}
                    <div className="relative">
                      <div
                        className={`px-3 py-2 text-sm leading-relaxed break-words ${
                          isOwn ? 'rounded-2xl rounded-tr-sm text-white' : 'rounded-2xl rounded-tl-sm'
                        } ${!isOwn && (isLight ? 'text-gray-800' : 'text-gray-200')}`}
                        style={isOwn
                          ? { background: 'linear-gradient(135deg, #6C63FF 0%, #8B84FF 100%)' }
                          : otherBubbleStyle}
                      >
                        {msg.content}
                      </div>

                      {/* 관리자 삭제 버튼 — 호버 시 표시 */}
                      {isAdmin && (
                        <button
                          onClick={() => deleteMessage(msg.id)}
                          title="메시지 삭제 (관리자)"
                          className={`absolute -top-1.5 ${isOwn ? '-left-1.5' : '-right-1.5'}
                            w-[18px] h-[18px] rounded-full bg-rose-500 hover:bg-rose-400
                            flex items-center justify-center shadow-md
                            opacity-0 group-hover:opacity-100
                            transition-opacity duration-150 active:scale-90`}
                        >
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>

                    <span className="text-xs text-gray-600 mx-1">{fmtTime(msg.created_at)}</span>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* 입력창 */}
        <div
          className="px-3 pb-3 pt-2"
          style={{ borderTop: isLight ? '1px solid rgba(91,85,204,0.10)' : '1px solid rgba(108,99,255,0.10)' }}
        >
          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={user ? '메시지를 입력하세요…' : `익명으로 채팅 (${userName || '익명'})`}
              maxLength={500}
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = isLight ? 'rgba(91,85,204,0.35)' : 'rgba(108,99,255,0.35)')}
              onBlur={e =>  (e.currentTarget.style.borderColor = isLight ? 'rgba(91,85,204,0.14)' : 'rgba(108,99,255,0.10)')}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              aria-label="메시지 보내기"
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center
                transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #8B84FF 100%)' }}
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── 드래그 가능한 플로팅 버튼 ── */}
      <motion.button
        // 채팅창이 열려있으면 드래그 비활성화
        drag={!isOpen}
        dragMomentum={false}
        dragElastic={0.08}
        dragConstraints={dragConstraints}
        // onTap: framer-motion이 드래그와 탭을 자체적으로 구분해 발화
        onTapStart={() => { didDragRef.current = false }}
        onDragStart={() => { didDragRef.current = true }}
        onDragEnd={snapToEdge}
        onTap={() => {
          if (didDragRef.current) return
          if (isOpen) closeChat()
          else openChat()
        }}
        animate={{ opacity: isOpen ? 1 : chatSettings.opacity }}
        whileHover={{ opacity: 1, scale: 1.06 }}
        whileDrag={{ opacity: 1, scale: 0.94 }}
        transition={{ opacity: { duration: 0.15 }, scale: { duration: 0.12 } }}
        aria-label={isOpen ? '채팅창 닫기' : '채팅창 열기'}
        className={`fixed z-50 right-4 md:right-6 bottom-[5.5rem] md:bottom-6
          flex items-center justify-center select-none touch-none
          ${isOpen ? 'cursor-pointer' : 'cursor-grab'}`}
        style={{
          x: dragX,
          y: dragY,
          width:               BUTTON_SIZE,
          height:              BUTTON_SIZE,
          borderRadius:        '50%',
          backdropFilter:      'blur(12px)',
          WebkitBackdropFilter:'blur(12px)',
          background: isOpen
            ? (isLight ? 'rgba(91,85,204,0.15)' : 'rgba(19,19,48,0.75)')
            : 'linear-gradient(135deg, rgba(108,99,255,0.82) 0%, rgba(139,132,255,0.82) 100%)',
          border: isOpen
            ? (isLight ? '1px solid rgba(91,85,204,0.25)' : '1px solid rgba(108,99,255,0.30)')
            : '1px solid rgba(255,255,255,0.18)',
          boxShadow: isOpen ? 'none' : '0 6px 20px rgba(108,99,255,0.40)',
        }}
      >
        {isOpen ? (
          <svg
            className={`w-5 h-5 ${isLight ? 'text-brand-600' : 'text-brand-300'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}

        {/* 읽지 않은 메시지 배지 */}
        <AnimatePresence>
          {!isOpen && chatSettings.badgeEnabled && unreadCount > 0 && (
            <motion.div
              key="badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 650, damping: 18 }}
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px]
                         bg-rose-500 rounded-full flex items-center justify-center
                         text-white text-[9px] font-bold px-1 shadow-lg
                         ring-2 ring-gray-950 pointer-events-none"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  )
}
