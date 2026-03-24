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
      <div className="pl-8 py-2 space-y-1 max-h-[200px] overflow-y-auto">
        {thoughts.map((thought, i) => (
          <p key={i} className="text-xs text-muted-foreground/70 leading-relaxed">
            {thought}
          </p>
        ))}
      </div>
    </motion.div>
  )
}
