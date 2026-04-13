# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
import re

from PyInstaller.utils.hooks import collect_submodules, copy_metadata, collect_all

project_root = Path.cwd()
bridge_entry = project_root / "crawler" / "bridge.py"
media_crawler_dir = project_root / "crawler" / "MediaCrawler"
pyproject_path = media_crawler_dir / "pyproject.toml"

def collect_media_crawler_datas(root: Path):
    skipped_parts = {".git", ".github", ".venv", "__pycache__", "test", "tests"}
    collected = []

    for file_path in root.rglob("*"):
        if not file_path.is_file():
            continue
        if any(part in skipped_parts for part in file_path.parts):
            continue

        relative_path = file_path.relative_to(root)
        target_dir = Path("MediaCrawler") / relative_path.parent
        collected.append((str(file_path), str(target_dir)))

    return collected


datas = collect_media_crawler_datas(media_crawler_dir)

hiddenimports = [
    "playwright.async_api",
    "playwright.sync_api",
    "openpyxl",
    "openpyxl.cell._writer",
    "openpyxl.cell.cell",
    "openpyxl.worksheet._writer",
    "typer",
    "click",
    "rich",
    "shellingham",
    "annotated_doc",
    "markdown_it",
    "pygments",
]

third_party_packages = {
    "httpx",
    "PIL",
    "playwright",
    "tenacity",
    "typer",
    "cv2",
    "aiomysql",
    "redis",
    "pydantic",
    "aiofiles",
    "fastapi",
    "uvicorn",
    "dotenv",
    "jieba",
    "wordcloud",
    "matplotlib",
    "requests",
    "parsel",
    "execjs",
    "pandas",
    "aiosqlite",
    "humps",
    "cryptography",
    "alembic",
    "asyncmy",
    "sqlalchemy",
    "motor",
    "openpyxl",
    "websockets",
    "asyncpg",
    "click",
    "rich",
    "shellingham",
    "annotated_doc",
    "markdown_it",
    "pygments",
}

if pyproject_path.exists():
    pyproject_text = pyproject_path.read_text(encoding="utf-8")
    for match in re.findall(r'"([^"]+)"', pyproject_text):
        package_name = re.split(r"[<>=~!]", match, maxsplit=1)[0].strip()
        if package_name:
            third_party_packages.add(package_name)

for package_name in (
    "api",
    "base",
    "cache",
    "cmd_arg",
    "config",
    "constant",
    "database",
    "media_platform",
    "model",
    "proxy",
    "store",
    "tools",
    "typer",
    "click",
    "rich",
    "shellingham",
):
    hiddenimports += collect_submodules(package_name)

package_aliases = {
    "Pillow": "PIL",
    "opencv-python": "cv2",
    "python-dotenv": "dotenv",
    "pyexecjs": "execjs",
    "pyhumps": "humps",
}

for package_name in sorted(third_party_packages):
    module_name = package_aliases.get(package_name, package_name)
    try:
        pkg_datas, pkg_binaries, pkg_hiddenimports = collect_all(module_name)
        datas += pkg_datas
        hiddenimports += pkg_hiddenimports
    except Exception:
        try:
            hiddenimports += collect_submodules(module_name)
        except Exception:
            pass

    try:
        datas += copy_metadata(package_name)
    except Exception:
        pass

a = Analysis(
    [str(bridge_entry)],
    pathex=[str(media_crawler_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[str(media_crawler_dir / ".venv" / "lib" / "python3.11" / "site-packages" / "playwright" / "_impl" / "__pyinstaller")],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='crawler',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
