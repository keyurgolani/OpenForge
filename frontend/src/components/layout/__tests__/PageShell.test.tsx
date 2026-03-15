/**
 * Tests for layout components
 *
 * NOTE: These tests require vitest and @testing-library/react to be installed.
 * Run: pnpm add -D vitest @testing-library/react @testing-library/jest-dom
 *
 * Then add to vite.config.ts:
 *   test: {
 *     globals: true,
 *     environment: 'jsdom',
 *   }
 *
 * Tests to implement:
 *
 * PageShell:
 * - renders children
 * - applies flex-col by default
 * - disables flex-col with nowrap
 *
 * PageContent:
 * - renders children
 * - has overflow-y-auto by default
 * - disables scroll with noScroll
 *
 * ConnectionStatus:
 * - shows connected state (emerald)
 * - shows disconnected state (amber)
 * - shows label when showLabel is true
 * - applies size classes
 *
 * WorkspaceSwitcher:
 * - shows current workspace name
 * - opens dropdown on click
 * - filters workspaces on search
 * - navigates to settings on "Add Workspace"
 *
 * TopBar:
 * - shows section title and description
 * - calls onToggleSidebar when clicked
 * - shows connection status when disconnected
 */

export {};
