'use client'

import { useState, useRef } from 'react'
import { Paperclip, X, Upload, FileText, Image } from 'lucide-react'
import { fileService, FileUploadResult, FileUploadError } from '@/services/fileService'
import toast from 'react-hot-toast'

interface FileUploadProps {
  conversationId?: string
  ensureConversationId?: () => Promise<string | null>
  onFileUploaded: (result: FileUploadResult) => void
  onError: (error: string) => void
}

export default function FileUpload({ conversationId, ensureConversationId, onFileUploaded, onError }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadFailed, setUploadFailed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const validation = fileService.validateFile(file)
      if (!validation.valid) {
        toast.error(validation.error || 'File not allowed')
        onError(validation.error || 'File not allowed')
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }
      setSelectedFile(file)
      setUploadProgress(0)
      setUploadFailed(false)
    }
  }

  const handleUpload = async (file: File) => {
    setIsUploading(true)
    setUploadProgress(0)
    try {
      let cid = conversationId
      if (!cid && ensureConversationId) {
        try { cid = await ensureConversationId() || undefined } catch {}
      }
      if (!cid) { onError('Chat not initialized'); return }
      const result = await fileService.uploadFileWithProgress(file, cid, setUploadProgress)
      
      if ('url' in result) {
        onFileUploaded(result)
        setSelectedFile(null)
        toast.success('Uploaded')
      } else {
        onError(result.message)
        setUploadFailed(true)
        toast.error(result.message)
      }
    } catch (error) {
      onError('Failed to upload file')
      setUploadFailed(true)
      toast.error('Upload failed')
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
        accept=".jpg,.jpeg,.pdf"
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

          {selectedFile.type === 'image/jpeg' && (
            <div className="mb-2">
              <img src={URL.createObjectURL(selectedFile)} alt="" className="w-28 h-20 object-cover rounded border border-gray-200" />
            </div>
          )}
          
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
              <span>{uploadFailed ? 'Retry' : 'Upload'}</span>
            </button>
          </div>

          {isUploading && (
            <div className="mt-2">
              <div className="h-2 w-full bg-gray-200 rounded">
                <div className="h-2 bg-blue-600 rounded" style={{ width: `${uploadProgress}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-gray-500">{uploadProgress}%</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
