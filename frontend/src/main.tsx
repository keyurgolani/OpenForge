import React, { Suspense, lazy, useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes, Navigate, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider, useToast } from '@/components/shared/ToastProvider'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import SpatialBackdrop from '@/components/shared/SpatialBackdrop'
import api, { checkAuth } from '@/lib/api'
import ROUTES, { chatRoute } from '@/lib/routes'
import { ThemeProvider } from '@/components/theme-provider'
import LoginPage from '@/pages/LoginPage'
import './index.css'

const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const AppShell = lazy(() => import('./pages/AppShell'))
const WorkspaceOverviewPage = lazy(() => import('./pages/WorkspaceOverviewPage'))
const WorkspaceHome = lazy(() => import('./pages/WorkspaceHome'))
const ProfilesPage = lazy(() => import('./pages/ProfilesPage'))
const WorkflowsPage = lazy(() => import('./pages/WorkflowsPage'))
const MissionsPage = lazy(() => import('./pages/MissionsPage'))
const RunsPage = lazy(() => import('./pages/RunsPage'))
const ArtifactsPage = lazy(() => import('./pages/ArtifactsPage'))
const EditorDispatcher = lazy(() => import('./components/knowledge/editors/EditorDispatcher'))
const WorkspaceAgentPage = lazy(() => import('./pages/WorkspaceAgentPage'))
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

function LegacyChatRedirect() {
    const { workspaceId = '', conversationId } = useParams<{ workspaceId: string; conversationId?: string }>()
    return <Navigate to={chatRoute(workspaceId, conversationId)} replace />
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
                            <Route path={ROUTES.ONBOARDING} element={
                                <ErrorBoundary>
                                    <OnboardingPage />
                                </ErrorBoundary>
                            } />
                            <Route path={ROUTES.WORKSPACE} element={
                                <ErrorBoundary>
                                    <AppShell />
                                </ErrorBoundary>
                            }>
                                <Route index element={
                                    <ErrorBoundary>
                                        <WorkspaceOverviewPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="knowledge" element={
                                    <ErrorBoundary>
                                        <WorkspaceHome />
                                    </ErrorBoundary>
                                } />
                                <Route path="knowledge/:knowledgeId" element={
                                    <ErrorBoundary>
                                        <EditorDispatcher />
                                    </ErrorBoundary>
                                } />
                                <Route path="chat" element={
                                    <ErrorBoundary>
                                        <WorkspaceAgentPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="chat/:conversationId" element={
                                    <ErrorBoundary>
                                        <WorkspaceAgentPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="agent" element={<LegacyChatRedirect />} />
                                <Route path="agent/:conversationId" element={<LegacyChatRedirect />} />
                                <Route path="profiles" element={
                                    <ErrorBoundary>
                                        <ProfilesPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="workflows" element={
                                    <ErrorBoundary>
                                        <WorkflowsPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="missions" element={
                                    <ErrorBoundary>
                                        <MissionsPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="runs" element={
                                    <ErrorBoundary>
                                        <RunsPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="artifacts" element={
                                    <ErrorBoundary>
                                        <ArtifactsPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="search" element={
                                    <ErrorBoundary>
                                        <SearchPage />
                                    </ErrorBoundary>
                                } />
                            </Route>
                            <Route element={
                                <ErrorBoundary>
                                    <AppShell />
                                </ErrorBoundary>
                            }>
                                <Route path={ROUTES.LEGACY_EXECUTIONS} element={
                                    <ErrorBoundary>
                                        <ExecutionListPage />
                                    </ErrorBoundary>
                                } />
                                <Route path={ROUTES.LEGACY_EXECUTION_DETAIL} element={
                                    <ErrorBoundary>
                                        <ExecutionMonitorPage />
                                    </ErrorBoundary>
                                } />
                                <Route path={ROUTES.SETTINGS} element={
                                    <ErrorBoundary>
                                        <SettingsPage />
                                    </ErrorBoundary>
                                } />
                            </Route>
                            <Route path="/" element={<Navigate to={ROUTES.ONBOARDING} replace />} />
                        </Routes>
                    </Suspense>
                        </AuthGuard>
                </BrowserRouter>
            </ToastProvider>
            </ThemeProvider>
        </QueryClientProvider>
    </React.StrictMode>,
)
