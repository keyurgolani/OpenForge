# Phase 6 Page Shell Standards

## Required Structure

Every major product page should follow this composition:

1. `PageHeader`
2. page-level action row
3. loading, error, or empty state
4. primary content sections built from shared cards/sections

## Current Shared Building Blocks

### Layout

- `frontend/src/pages/AppShell.tsx`
- `frontend/src/components/layout/PrimaryNavExpanded.tsx`
- `frontend/src/components/layout/PrimaryNavCollapsed.tsx`
- `frontend/src/components/layout/TopBar.tsx`
- `frontend/src/components/layout/PageShell.tsx`
- `frontend/src/components/layout/PageContent.tsx`
- `frontend/src/components/layout/Breadcrumbs.tsx`

### Shared Page-State Components

- `frontend/src/components/shared/PageHeader.tsx`
- `frontend/src/components/shared/LoadingState.tsx`
- `frontend/src/components/shared/ErrorState.tsx`
- `frontend/src/components/shared/EmptyState.tsx`
- `frontend/src/components/shared/MutationButton.tsx`
- `frontend/src/components/shared/Card.tsx`
- `frontend/src/components/shared/Section.tsx`
- `frontend/src/components/shared/StatusBadge.tsx`

## Header Rules

- Title should use canonical product nouns from `frontend/src/lib/productVocabulary.ts`.
- Description should explain the product concept, not the implementation detail.
- Primary actions belong in the header when they are page-defining.
- Back-navigation belongs in the header for detail pages such as profile builder/detail routes.

## State Rules

- Loading states use `LoadingState`.
- Recoverable page-level failures use `ErrorState`.
- Empty collections use `EmptyState`.
- Mutating actions use `MutationButton` for pending and error feedback.

## Detail Page Rules

Detail pages should separate:

- editable identity/config fields
- validation/health information
- resolved or computed runtime information

The new profile detail page follows this standard by splitting profile identity, validation, and resolved composition into separate sections.
