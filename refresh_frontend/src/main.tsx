import React, { Suspense, lazy, useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/components/shared/ThemeProvider'
import { ToastProvider, useToast } from '@/components/shared/ToastProvider'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import api, { checkAuth } from '@/lib/api'
import ROUTES from '@/lib/routes'
import './index.css'

const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const AppShell = lazy(() => import('./components/layout/AppShell'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const WorkspaceHome = lazy(() => import('./pages/WorkspaceHome'))
const AgentsPage = lazy(() => import('./pages/AgentsPage'))
const AgentDetailPage = lazy(() => import('./pages/AgentDetailPage'))
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'))
const AutomationDetailPage = lazy(() => import('./pages/AutomationDetailPage'))
const DeploymentsPage = lazy(() => import('./pages/DeploymentsPage'))
const DeploymentDetailPage = lazy(() => import('./pages/DeploymentDetailPage'))
const RunDetailPage = lazy(() => import('./pages/RunDetailPage'))
const OutputsPage = lazy(() => import('./pages/OutputsPage'))
const OutputDetailPage = lazy(() => import('./pages/OutputDetailPage'))
const EditorDispatcher = lazy(() => import('./pages/EditorDispatcher'))
const AgentChatPage = lazy(() => import('./pages/AgentChatPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SettingsLayout = lazy(() => import('./pages/settings/SettingsLayout'))
const SettingsIndex = lazy(() => import('./pages/settings/SettingsIndex'))
const WorkspacesPage = lazy(() => import('./pages/settings/WorkspacesPage'))
const ModelsLayout = lazy(() => import('./pages/settings/models/ModelsLayout'))
const ProvidersPage = lazy(() => import('./pages/settings/models/ProvidersPage'))
const ReasoningPage = lazy(() => import('./pages/settings/models/ReasoningPage'))
const VisionPage = lazy(() => import('./pages/settings/models/VisionPage'))
const EmbeddingPage = lazy(() => import('./pages/settings/models/EmbeddingPage'))
const AudioPage = lazy(() => import('./pages/settings/models/AudioPage'))
const CLIPPage = lazy(() => import('./pages/settings/models/CLIPPage'))
const PDFPage = lazy(() => import('./pages/settings/models/PDFPage'))
const ToolsAndConnectionsPage = lazy(() => import('./pages/settings/ToolsAndConnectionsPage'))
const DataPage = lazy(() => import('./pages/settings/DataPage'))
const AdvancedPage = lazy(() => import('./pages/settings/AdvancedPage'))

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
    <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--bg))' }}>
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" />
        <span className="font-label text-sm" style={{ color: 'rgb(var(--fg-muted))' }}>Loading OpenForge...</span>
      </div>
    </div>
  )
}

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
      .catch(() => setStatus('ok'))
  }, [])

  useEffect(() => {
    const handler = () => setStatus('login')
    window.addEventListener('openforge:unauthorized', handler)
    return () => window.removeEventListener('openforge:unauthorized', handler)
  }, [])

  useEffect(() => {
    const handler = () => setOnboardingComplete(true)
    window.addEventListener('openforge:onboarding-complete', handler)
    return () => window.removeEventListener('openforge:onboarding-complete', handler)
  }, [])

  if (status === 'loading') return <PageLoader />
  if (status === 'login') return (
    <Suspense fallback={<PageLoader />}>
      <LoginPage onSuccess={() => {
        setStatus('ok')
        checkAuth().then(d => setOnboardingComplete(d.onboarding_complete !== false)).catch(() => {})
      }} />
    </Suspense>
  )

  if (!onboardingComplete && !location.pathname.startsWith('/v2/onboarding')) {
    return <Navigate to="/v2/onboarding" replace />
  }

  return <>{children}</>
}

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
        const msg = err?.response?.data?.detail ?? err?.message ?? 'An unexpected error occurred'
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

function App() {
  return (
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <AxiosInterceptorSetup />
            <BrowserRouter>
              <AuthGuard>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path={ROUTES.ONBOARDING} element={<ErrorBoundary><OnboardingPage /></ErrorBoundary>} />

                    {/* Workspace-scoped routes (only knowledge) */}
                    <Route path={ROUTES.WORKSPACE} element={<ErrorBoundary><AppShell /></ErrorBoundary>}>
                      <Route index element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
                      <Route path="knowledge" element={<ErrorBoundary><WorkspaceHome /></ErrorBoundary>} />
                      <Route path="knowledge/:knowledgeId" element={<ErrorBoundary><EditorDispatcher /></ErrorBoundary>} />
                      <Route path="chat" element={<ErrorBoundary><AgentChatPage /></ErrorBoundary>} />
                      <Route path="chat/:conversationId" element={<ErrorBoundary><AgentChatPage /></ErrorBoundary>} />
                      <Route path="search" element={<ErrorBoundary><SearchPage /></ErrorBoundary>} />
                    </Route>

                    {/* Global routes (workspace-agnostic) */}
                    <Route element={<ErrorBoundary><AppShell /></ErrorBoundary>}>
                      <Route path="/v2/chat" element={<ErrorBoundary><AgentChatPage /></ErrorBoundary>} />
                      <Route path="/v2/chat/:conversationId" element={<ErrorBoundary><AgentChatPage /></ErrorBoundary>} />
                      <Route path="/v2/agents" element={<ErrorBoundary><AgentsPage /></ErrorBoundary>} />
                      <Route path="/v2/agents/new" element={<ErrorBoundary><AgentDetailPage /></ErrorBoundary>} />
                      <Route path="/v2/agents/:agentId" element={<ErrorBoundary><AgentDetailPage /></ErrorBoundary>} />
                      <Route path="/v2/automations" element={<ErrorBoundary><AutomationsPage /></ErrorBoundary>} />
                      <Route path="/v2/automations/:automationId" element={<ErrorBoundary><AutomationDetailPage /></ErrorBoundary>} />
                      <Route path="/v2/deployments" element={<ErrorBoundary><DeploymentsPage /></ErrorBoundary>} />
                      <Route path="/v2/deployments/:deploymentId" element={<ErrorBoundary><DeploymentDetailPage /></ErrorBoundary>} />
                      <Route path="/v2/deployments/:deploymentId/runs/:runId" element={<ErrorBoundary><RunDetailPage /></ErrorBoundary>} />
                      <Route path="/v2/runs" element={<Navigate to="/v2/deployments" replace />} />
                      <Route path="/v2/runs/:runId" element={<ErrorBoundary><RunDetailPage /></ErrorBoundary>} />
                      <Route path="/v2/outputs" element={<ErrorBoundary><OutputsPage /></ErrorBoundary>} />
                      <Route path="/v2/outputs/:outputId" element={<ErrorBoundary><OutputDetailPage /></ErrorBoundary>} />
                      <Route path="/v2/settings" element={<ErrorBoundary><SettingsLayout /></ErrorBoundary>}>
                        <Route index element={<SettingsIndex />} />
                        <Route path="workspaces" element={<ErrorBoundary><WorkspacesPage /></ErrorBoundary>} />
                        <Route path="models" element={<ErrorBoundary><ModelsLayout /></ErrorBoundary>}>
                          <Route index element={<Navigate to="/v2/settings/models/providers" replace />} />
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
                        <Route path="advanced" element={<ErrorBoundary><AdvancedPage /></ErrorBoundary>} />
                      </Route>
                    </Route>

                    <Route path="/v2" element={<Navigate to={ROUTES.ONBOARDING} replace />} />
                    <Route path="*" element={<Navigate to="/v2" replace />} />
                  </Routes>
                </Suspense>
              </AuthGuard>
            </BrowserRouter>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </React.StrictMode>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
