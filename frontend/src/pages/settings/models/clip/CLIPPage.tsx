/**
 * CLIPPage - CLIP model configuration
 *
 * Assign CLIP models for multimodal search.
 */

import CLIPTab from '../../llm/CLIPTab';

export function CLIPPage() {
  return (
    <div className="p-6">
      <CLIPTab />
    </div>
  );
}

export default CLIPPage;
