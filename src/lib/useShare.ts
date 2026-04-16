import { useState, useCallback } from 'react'

export function useShare() {
  const [toastVisible, setToastVisible] = useState(false)

  const showToast = useCallback(() => {
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }, [])

  const handleShare = useCallback(async () => {
    const url   = window.location.origin
    const text  = url
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

    // 모바일 + share API 지원 → 시스템 공유 시트
    if (navigator.share && isMobile) {
      try {
        await navigator.share({ title: 'Financy — 투자 기상도', text, url })
      } catch {
        // 사용자 취소 — 무시
      }
      return
    }

    // PC (또는 share 미지원) → 클립보드 복사만 시도
    try {
      await navigator.clipboard.writeText(text)
      showToast()
    } catch {
      // clipboard 권한 거부 등 — 조용히 무시
    }
  }, [showToast])

  return { handleShare, toastVisible }
}
