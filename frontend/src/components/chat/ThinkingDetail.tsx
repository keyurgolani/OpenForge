import { motion } from 'framer-motion'

interface ThinkingDetailProps {
  thoughts: string[]
}

export function ThinkingDetail({ thoughts }: ThinkingDetailProps) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="overflow-hidden"
    >
      <pre className="whitespace-pre-wrap break-words text-xs text-foreground/60 leading-relaxed mt-1 ml-4.5 max-h-[200px] overflow-y-auto">
        {thoughts.join('\n')}
      </pre>
    </motion.div>
  )
}
