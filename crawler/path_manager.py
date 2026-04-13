import os
from pathlib import Path

class PathManager:
    @staticmethod
    def get_base_dir() -> Path:
        base = os.environ.get("CHITU_BASE_DIR", "~/.chitu")
        path = Path(os.path.expanduser(base)).resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path

    @staticmethod
    def get_cookies_file() -> Path:
        return PathManager.get_base_dir() / "cookies.json"

    @staticmethod
    def get_incremental_state_file() -> Path:
        return PathManager.get_base_dir() / "incremental_state.json"

    @staticmethod
    def get_browser_user_data_dir(platform: str) -> Path:
        path = PathManager.get_base_dir() / "browser" / platform
        path.mkdir(parents=True, exist_ok=True)
        return path

    @staticmethod
    def get_temp_dir() -> Path:
        path = PathManager.get_base_dir() / "temp"
        path.mkdir(parents=True, exist_ok=True)
        return path
