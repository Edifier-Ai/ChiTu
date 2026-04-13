import json
import sys
from typing import Dict, Any, List

def emit_message(message_type: str, payload: Dict[str, Any]) -> None:
    print(
        json.dumps({"type": message_type, "payload": payload}, ensure_ascii=False),
        file=sys.stderr,
        flush=True,
    )

def output_progress(platform: str, keyword: str, current: int, total: int, data: List[Dict] = None):
    emit_message("progress", {
        "platform": platform,
        "keyword": keyword,
        "current": current,
        "total": total,
        "data": data or [],
    })

def output_error(message: str) -> None:
    emit_message("error", {"message": message})

def output_complete(total: int) -> None:
    emit_message("complete", {"total": total})
