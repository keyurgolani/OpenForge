import { useState, useCallback, useRef, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/cn'

interface CopyButtonProps {
  text: string
  className?: string
  label?: string
}

export default function CopyButton({ text, className, label = 'Copy to clipboard' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    }
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center justify-center rounded-md p-1.5',
        'text-fg-subtle hover:text-fg hover:bg-bg-sunken',
        'transition-colors focus-ring',
        className,
      )}
      aria-label={label}
      title={label}
    >
      {copied ? (
        <Check className="h-4 w-4 text-success" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  )
}
