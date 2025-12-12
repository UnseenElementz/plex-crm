'use client'

import { useEffect, useState } from 'react'

export default function AdminSecurityPage(){
  const [ipLogs, setIpLogs] = useState<Record<string,string[]>>({})
  const [blocked, setBlocked] = useState<string[]>([])
  const [blockInput, setBlockInput] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(()=>{ (async()=>{ try{ const r = await fetch('/api/admin/security/ips'); if(r.ok){ const j = await r.json(); setIpLogs(j.ip_logs||{}); setBlocked(j.blocked_ips||[]) } } catch{} })() },[])

  async function block(ip: string){
    setMsg('')
    try{ const r = await fetch('/api/admin/security/block', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ip }) }); const j = await r.json(); if(!r.ok){ setMsg(j?.error||'Failed'); return } setBlocked(j.blocked_ips||[]) } catch(e:any){ setMsg(e?.message||'Failed') }
  }
  async function unblock(ip: string){
    setMsg('')
    try{ const r = await fetch(`/api/admin/security/block?ip=${encodeURIComponent(ip)}`, { method:'DELETE' }); const j = await r.json(); if(!r.ok){ setMsg(j?.error||'Failed'); return } setBlocked(j.blocked_ips||[]) } catch(e:any){ setMsg(e?.message||'Failed') }
  }

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold gradient-text">Security</h2>
        <a href="/admin" className="btn-outline">← Back to Chat</a>
      </div>

      {msg && (<div className="glass p-3 rounded mb-4 text-rose-300 text-sm">{msg}</div>)}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card-solid p-6 rounded-2xl border border-cyan-500/20">
          <h3 className="card-title">IP Logs</h3>
          <div className="space-y-3 max-h-[50vh] overflow-auto">
            {Object.keys(ipLogs).length===0 && (<div className="text-slate-400 text-sm">No logs yet</div>)}
            {Object.entries(ipLogs).map(([email,ips])=> (
              <div key={email} className="border border-slate-700 rounded-lg p-2">
                <div className="text-slate-300 text-xs">{email||'(unknown user)'}</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {ips.map(ip=> (
                    <div key={ip} className="inline-flex items-center gap-2 text-xs text-slate-300 px-2 py-1 rounded border border-slate-700">
                      <span>{ip}</span>
                      {blocked.includes(ip) ? (
                        <button className="btn-xs-outline" onClick={()=> unblock(ip)}>Unblock</button>
                      ) : (
                        <button className="btn-xs-outline" onClick={()=> block(ip)}>Block</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-solid p-6 rounded-2xl border border-cyan-500/20">
          <h3 className="card-title">Blocked IPs</h3>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="IP to block" value={blockInput} onChange={e=>setBlockInput(e.target.value)} />
              <button className="btn" onClick={()=> block(blockInput)} disabled={!blockInput}>Add</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {blocked.map(ip=> (
                <div key={ip} className="inline-flex items-center gap-2 text-xs text-slate-300 px-2 py-1 rounded border border-slate-700">
                  <span>{ip}</span>
                  <button className="btn-xs-outline" onClick={()=> unblock(ip)}>Remove</button>
                </div>
              ))}
              {blocked.length===0 && (<div className="text-slate-400 text-sm">No blocked IPs</div>)}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
