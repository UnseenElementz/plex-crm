import { describe, expect, it } from 'vitest'
import { fileService } from './fileService'

describe('fileService.validateFile', () => {
  it('accepts jpeg and pdf under 5MB', () => {
    const jpg = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' })
    const pdf = new File([new Uint8Array([1, 2, 3])], 'a.pdf', { type: 'application/pdf' })
    expect(fileService.validateFile(jpg).valid).toBe(true)
    expect(fileService.validateFile(pdf).valid).toBe(true)
  })

  it('rejects non-jpg/pdf', () => {
    const png = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })
    expect(fileService.validateFile(png).valid).toBe(false)
  })

  it('rejects >5MB', () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.jpg', { type: 'image/jpeg' })
    expect(fileService.validateFile(big).valid).toBe(false)
  })
})

