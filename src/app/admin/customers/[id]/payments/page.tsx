"use client"
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Payment = { id: string; amount: number; currency: string; provider: string; status: string; created_at: string }

export default function AdminCustomerPaymentsPage(){
  const params = useParams() as { id: string }
  const [rows, setRows] = useState<Payment[]>([])
  useEffect(()=>{ (async()=>{ try{ const res = await fetch(`/api/payments/${params.id}`); setRows(await res.json()) } catch{} })() }, [params.id])
  return (
    <main className="p-6 max-w-5xl mx-auto">
      <div className="glass p-4 rounded-2xl">
        <h2 className="text-2xl font-semibold mb-2">Payment History</h2>
        <table className="w-full text-sm">
          <thead><tr><th className="p-2">Date</th><th className="p-2">Amount</th><th className="p-2">Provider</th><th className="p-2">Status</th></tr></thead>
          <tbody>
            {rows.map(r=> (
              <tr key={r.id} className="border-t border-slate-800">
                <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
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
