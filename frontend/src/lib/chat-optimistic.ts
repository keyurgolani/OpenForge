interface ComparableMessage {
  role?: string | null
  content?: string | null
}

export interface OptimisticMessageEntry<TMessage extends ComparableMessage> {
  baselineCount: number
  message: TMessage
}

function buildMessageKey(message: ComparableMessage): string | null {
  const role = typeof message.role === 'string' ? message.role.trim() : ''
  const content = typeof message.content === 'string' ? message.content.replace(/\r\n/g, '\n').trim() : ''

  if (!role || !content) return null
  return `${role}\u0000${content}`
}

function getAcknowledgedOptimisticIndices<TMessage extends ComparableMessage>(
  serverMessages: TMessage[] | undefined,
  optimisticEntries: OptimisticMessageEntry<TMessage>[] | undefined,
): Set<number> {
  const acknowledged = new Set<number>()
  if (!serverMessages?.length || !optimisticEntries?.length) return acknowledged

  const availableServerKeys = new Map<string, number>()
  for (const message of serverMessages) {
    const key = buildMessageKey(message)
    if (!key) continue
    availableServerKeys.set(key, (availableServerKeys.get(key) ?? 0) + 1)
  }

  optimisticEntries.forEach((entry, index) => {
    const key = buildMessageKey(entry.message)
    if (!key) return

    const available = availableServerKeys.get(key) ?? 0
    if (available <= 0) return

    acknowledged.add(index)
    availableServerKeys.set(key, available - 1)
  })

  return acknowledged
}

export function mergeMessagesWithOptimistic<TMessage extends ComparableMessage>(
  serverMessages: TMessage[] | undefined,
  optimisticEntries: OptimisticMessageEntry<TMessage>[] | undefined,
): TMessage[] {
  const server = serverMessages ?? []
  const acknowledgedIndices = getAcknowledgedOptimisticIndices(server, optimisticEntries)
  const pendingEntries = (optimisticEntries ?? []).filter((_, index) => !acknowledgedIndices.has(index))

  if (pendingEntries.length === 0) return server

  const merged = [...server]
  let insertedCount = 0
  for (const entry of pendingEntries) {
    const insertAt = Math.min(Math.max(entry.baselineCount + insertedCount, 0), merged.length)
    merged.splice(insertAt, 0, entry.message)
    insertedCount += 1
  }

  return merged
}

export function pruneOptimisticMessages<TMessage extends ComparableMessage>(
  serverMessages: TMessage[] | undefined,
  optimisticEntries: OptimisticMessageEntry<TMessage>[] | undefined,
): OptimisticMessageEntry<TMessage>[] {
  const acknowledgedIndices = getAcknowledgedOptimisticIndices(serverMessages, optimisticEntries)
  return (optimisticEntries ?? []).filter((_, index) => !acknowledgedIndices.has(index))
}

export function mergeMessageCountWithOptimistic<TMessage extends ComparableMessage>(
  serverMessageCount: number | undefined,
  optimisticEntries: OptimisticMessageEntry<TMessage>[] | undefined,
): number {
  const serverCount = serverMessageCount ?? 0
  const pendingCount = optimisticEntries?.length ?? 0
  return serverCount + pendingCount
}
