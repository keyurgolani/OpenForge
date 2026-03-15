/**
 * ProvidersPage - LLM provider configuration
 *
 * Configure LLM provider credentials and settings.
 */

import ProvidersTab from '../../llm/ProvidersTab';

export function ProvidersPage() {
  return (
    <div className="p-6">
      <ProvidersTab />
    </div>
  );
}

export default ProvidersPage;
