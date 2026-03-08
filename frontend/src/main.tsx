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
import './index.css'

const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const AppShell = lazy(() => import('./pages/AppShell'))
const WorkspaceHome = lazy(() => import('./pages/WorkspaceHome'))
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))

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

type AuthState = 'loading' | 'not_required' | 'required_not_authenticated' | 'authenticated'

function AuthGuard({ children }: { children: React.ReactNode }) {
    const [authState, setAuthState] = useState<AuthState>('loading')

    const checkAuthState = async () => {
        try {
            const result = await checkAuth()
            if (!result.auth_required) {
                setAuthState('not_required')
            } else if (result.authenticated) {
                setAuthState('authenticated')
            } else {
                setAuthState('required_not_authenticated')
            }
        } catch {
            // If auth check fails, assume not required (backward compat)
            setAuthState('not_required')
        }
    }

    useEffect(() => {
        void checkAuthState()
    }, [])

    if (authState === 'loading') {
        return <PageLoader />
    }

    if (authState === 'required_not_authenticated') {
        return (
            <Suspense fallback={<PageLoader />}>
                <LoginPage onSuccess={() => setAuthState('authenticated')} />
            </Suspense>
        )
    }

    return <>{children}</>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
                <ToastProvider>
                    <SpatialBackdrop />
                    <AxiosInterceptorSetup />
                    <AuthGuard>
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
                                    <Route path="knowledge/:knowledgeId" element={
                                        <ErrorBoundary>
                                            <KnowledgePage />
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
                    </AuthGuard>
                </ToastProvider>
            </ThemeProvider>
        </QueryClientProvider>
    </React.StrictMode>,
)
