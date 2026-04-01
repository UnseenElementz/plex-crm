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
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
  private readonly ALLOWED_TYPES = [
    'image/jpeg',
    'application/pdf'
  ]

  validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      return { valid: false, error: 'File size must be 5MB or less' }
    }

    // Check file type
    const type = String(file.type || '').toLowerCase()
    const name = String(file.name || '').toLowerCase()
    const isJpg = type === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')
    const isPdf = type === 'application/pdf' || name.endsWith('.pdf')
    if (!(isJpg || isPdf) || !this.ALLOWED_TYPES.includes(isPdf ? 'application/pdf' : 'image/jpeg')) {
      return { valid: false, error: 'Only .jpg, .jpeg, .pdf are allowed' }
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
        const j = await res.json().catch(()=>({}))
        return { message: j?.error || 'Upload failed' }
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

  uploadFileWithProgress(
    file: File,
    conversationId: string,
    onProgress: (pct: number) => void
  ): Promise<FileUploadResult | FileUploadError> {
    const validation = this.validateFile(file)
    if (!validation.valid) return Promise.resolve({ message: validation.error! })

    return new Promise((resolve) => {
      const form = new FormData()
      form.append('file', file)
      form.append('conversationId', conversationId)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/chat/upload', true)
      xhr.upload.onprogress = (evt) => {
        if (!evt.lengthComputable) return
        const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100)))
        onProgress(pct)
      }
      xhr.onerror = () => resolve({ message: 'Upload failed' })
      xhr.onload = () => {
        try {
          const ok = xhr.status >= 200 && xhr.status < 300
          const json = JSON.parse(xhr.responseText || '{}')
          if (!ok) return resolve({ message: json?.error || `Upload failed (HTTP ${xhr.status})` })
          return resolve(json)
        } catch {
          return resolve({ message: 'Upload failed' })
        }
      }
      xhr.send(form)
    })
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
