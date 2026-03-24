import { ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface ScrollToBottomFABProps {
  visible: boolean
  newStepsCount?: number
  onClick: () => void
}

export function ScrollToBottomFAB({ visible, newStepsCount, onClick }: ScrollToBottomFABProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          onClick={onClick}
          className="absolute bottom-20 right-6 z-10 w-10 h-10 rounded-full btn-primary flex items-center justify-center shadow-lg"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="w-5 h-5" />
          {newStepsCount && newStepsCount > 0 ? (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-[10px] font-bold text-white flex items-center justify-center">
              {newStepsCount}
            </span>
          ) : null}
        </motion.button>
      )}
    </AnimatePresence>
  )
}
