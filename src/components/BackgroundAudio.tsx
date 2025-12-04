"use client"
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function BackgroundAudio(){
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [muted, setMuted] = useState(false)
  const [src, setSrc] = useState('')
  const [volume, setVolume] = useState(0.1)
  const pathname = usePathname()
  const isAdmin = (pathname || '').startsWith('/admin')

  useEffect(()=>{
    if (isAdmin) return
    (async()=>{
      try{
        const res = await fetch('/api/admin/settings')
        const s = res.ok ? await res.json() : {}
        let url: string = s.bg_music_url || ''
        let vol: number = Number(s.bg_music_volume ?? 0.1)
        let on: boolean = Boolean(s.bg_music_enabled ?? false)
        if ((!url || !on) && typeof window !== 'undefined'){
          try{
            const raw = localStorage.getItem('admin_settings')
            if (raw){
              const cfg = JSON.parse(raw)
              url = url || cfg.bg_music_url || ''
              vol = Number(vol || cfg.bg_music_volume || 0.1)
              on = Boolean(on || cfg.bg_music_enabled || false)
            }
          }catch{}
        }
        if (url && on){
          setEnabled(true)
          setVolume(Math.max(0, Math.min(1, vol || 0.1)))
          setSrc(`/api/proxy-audio?src=${encodeURIComponent(url)}`)
        }
      }catch{}
    })()
  }, [isAdmin])

  useEffect(()=>{
    if (isAdmin) return
    if (!enabled || !src) return
    if (typeof window === 'undefined') return
    try{
      const played = localStorage.getItem('bg_music_played') === '1'
      if (played) return
      const a = new Audio(src)
      a.volume = volume
      a.loop = false
      a.muted = false
      audioRef.current = a
      const tryPlay = async ()=>{
        try{ await a.play(); localStorage.setItem('bg_music_played','1') }catch{}
      }
      tryPlay()
      const onFirst = async ()=>{
        try{ await tryPlay() }catch{}
        window.removeEventListener('pointerdown', onFirst)
        window.removeEventListener('keydown', onFirst)
      }
      window.addEventListener('pointerdown', onFirst)
      window.addEventListener('keydown', onFirst)
      return ()=>{
        window.removeEventListener('pointerdown', onFirst)
        window.removeEventListener('keydown', onFirst)
      }
    }catch{}
  }, [enabled, src, volume, isAdmin])

  function toggleMute(){
    const a = audioRef.current
    if (!a) return
    a.muted = !a.muted
    setMuted(a.muted)
  }

  if (isAdmin || !enabled || !src) return null
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button className={`cta-outline shimmer rounded-full px-4 py-2`} onClick={toggleMute}>
        {muted ? '🔇 Unmute' : '🔊 Mute'}
      </button>
    </div>
  )
}
