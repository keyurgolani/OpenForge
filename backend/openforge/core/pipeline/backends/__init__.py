"""Pipeline slot backends for knowledge extraction and processing.

Importing this package triggers backend registration via register_backend()
calls at module scope in each backend module.
"""

from openforge.core.pipeline.backends import audio_backends as _audio  # noqa: F401
from openforge.core.pipeline.backends import clip_backend as _clip  # noqa: F401
from openforge.core.pipeline.backends import image_backends as _image  # noqa: F401
from openforge.core.pipeline.backends import ocr_backend as _ocr  # noqa: F401
from openforge.core.pipeline.backends import text_extraction as _text  # noqa: F401
from openforge.core.pipeline.backends import video_backends as _video  # noqa: F401
