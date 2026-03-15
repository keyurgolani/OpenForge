import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import RunDetailPage from '@/pages/RunDetailPage'

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useParams: () => ({ workspaceId: 'ws-1', runId: 'run-1' }),
  }
})

vi.mock('@/features/runs', () => ({
  useRunQuery: () => ({
    data: {
      id: 'run-1',
      run_type: 'workflow',
      workflow_id: 'wf-1',
      workflow_version_id: 'ver-1',
      mission_id: null,
      parent_run_id: null,
      root_run_id: 'run-1',
      spawned_by_step_id: null,
      workspace_id: 'ws-1',
      status: 'completed',
      state_snapshot: {},
      input_payload: {},
      output_payload: { research_summary: 'alpha\nbeta' },
      current_node_id: null,
      delegation_mode: 'fanout',
      merge_strategy: 'concat_field',
      join_group_id: 'research-branches',
      branch_key: null,
      branch_index: null,
      handoff_reason: null,
      composite_metadata: { pattern: 'map_reduce_research' },
    },
    isLoading: false,
    error: null,
  }),
  useRunStepsQuery: () => ({
    data: {
      steps: [
        {
          id: 'step-1',
          run_id: 'run-1',
          node_id: 'node-1',
          node_key: 'research.fanout',
          step_index: 1,
          status: 'completed',
          input_snapshot: {},
          output_snapshot: {},
          delegation_mode: 'fanout',
          merge_strategy: null,
          join_group_id: 'research-branches',
          branch_key: null,
          branch_index: null,
          handoff_reason: null,
          composite_metadata: {},
          retry_count: 0,
        },
      ],
    },
  }),
  useRunLineageQuery: () => ({
    data: {
      run_id: 'run-1',
      parent_run: null,
      child_runs: [
        {
          id: 'child-1',
          run_type: 'subworkflow',
          workflow_id: 'wf-child',
          workspace_id: 'ws-1',
          status: 'completed',
          state_snapshot: {},
          input_payload: {},
          output_payload: {},
          composite_metadata: {},
          join_group_id: 'research-branches',
        },
      ],
      tree: {},
      delegation_history: [{ delegation_mode: 'fanout', join_group_id: 'research-branches', merge_strategy: 'concat_field' }],
      branch_groups: [{ join_group_id: 'research-branches', branch_count: 1 }],
    },
  }),
  useRunCompositeDebugQuery: () => ({
    data: {
      run_id: 'run-1',
      delegation_history: [{ delegation_mode: 'fanout', join_group_id: 'research-branches', merge_strategy: 'concat_field' }],
      branch_groups: [{ join_group_id: 'research-branches', branch_count: 1 }],
      merge_outcomes: [{ strategy: 'concat_field', join_group_id: 'research-branches' }],
    },
  }),
  useRunCheckpointsQuery: () => ({ data: { checkpoints: [] } }),
  useRunEventsQuery: () => ({ data: { events: [] } }),
}))

describe('RunDetailPage', () => {
  it('renders composite delegation and branch information', () => {
    render(
      <MemoryRouter>
        <RunDetailPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Delegation timeline')).toBeInTheDocument()
    expect(screen.getAllByText('research-branches').length).toBeGreaterThan(0)
    expect(screen.getAllByText('concat_field').length).toBeGreaterThan(0)
    expect(screen.getByText('Branch groups and merge outcomes')).toBeInTheDocument()
  })
})
