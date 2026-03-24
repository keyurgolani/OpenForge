import { describe, expect, it } from 'vitest'
import { extractSentences } from '@/lib/thought-extractor'

describe('extractSentences', () => {
  it('splits on sentence boundaries', () => {
    const result = extractSentences('First sentence. Second sentence. Third')
    expect(result.sentences).toEqual(['First sentence.', 'Second sentence.'])
    expect(result.remainder).toBe('Third')
  })

  it('returns empty sentences when no boundary found', () => {
    const result = extractSentences('No boundary here')
    expect(result.sentences).toEqual([])
    expect(result.remainder).toBe('No boundary here')
  })

  it('handles question marks and exclamation marks', () => {
    const result = extractSentences('Is this right? Yes it is! More text')
    expect(result.sentences).toEqual(['Is this right?', 'Yes it is!'])
    expect(result.remainder).toBe('More text')
  })

  it('handles abbreviations without splitting', () => {
    const result = extractSentences('Dr. Smith went to e.g. the store. Next')
    expect(result.sentences).toEqual(['Dr. Smith went to e.g. the store.'])
    expect(result.remainder).toBe('Next')
  })

  it('handles ellipses without splitting', () => {
    const result = extractSentences('Thinking... Still thinking. Done')
    expect(result.sentences).toEqual(['Thinking... Still thinking.'])
    expect(result.remainder).toBe('Done')
  })

  it('strips filler words from start of sentences', () => {
    const result = extractSentences('Hmm let me think about this. Actually this is good. Next')
    expect(result.sentences[0]).not.toMatch(/^Hmm/)
    expect(result.sentences[1]).not.toMatch(/^Actually/)
  })

  it('truncates long sentences to ~120 chars', () => {
    const longSentence = 'A'.repeat(150) + '. Next'
    const result = extractSentences(longSentence)
    expect(result.sentences[0].length).toBeLessThanOrEqual(123) // 120 + "..."
  })

  it('capitalizes first letter after stripping filler', () => {
    const result = extractSentences('Well the answer is clear. Next')
    expect(result.sentences[0]).toMatch(/^[A-Z]/)
  })
})
