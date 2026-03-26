const PIPELINE_TO_KNOWLEDGE_TYPE: Record<string, string> = {
  text: "note",
  pdf: "pdf",
  image: "image",
  audio: "audio",
  document: "document",
  sheet: "sheet",
  slides: "slides",
};

export function pipelineToKnowledgeType(pipeline: string): string {
  return PIPELINE_TO_KNOWLEDGE_TYPE[pipeline] ?? "note";
}
