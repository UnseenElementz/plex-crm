import { getSupabase } from './supabaseClient'

export async function getUser(){
  const s = getSupabase()
  if (!s) return null
  const { data } = await s.auth.getUser()
  return data.user
}

export async function getProfile(){
  const user = await getUser()
  if (!user) return null
  const s = getSupabase()
  if (!s) return null
  const { data } = await s.from('profiles').select('*').eq('user_id', user.id).limit(1)
  return data?.[0] || null
}

export async function signOut(){
  const s = getSupabase()
  if (!s) return
  await s.auth.signOut()
}
