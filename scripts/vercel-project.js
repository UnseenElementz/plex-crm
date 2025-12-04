const https = require('https')
const fs = require('fs')
const path = require('path')

function api(method, p, body){
  const token = process.env.VERCEL_TOKEN
  const teamId = process.env.VERCEL_ORG_ID
  if (!token) throw new Error('VERCEL_TOKEN is required')
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
  const payload = body ? Buffer.from(JSON.stringify(body)) : null
  return new Promise((resolve, reject)=>{
    const req = https.request({
      method,
      hostname: 'api.vercel.com',
      path: `/v9/projects${p}${qs}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': payload.length } : {})
      }
    }, res =>{
      const chunks=[]
      res.on('data', d=> chunks.push(d))
      res.on('end', ()=>{
        const txt = Buffer.concat(chunks).toString('utf8')
        let j = {}
        try{ j = txt ? JSON.parse(txt) : {} } catch{}
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(j)
        else reject(new Error(j.error?.message || j.error || txt || `HTTP ${res.statusCode}`))
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function ensureProject(){
  const cwd = process.cwd()
  const pkgPath = path.join(cwd, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const name = pkg.name || 'app'
  let project = null
  try{
    const list = await api('GET', '', null)
    project = (Array.isArray(list?.projects)? list.projects : list).find(p=> p.name === name) || null
  }catch{}
  if (!project){
    project = await api('POST', '', { name, framework: 'nextjs' })
  }
  const orgId = process.env.VERCEL_ORG_ID || project.orgId || project.teamId || ''
  const dir = path.join(cwd, '.vercel')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir)
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ projectId: project.id, orgId }, null, 2))
  process.stdout.write(`Linked Vercel project ${name} (${project.id})\n`)
}

ensureProject().catch(e=>{ process.stderr.write(String(e.message||e)); process.exit(1) })

