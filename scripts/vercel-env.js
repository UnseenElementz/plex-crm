const https = require('https')

function readProject(){
  try{
    const fs = require('fs')
    const j = JSON.parse(fs.readFileSync('.vercel/project.json','utf8'))
    return j
  }catch{ return {} }
}

function req(method, path, body){
  const token = process.env.VERCEL_TOKEN
  const pj = readProject()
  const teamId = process.env.VERCEL_ORG_ID || pj.orgId
  const projectId = process.env.VERCEL_PROJECT_ID || pj.projectId
  if (!token || !projectId) throw new Error('Missing VERCEL_TOKEN or VERCEL_PROJECT_ID')
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
  const payload = body ? Buffer.from(JSON.stringify(body)) : null
  return new Promise((resolve, reject)=>{
    const req = https.request({
      method,
      hostname: 'api.vercel.com',
      path: `/v9/projects/${projectId}${path}${qs}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': payload ? payload.length : 0
      }
    }, res =>{
      const chunks=[]
      res.on('data', d=> chunks.push(d))
      res.on('end', ()=>{
        const txt = Buffer.concat(chunks).toString('utf8')
        const j = txt ? JSON.parse(txt) : {}
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(j)
        else reject(new Error(j.error?.message || j.error || txt || `HTTP ${res.statusCode}`))
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function readDotEnv(){
  const fs = require('fs')
  const p = '.env.local'
  const out = {}
  if (fs.existsSync(p)){
    const txt = fs.readFileSync(p, 'utf8')
    for (const line of txt.split(/\r?\n/)){
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) out[m[1]] = m[2]
    }
  }
  return out
}

async function listEnv(){
  return await req('GET', '/env', null)
}

async function main(){
  const dot = readDotEnv()
  const envs = [
    { key: 'NEXT_PUBLIC_SUPABASE_URL', value: process.env.NEXT_PUBLIC_SUPABASE_URL || dot.NEXT_PUBLIC_SUPABASE_URL },
    { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || dot.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    { key: 'SUPABASE_SERVICE_ROLE_KEY', value: process.env.SUPABASE_SERVICE_ROLE_KEY || dot.SUPABASE_SERVICE_ROLE_KEY },
    { key: 'NEXT_PUBLIC_CANONICAL_HOST', value: process.env.NEXT_PUBLIC_CANONICAL_HOST || dot.NEXT_PUBLIC_CANONICAL_HOST }
  ]
  const existing = await listEnv().catch(()=>({ envs: [] }))
  const rows = Array.isArray(existing?.envs) ? existing.envs : (Array.isArray(existing) ? existing : [])
  for (const e of envs){
    if (!e.value) continue
    for (const target of ['production','preview']){
      const found = rows.find(r=> r.key === e.key && Array.isArray(r.target) ? r.target.includes(target) : r.target === target)
      if (found) { process.stdout.write(`Skip ${e.key} (${target})\n`); continue }
      await req('POST', '/env', { key: e.key, value: e.value, type: 'encrypted', target: [target] })
      process.stdout.write(`Set ${e.key} (${target})\n`)
    }
  }
}

main().catch(e=>{ process.stderr.write(String(e.message||e)); process.exit(1) })
