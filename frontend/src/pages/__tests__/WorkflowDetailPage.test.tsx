import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import WorkflowDetailPage from '@/pages/WorkflowDetailPage'

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useParams: () => ({ workspaceId: 'ws-1', workflowId: 'wf-1' }),
  }
})

vi.mock('@/features/workflows', () => ({
  useWorkflowQuery: () => ({
    data: {
      id: 'wf-1',
      workspace_id: 'ws-1',
      name: 'Map Reduce Research',
      slug: 'map-reduce-research',
      description: 'Composite workflow',
      current_version_id: 'ver-1',
      is_system: true,
      is_template: true,
      template_kind: 'composite_pattern',
      template_metadata: { pattern: 'map_reduce_research', badges: ['fanout', 'reduce'] },
      current_version: {
        id: 'ver-1',
        workflow_id: 'wf-1',
        version_number: 1,
        entry_node_id: 'node-1',
        entry_node: null,
        state_schema: {},
        default_input_schema: {},
        default_output_schema: {},
        status: 'active',
        change_note: 'Initial',
        nodes: [
          {
            id: 'node-1',
            workflow_version_id: 'ver-1',
            node_key: 'research.fanout',
            node_type: 'fanout',
            label: 'Fan out research branches',
            description: null,
            config: { child_workflow_id: 'child-1', join_group_id: 'research-branches' },
            executor_ref: 'runtime.fanout',
            input_mapping: {},
            output_mapping: {},
            status: 'active',
          },
          {
            id: 'node-2',
            workflow_version_id: 'ver-1',
            node_key: 'research.reduce',
            node_type: 'reduce',
            label: 'Reduce branch outputs',
            description: null,
            config: { strategy: 'concat_field', join_group_id: 'research-branches' },
            executor_ref: 'runtime.reduce',
            input_mapping: {},
            output_mapping: {},
            status: 'active',
          },
        ],
        edges: [],
      },
      status: 'active',
    },
    isLoading: false,
    error: null,
  }),
  useWorkflowVersionsQuery: () => ({ data: { versions: [{ id: 'ver-1', version_number: 1, status: 'active', change_note: 'Initial', nodes: [], edges: [] }] } }),
  useWorkflowVersionQuery: () => ({ data: null }),
}))

describe('WorkflowDetailPage', () => {
  it('renders composite pattern badges and node facts', () => {
    render(
      <MemoryRouter>
        <WorkflowDetailPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Composite orchestration')).toBeInTheDocument()
    expect(screen.getAllByText('composite_pattern').length).toBeGreaterThan(0)
    expect(screen.getAllByText('fanout').length).toBeGreaterThan(0)
    expect(screen.getAllByText('research-branches').length).toBeGreaterThan(0)
    expect(screen.getByText('child-1')).toBeInTheDocument()
  })
})
