/**
 * EmbeddingPage - Embedding model configuration
 *
 * Assign embedding models for vector search.
 */

import EmbeddingTab from '../../llm/EmbeddingTab';

export function EmbeddingPage() {
  return (
    <div className="p-6">
      <EmbeddingTab />
    </div>
  );
}

export default EmbeddingPage;
