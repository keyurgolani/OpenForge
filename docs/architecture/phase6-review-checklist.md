# Phase 6 Review Checklist

This document provides a comprehensive checklist for verifying the Phase 6 implementation.

## Navigation

### Primary Navigation

- [ ] All primary nav items are clickable and navigate to correct routes
- [ ] Active state is correctly highlighted for current route
- [ ] Sidebar collapses/expands correctly
- [ ] Sidebar state persists across page reloads (localStorage)
- [ ] Keyboard navigation works (Tab, Enter)
- [ ] Tooltips show on hover for collapsed sidebar icons

### Workspace Switcher

- [ ] Workspace selector shows current workspace
- [ ] Dropdown opens and closes correctly
- [ ] Search input filters workspaces
- [ ] Switching workspace preserves sub-path (e.g., /chat → /chat)
- [ ] "Add Workspace" button navigates to settings
- [ ] Connection status indicator shows correctly

### Sub-navigation

- [ ] Chat sub-nav expands to show recent conversations
- [ ] Runs sub-nav expands to show active runs
- [ ] Sub-nav items are clickable and navigate correctly
- [ ] Context menu works on conversation items (rename, delete)

## Settings

### Settings Layout

- [ ] Settings page loads with left navigation
- [ ] All settings sections are accessible via URL
- [ ] Active section is highlighted in navigation
- [ ] Models section shows sub-navigation
- [ ] Breadcrumbs work correctly

### Settings Routes

| Route | Page | Verified |
|-------|------|----------|
| `/settings` | Redirects to `/settings/workspaces` | [ ] |
| `/settings/workspaces` | WorkspacesSettingsPage | [ ] |
| `/settings/models` | Redirects to `/settings/models/providers` | [ ] |
| `/settings/models/providers` | ProvidersPage | [ ] |
| `/settings/models/reasoning` | ReasoningPage | [ ] |
| `/settings/models/vision` | VisionPage | [ ] |
| `/settings/models/embedding` | EmbeddingPage | [ ] |
| `/settings/models/audio` | AudioPage | [ ] |
| `/settings/models/clip` | CLIPPage | [ ] |
| `/settings/models/pdf` | PDFPage | [ ] |
| `/settings/prompts` | PromptsSettingsPage | [ ] |
| `/settings/policies` | PoliciesSettingsPage | [ ] |
| `/settings/approvals` | ApprovalsSettingsPage | [ ] |
| `/settings/pipelines` | PipelinesSettingsPage | [ ] |
| `/settings/skills` | SkillsSettingsPage | [ ] |
| `/settings/mcp` | MCPSettingsPage | [ ] |
| `/settings/audit` | AuditSettingsPage | [ ] |
| `/settings/import` | ImportSettingsPage | [ ] |
| `/settings/export` | ExportSettingsPage | [ ] |

### Legacy Route Compatibility

- [ ] `/settings?tab=workspaces` redirects to `/settings/workspaces`
- [ ] `/settings?tab=llm` redirects to `/settings/models/providers`
- [ ] `/settings?tab=tools` redirects to `/settings/policies`
- [ ] `/settings?tab=hitl` redirects to `/settings/approvals`
- [ ] `/settings?newWorkspace=1` triggers workspace creation

## Page Composition

### PageShell

- [ ] PageShell renders children correctly
- [ ] nowrap prop disables flex-col layout

### PageContent

- [ ] PageContent provides scrollable container
- [ ] noScroll prop disables overflow-y-auto
- [ ] Consistent padding applied

### PageHeader

- [ ] Title renders correctly
- [ ] Description renders correctly
- [ ] Actions area renders correctly
- [ ] Responsive layout works

## Shared Components

### EmptyState

- [ ] Shows title, description, and CTA
- [ ] onAction callback works

### LoadingState

- [ ] Shows loading indicator

### ErrorState

- [ ] Shows error message
- [ ] Retry action works

### Skeleton

- [ ] Skeleton renders with pulse animation
- [ ] SkeletonText renders multiple lines
- [ ] SkeletonList renders list items

### Badge

- [ ] All variants render correctly (default, accent, success, warning, danger, outline, muted)
- [ ] All sizes render correctly (sm, md, lg)
- [ ] Icon renders correctly

### Card

- [ ] Card renders with default styling
- [ ] Glass variant renders correctly
- [ ] Hover effects work
- [ ] Interactive state works

### MutationButton

- [ ] Shows loading spinner when pending
- [ ] Disabled when pending
- [ ] Success/error states style correctly

## Accessibility

### Keyboard Navigation

- [ ] Tab navigation works through all interactive elements
- [ ] Enter/Space activates buttons and links
- [ ] Escape closes modals and dropdowns
- [ ] Arrow keys navigate within menus

### Screen Reader Support

- [ ] SkipLink is visible on focus
- [ ] LiveRegion announces changes
- [ ] ARIA labels on icon-only buttons
- [ ] aria-current on active nav items

### axe-core

- [ ] No critical violations
- [ ] No serious violations
- [ ] Moderate violations reviewed and accepted

## Performance

### Bundle Size

- [ ] No significant increase in bundle size
- [ ] Settings pages are lazy loaded
- [ ] Layout components are tree-shakeable

### Runtime Performance

- [ ] No layout shift on navigation
- [ ] Smooth sidebar collapse/expand animation
- [ ] No jank on scroll

## Cross-Browser

- [ ] Chrome/Edge works
- [ ] Firefox works
- [ ] Safari works
- [ ] Mobile responsive

## Migration

### Backward Compatibility

- [ ] Existing bookmarks still work (with redirect)
- [ ] Query param state preserved
- [ ] No console errors on legacy routes

### Cleanup

- [ ] Old SettingsPage.tsx marked as deprecated or removed
- [ ] Unused imports removed
- [ ] Dead code eliminated
