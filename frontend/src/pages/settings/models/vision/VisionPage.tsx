/**
 * VisionPage - Vision model configuration
 *
 * Assign vision models for image understanding.
 */

import { Eye } from 'lucide-react';
import ModelTypeTab from '../../llm/ModelTypeTab';

export function VisionPage() {
  return (
    <div className="p-6">
      <ModelTypeTab
        configType="vision"
        title="Vision Models"
        description="Models used for image analysis and visual content extraction. Must support multimodal input."
        Icon={Eye}
      />
    </div>
  );
}

export default VisionPage;
