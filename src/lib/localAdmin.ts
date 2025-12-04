export function isLocalAdmin(){
  if (typeof window === 'undefined') return false
  return !!localStorage.getItem('localAdmin')
}

export function loginLocalAdmin(user: string, pass: string){
  const inUser = (user || '').trim()
  const inPass = (pass || '').trim()
  const envUser = process.env.NEXT_PUBLIC_ADMIN_USER || ''
  const envPass = process.env.NEXT_PUBLIC_ADMIN_PASS || ''
  let expectUser = ''
  let expectPass = ''
  // Prefer Admin Settings values first
  try{
    if (typeof window !== 'undefined'){
      const stored = localStorage.getItem('admin_settings')
      if (stored){
        const data = JSON.parse(stored)
        expectUser = data.admin_user || expectUser
        expectPass = data.admin_pass || expectPass
      }
    }
    if (!expectUser || !expectPass){
      const cookieStr = typeof document !== 'undefined' ? (document.cookie || '') : ''
      const cookieMatch = cookieStr.split(';').map(s=>s.trim()).find(s=> s.startsWith('admin_settings='))
      if (cookieMatch) {
        const rawCookie = decodeURIComponent(cookieMatch.split('=')[1] || '')
        if (rawCookie) {
          const data = JSON.parse(rawCookie)
          expectUser = expectUser || (data.admin_user || '')
          expectPass = expectPass || (data.admin_pass || '')
        }
      }
    }
  } catch {}
  // Fallback to env only if settings are not present
  if (!expectUser) expectUser = envUser
  if (!expectPass) expectPass = envPass
  if (!expectUser && !expectPass) {
    expectUser = 'Anfrax786'
    expectPass = 'Badaman1'
  }
  if ((!expectUser || !expectPass) && typeof window !== 'undefined'){
    try{
      // Fetch from API to hydrate credentials into cookie/localStorage if needed
      // This helps on fresh sessions with no stored settings
      // eslint-disable-next-line no-undef
      const controller = new AbortController()
      const t = setTimeout(()=> controller.abort(), 3000)
      fetch('/api/admin/settings', { signal: controller.signal })
        .then(r=> r.ok ? r.json() : null)
        .then(d=>{
          if (d){
            expectUser = expectUser || (d.admin_user || '')
            expectPass = expectPass || (d.admin_pass || '')
            try{
              const toStore = {
                admin_user: d.admin_user,
                admin_pass: d.admin_pass
              }
              localStorage.setItem('admin_settings', JSON.stringify({ ...(JSON.parse(localStorage.getItem('admin_settings')||'{}')||{}), ...toStore }))
              document.cookie = `admin_settings=${encodeURIComponent(JSON.stringify({ admin_user: d.admin_user, admin_pass: d.admin_pass }))}; path=/; max-age=31536000`
            } catch {}
          }
        })
        .catch(()=>{})
        .finally(()=> clearTimeout(t))
    } catch {}
  }
  const matchUser = (expectUser || '').toLowerCase() === inUser.toLowerCase()
  const matchPass = (expectPass || '') === inPass
  if (matchUser && matchPass && expectUser && expectPass) {
    try{
      localStorage.setItem('localAdmin', '1')
      localStorage.setItem('localAdminUser', inUser)
      localStorage.setItem('localAdminPass', inPass)
    }catch{}
    return true
  }
  return false
}

export function logoutLocalAdmin(){
  if (typeof window !== 'undefined') localStorage.removeItem('localAdmin')
}
