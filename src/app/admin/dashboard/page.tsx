"use client"
import Dashboard from '@/components/Dashboard'

export default function DashboardPage() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold gradient-text">Plex Dashboard</h1>
        <a href="/admin" className="btn-outline">← Back to Chat</a>
      </div>
      <Dashboard />
    </div>
  )
}
