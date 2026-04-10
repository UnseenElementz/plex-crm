"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

const RECOVERY_SOURCE_PATHS = new Set(["/", "/login", "/forgot-password"])

function hasRecoveryPayload(pathname: string) {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""))
  const searchType = String(search.get("type") || "").trim().toLowerCase()
  const hashType = String(hash.get("type") || "").trim().toLowerCase()

  if (searchType === "recovery" || hashType === "recovery") return true
  if (search.has("token_hash")) return true
  if (hash.has("access_token")) return true

  // Some Supabase recovery flows arrive with only ?code=... when the redirect lands on /.
  if (search.has("code") && RECOVERY_SOURCE_PATHS.has(pathname)) return true

  return false
}

export default function AuthRecoveryRedirect() {
  const pathname = usePathname() || "/"

  useEffect(() => {
    if (typeof window === "undefined") return
    if (pathname === "/reset-password") return
    if (!RECOVERY_SOURCE_PATHS.has(pathname)) return
    if (!hasRecoveryPayload(pathname)) return

    const target = `/reset-password${window.location.search}${window.location.hash}`
    window.location.replace(target)
  }, [pathname])

  return null
}
