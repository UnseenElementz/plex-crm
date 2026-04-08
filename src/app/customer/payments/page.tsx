"use client"
import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabaseClient'

type Payment = { id: string; amount: number; currency: string; provider: string; status: string; created_at: string }

export default function CustomerPaymentsPage(){
  const [rows, setRows] = useState<Payment[]>([])
  useEffect(()=>{ (async()=>{ try{
    const s = getSupabase()
    const token = (await s?.auth.getSession())?.data.session?.access_token
    const res = await fetch('/api/payments/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    const data = await res.json().catch(()=>[])
    setRows(Array.isArray(data) ? data : [])
  } catch{} })() }, [])
  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="glass p-4 rounded-2xl">
        <h2 className="text-2xl font-semibold mb-2">Payment History</h2>
        <table className="w-full text-sm">
          <thead><tr><th className="p-2">Date</th><th className="p-2">Amount</th><th className="p-2">Provider</th><th className="p-2">Status</th></tr></thead>
          <tbody>
            {rows.map(r=> (
              <tr key={r.id} className="border-t border-slate-800">
                <td className="p-2">{require('date-fns').format(new Date(r.created_at), 'dd/MM/yyyy')}</td>
                <td className="p-2">£{Number(r.amount).toFixed(2)}</td>
                <td className="p-2">{r.provider}</td>
                <td className="p-2">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
