'use client'

import { useState } from 'react'

export default function CustomerContactPage(){
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  async function send(){
    setLoading(true); setStatus('');
    try{
      const res = await fetch('/api/contact/send', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email, subject, message }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to send')
      setStatus('Message sent! We will reply shortly.')
      setSubject(''); setMessage('')
    }catch(e:any){ setStatus(`Failed: ${e?.message || 'Error'}`) }
    finally{ setLoading(false) }
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="glass p-6 rounded-2xl">
        <h2 className="text-2xl font-semibold mb-4">Contact Support</h2>
        <p className="text-slate-400 mb-4">Send us a message and we will get back to you.</p>
        <div className="space-y-3">
          <input className="input" placeholder="Your email" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="input" placeholder="Subject" value={subject} onChange={e=>setSubject(e.target.value)} />
          <textarea className="input" placeholder="Message" rows={6} value={message} onChange={e=>setMessage(e.target.value)} />
          <button className="btn" onClick={send} disabled={loading || !email || !subject || !message}>{loading ? 'Sending...' : 'Send Message'}</button>
          {status && (<div className={`text-sm ${status.startsWith('Failed') ? 'text-rose-400' : 'text-emerald-400'}`}>{status}</div>)}
          {status.startsWith('Failed') && (
            <div className="text-slate-400 text-sm">
              You can email us directly at <a className="text-brand" href="mailto:streamzrus1@gmail.com">streamzrus1@gmail.com</a>.
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
