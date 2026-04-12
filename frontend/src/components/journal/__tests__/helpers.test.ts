import { describe, it, expect } from 'vitest'
import {
  toIsoDate,
  parseJournalDate,
  isWithinRange,
  flattenEntries,
  computeStreak,
  computeLongestStreak,
  countWords,
  rangeIncludesToday,
} from '../helpers'

describe('toIsoDate', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(toIsoDate(new Date('2026-04-09T15:00:00Z'))).toBe('2026-04-09')
  })
})

describe('parseJournalDate', () => {
  it('parses a journal title like "April 09, 2026" into ISO date', () => {
    expect(parseJournalDate('April 09, 2026')).toBe('2026-04-09')
  })
  it('returns null for unparseable input', () => {
    expect(parseJournalDate('not a date')).toBeNull()
  })
})

describe('isWithinRange', () => {
  it('returns true when range is null', () => {
    expect(isWithinRange('2026-04-09', null)).toBe(true)
  })
  it('returns true when date is inside [from, to]', () => {
    expect(isWithinRange('2026-04-09', { from: '2026-04-01', to: '2026-04-30' })).toBe(true)
  })
  it('returns false when date is outside the range', () => {
    expect(isWithinRange('2026-03-31', { from: '2026-04-01', to: '2026-04-30' })).toBe(false)
  })
  it('is inclusive on both endpoints', () => {
    expect(isWithinRange('2026-04-01', { from: '2026-04-01', to: '2026-04-30' })).toBe(true)
    expect(isWithinRange('2026-04-30', { from: '2026-04-01', to: '2026-04-30' })).toBe(true)
  })
})

describe('flattenEntries', () => {
  it('returns an array of {journalId, entryIndex, timestamp, body, editable} for each entry', () => {
    const journals = [
      {
        id: 'j1',
        date: 'April 09, 2026',
        readonly: false,
        entries: [
          { timestamp: '2026-04-09T09:00:00Z', body: 'first', editable: true },
          { timestamp: '2026-04-09T10:00:00Z', body: 'second', editable: false },
        ],
      },
    ]
    const flat = flattenEntries(journals as any)
    expect(flat).toHaveLength(2)
    expect(flat[0]).toMatchObject({ journalId: 'j1', entryIndex: 0, body: 'first', editable: true })
    expect(flat[1]).toMatchObject({ journalId: 'j1', entryIndex: 1, body: 'second', editable: false })
  })
})

describe('computeStreak', () => {
  it('returns 0 when no journals', () => {
    expect(computeStreak([], new Date('2026-04-11'))).toBe(0)
  })
  it('returns 1 when only today has entries', () => {
    const journals = [{ date: 'April 11, 2026', entries: [{ timestamp: '', body: 'x', editable: true }] }]
    expect(computeStreak(journals as any, new Date('2026-04-11'))).toBe(1)
  })
  it('returns 3 for today + yesterday + day-before', () => {
    const journals = [
      { date: 'April 11, 2026', entries: [{ timestamp: '', body: 'a', editable: true }] },
      { date: 'April 10, 2026', entries: [{ timestamp: '', body: 'b', editable: false }] },
      { date: 'April 09, 2026', entries: [{ timestamp: '', body: 'c', editable: false }] },
    ]
    expect(computeStreak(journals as any, new Date('2026-04-11'))).toBe(3)
  })
  it('breaks on a missing day', () => {
    const journals = [
      { date: 'April 11, 2026', entries: [{ timestamp: '', body: 'a', editable: true }] },
      { date: 'April 09, 2026', entries: [{ timestamp: '', body: 'c', editable: false }] },
    ]
    expect(computeStreak(journals as any, new Date('2026-04-11'))).toBe(1)
  })
  it('returns 0 if today has no entry but yesterday did (yesterday not counted as current streak)', () => {
    const journals = [
      { date: 'April 10, 2026', entries: [{ timestamp: '', body: 'b', editable: false }] },
    ]
    expect(computeStreak(journals as any, new Date('2026-04-11'))).toBe(0)
  })
})

describe('computeLongestStreak', () => {
  it('returns 0 for empty', () => {
    expect(computeLongestStreak([])).toBe(0)
  })
  it('returns the longest run', () => {
    const journals = [
      { date: 'April 11, 2026', entries: [{ timestamp: '', body: '', editable: true }] },
      { date: 'April 10, 2026', entries: [{ timestamp: '', body: '', editable: false }] },
      { date: 'April 05, 2026', entries: [{ timestamp: '', body: '', editable: false }] },
      { date: 'April 04, 2026', entries: [{ timestamp: '', body: '', editable: false }] },
      { date: 'April 03, 2026', entries: [{ timestamp: '', body: '', editable: false }] },
    ]
    expect(computeLongestStreak(journals as any)).toBe(3)
  })
})

describe('countWords', () => {
  it('counts whitespace-separated tokens', () => {
    expect(countWords('hello world foo')).toBe(3)
    expect(countWords('  one   two  ')).toBe(2)
    expect(countWords('')).toBe(0)
  })
})

describe('rangeIncludesToday', () => {
  it('returns true when range is null', () => {
    expect(rangeIncludesToday(null, new Date('2026-04-11'))).toBe(true)
  })
  it('returns true when today is in range', () => {
    expect(rangeIncludesToday({ from: '2026-04-01', to: '2026-04-30' }, new Date('2026-04-11'))).toBe(true)
  })
  it('returns false when today is outside range', () => {
    expect(rangeIncludesToday({ from: '2026-03-01', to: '2026-03-31' }, new Date('2026-04-11'))).toBe(false)
  })
})
