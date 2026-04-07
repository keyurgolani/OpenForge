type EventMap = {
  render: [text: string]
  complete: []
}
type EventName = keyof EventMap

export class StreamRenderer {
  private buffer = ''
  private rendered = ''
  private rafId: number | null = null
  private draining = false
  private charsPerFrame = 2
  private listeners = new Map<EventName, Set<(...args: unknown[]) => void>>()

  on<E extends EventName>(event: E, cb: (...args: EventMap[E]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(cb)
  }

  off<E extends EventName>(event: E, cb: (...args: EventMap[E]) => void) {
    this.listeners.get(event)?.delete(cb)
  }

  private emit<E extends EventName>(event: E, ...args: EventMap[E]) {
    this.listeners.get(event)?.forEach((cb) => cb(...args))
  }

  ingest(token: string) {
    this.buffer += token
    if (this.rafId === null) this.startLoop()
  }

  complete() {
    this.draining = true
    if (this.rafId === null) {
      this.emit('complete')
    }
  }

  /** Set content instantly without animation (for snapshot restoration). */
  setImmediate(content: string) {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.draining = false
    this.buffer = content
    this.rendered = content
    this.emit('render', this.rendered)
    this.emit('complete')
  }

  reset() {
    this.buffer = ''
    this.rendered = ''
    this.draining = false
    this.charsPerFrame = 2
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.buffer = ''
    this.rendered = ''
    this.draining = false
    this.charsPerFrame = 2
    this.listeners.clear()
  }

  private startLoop() {
    this.rafId = requestAnimationFrame(this.tick)
  }

  private tick = () => {
    const pending = this.buffer.length - this.rendered.length
    if (pending <= 0) {
      this.rafId = null
      if (this.draining) {
        this.emit('complete')
        this.draining = false
      }
      return
    }

    if (this.draining) {
      this.rendered = this.buffer
      this.emit('render', this.rendered)
      this.rafId = null
      this.emit('complete')
      this.draining = false
      return
    }

    const pressure = pending / 50
    const chars = Math.max(1, Math.ceil(this.charsPerFrame * (1 + pressure)))

    let target = this.rendered.length + chars
    target = this.snapToWordBoundary(target)

    this.rendered = this.buffer.slice(0, target)
    this.emit('render', this.rendered)

    this.rafId = requestAnimationFrame(this.tick)
  }

  private snapToWordBoundary(index: number): number {
    if (index >= this.buffer.length) return this.buffer.length
    const ch = this.buffer[index]
    if (ch === ' ' || ch === '\n') return index

    const nextSpace = this.buffer.indexOf(' ', index)
    const nextNewline = this.buffer.indexOf('\n', index)
    const boundary = Math.min(
      nextSpace === -1 ? Infinity : nextSpace,
      nextNewline === -1 ? Infinity : nextNewline
    )

    if (boundary !== Infinity && boundary - index < 12) {
      return boundary
    }
    return index
  }
}
