"""Data analysis tool — wraps Python execution with pre-imported data science libraries."""

import asyncio
import os
import sys
import textwrap
from protocol import BaseTool, ToolContext, ToolResult
from security import security


_PREAMBLE = textwrap.dedent("""\
    import json, os, sys
    import pandas as pd
    import numpy as np
    try:
        import scipy
    except ImportError:
        pass
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    try:
        import seaborn as sns
    except ImportError:
        pass

    # Auto-save charts — monkey-patch plt.show()
    _chart_counter = [0]
    _chart_dir = os.environ.get('CHART_DIR', '.')
    _original_show = plt.show

    def _auto_show(*args, **kwargs):
        _chart_counter[0] += 1
        path = os.path.join(_chart_dir, f'chart_{_chart_counter[0]}.png')
        plt.savefig(path, dpi=150, bbox_inches='tight')
        plt.close()
        print(f'[chart saved: {path}]')

    plt.show = _auto_show
""")

_POSTAMBLE = textwrap.dedent("""\
    # Auto-save any remaining open figures
    import matplotlib.pyplot as _plt
    for _fig_num in _plt.get_fignums():
        _chart_counter[0] += 1
        _path = os.path.join(_chart_dir, f'chart_{_chart_counter[0]}.png')
        _plt.figure(_fig_num).savefig(_path, dpi=150, bbox_inches='tight')
        print(f'[chart saved: {_path}]')
    _plt.close('all')
""")


class RunPythonAnalysisTool(BaseTool):
    @property
    def id(self):
        return "data.run_python_analysis"

    @property
    def category(self):
        return "data"

    @property
    def display_name(self):
        return "Run Python Analysis"

    @property
    def description(self):
        return (
            "Execute a Python data analysis script with pandas, numpy, scipy, "
            "matplotlib, and seaborn pre-imported. Charts created with plt.show() "
            "are automatically saved as PNG files. Has a 120-second timeout "
            "(vs 30s for shell.execute_python) for longer analyses."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Python analysis code to execute. pandas, numpy, scipy, matplotlib, and seaborn are pre-imported.",
                },
                "timeout": {
                    "type": "number",
                    "default": 120,
                    "description": "Timeout in seconds (max 120).",
                },
            },
            "required": ["code"],
        }

    @property
    def risk_level(self):
        return "medium"

    @property
    def max_output(self):
        return 100000

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        code = params["code"]
        workspace_dir = security.get_workspace_dir(context.workspace_id)
        timeout = min(params.get("timeout", 120), 120)

        # Build full script with preamble, user code, and postamble
        full_script = _PREAMBLE + "\n" + code + "\n" + _POSTAMBLE

        env = os.environ.copy()
        env["CHART_DIR"] = str(workspace_dir)

        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-c", full_script,
                cwd=str(workspace_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=timeout,
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                return ToolResult(
                    success=False,
                    error=f"Analysis timed out after {timeout}s",
                )

            out = stdout.decode("utf-8", errors="replace")
            err = stderr.decode("utf-8", errors="replace")
            combined = out
            if err:
                combined += f"\n[stderr]\n{err}"

            return self._maybe_truncate("", combined.strip())
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
