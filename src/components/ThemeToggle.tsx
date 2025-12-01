"use client"
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export default function ThemeToggle(){
  const [dark, setDark] = useState(true)
  useEffect(()=>{
    const cls = dark ? 'dark' : 'light'
    document.documentElement.classList.remove('dark','light')
    document.documentElement.classList.add(cls)
  }, [dark])
  return (
    <button className="btn-outline" onClick={()=>setDark(d=>!d)} aria-label="Toggle theme">
      {dark ? <Moon size={18} /> : <Sun size={18} />}
      <span className="ml-2">{dark?'Dark':'Light'} mode</span>
    </button>
  )
}
