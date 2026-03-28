import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Anvil,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Server,
  FolderOpen,
  PartyPopper,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  getOnboarding,
  advanceOnboarding,
  createProvider,
  testConnection,
  createWorkspace,
} from '@/lib/api'

/* -------------------------------------------------------------------------- */
/* Step definitions                                                           */
/* -------------------------------------------------------------------------- */

const STEPS = ['welcome', 'provider', 'workspace', 'done'] as const
type Step = (typeof STEPS)[number]

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState<Step>('welcome')
  const stepIndex = STEPS.indexOf(currentStep)

  // Provider form state
  const [providerName, setProviderName] = useState('')
  const [providerType, setProviderType] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [apiBase, setApiBase] = useState('')
  const [providerError, setProviderError] = useState('')
  const [createdProviderId, setCreatedProviderId] = useState<string | null>(null)
  const [connectionTested, setConnectionTested] = useState(false)

  // Workspace form state
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceDescription, setWorkspaceDescription] = useState('')
  const [workspaceError, setWorkspaceError] = useState('')

  const onboardingQuery = useQuery({
    queryKey: ['onboarding'],
    queryFn: getOnboarding,
  })

  const advanceMutation = useMutation({
    mutationFn: (step: string) => advanceOnboarding(step),
  })

  const createProviderMutation = useMutation({
    mutationFn: () =>
      createProvider({
        provider_name: providerName || providerType,
        provider_type: providerType,
        api_key: apiKey,
        ...(apiBase ? { api_base: apiBase } : {}),
      }),
    onSuccess: (data) => {
      setCreatedProviderId(data.id)
      setProviderError('')
    },
    onError: (err: any) => {
      setProviderError(err?.response?.data?.detail ?? err?.message ?? 'Failed to create provider')
    },
  })

  const testConnectionMutation = useMutation({
    mutationFn: (providerId: string) => testConnection(providerId),
    onSuccess: () => {
      setConnectionTested(true)
      setProviderError('')
    },
    onError: (err: any) => {
      setProviderError(
        err?.response?.data?.detail ?? err?.message ?? 'Connection test failed',
      )
    },
  })

  const createWorkspaceMutation = useMutation({
    mutationFn: () =>
      createWorkspace({
        name: workspaceName,
        description: workspaceDescription,
      }),
    onSuccess: () => {
      setWorkspaceError('')
      handleNext()
    },
    onError: (err: any) => {
      setWorkspaceError(
        err?.response?.data?.detail ?? err?.message ?? 'Failed to create workspace',
      )
    },
  })

  const handleNext = () => {
    const nextIndex = stepIndex + 1
    if (nextIndex < STEPS.length) {
      advanceMutation.mutate(STEPS[nextIndex])
      setCurrentStep(STEPS[nextIndex])
    }
  }

  const handleBack = () => {
    const prevIndex = stepIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex])
    }
  }

  const handleProviderNext = async () => {
    if (!createdProviderId) {
      createProviderMutation.mutate()
    } else if (!connectionTested) {
      testConnectionMutation.mutate(createdProviderId)
    } else {
      handleNext()
    }
  }

  const handleWorkspaceNext = () => {
    if (!workspaceName.trim()) {
      setWorkspaceError('Workspace name is required')
      return
    }
    createWorkspaceMutation.mutate()
  }

  const handleFinish = () => {
    advanceMutation.mutate('complete')
    window.dispatchEvent(new Event('openforge:onboarding-complete'))
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50/60 to-rose-50 dark:from-amber-950/30 dark:via-bg dark:to-rose-950/20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.12),transparent_50%)]" />

      <div className="relative z-10 w-full max-w-lg px-4">
        {/* Progress dots */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((step, i) => (
            <div
              key={step}
              className={cn(
                'h-2.5 w-2.5 rounded-full transition-all duration-300',
                i <= stepIndex
                  ? 'bg-primary scale-110'
                  : 'bg-border',
                i === stepIndex && 'ring-4 ring-primary/20',
              )}
            />
          ))}
        </div>

        {/* Card */}
        <div
          className={cn(
            'rounded-2xl border border-border/50 bg-bg-elevated/80 backdrop-blur-xl',
            'p-8 shadow-2xl shadow-black/5',
          )}
        >
          {/* Step 1: Welcome */}
          {currentStep === 'welcome' && (
            <div className="space-y-8 text-center">
              <div className="flex flex-col items-center gap-4">
                <div
                  className={cn(
                    'flex h-20 w-20 items-center justify-center rounded-2xl',
                    'bg-gradient-to-br from-primary to-primary/80',
                    'shadow-lg shadow-primary/25',
                  )}
                >
                  <Anvil className="h-10 w-10 text-white" strokeWidth={1.75} />
                </div>
                <div>
                  <h1 className="font-display text-3xl font-bold tracking-tight text-fg">
                    Welcome to OpenForge
                  </h1>
                  <p className="mt-3 font-body text-sm leading-relaxed text-fg-muted max-w-sm mx-auto">
                    Your autonomous agent platform is ready to be set up. Let us walk you through the initial
                    configuration in just a few steps.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 text-left">
                {[
                  { icon: Server, label: 'Connect an LLM provider' },
                  { icon: FolderOpen, label: 'Create your first workspace' },
                  { icon: Sparkles, label: 'Start building agents' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 rounded-lg bg-bg-sunken/50 p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-body text-sm text-fg">{item.label}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={handleNext}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-lg',
                  'bg-primary px-4 py-2.5',
                  'font-label text-sm font-semibold text-fg-on-primary',
                  'hover:bg-primary-hover transition-all',
                )}
              >
                Get Started
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Step 2: Configure LLM Provider */}
          {currentStep === 'provider' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Server className="h-6 w-6 text-primary" />
                </div>
                <h2 className="font-display text-xl font-bold text-fg">
                  Configure LLM Provider
                </h2>
                <p className="mt-1 font-body text-sm text-fg-muted">
                  Connect your preferred language model provider
                </p>
              </div>

              {providerError && (
                <div className="flex items-center gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
                  <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
                  <p className="font-body text-sm text-danger">{providerError}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="font-label text-sm font-medium text-fg">Provider Type</label>
                  <select
                    value={providerType}
                    onChange={(e) => setProviderType(e.target.value)}
                    disabled={!!createdProviderId}
                    className="w-full rounded-lg border border-border bg-bg py-2.5 px-3 font-body text-sm text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google AI</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="ollama">Ollama (Local)</option>
                    <option value="custom">Custom OpenAI-compatible</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="font-label text-sm font-medium text-fg">Display Name</label>
                  <input
                    type="text"
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    placeholder={`My ${providerType} provider`}
                    disabled={!!createdProviderId}
                    className="w-full rounded-lg border border-border bg-bg py-2.5 px-3 font-body text-sm text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="font-label text-sm font-medium text-fg">API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    disabled={!!createdProviderId}
                    className="w-full rounded-lg border border-border bg-bg py-2.5 px-3 font-mono text-sm text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                </div>

                {(providerType === 'custom' || providerType === 'ollama') && (
                  <div className="space-y-2">
                    <label className="font-label text-sm font-medium text-fg">API Base URL</label>
                    <input
                      type="text"
                      value={apiBase}
                      onChange={(e) => setApiBase(e.target.value)}
                      placeholder="http://localhost:11434/v1"
                      disabled={!!createdProviderId}
                      className="w-full rounded-lg border border-border bg-bg py-2.5 px-3 font-mono text-sm text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    />
                  </div>
                )}

                {createdProviderId && connectionTested && (
                  <div className="flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3">
                    <Check className="h-4 w-4 text-success" />
                    <span className="text-sm font-medium text-success">Connection successful</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 font-label text-sm font-medium text-fg-muted hover:text-fg transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={handleProviderNext}
                  disabled={
                    createProviderMutation.isPending ||
                    testConnectionMutation.isPending ||
                    (!createdProviderId && !apiKey)
                  }
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-5 py-2.5',
                    'bg-primary font-label text-sm font-semibold text-fg-on-primary',
                    'hover:bg-primary-hover disabled:opacity-50 transition-all',
                  )}
                >
                  {(createProviderMutation.isPending || testConnectionMutation.isPending) && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {!createdProviderId
                    ? 'Create Provider'
                    : !connectionTested
                      ? 'Test Connection'
                      : 'Continue'}
                  {!createProviderMutation.isPending &&
                    !testConnectionMutation.isPending && (
                      <ChevronRight className="h-4 w-4" />
                    )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Create Workspace */}
          {currentStep === 'workspace' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <FolderOpen className="h-6 w-6 text-primary" />
                </div>
                <h2 className="font-display text-xl font-bold text-fg">
                  Create Your Workspace
                </h2>
                <p className="mt-1 font-body text-sm text-fg-muted">
                  Workspaces organize your knowledge, agents, and conversations
                </p>
              </div>

              {workspaceError && (
                <div className="flex items-center gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
                  <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
                  <p className="font-body text-sm text-danger">{workspaceError}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="font-label text-sm font-medium text-fg">Workspace Name</label>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="My Workspace"
                    autoFocus
                    className="w-full rounded-lg border border-border bg-bg py-2.5 px-3 font-body text-sm text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-2">
                  <label className="font-label text-sm font-medium text-fg">
                    Description
                    <span className="ml-1 text-fg-subtle">(optional)</span>
                  </label>
                  <textarea
                    value={workspaceDescription}
                    onChange={(e) => setWorkspaceDescription(e.target.value)}
                    placeholder="What will this workspace be used for?"
                    rows={3}
                    className="w-full rounded-lg border border-border bg-bg py-2.5 px-3 font-body text-sm text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 font-label text-sm font-medium text-fg-muted hover:text-fg transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={handleWorkspaceNext}
                  disabled={createWorkspaceMutation.isPending || !workspaceName.trim()}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-5 py-2.5',
                    'bg-primary font-label text-sm font-semibold text-fg-on-primary',
                    'hover:bg-primary-hover disabled:opacity-50 transition-all',
                  )}
                >
                  {createWorkspaceMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Create Workspace
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {currentStep === 'done' && (
            <div className="space-y-8 text-center">
              <div className="flex flex-col items-center gap-4">
                <div
                  className={cn(
                    'flex h-20 w-20 items-center justify-center rounded-2xl',
                    'bg-gradient-to-br from-success/80 to-success',
                    'shadow-lg shadow-success/25',
                  )}
                >
                  <PartyPopper className="h-10 w-10 text-white" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-bold text-fg">
                    You're All Set!
                  </h2>
                  <p className="mt-2 font-body text-sm leading-relaxed text-fg-muted max-w-sm mx-auto">
                    Your OpenForge instance is configured and ready to go. Start creating agents,
                    uploading knowledge, and building automations.
                  </p>
                </div>
              </div>

              <button
                onClick={handleFinish}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-lg',
                  'bg-primary px-4 py-2.5',
                  'font-label text-sm font-semibold text-fg-on-primary',
                  'hover:bg-primary-hover transition-all',
                )}
              >
                <Sparkles className="h-4 w-4" />
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
