'use client'

import { useState, useRef } from 'react'
import { Paperclip, X, Upload, FileText, Image } from 'lucide-react'
import { fileService, FileUploadResult, FileUploadError } from '@/services/fileService'

interface FileUploadProps {
  conversationId: string
  onFileUploaded: (result: FileUploadResult) => void
  onError: (error: string) => void
}

export default function FileUpload({ conversationId, onFileUploaded, onError }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      handleUpload(file)
    }
  }

  const handleUpload = async (file: File) => {
    setIsUploading(true)
    try {
      const result = await fileService.uploadFile(file, conversationId)
      
      if ('url' in result) {
        onFileUploaded(result)
        setSelectedFile(null)
      } else {
        onError(result.message)
      }
    } catch (error) {
      onError('Failed to upload file')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <Image className="w-4 h-4" />
    } else if (fileType === 'application/pdf') {
      return <FileText className="w-4 h-4" />
    } else {
      return <Paperclip className="w-4 h-4" />
    }
  }

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*,.pdf,.txt,.doc,.docx"
        disabled={isUploading}
      />
      
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Attach file"
      >
        {isUploading ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
        ) : (
          <Paperclip size={20} />
        )}
      </button>

      {selectedFile && (
        <div className="absolute bottom-full right-0 mb-2 p-3 bg-white border border-gray-200 rounded-lg shadow-lg min-w-64">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              {getFileIcon(selectedFile.type)}
              <span className="text-sm font-medium text-gray-900 truncate">
                {selectedFile.name}
              </span>
            </div>
            <button
              onClick={() => setSelectedFile(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">
              {fileService.formatFileSize(selectedFile.size)}
            </span>
            <button
              onClick={() => handleUpload(selectedFile)}
              disabled={isUploading}
              className="flex items-center space-x-1 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Upload size={12} />
              <span>Upload</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}