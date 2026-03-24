export function partitionForRender(text: string): {
  stable: string
  active: string
} {
  if (!text) return { stable: '', active: '' }

  const lastSafeBreak = text.lastIndexOf('\n\n')
  if (lastSafeBreak === -1) return { stable: '', active: text }

  const stableCandidate = text.slice(0, lastSafeBreak)

  // Check if we're inside an unclosed code fence
  const fenceCount = (stableCandidate.match(/```/g) || []).length
  if (fenceCount % 2 !== 0) {
    // Inside a code block — backtrack to previous safe point
    const prev = text.lastIndexOf('\n\n', lastSafeBreak - 1)
    if (prev <= 0) return { stable: '', active: text }

    // Verify this earlier point is also safe
    const earlierCandidate = text.slice(0, prev)
    const earlierFences = (earlierCandidate.match(/```/g) || []).length
    if (earlierFences % 2 !== 0) {
      return { stable: '', active: text }
    }

    return { stable: earlierCandidate, active: text.slice(prev) }
  }

  return { stable: stableCandidate, active: text.slice(lastSafeBreak) }
}
