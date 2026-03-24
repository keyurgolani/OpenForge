import { describe, expect, it } from 'vitest'

import {
  mergeMessageCountWithOptimistic,
  mergeMessagesWithOptimistic,
  pruneOptimisticMessages,
  type OptimisticMessageEntry,
} from '@/lib/chat-optimistic'

type TestMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

describe('chat optimistic helpers', () => {
  it('keeps an optimistic user message visible when only the assistant reply has reached the server', () => {
    const optimistic: OptimisticMessageEntry<TestMessage>[] = [
      {
        baselineCount: 0,
        message: {
          id: 'optimistic-1',
          role: 'user',
          content: 'Research AI coding agents.',
          created_at: '2026-03-22T11:35:00.000Z',
        },
      },
    ]
    const serverMessages: TestMessage[] = [
      {
        id: 'server-1',
        role: 'assistant',
        content: 'What version of React are you on?',
        created_at: '2026-03-22T11:35:10.000Z',
      },
    ]

    expect(mergeMessagesWithOptimistic(serverMessages, optimistic).map((message) => message.content)).toEqual([
      'Research AI coding agents.',
      'What version of React are you on?',
    ])
    expect(pruneOptimisticMessages(serverMessages, optimistic)).toHaveLength(1)
  })

  it('inserts pending optimistic user messages after the existing history they were sent from', () => {
    const serverMessages: TestMessage[] = [
      {
        id: 'server-1',
        role: 'assistant',
        content: 'Existing reply.',
        created_at: '2026-03-22T11:30:00.000Z',
      },
      {
        id: 'server-2',
        role: 'assistant',
        content: 'Assistant follow-up.',
        created_at: '2026-03-22T11:36:05.000Z',
      },
    ]
    const optimistic: OptimisticMessageEntry<TestMessage>[] = [
      {
        baselineCount: 1,
        message: {
          id: 'optimistic-2',
          role: 'user',
          content: 'Follow-up question',
          created_at: '2026-03-22T11:36:00.000Z',
        },
      },
    ]

    expect(mergeMessagesWithOptimistic(serverMessages, optimistic).map((message) => message.content)).toEqual([
      'Existing reply.',
      'Follow-up question',
      'Assistant follow-up.',
    ])
    expect(pruneOptimisticMessages(serverMessages, optimistic)).toHaveLength(1)
  })

  it('prunes optimistic messages once the matching user message exists in server history', () => {
    const optimistic: OptimisticMessageEntry<TestMessage>[] = [
      {
        baselineCount: 0,
        message: {
          id: 'optimistic-3',
          role: 'user',
          content: 'Research AI coding agents.',
          created_at: '2026-03-22T11:35:00.000Z',
        },
      },
    ]
    const settledServerMessages: TestMessage[] = [
      {
        id: 'server-1',
        role: 'user',
        content: 'Research AI coding agents.',
        created_at: '2026-03-22T11:35:00.000Z',
      },
      {
        id: 'server-2',
        role: 'assistant',
        content: 'What version of React are you on?',
        created_at: '2026-03-22T11:35:10.000Z',
      },
    ]

    expect(mergeMessagesWithOptimistic(settledServerMessages, optimistic).map((message) => message.content)).toEqual([
      'Research AI coding agents.',
      'What version of React are you on?',
    ])
    expect(pruneOptimisticMessages(settledServerMessages, optimistic)).toHaveLength(0)
  })

  it('adds optimistic entries to thread counts until they are pruned', () => {
    const optimistic: OptimisticMessageEntry<TestMessage>[] = [
      {
        baselineCount: 0,
        message: {
          id: 'optimistic-4',
          role: 'user',
          content: 'Draft prompt',
          created_at: '2026-03-22T11:37:00.000Z',
        },
      },
    ]

    expect(mergeMessageCountWithOptimistic(0, optimistic)).toBe(1)
    expect(mergeMessageCountWithOptimistic(1, optimistic)).toBe(2)
  })

  it('counts multiple pending optimistic messages while they remain unresolved', () => {
    const optimistic: OptimisticMessageEntry<TestMessage>[] = [
      {
        baselineCount: 1,
        message: {
          id: 'optimistic-5',
          role: 'user',
          content: 'First pending follow-up',
          created_at: '2026-03-22T11:38:00.000Z',
        },
      },
      {
        baselineCount: 1,
        message: {
          id: 'optimistic-6',
          role: 'user',
          content: 'Second pending follow-up',
          created_at: '2026-03-22T11:38:20.000Z',
        },
      },
    ]

    expect(mergeMessageCountWithOptimistic(1, optimistic)).toBe(3)
    expect(mergeMessageCountWithOptimistic(2, optimistic)).toBe(4)
  })
})
