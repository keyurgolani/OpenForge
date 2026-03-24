const ABBREVIATIONS = /(?:Dr|Mr|Mrs|Ms|Jr|Sr|Prof|etc|vs|e\.g|i\.e|approx|dept|est|govt)\./gi
const FILLER_RE = /^(?:Hmm|Hm|Let me|OK so|OK,?\s|Actually|Well|So,?\s|Alright|Right|Um|Uh)\s*/i

export function extractSentences(buffer: string): {
  sentences: string[]
  remainder: string
} {
  // Protect abbreviations by replacing their dots temporarily
  let safe = buffer
  const abbrevs: string[] = []
  safe = safe.replace(ABBREVIATIONS, (match) => {
    abbrevs.push(match)
    return `__ABBREV${abbrevs.length - 1}__`
  })

  // Protect ellipses
  safe = safe.replace(/\.\.\./g, '__ELLIPSIS__')

  // Split on sentence boundaries: .!? followed by space and uppercase
  const parts = safe.split(/(?<=[.!?])\s+(?=[A-Z])/)
  if (parts.length <= 1) {
    return { sentences: [], remainder: buffer }
  }

  const remainder = parts.pop()!

  // Restore abbreviations and ellipses
  const restore = (s: string) => {
    let result = s.replace(/__ELLIPSIS__/g, '...')
    result = result.replace(/__ABBREV(\d+)__/g, (_, idx) => abbrevs[parseInt(idx)])
    return result
  }

  const sentences = parts.map(restore).map(postProcess)
  return { sentences, remainder: restore(remainder) }
}

function postProcess(sentence: string): string {
  // Strip filler words
  let s = sentence.replace(FILLER_RE, '')

  // Capitalize first letter
  if (s.length > 0) {
    s = s[0].toUpperCase() + s.slice(1)
  }

  // Truncate to ~120 chars
  if (s.length > 120) {
    s = s.slice(0, 117) + '...'
  }

  return s
}
