'use client'

import { useEffect, useState } from 'react'
import AdminDashboard from '@/components/admin/AdminDashboard'
import { useAuthStore } from '@/stores/authStore'
import { useRouter } from 'next/navigation'

export default function AdminPage() {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore()
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => { (async()=>{ await checkAuth(); setChecked(true) })() }, [])

  useEffect(() => {
    if (checked && !isLoading && !isAuthenticated) { router.replace('/login') }
  }, [isAuthenticated, isLoading, checked, router])

  if (isLoading || !checked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  return <AdminDashboard />
}
