/**
 * WorkspacesPage - Workspace management settings
 *
 * Create, edit, and delete workspaces.
 */

import { useSearchParams } from 'react-router-dom';
import WorkspacesSettings from '../WorkspacesTab';

export function WorkspacesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const newWorkspaceRequested = searchParams.get('newWorkspace') === '1';

  return (
    <div className="p-6">
      <WorkspacesSettings
        openCreateRequested={newWorkspaceRequested}
        onCreateRequestConsumed={() => {
          if (!newWorkspaceRequested) return;
          const next = new URLSearchParams(searchParams);
          next.delete('newWorkspace');
          setSearchParams(next, { replace: true });
        }}
      />
    </div>
  );
}

export default WorkspacesPage;
