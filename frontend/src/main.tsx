import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'

const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const AppShell = lazy(() => import('./pages/AppShell'))
const WorkspaceHome = lazy(() => import('./pages/WorkspaceHome'))
const NotePage = lazy(() => import('./pages/NotePage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: 2,
            refetchOnWindowFocus: false,
        },
    },
})

function PageLoader() {
    return (
        <div className="fixed inset-0 flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center animate-pulse">
                    <span className="text-accent text-lg">⊕</span>
                </div>
                <span className="text-muted-foreground text-sm">Loading OpenForge…</span>
            </div>
        </div>
    )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <Suspense fallback={<PageLoader />}>
                    <Routes>
                        <Route path="/onboarding" element={<OnboardingPage />} />
                        <Route path="/w/:workspaceId" element={<AppShell />}>
                            <Route index element={<WorkspaceHome />} />
                            <Route path="notes/:noteId" element={<NotePage />} />
                            <Route path="chat" element={<ChatPage />} />
                            <Route path="chat/:conversationId" element={<ChatPage />} />
                            <Route path="search" element={<SearchPage />} />
                            <Route path="settings" element={<SettingsPage />} />
                        </Route>
                        <Route path="/" element={<Navigate to="/onboarding" replace />} />
                    </Routes>
                </Suspense>
            </BrowserRouter>
        </QueryClientProvider>
    </React.StrictMode>,
)
