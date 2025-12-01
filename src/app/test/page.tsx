'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function TestPage() {
  const [testResults, setTestResults] = useState<string[]>([])

  const runTests = async () => {
    const results: string[] = []
    
    // Test 1: Check if components can be imported
    try {
      const { default: ChatWidget } = await import('@/components/chat/ChatWidget')
      results.push('✅ ChatWidget component imported successfully')
    } catch (error) {
      results.push('❌ ChatWidget import failed: ' + (error as Error).message)
    }

    // Test 2: Check if admin components can be imported
    try {
      const { default: AdminDashboard } = await import('@/components/admin/AdminDashboard')
      results.push('✅ AdminDashboard component imported successfully')
    } catch (error) {
      results.push('❌ AdminDashboard import failed: ' + (error as Error).message)
    }

    // Test 3: Check if stores can be imported
    try {
      const { useChatStore } = await import('@/stores/chatStore')
      results.push('✅ Chat store imported successfully')
    } catch (error) {
      results.push('❌ Chat store import failed: ' + (error as Error).message)
    }

    // Test 4: Check if auth store can be imported
    try {
      const { useAuthStore } = await import('@/stores/authStore')
      results.push('✅ Auth store imported successfully')
    } catch (error) {
      results.push('❌ Auth store import failed: ' + (error as Error).message)
    }

    // Test 5: Check if Supabase client can be imported
    try {
      const { supabase } = await import('@/lib/supabase')
      results.push('✅ Supabase client imported successfully')
    } catch (error) {
      results.push('❌ Supabase client import failed: ' + (error as Error).message)
    }

    setTestResults(results)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Live Chat System Test Page</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Customer Widget Test */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Customer Chat Widget</h2>
            <p className="text-gray-600 mb-4">
              Test the customer-facing chat widget by clicking the chat button in the bottom-right corner.
            </p>
            <Link href="/widget" className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
              Open Widget Demo
            </Link>
          </div>

          {/* Admin Dashboard Test */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Admin Dashboard</h2>
            <p className="text-gray-600 mb-4">
              Test the admin dashboard to manage customer conversations.
            </p>
            <Link href="/admin" prefetch={false} className="inline-block px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
              Open Admin Dashboard
            </Link>
          </div>

          {/* Admin Login Test */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Admin Login</h2>
            <p className="text-gray-600 mb-4">
              Test the admin authentication system.
            </p>
            <Link href="/admin/login" className="inline-block px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors">
              Open Admin Login
            </Link>
            <div className="mt-3 text-sm text-gray-500">
              <p>Demo credentials:</p>
              <p>Email: admin@example.com</p>
              <p>Password: admin123</p>
            </div>
          </div>

          {/* System Tests */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">System Tests</h2>
            <p className="text-gray-600 mb-4">
              Run automated tests to verify system components.
            </p>
            <button
              onClick={runTests}
              className="inline-block px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
            >
              Run Tests
            </button>
          </div>
        </div>

        {/* Test Results */}
        {testResults.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Test Results</h2>
            <div className="space-y-2">
              {testResults.map((result, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <span className={result.includes('✅') ? 'text-green-600' : 'text-red-600'}>
                    {result.includes('✅') ? '✓' : '✗'}
                  </span>
                  <span className="text-sm text-gray-700">{result}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Features Overview */}
        <div className="bg-white rounded-lg shadow-md p-6 mt-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">System Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium text-gray-800 mb-2">Customer Features</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Real-time chat widget</li>
                <li>• File sharing support</li>
                <li>• Mobile responsive design</li>
                <li>• Persistent conversations</li>
                <li>• Customizable appearance</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-800 mb-2">Admin Features</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Conversation management</li>
                <li>• Real-time messaging</li>
                <li>• Customer information panel</li>
                <li>• Search and filtering</li>
                <li>• Authentication system</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
