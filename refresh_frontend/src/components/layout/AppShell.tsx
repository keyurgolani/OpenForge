import { useEffect, useCallback, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useUIStore } from '@/stores/uiStore'
import api from '@/lib/api'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { cn } from '@/lib/cn'

/** Breakpoint for mobile overlay behavior */
const MOBILE_BREAKPOINT = 768

export default function AppShell() {
  const [isMobile, setIsMobile] = useState(false)

  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen)
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useUIStore((s) => s.setActiveWorkspaceId)
  const setWorkspaces = useUIStore((s) => s.setWorkspaces)

  // Fetch workspaces on mount
  const fetchWorkspaces = useCallback(async () => {
    try {
      const { data } = await api.get('/workspaces')
      const list = Array.isArray(data) ? data : data.items ?? []
      setWorkspaces(list)

      // Auto-select first workspace if none is active
      if (!activeWorkspaceId && list.length > 0) {
        setActiveWorkspaceId(list[0].id)
      }
      // If the active workspace was deleted, reset to first
      if (activeWorkspaceId && !list.find((w: { id: string }) => w.id === activeWorkspaceId)) {
        setActiveWorkspaceId(list.length > 0 ? list[0].id : null)
      }
    } catch {
      // API interceptor handles error display
    }
  }, [activeWorkspaceId, setActiveWorkspaceId, setWorkspaces])

  useEffect(() => {
    fetchWorkspaces()
  }, [fetchWorkspaces])

  // Responsive detection
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (mobile) {
        setSidebarOpen(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [setSidebarOpen])

  // Close mobile sidebar on navigation
  const closeMobileSidebar = useCallback(() => {
    if (isMobile && sidebarOpen) {
      setSidebarOpen(false)
    }
  }, [isMobile, sidebarOpen, setSidebarOpen])

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Desktop sidebar */}
      {!isMobile && <Sidebar />}

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {isMobile && sidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
              onClick={closeMobileSidebar}
              aria-hidden="true"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-[280px]"
            >
              <Sidebar />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden" onClick={closeMobileSidebar}>
        <TopBar />
        <main
          className={cn(
            'flex-1 overflow-y-auto',
            'scroll-smooth',
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
