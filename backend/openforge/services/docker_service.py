import asyncio
import logging
from typing import Dict, Any, Optional

try:
    import aiodocker
except ImportError:
    aiodocker = None

logger = logging.getLogger("openforge.docker")


class DockerLogService:
    def __init__(self):
        self.active_tasks: Dict[str, asyncio.Task] = {}

    async def stream_logs(self, websocket: Any, ws_manager: Any):
        """Streams docker logs to a specific WebSocket connection."""
        if not aiodocker:
            await ws_manager.send_to_connection(websocket, {
                "type": "container_log_error",
                "detail": "aiodocker is not installed or available."
            })
            return

        try:
            docker = aiodocker.Docker()
            # Test connection
            await docker.system.info()
        except Exception as e:
            logger.error(f"Cannot connect to Docker daemon: {e}")
            await ws_manager.send_to_connection(websocket, {
                "type": "container_log_error",
                "detail": f"Cannot connect to Docker daemon: {e}"
            })
            return

        # Let's get all containers for this project
        try:
            containers = await docker.containers.list()
            # We want to identify openforge containers. Assuming they contain "openforge" in name or label
            openforge_containers = []
            for c in containers:
                info = await c.show()
                name = info.get("Name", "").lstrip("/")
                if "openforge" in name:
                    openforge_containers.append((c, name))
            
            if not openforge_containers:
                 await ws_manager.send_to_connection(websocket, {
                    "type": "container_log_error",
                    "detail": "No OpenForge containers found."
                })
                 await docker.close()
                 return

            async def tail_container(container, container_name):
                try:
                    # fetch last 50 lines first, then follow
                    async for line in container.log(stdout=True, stderr=True, follow=True, tail=50):
                        if isinstance(line, bytes):
                            text = line.decode('utf-8', errors='replace')
                        else:
                            text = str(line)
                        
                        await ws_manager.send_to_connection(websocket, {
                            "type": "container_log",
                            "container": container_name,
                            "data": text
                        })
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.error(f"Error reading logs for {container_name}: {e}")

            tasks = []
            for c, name in openforge_containers:
                tasks.append(asyncio.create_task(tail_container(c, name)))

            # Bind the tasks so we can cancel them when WS disconnects?
            # Actually, this stream_logs function runs in background, so we just wait on tasks
            await asyncio.gather(*tasks)

        finally:
            await docker.close()


docker_service = DockerLogService()
