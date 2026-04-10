import { FileText } from 'lucide-react'
import { PipelineModelsPage } from './PipelineModelsPage'

export function PipelineDocumentPage() {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Document Models
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Marker and Docling run in parallel during document processing — Marker for text extraction, Docling for table analysis. Download the models you need.
                </p>
            </div>

            <PipelineModelsPage
                filter={['marker', 'docling']}
            />
        </div>
    )
}

export default PipelineDocumentPage
