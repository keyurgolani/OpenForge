import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider, useToast } from '@/components/shared/ToastProvider'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import SpatialBackdrop from '@/components/shared/SpatialBackdrop'
import api from '@/lib/api'
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
            gcTime: 5 * 60_000,
            retry: 2,
            refetchOnWindowFocus: false,
        },
    },
})

function PageLoader() {
    return (
        <div className="fixed inset-0 flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <LoadingSpinner size="lg" />
                <span className="text-muted-foreground text-sm">Loading OpenForge…</span>
            </div>
        </div>
    )
}

/** Set up Axios response interceptor inside the Toast context */
function AxiosInterceptorSetup() {
    const { error: showError } = useToast()

    React.useEffect(() => {
        const id = api.interceptors.response.use(
            res => res,
            err => {
                const msg = err?.response?.data?.detail
                    ?? err?.message
                    ?? 'An unexpected error occurred'
                // Don't toast on 404 for optional queries
                if (err?.response?.status !== 404) {
                    showError('Request failed', msg)
                }
                return Promise.reject(err)
            },
        )
        return () => api.interceptors.response.eject(id)
    }, [showError])

    return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <SpatialBackdrop />
                <AxiosInterceptorSetup />
                <BrowserRouter>
                    <Suspense fallback={<PageLoader />}>
                        <Routes>
                            <Route path="/onboarding" element={
                                <ErrorBoundary>
                                    <OnboardingPage />
                                </ErrorBoundary>
                            } />
                            <Route path="/w/:workspaceId" element={
                                <ErrorBoundary>
                                    <AppShell />
                                </ErrorBoundary>
                            }>
                                <Route index element={
                                    <ErrorBoundary>
                                        <WorkspaceHome />
                                    </ErrorBoundary>
                                } />
                                <Route path="notes/:noteId" element={
                                    <ErrorBoundary>
                                        <NotePage />
                                    </ErrorBoundary>
                                } />
                                <Route path="knowledge/:noteId" element={
                                    <ErrorBoundary>
                                        <NotePage />
                                    </ErrorBoundary>
                                } />
                                <Route path="chat" element={
                                    <ErrorBoundary>
                                        <ChatPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="chat/:conversationId" element={
                                    <ErrorBoundary>
                                        <ChatPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="search" element={
                                    <ErrorBoundary>
                                        <SearchPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="settings" element={
                                    <ErrorBoundary>
                                        <SettingsPage />
                                    </ErrorBoundary>
                                } />
                            </Route>
                            <Route path="/" element={<Navigate to="/onboarding" replace />} />
                        </Routes>
                    </Suspense>
                </BrowserRouter>
            </ToastProvider>
        </QueryClientProvider>
    </React.StrictMode>,
)
