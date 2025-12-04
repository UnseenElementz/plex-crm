"use client"
import { useEffect, useMemo, useState, Fragment } from 'react'

export default function DatePicker({ value, onChange }: { value?: string; onChange: (iso: string) => void }){
  const initial = useMemo(() => {
    const d = value ? new Date(value) : new Date()
    const valid = !isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100
    return valid ? d : new Date()
  }, [value])
  const today = useMemo(() => new Date(), [])
  const [selected, setSelected] = useState<Date>(initial)
  const [viewYear, setViewYear] = useState<number>(today.getFullYear())
  const [viewMonth, setViewMonth] = useState<number>(today.getMonth())

  useEffect(() => {
    const d = value ? new Date(value) : selected
    const valid = !isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100
    const ref = valid ? d : today
    setSelected(ref)
    setViewYear(ref.getFullYear())
    setViewMonth(ref.getMonth())
  }, [value])

  const daysInMonth = useMemo(() => new Date(viewYear, viewMonth + 1, 0).getDate(), [viewYear, viewMonth])
  const firstDay = useMemo(() => new Date(viewYear, viewMonth, 1).getDay(), [viewYear, viewMonth])
  const weeks = useMemo(() => {
    const cells: Array<{ day?: number; date?: Date }> = []
    for (let i = 0; i < firstDay; i++) cells.push({})
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d)
      cells.push({ day: d, date })
    }
    const rows: Array<typeof cells> = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    return rows
  }, [firstDay, daysInMonth, viewYear, viewMonth])

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const formatDMY = (d: Date) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
  const years = useMemo(()=>{
    const base = today.getFullYear()
    const arr: number[] = []
    for(let y = base - 50; y <= base + 50; y++) arr.push(y)
    const sel = selected.getFullYear()
    if (!arr.includes(sel)) arr.push(sel)
    arr.sort((a,b)=>a-b)
    return arr
  }, [today, selected])

  function pick(date: Date){
    setSelected(date)
    onChange(new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString())
  }

  return (
    <div className="glass p-3 rounded-lg border border-cyan-500/20 w-full max-w-xs">
      <div className="flex items-center justify-between mb-2 gap-2">
        <button className="btn-xs-outline" onClick={() => {
          const m = viewMonth - 1
          if (m < 0) { setViewMonth(11); setViewYear(viewYear - 1) } else { setViewMonth(m) }
        }}>◀</button>
        <div className="flex items-center gap-2">
          <select className="input text-xs h-8 py-1" value={viewMonth} onChange={e=> setViewMonth(parseInt(e.target.value,10))}>
            {monthNames.map((m, idx)=> (<option key={`m-${idx}`} value={idx}>{m}</option>))}
          </select>
          <input 
            className="input text-xs h-8 py-1 w-24" 
            type="number" 
            min={2000} 
            max={2100} 
            value={viewYear} 
            onChange={e=> {
              const v = parseInt(e.target.value, 10)
              if (!isNaN(v)) {
                const y = Math.max(2000, Math.min(2100, v))
                setViewYear(y)
              }
            }}
          />
          <button className="btn-xs-outline" onClick={()=> setViewYear(y=> Math.min(2100, y+1))}>+1y</button>
          <button className="btn-xs-outline" onClick={()=> setViewYear(y=> Math.max(2000, y-1))}>-1y</button>
          <button className="btn-xs-outline" onClick={()=>{ const t = new Date(); setViewYear(t.getFullYear()); setViewMonth(t.getMonth()); setSelected(t) }}>Today</button>
        </div>
        <button className="btn-xs-outline" onClick={() => {
          const m = viewMonth + 1
          if (m > 11) { setViewMonth(0); setViewYear(viewYear + 1) } else { setViewMonth(m) }
        }}>▶</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-slate-400 mb-1">
        <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.map((row, i) => (
          <Fragment key={`row-${i}`}>
            {row.map((cell, j) => (
              <button key={`cell-${i}-${j}`} disabled={!cell.day} onClick={() => cell.date && pick(cell.date)} className={`px-2 py-1 rounded text-sm ${cell.day ? 'hover:bg-slate-700/50' : 'opacity-40'} ${cell.date && isSameDay(cell.date, selected) ? 'bg-cyan-600/30 text-cyan-200' : 'text-slate-200'}`}>{cell.day || ''}</button>
            ))}
          </Fragment>
        ))}
      </div>
      <div className="mt-2 text-[12px] text-slate-400">Selected: {formatDMY(selected)}</div>
    </div>
  )
}
