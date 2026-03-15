# Frontend Architecture Rules

This document defines the structural conventions for the OpenForge frontend to ensure consistency and maintainability.

## Directory Structure

### `/components/layout/`

Shell primitives for page composition. These components define the structural skeleton of the application.

**Contents:**
- `AppShellLayout.tsx` - Root layout composing all shell primitives
- `PrimaryNav.tsx` - Left sidebar navigation (expanded/collapsed)
- `PrimaryNavExpanded.tsx` - Expanded sidebar with full labels
- `PrimaryNavCollapsed.tsx` - Collapsed sidebar with icons only
- `WorkspaceSwitcher.tsx` - Workspace selector dropdown
- `TopBar.tsx` - Top navigation bar with global actions
- `PageContainer.tsx` - Main content wrapper
- `PageShell.tsx` - Standard page composition (header + content)
- `PageContent.tsx` - Scrollable content wrapper
- `Breadcrumbs.tsx` - Breadcrumb navigation
- `ConnectionStatus.tsx` - WebSocket connection indicator
- `NavSubList.tsx` - Sub-navigation for Chat/Runs
- `PinnedKnowledge.tsx` - Pinned items section
- `index.ts` - Barrel exports

**Rules:**
- Layout components should NOT contain business logic
- Layout components should accept children and compose them
- Layout components should be presentational only
- Use composition over props for flexibility

### `/components/shared/`

Reusable UI components used across multiple pages.

**Contents:**
- `EmptyState.tsx` - Empty state display
- `LoadingState.tsx` - Loading spinner/skeleton
- `ErrorState.tsx` - Error message display
- `StatusBadge.tsx` - Status indicator badge
- `Skeleton.tsx` - Loading placeholder
- `Badge.tsx` - Generic badge with variants
- `Card.tsx` - Standard card component
- `Section.tsx` - Section wrapper with title
- `PageHeader.tsx` - Page title and actions
- `ConfirmModal.tsx` - Confirmation dialog
- `CommandPalette.tsx` - Global command palette
- `Siderail.tsx` - Collapsible side panel
- `index.ts` - Barrel exports

**Rules:**
- Shared components must be truly reusable
- Avoid page-specific logic in shared components
- Use composition and children props
- Export from index.ts for clean imports

### `/pages/`

Route-level page components.

**Structure:**
```
/pages/
  /settings/
    SettingsLayout.tsx      # Shell with subsection nav
    SettingsNav.tsx         # Left nav for settings sections
    index.tsx               # Redirect handler
    /workspaces/
      WorkspacesPage.tsx
    /models/
      /providers/
        ProvidersPage.tsx
      /reasoning/
        ReasoningPage.tsx
      # ... other model types
    /prompts/
      PromptsPage.tsx
    # ... other sections
  AppShell.tsx              # Main app shell (routes to pages)
  LoginPage.tsx
  OnboardingPage.tsx
  # ... other top-level pages
```

**Rules:**
- Each page is a route-level component
- Pages compose layout + shared components + domain components
- Pages contain page-specific business logic
- Subdirectories for grouped pages (e.g., settings sections)

### `/hooks/`

Custom React hooks.

**Structure:**
```
/hooks/
  /streaming/
    types.ts                # Shared stream types
    reducer.ts              # Stream state management
  useStreamingChat.ts       # Chat-specific streaming
  useWebSocket.ts           # Common WebSocket utilities
  useMutationFeedback.ts    # Standard mutation feedback
  # ... other hooks
```

**Rules:**
- Hooks should be focused and composable
- Domain hooks go in subdirectories
- Shared hooks go at root level
- Export types alongside hooks

## Page Composition Pattern

All pages should follow a consistent composition pattern:

```tsx
// Standard page pattern
<PageShell>
  <PageHeader
    title="Page Title"
    description="Page description"
    actions={<ActionButtons />}
  />
  <PageContent>
    {isLoading && <LoadingState />}
    {error && <ErrorState error={error} />}
    {data && <Content data={data} />}
  </PageContent>
</PageShell>
```

### PageShell

Combines PageHeader + PageContent with consistent layout.

```tsx
interface PageShellProps {
  children: React.ReactNode;
  className?: string;
}
```

### PageHeader

Standard page header with title, description, and actions.

```tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
}
```

### PageContent

Scrollable content wrapper with consistent padding.

```tsx
interface PageContentProps {
  children: React.ReactNode;
  className?: string;
}
```

## Component Naming Conventions

| Type | Suffix | Example |
|------|--------|---------|
| Page | `Page` | `WorkspacesPage.tsx` |
| Layout | `Layout` | `SettingsLayout.tsx` |
| Tab | `Tab` | `ProvidersTab.tsx` |
| Modal | `Modal` | `ConfirmModal.tsx` |
| Card | `Card` | `ToolCallCard.tsx` |
| List | `List` | `KnowledgeList.tsx` |
| Item | `Item` | `ConversationItem.tsx` |
| Button | `Button` | `MutationButton.tsx` |
| Hook | `use` | `useMutationFeedback.ts` |

## Import Patterns

### Preferred: Barrel imports

```tsx
// Good
import { EmptyState, LoadingState, ErrorState } from '@/components/shared';
import { PageShell, PageHeader, PageContent } from '@/components/layout';
```

### Avoid: Deep imports

```tsx
// Avoid unless necessary for code splitting
import EmptyState from '@/components/shared/EmptyState';
```

## State Management

- **Local state**: useState for component-local state
- **Server state**: React Query for API data
- **Global state**: Zustand for cross-cutting concerns (UI preferences, auth)
- **URL state**: React Router for navigation state

## Styling

- Use Tailwind CSS utility classes
- Follow existing glass-card patterns for panels
- Use CSS variables for theming
- Animate with Framer Motion sparingly

## Testing

- Component tests in `__tests__/` adjacent to components
- E2E tests in `e2e/`
- Test user interactions, not implementation details
- Use React Testing Library

## Code Splitting

- Lazy load settings subsection pages
- Lazy load heavy domain components (editors, visualizations)
- Keep shell components eagerly loaded
