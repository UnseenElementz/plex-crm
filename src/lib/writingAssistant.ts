export function polishWritingDraft(input: string) {
  let text = String(input || '')
  if (!text.trim()) return ''

  text = text.replace(/\r\n/g, '\n')
  text = text.replace(/[ \t]+\n/g, '\n')
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/\bi\b/g, 'I')
  text = text.replace(/\bim\b/gi, "I'm")
  text = text.replace(/\bdont\b/gi, "don't")
  text = text.replace(/\bcant\b/gi, "can't")
  text = text.replace(/\bwont\b/gi, "won't")
  text = text.replace(/\bdoesnt\b/gi, "doesn't")
  text = text.replace(/\bdidnt\b/gi, "didn't")
  text = text.replace(/\bive\b/gi, "I've")
  text = text.replace(/\bthats\b/gi, "that's")
  text = text.replace(/\btheres\b/gi, "there's")
  text = text.replace(/\bweve\b/gi, "we've")
  text = text.replace(/\bu\b/g, 'you')
  text = text.replace(/\bur\b/g, 'your')
  text = text.replace(/\bpls\b/gi, 'please')
  text = text.replace(/\bthx\b/gi, 'thanks')
  text = text.replace(/\s{2,}/g, ' ')

  const lines = text.split('\n').map((line) => {
    const trimmed = line.trim()
    if (!trimmed) return ''
    const normalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
    if (/[.!?]$/.test(normalized)) return normalized
    return normalized
  })

  return lines.join('\n').trim()
}
