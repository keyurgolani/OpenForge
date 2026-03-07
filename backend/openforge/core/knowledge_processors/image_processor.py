"""
Image processor for OpenForge Knowledge System.

Processes uploaded images through:
1. EXIF metadata extraction
2. Thumbnail generation
3. OCR text extraction
4. CLIP visual embedding
5. Vision LLM description
6. Text embedding
"""
import base64
import io
import logging
from pathlib import Path
from uuid import UUID
from typing import Optional
import json

from PIL import Image
from PIL.ExifTags import TAGS

from openforge.config import get_settings
from openforge.core.embedding import embed_texts
from openforge.db.qdrant_client import get_qdrant
from openforge.core.content_processors.base import ContentProcessor, ProcessorResult

logger = logging.getLogger("openforge.image_processor")

# Lazy-loaded models
_clip_model = None


def get_clip_model():
    """Get or load the CLIP model."""
    global _clip_model
    if _clip_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _clip_model = SentenceTransformer("clip-ViT-B-32")
            logger.info("CLIP model loaded successfully")
        except Exception as e:
            logger.warning(f"Failed to load CLIP model: {e}")
            return None
    return _clip_model


class ImageProcessor(ContentProcessor):
    """Process images for knowledge storage and retrieval."""

    name = "image"
    supported_types = ["image/"]
    supported_extensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif"]

    def __init__(self):
        self.settings = get_settings()

    async def process(
        self,
        file_path: str,
        workspace_id: UUID,
        knowledge_id: Optional[UUID] = None,
        **kwargs,
    ) -> ProcessorResult:
        """
        Full image processing pipeline.

        Args:
            file_path: Path to the image file
            workspace_id: UUID of the workspace
            knowledge_id: Optional UUID of the knowledge entry
            **kwargs: Additional options (vision_provider_config)

        Returns:
            ProcessorResult with extracted metadata, thumbnail path, OCR text, and AI description
        """
        result = ProcessorResult(success=False)
        vision_provider_config = kwargs.get("vision_provider_config")
        clip_embedded = False

        image_path = Path(file_path)
        if not image_path.exists():
            result.error = f"Image file not found: {file_path}"
            logger.error(f"Image file not found: {file_path}")
            return result

        try:
            # Load image
            with Image.open(image_path) as img:
                # Step 1: Extract EXIF metadata
                result.metadata = self._extract_exif(img)

                # Add basic image info
                result.metadata["width"] = img.width
                result.metadata["height"] = img.height
                result.metadata["format"] = img.format
                result.metadata["mode"] = img.mode

                # Step 2: Generate thumbnail
                result.thumbnail_path = await self._generate_thumbnail(
                    img, workspace_id, knowledge_id
                )

                # Step 3: Run OCR
                result.extracted_text = await self._run_ocr(image_path)

                # Step 4: Generate CLIP embedding
                if knowledge_id:
                    clip_embedded = await self._store_clip_embedding(
                        img, knowledge_id, workspace_id
                    )

                # Step 5: Call vision LLM for description
                if vision_provider_config:
                    vision_result = await self._call_vision_llm(
                        image_path, vision_provider_config
                    )
                    result.ai_description = vision_result.get("description", "")
                    result.ai_tags = vision_result.get("tags", [])
                    result.ai_title = vision_result.get("title")

                # Step 6: Build combined text and embed
                combined_text = self._build_combined_text({
                    "ai_title": result.ai_title,
                    "ai_description": result.ai_description,
                    "ocr_text": result.extracted_text,
                    "ai_tags": result.ai_tags,
                })

                result.content = combined_text
                result.success = True

                if knowledge_id and combined_text.strip():
                    await self._store_text_embedding(
                        combined_text, knowledge_id, workspace_id, result.ai_title
                    )
                    result.embedded = True

        except Exception as e:
            logger.exception(f"Error processing image {knowledge_id}: {e}")
            result.error = str(e)

        return result

    def _extract_exif(self, img: Image.Image) -> dict:
        """Extract EXIF metadata from image."""
        metadata = {}
        try:
            exif = img._getexif()
            if exif:
                for tag_id, value in exif.items():
                    tag = TAGS.get(tag_id, tag_id)
                    # Skip large binary data
                    if tag in ("MakerNote", "UserComment", "CFAPattern"):
                        continue
                    # Convert bytes to string
                    if isinstance(value, bytes):
                        try:
                            value = value.decode("utf-8", errors="ignore")
                        except Exception:
                            continue
                    # Handle special tags
                    if tag == "GPSInfo" and isinstance(value, dict):
                        metadata["has_gps"] = True
                    else:
                        metadata[tag] = str(value)[:500]  # Limit length
        except Exception as e:
            logger.debug(f"Could not extract EXIF: {e}")

        return metadata

    async def _generate_thumbnail(
        self, img: Image.Image, workspace_id: UUID, knowledge_id: UUID
    ) -> Optional[str]:
        """Generate a thumbnail for the image."""
        try:
            workspace_dir = Path(self.settings.workspace_root) / str(workspace_id)
            thumbnail_dir = workspace_dir / "thumbnails"
            thumbnail_dir.mkdir(parents=True, exist_ok=True)

            thumbnail_path = thumbnail_dir / f"{knowledge_id}.webp"

            # Resize to 300px wide
            max_width = 300
            if img.width > max_width:
                ratio = max_width / img.width
                new_height = int(img.height * ratio)
                thumbnail = img.copy()
                thumbnail.thumbnail((max_width, new_height), Image.Resampling.LANCZOS)
            else:
                thumbnail = img.copy()

            # Convert to RGB if necessary (for PNG with transparency)
            if thumbnail.mode in ("RGBA", "P"):
                thumbnail = thumbnail.convert("RGB")

            # Save as WEBP
            thumbnail.save(thumbnail_path, "WEBP", quality=85)
            logger.info(f"Generated thumbnail: {thumbnail_path}")

            return f"thumbnails/{knowledge_id}.webp"

        except Exception as e:
            logger.error(f"Failed to generate thumbnail: {e}")
            return None

    async def _run_ocr(self, image_path: Path) -> str:
        """Run Tesseract OCR on the image."""
        try:
            import pytesseract

            text = pytesseract.image_to_string(str(image_path))
            return text.strip()
        except Exception as e:
            logger.debug(f"OCR failed: {e}")
            return ""

    async def _store_clip_embedding(
        self, img: Image.Image, knowledge_id: UUID, workspace_id: UUID
    ) -> bool:
        """Generate and store CLIP visual embedding."""
        try:
            clip_model = get_clip_model()
            if not clip_model:
                return False

            # Generate CLIP embedding
            embedding = clip_model.encode(img)

            # Store in visual collection
            client = get_qdrant()
            from qdrant_client.models import PointStruct

            collection = f"{self.settings.qdrant_collection}_visual"

            # Ensure collection exists
            self._ensure_visual_collection(client, collection)

            point = PointStruct(
                id=str(knowledge_id),
                vector=embedding.tolist(),
                payload={
                    "knowledge_id": str(knowledge_id),
                    "workspace_id": str(workspace_id),
                    "type": "image",
                },
            )

            client.upsert(collection_name=collection, points=[point])
            logger.info(f"Stored CLIP embedding for {knowledge_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to store CLIP embedding: {e}")
            return False

    def _ensure_visual_collection(self, client, collection: str):
        """Ensure the visual collection exists."""
        from qdrant_client.models import VectorParams, Distance

        collections = [c.name for c in client.get_collections().collections]
        if collection not in collections:
            client.create_collection(
                collection_name=collection,
                vectors_config=VectorParams(
                    size=512,  # CLIP ViT-B-32 dimension
                    distance=Distance.COSINE,
                ),
            )
            logger.info(f"Created visual collection: {collection}")

    async def _call_vision_llm(
        self, image_path: Path, provider_config: dict
    ) -> dict:
        """Call vision LLM to describe the image."""
        result = {"description": "", "tags": [], "title": None}

        try:
            # Read and encode image
            with open(image_path, "rb") as f:
                image_data = base64.b64encode(f.read()).decode("utf-8")

            # Determine mime type
            mime_type = "image/jpeg"
            if image_path.suffix.lower() == ".png":
                mime_type = "image/png"
            elif image_path.suffix.lower() == ".gif":
                mime_type = "image/gif"
            elif image_path.suffix.lower() == ".webp":
                mime_type = "image/webp"

            # Build prompt
            prompt = """Analyze this image and provide:
1. A detailed description of what you see (2-3 sentences)
2. A list of relevant tags (comma-separated)
3. A concise title (5-10 words)

Respond in JSON format:
{"description": "...", "tags": ["tag1", "tag2"], "title": "..."}"""

            # Call the vision model
            from openforge.core.llm_gateway import llm_gateway

            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{image_data}"
                            },
                        },
                    ],
                }
            ]

            provider_id = provider_config.get("provider_id")
            model = provider_config.get("model", "gpt-4o-mini")

            response = await llm_gateway.chat(
                messages=messages,
                provider_id=provider_id,
                model=model,
                temperature=0.3,
            )

            # Parse response
            content = response.get("content", "")
            if content:
                # Try to extract JSON
                import re
                json_match = re.search(r"\{.*\}", content, re.DOTALL)
                if json_match:
                    try:
                        parsed = json.loads(json_match.group())
                        result["description"] = parsed.get("description", "")
                        result["tags"] = parsed.get("tags", [])
                        result["title"] = parsed.get("title")
                    except json.JSONDecodeError:
                        result["description"] = content[:500]

        except Exception as e:
            logger.error(f"Vision LLM call failed: {e}")

        return result

    def _build_combined_text(self, result: dict) -> str:
        """Build combined text for embedding."""
        parts = []

        if result.get("ai_title"):
            parts.append(f"Title: {result['ai_title']}")

        if result.get("ai_description"):
            parts.append(f"Description: {result['ai_description']}")

        if result.get("ocr_text"):
            parts.append(f"Text in image: {result['ocr_text']}")

        if result.get("ai_tags"):
            parts.append(f"Tags: {', '.join(result['ai_tags'])}")

        return "\n\n".join(parts)

    async def _store_text_embedding(
        self,
        text: str,
        knowledge_id: UUID,
        workspace_id: UUID,
        title: Optional[str] = None,
    ):
        """Store text embedding in the main knowledge collection."""
        from openforge.core.knowledge_processor import knowledge_processor

        await knowledge_processor.process_knowledge(
            knowledge_id=knowledge_id,
            workspace_id=workspace_id,
            content=text,
            knowledge_type="image",
            title=title,
            tags=[],
        )
