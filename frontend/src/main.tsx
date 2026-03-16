import React, { Suspense, lazy, useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider, useToast } from '@/components/shared/ToastProvider'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import SpatialBackdrop from '@/components/shared/SpatialBackdrop'
import api, { checkAuth } from '@/lib/api'
import ROUTES from '@/lib/routes'
import { ThemeProvider } from '@/components/theme-provider'
import LoginPage from '@/pages/LoginPage'
import './index.css'

const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const AppShell = lazy(() => import('./pages/AppShell'))
const WorkspaceOverviewPage = lazy(() => import('./pages/WorkspaceOverviewPage'))
const WorkspaceHome = lazy(() => import('./pages/WorkspaceHome'))
const ProfilesPage = lazy(() => import('./pages/ProfilesPage'))
const ProfileDetailPage = lazy(() => import('./pages/ProfileDetailPage'))
const WorkflowsPage = lazy(() => import('./pages/WorkflowsPage'))
const WorkflowDetailPage = lazy(() => import('./pages/WorkflowDetailPage'))
const MissionsPage = lazy(() => import('./pages/MissionsPage'))
const MissionDetailPage = lazy(() => import('./pages/MissionDetailPage'))
const RunsPage = lazy(() => import('./pages/RunsPage'))
const RunDetailPage = lazy(() => import('./pages/RunDetailPage'))
const ArtifactsPage = lazy(() => import('./pages/ArtifactsPage'))
const ArtifactDetailPage = lazy(() => import('./pages/ArtifactDetailPage'))
const CatalogPage = lazy(() => import('./pages/CatalogPage'))
const OperatorDashboardPage = lazy(() => import('./pages/OperatorDashboardPage'))
const EditorDispatcher = lazy(() => import('./components/knowledge/editors/EditorDispatcher'))
const WorkspaceAgentPage = lazy(() => import('./pages/WorkspaceAgentPage'))
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
const PromptsSettingsPage = lazy(() => import('./pages/settings/prompts/PromptsPage'))
const PoliciesSettingsPage = lazy(() => import('./pages/settings/policies/PoliciesPage'))
const ApprovalsSettingsPage = lazy(() => import('./pages/settings/approvals/ApprovalsPage'))
const PipelinesSettingsPage = lazy(() => import('./pages/settings/pipelines/PipelinesPage'))
const ToolsSettingsPage = lazy(() => import('./pages/settings/tools/ToolsPage'))
const BundlesSettingsPage = lazy(() => import('./pages/settings/bundles/BundlesPage'))
const SkillsSettingsPage = lazy(() => import('./pages/settings/skills/SkillsPage'))
const MCPSettingsPage = lazy(() => import('./pages/settings/mcp/MCPPage'))
const AuditSettingsPage = lazy(() => import('./pages/settings/audit/AuditPage'))
const ImportSettingsPage = lazy(() => import('./pages/settings/import/ImportPage'))
const ExportSettingsPage = lazy(() => import('./pages/settings/export/ExportPage'))

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
                                <Route path="operator" element={
                                    <ErrorBoundary>
                                        <OperatorDashboardPage />
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
                                <Route path="/profiles" element={<ErrorBoundary><ProfilesPage /></ErrorBoundary>} />
                                <Route path="/profiles/:profileId" element={<ErrorBoundary><ProfileDetailPage /></ErrorBoundary>} />
                                <Route path="/workflows" element={<ErrorBoundary><WorkflowsPage /></ErrorBoundary>} />
                                <Route path="/workflows/:workflowId" element={<ErrorBoundary><WorkflowDetailPage /></ErrorBoundary>} />
                                <Route path="/missions" element={<ErrorBoundary><MissionsPage /></ErrorBoundary>} />
                                <Route path="/missions/:missionId" element={<ErrorBoundary><MissionDetailPage /></ErrorBoundary>} />
                                <Route path="/runs" element={<ErrorBoundary><RunsPage /></ErrorBoundary>} />
                                <Route path="/runs/:runId" element={<ErrorBoundary><RunDetailPage /></ErrorBoundary>} />
                                <Route path="/artifacts" element={<ErrorBoundary><ArtifactsPage /></ErrorBoundary>} />
                                <Route path="/artifacts/:artifactId" element={<ErrorBoundary><ArtifactDetailPage /></ErrorBoundary>} />
                                <Route path="/catalog" element={<ErrorBoundary><CatalogPage /></ErrorBoundary>} />
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
                                    <Route path="prompts" element={<ErrorBoundary><PromptsSettingsPage /></ErrorBoundary>} />
                                    <Route path="policies" element={<ErrorBoundary><PoliciesSettingsPage /></ErrorBoundary>} />
                                    <Route path="tools" element={<ErrorBoundary><ToolsSettingsPage /></ErrorBoundary>} />
                                    <Route path="bundles" element={<ErrorBoundary><BundlesSettingsPage /></ErrorBoundary>} />
                                    <Route path="approvals" element={<ErrorBoundary><ApprovalsSettingsPage /></ErrorBoundary>} />
                                    <Route path="pipelines" element={<ErrorBoundary><PipelinesSettingsPage /></ErrorBoundary>} />
                                    <Route path="skills" element={<ErrorBoundary><SkillsSettingsPage /></ErrorBoundary>} />
                                    <Route path="mcp" element={<ErrorBoundary><MCPSettingsPage /></ErrorBoundary>} />
                                    <Route path="audit" element={<ErrorBoundary><AuditSettingsPage /></ErrorBoundary>} />
                                    <Route path="import" element={<ErrorBoundary><ImportSettingsPage /></ErrorBoundary>} />
                                    <Route path="export" element={<ErrorBoundary><ExportSettingsPage /></ErrorBoundary>} />
                                </Route>
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
