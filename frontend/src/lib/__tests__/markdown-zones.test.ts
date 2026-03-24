import { describe, expect, it } from 'vitest'
import { partitionForRender } from '@/lib/markdown-zones'

describe('partitionForRender', () => {
  it('returns empty stable when no double newline', () => {
    const result = partitionForRender('single paragraph with no breaks')
    expect(result.stable).toBe('')
    expect(result.active).toBe('single paragraph with no breaks')
  })

  it('splits on last double newline', () => {
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird partial'
    const result = partitionForRender(text)
    expect(result.stable).toBe('First paragraph.\n\nSecond paragraph.')
    expect(result.active).toBe('\n\nThird partial')
  })

  it('does not split inside an unclosed code fence', () => {
    const text = 'Before.\n\n```python\ndef foo():\n\n    pass'
    const result = partitionForRender(text)
    expect(result.stable).toBe('Before.')
  })

  it('splits after a closed code fence', () => {
    const text = 'Before.\n\n```python\ndef foo():\n    pass\n```\n\nAfter text'
    const result = partitionForRender(text)
    expect(result.stable).toContain('```python')
    expect(result.stable).toContain('```')
    expect(result.active).toBe('\n\nAfter text')
  })

  it('handles empty string', () => {
    const result = partitionForRender('')
    expect(result.stable).toBe('')
    expect(result.active).toBe('')
  })

  it('handles text that is all inside a code fence', () => {
    const text = '```\ncode here\n\nmore code'
    const result = partitionForRender(text)
    expect(result.stable).toBe('')
    expect(result.active).toBe(text)
  })
})
