import React, { Suspense, lazy, useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider, useToast } from '@/components/shared/ToastProvider'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import SpatialBackdrop from '@/components/shared/SpatialBackdrop'
import api, { checkAuth } from '@/lib/api'
import ROUTES from '@/lib/routes'
import { ThemeProvider } from '@/components/theme-provider'
import { ColorSchemeProvider } from '@/components/color-scheme-provider'
import LoginPage from '@/pages/LoginPage'
import './index.css'
import './styles/color-schemes.css'

const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const AppShell = lazy(() => import('./pages/AppShell'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const WorkspaceHome = lazy(() => import('./pages/WorkspaceHome'))
const AgentsPage = lazy(() => import('./pages/AgentsPage'))
const AgentDetailPage = lazy(() => import('./pages/AgentDetailPage'))
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'))
const AutomationDetailPage = lazy(() => import('./pages/AutomationDetailPage'))
const DeploymentsPage = lazy(() => import('./pages/DeploymentsPage'))
const DeploymentDetailPage = lazy(() => import('./pages/DeploymentDetailPage'))
const RunsPage = lazy(() => import('./pages/RunsPage'))
const RunDetailPage = lazy(() => import('./pages/RunDetailPage'))
const OutputsPage = lazy(() => import('./pages/OutputsPage'))
const OutputDetailPage = lazy(() => import('./pages/OutputDetailPage'))
const EditorDispatcher = lazy(() => import('./components/knowledge/editors/EditorDispatcher'))
const AgentChatPage = lazy(() => import('./pages/AgentChatPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
// Settings pages
const SettingsIndex = lazy(() => import('./pages/settings'))
const SettingsLayout = lazy(() => import('./pages/settings/SettingsLayout'))
const ModelsLayout = lazy(() => import('./pages/settings/models/ModelsLayout'))
const WorkspacesPage = lazy(() => import('./pages/settings/workspaces/WorkspacesPage'))
const ProvidersPage = lazy(() => import('./pages/settings/models/providers/ProvidersPage'))
const ReasoningPage = lazy(() => import('./pages/settings/models/reasoning/ReasoningPage'))
const VisionPage = lazy(() => import('./pages/settings/models/vision/VisionPage'))
const EmbeddingPage = lazy(() => import('./pages/settings/models/embedding/EmbeddingPage'))
const AudioPage = lazy(() => import('./pages/settings/models/audio/AudioPage'))
const CLIPPage = lazy(() => import('./pages/settings/models/clip/CLIPPage'))
const PDFPage = lazy(() => import('./pages/settings/models/pdf/PDFPage'))
const ToolsAndConnectionsPage = lazy(() => import('./pages/settings/ToolsAndConnectionsPage'))
const DataPage = lazy(() => import('./pages/settings/DataPage'))
const AdvancedPage = lazy(() => import('./pages/settings/AdvancedPage'))
const AppearancePage = lazy(() => import('./pages/settings/AppearancePage'))

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

/** AuthGuard: checks auth status on mount, enforces onboarding, and listens for 401 events */
function AuthGuard({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<'loading' | 'ok' | 'login'>('loading')
    const [onboardingComplete, setOnboardingComplete] = useState(true)
    const location = useLocation()

    useEffect(() => {
        checkAuth()
            .then(data => {
                setStatus(data.authenticated ? 'ok' : 'login')
                setOnboardingComplete(data.onboarding_complete !== false)
            })
            .catch(() => setStatus('ok')) // if check fails, don't block access
    }, [])

    useEffect(() => {
        const handler = () => setStatus('login')
        window.addEventListener('openforge:unauthorized', handler)
        return () => window.removeEventListener('openforge:unauthorized', handler)
    }, [])

    // Listen for onboarding completion event dispatched by OnboardingPage
    useEffect(() => {
        const handler = () => setOnboardingComplete(true)
        window.addEventListener('openforge:onboarding-complete', handler)
        return () => window.removeEventListener('openforge:onboarding-complete', handler)
    }, [])

    if (status === 'loading') return <PageLoader />
    if (status === 'login') return <LoginPage onSuccess={() => {
        setStatus('ok')
        checkAuth().then(d => setOnboardingComplete(d.onboarding_complete !== false)).catch(() => {})
    }} />

    // Server says onboarding is not complete — redirect to /onboarding
    if (!onboardingComplete && !location.pathname.startsWith('/onboarding')) {
        return <Navigate to="/onboarding" replace />
    }

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
              <ColorSchemeProvider>
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
                                        <DashboardPage />
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
                                        <AgentChatPage />
                                    </ErrorBoundary>
                                } />
                                <Route path="chat/:conversationId" element={
                                    <ErrorBoundary>
                                        <AgentChatPage />
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
                                <Route path="/chat" element={<ErrorBoundary><AgentChatPage /></ErrorBoundary>} />
                                <Route path="/chat/:conversationId" element={<ErrorBoundary><AgentChatPage /></ErrorBoundary>} />
                                <Route path="/agents" element={<ErrorBoundary><AgentsPage /></ErrorBoundary>} />
                                <Route path="/agents/new" element={<ErrorBoundary><AgentDetailPage /></ErrorBoundary>} />
                                <Route path="/agents/:agentId" element={<ErrorBoundary><AgentDetailPage /></ErrorBoundary>} />
                                <Route path="/automations" element={<ErrorBoundary><AutomationsPage /></ErrorBoundary>} />
                                <Route path="/automations/:automationId" element={<ErrorBoundary><AutomationDetailPage /></ErrorBoundary>} />
                                <Route path="/deployments" element={<ErrorBoundary><DeploymentsPage /></ErrorBoundary>} />
                                <Route path="/deployments/:deploymentId" element={<ErrorBoundary><DeploymentDetailPage /></ErrorBoundary>} />
                                <Route path="/deployments/:deploymentId/runs/:runId" element={<ErrorBoundary><RunDetailPage /></ErrorBoundary>} />
                                <Route path="/runs" element={<Navigate to="/deployments" replace />} />
                                <Route path="/runs/:runId" element={<ErrorBoundary><RunDetailPage /></ErrorBoundary>} />
                                <Route path="/outputs" element={<ErrorBoundary><OutputsPage /></ErrorBoundary>} />
                                <Route path="/outputs/:outputId" element={<ErrorBoundary><OutputDetailPage /></ErrorBoundary>} />
                                <Route path="/settings" element={<ErrorBoundary><SettingsLayout /></ErrorBoundary>}>
                                    <Route index element={<SettingsIndex />} />
                                    <Route path="workspaces" element={<ErrorBoundary><WorkspacesPage /></ErrorBoundary>} />
                                    <Route path="models" element={<ErrorBoundary><ModelsLayout /></ErrorBoundary>}>
                                        <Route index element={<Navigate to="/settings/models/providers" replace />} />
                                        <Route path="providers" element={<ErrorBoundary><ProvidersPage /></ErrorBoundary>} />
                                        <Route path="reasoning" element={<ErrorBoundary><ReasoningPage /></ErrorBoundary>} />
                                        <Route path="vision" element={<ErrorBoundary><VisionPage /></ErrorBoundary>} />
                                        <Route path="embedding" element={<ErrorBoundary><EmbeddingPage /></ErrorBoundary>} />
                                        <Route path="audio" element={<ErrorBoundary><AudioPage /></ErrorBoundary>} />
                                        <Route path="clip" element={<ErrorBoundary><CLIPPage /></ErrorBoundary>} />
                                        <Route path="pdf" element={<ErrorBoundary><PDFPage /></ErrorBoundary>} />
                                    </Route>
                                    <Route path="tools" element={<ErrorBoundary><ToolsAndConnectionsPage /></ErrorBoundary>} />
                                    <Route path="data" element={<ErrorBoundary><DataPage /></ErrorBoundary>} />
                                    <Route path="appearance" element={<ErrorBoundary><AppearancePage /></ErrorBoundary>} />
                                    <Route path="advanced" element={<ErrorBoundary><AdvancedPage /></ErrorBoundary>} />
                                    {/* Redirects from old routes */}
                                    <Route path="skills" element={<Navigate to="/settings/tools" replace />} />
                                    <Route path="mcp" element={<Navigate to="/settings/tools" replace />} />
                                    <Route path="pipelines" element={<Navigate to="/settings/advanced" replace />} />
                                    <Route path="audit" element={<Navigate to="/settings/advanced" replace />} />
                                    <Route path="import" element={<Navigate to="/settings/data" replace />} />
                                    <Route path="export" element={<Navigate to="/settings/data" replace />} />
                                </Route>
                            </Route>
                            <Route path="/" element={<Navigate to={ROUTES.ONBOARDING} replace />} />
                        </Routes>
                    </Suspense>
                        </AuthGuard>
                </BrowserRouter>
            </ToastProvider>
            </ColorSchemeProvider>
            </ThemeProvider>
        </QueryClientProvider>
    </React.StrictMode>,
)
