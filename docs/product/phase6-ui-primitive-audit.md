# Phase 6 UI Primitive Audit

## Shared Primitives in Active Use

- `PageHeader`
- `LoadingState`
- `ErrorState`
- `EmptyState`
- `Card`
- `Section`
- `MutationButton`
- `StatusBadge`
- `SkipLink`
- `LiveRegion`

## Layout Primitives

- `PrimaryNavExpanded`
- `PrimaryNavCollapsed`
- `TopBar`
- `PageShell`
- `PageContent`
- `Breadcrumbs`

## Audit Summary

- The shell now has reusable primitives for navigation, page headers, state handling, and mutation feedback.
- The new profile detail surface uses the shared page-state and card primitives instead of inventing another bespoke layout.
- The largest remaining UX debt is breadth, not primitive absence: workflows, missions, runs, and artifacts still need deeper builder/detail experiences.
