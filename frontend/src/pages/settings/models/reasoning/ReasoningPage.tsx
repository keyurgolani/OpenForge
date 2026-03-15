/**
 * ReasoningPage - Reasoning model configuration
 *
 * Assign reasoning models for chat and analysis.
 */

import { MessageSquare } from 'lucide-react';
import ModelTypeTab from '../../llm/ModelTypeTab';

export function ReasoningPage() {
  return (
    <div className="p-6">
      <ModelTypeTab
        configType="chat"
        title="Reasoning Models"
        description="Models used for reasoning and chat conversations. Configure the models available and set the system default."
        Icon={MessageSquare}
      />
    </div>
  );
}

export default ReasoningPage;
