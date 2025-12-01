'use client'

import { useState } from 'react'
import { ExternalLink, Download, FileText, Image } from 'lucide-react'
import { fileService } from '@/services/fileService'

interface FileAttachmentProps {
  url: string
  fileName: string
  fileSize: number | string
  fileType: string
}

export default function FileAttachment({ url, fileName, fileSize, fileType }: FileAttachmentProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleDownload = async () => {
    setIsLoading(true)
    try {
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Download failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleView = () => {
    window.open(url, '_blank')
  }

  const isImage = fileType.startsWith('image/')

  function parseSizeString(s: string): number {
    try{
      const m = s.trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?/i)
      if (!m) return 0
      const val = parseFloat(m[1] || '0')
      const unit = (m[2] || 'B').toUpperCase()
      const mult = unit === 'TB' ? 1024 ** 4 : unit === 'GB' ? 1024 ** 3 : unit === 'MB' ? 1024 ** 2 : unit === 'KB' ? 1024 : 1
      return isNaN(val) ? 0 : Math.round(val * mult)
    } catch { return 0 }
  }
  const displaySize = typeof fileSize === 'number' ? fileSize : parseSizeString(fileSize)

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-w-sm">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <span className="text-lg">
              {fileService.getFileIcon(fileType)}
            </span>
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate" title={fileName}>
            {fileName}
          </p>
          <p className="text-xs text-gray-500">
            {fileService.formatFileSize(displaySize)}
          </p>
          
          <div className="flex space-x-2 mt-2">
            {isImage ? (
              <button
                onClick={handleView}
                disabled={isLoading}
                className="inline-flex items-center px-2 py-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                <Image size={12} className="mr-1" />
                View
              </button>
            ) : (
              <button
                onClick={handleView}
                disabled={isLoading}
                className="inline-flex items-center px-2 py-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                <ExternalLink size={12} className="mr-1" />
                Open
              </button>
            )}
            
            <button
              onClick={handleDownload}
              disabled={isLoading}
              className="inline-flex items-center px-2 py-1 text-xs text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              <Download size={12} className="mr-1" />
              Download
            </button>
          </div>
        </div>
      </div>
      
      {isImage && (
        <div className="mt-3">
          <img
            src={url}
            alt={fileName}
            className="w-full h-32 object-cover rounded border"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
            }}
          />
        </div>
      )}
    </div>
  )
}
