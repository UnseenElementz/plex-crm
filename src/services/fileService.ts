import { supabase } from '@/lib/supabase'

export interface FileUploadResult {
  url: string
  fileName: string
  fileSize: number
  fileType: string
}

export interface FileUploadError {
  message: string
  code?: string
}

class FileService {
  private readonly BUCKET_NAME = 'chat-attachments'
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
  private readonly ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]

  validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      return { valid: false, error: 'File size must be less than 10MB' }
    }

    // Check file type
    if (!this.ALLOWED_TYPES.includes(file.type)) {
      return { valid: false, error: 'File type not allowed' }
    }

    return { valid: true }
  }

  generateFileName(originalName: string, conversationId: string): string {
    const timestamp = Date.now()
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_')
    return `${conversationId}/${timestamp}_${sanitizedName}`
  }

  async uploadFile(file: File, conversationId: string): Promise<FileUploadResult | FileUploadError> {
    try {
      // Validate file
      const validation = this.validateFile(file)
      if (!validation.valid) {
        return { message: validation.error! }
      }

      // Prefer server-side upload API (service role, reliable permissions)
      try {
        const form = new FormData()
        form.append('file', file)
        form.append('conversationId', conversationId)
        const res = await fetch('/api/chat/upload', { method: 'POST', body: form })
        if (res.ok) {
          const j = await res.json()
          return j
        }
      } catch {}
      
      // Fallback: attempt direct client-side upload (requires storage insert policy)
      try {
        const fileName = this.generateFileName(file.name, conversationId)
        const { data, error } = await supabase.storage
          .from(this.BUCKET_NAME)
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          })
        if (error || !data) {
          return { message: error?.message || 'Upload failed' }
        }
        const { data: { publicUrl } } = supabase.storage.from(this.BUCKET_NAME).getPublicUrl(data.path)
        return { url: publicUrl, fileName: file.name, fileSize: file.size, fileType: file.type }
      } catch (e:any) {
        return { message: e?.message || 'Upload failed' }
      }
    } catch (error) {
      return { message: (error as Error).message }
    }
  }

  async deleteFile(fileUrl: string): Promise<boolean> {
    try {
      // Extract file path from URL
      const url = new URL(fileUrl)
      const path = url.pathname.split('/').slice(2).join('/')
      
      const { error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .remove([path])

      return !error
    } catch (error) {
      console.error('Error deleting file:', error)
      return false
    }
  }

  getFileIcon(fileType: string): string {
    if (fileType.startsWith('image/')) {
      return '🖼️'
    } else if (fileType === 'application/pdf') {
      return '📄'
    } else if (fileType.includes('word')) {
      return '📝'
    } else if (fileType === 'text/plain') {
      return '📄'
    } else {
      return '📎'
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

export const fileService = new FileService()
