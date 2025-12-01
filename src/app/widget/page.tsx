'use client'

import ChatWidget from '@/components/chat/ChatWidget'

export default function WidgetPage() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Live Chat Widget Demo</h1>
        <p className="text-gray-600 mb-8">
          This page demonstrates the customer chat widget. The chat button appears in the bottom-right corner.
        </p>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Sample Website Content</h2>
          <p className="text-gray-600 mb-4">
            This is a sample page to demonstrate how the chat widget integrates with a website.
            The chat widget will appear as a floating button in the corner of the page.
          </p>
          <p className="text-gray-600">
            Click the chat button to start a conversation with our support team!
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Widget Features</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>Real-time messaging</li>
            <li>Responsive design for mobile devices</li>
            <li>Customizable position and colors</li>
            <li>Message timestamps</li>
            <li>Typing indicators</li>
            <li>File sharing support (coming soon)</li>
          </ul>
        </div>
      </div>

      {/* Chat Widget */}
      <ChatWidget
        position="bottom-right"
        primaryColor="#007BFF"
        welcomeMessage="Hello! How can we help you today?"
      />
    </div>
  )
}