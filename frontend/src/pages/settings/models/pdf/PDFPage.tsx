/**
 * PDFPage - PDF processing model configuration
 *
 * Assign PDF processing models for document extraction.
 */

import { PDFProcessingTab } from '../../llm/CLIPTab';

export function PDFPage() {
  return (
    <div className="p-6">
      <PDFProcessingTab />
    </div>
  );
}

export default PDFPage;
