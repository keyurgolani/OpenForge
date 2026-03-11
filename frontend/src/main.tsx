import React, { Suspense, lazy, useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider, useToast } from '@/components/shared/ToastProvider'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import SpatialBackdrop from '@/components/shared/SpatialBackdrop'
import api, { checkAuth } from '@/lib/api'
import { ThemeProvider } from '@/components/theme-provider'
import LoginPage from '@/pages/LoginPage'
import './index.css'

const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const AppShell = lazy(() => import('./pages/AppShell'))
const WorkspaceHome = lazy(() => import('./pages/WorkspaceHome'))
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'))
const AgentPage = lazy(() => import('./pages/AgentPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ExecutionListPage = lazy(() => import('./pages/ExecutionListPage'))
const ExecutionMonitorPage = lazy(() => import('./pages/ExecutionMonitorPage'))

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

/** AuthGuard: checks auth status on mount and listens for 401 events */
function AuthGuard({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<'loading' | 'ok' | 'login'>('loading')

    useEffect(() => {
        checkAuth()
            .then(data => setStatus(data.authenticated ? 'ok' : 'login'))
            .catch(() => setStatus('ok')) // if check fails, don't block access
    }, [])

    useEffect(() => {
        const handler = () => setStatus('login')
        window.addEventListener('openforge:unauthorized', handler)
        return () => window.removeEventListener('openforge:unauthorized', handler)
    }, [])

    if (status === 'loading') return <PageLoader />
    if (status === 'login') return <LoginPage onSuccess={() => setStatus('ok')} />
    return <>{children}</>
}

/** Set up Axios response interceptor inside the Toast context */
function AxiosInterceptorSetup() {
    const { error: showError } = useToast()

    React.useEffect(() => {
        const id = api.interceptors.response.use(
            res => res,
            err => {
                if (err?.response?.status === 401) {
                    window.dispatchEvent(new Event('openforge:unauthorized'))
                    return Promise.reject(err)
                }
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
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
                <ToastProvider>
                    <SpatialBackdrop />
                    <AxiosInterceptorSetup />
                    <BrowserRouter>
                        <AuthGuard>
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
                                <Route path="knowledge/:knowledgeId" element={
                                    <ErrorBoundary>
                                        <KnowledgePage />
                                    </ErrorBoundary>
                                } />
                                <Route path="agent" element={
                                    <ErrorBoundary>
                                        <AgentPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="agent/:conversationId" element={
                                    <ErrorBoundary>
                                        <AgentPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="search" element={
                                    <ErrorBoundary>
                                        <SearchPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="executions" element={
                                    <ErrorBoundary>
                                        <ExecutionListPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="executions/:executionId" element={
                                    <ErrorBoundary>
                                        <ExecutionMonitorPage />
                                    </ErrorBoundary>
                                } />
                            </Route>
                            <Route path="/settings" element={
                                <ErrorBoundary>
                                    <SettingsPage />
                                </ErrorBoundary>
                            } />
                            <Route path="/" element={<Navigate to="/onboarding" replace />} />
                        </Routes>
                    </Suspense>
                        </AuthGuard>
                </BrowserRouter>
            </ToastProvider>
            </ThemeProvider>
        </QueryClientProvider>
    </React.StrictMode>,
)
