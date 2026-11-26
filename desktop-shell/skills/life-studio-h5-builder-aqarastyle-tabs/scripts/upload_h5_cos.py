"""Zip a canvas preview workspace and upload that one archive.

The host and this API share a region. AGENTHUB_BASE_URL is optional and
defaults to http://127.0.0.1:8000. Do not install packages and do not call COS.

Usage:
    python3 scripts/upload_h5_cos.py <workspace-directory> [--project-id ID]

The workspace root must contain README.txt, manifest.json, preview/, and runtime/.
Those four entries are packed at the zip root. The stored name is
dashboard/life-app-<milliseconds>.zip, or
dashboard/<project-id>/life-app-<milliseconds>.zip when a project id is present.

Prints ZIP_URL (the returned CDN address) and BASE_URL (its directory).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import tempfile
import time
import zipfile
from pathlib import Path
from urllib.parse import urlsplit

_PACKAGE_FILES = ("README.txt", "manifest.json")
_PACKAGE_DIRS = ("preview", "runtime")
_PROJECT_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def _assert_workspace(root: Path) -> None:
    missing = [name for name in (*_PACKAGE_FILES, *_PACKAGE_DIRS) if not (root / name).exists()]
    if missing:
        raise SystemExit("workspace is missing: " + ", ".join(missing))
    for name in _PACKAGE_FILES:
        if not (root / name).is_file():
            raise SystemExit(f"{name} must be a file")
    for name in _PACKAGE_DIRS:
        if not (root / name).is_dir():
            raise SystemExit(f"{name} must be a directory")


def _write_zip(root: Path, dest: Path) -> None:
    root = root.resolve()
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in _PACKAGE_FILES:
            archive.write(root / name, arcname=name)
        for name in _PACKAGE_DIRS:
            folder = root / name
            files = [
                path
                for path in sorted(folder.rglob("*"))
                if path.is_file()
                and not path.is_symlink()
                and path.name != ".DS_Store"
                and "__MACOSX" not in path.parts
            ]
            if not files:
                raise SystemExit(f"{name}/ has no files to pack")
            for path in files:
                archive.write(path, arcname=path.relative_to(root).as_posix())


def _project_id(explicit: str) -> str:
    raw = (explicit or os.environ.get("PROJECT_ID", "")).strip()
    if not raw:
        return ""
    if not _PROJECT_ID.fullmatch(raw):
        raise SystemExit("project id must be a single path segment")
    return raw


def object_key(project_id: str, millis: int) -> str:
    name = f"life-app-{millis}.zip"
    if project_id:
        return f"dashboard/{project_id}/{name}"
    return f"dashboard/{name}"


def _base_url(cdn_url: str) -> str:
    parsed = urlsplit(cdn_url.strip())
    if parsed.scheme not in ("https", "http") or not parsed.netloc or not parsed.path:
        raise SystemExit("upload API returned an unusable cdn_url")
    parent = parsed.path.rsplit("/", 1)[0]
    return f"{parsed.scheme}://{parsed.netloc}{parent}/"


def upload_file(file_path: Path, key: str) -> str:
    try:
        import requests
    except ImportError:
        raise SystemExit("host is missing requests; do not install it from the agent")
    base_url = os.getenv("AGENTHUB_BASE_URL", "").strip() or "http://127.0.0.1:8000"
    upload_url = f"{base_url.rstrip('/')}/builder/api/v1/resource/upload"
    with file_path.open("rb") as file:
        response = requests.post(
            upload_url,
            files={"file": (file_path.name, file, "application/octet-stream")},
            data={"object_key": key},
            timeout=(10, 120),
        )
    try:
        result = response.json()
    except ValueError:
        raise SystemExit(f"upload API returned HTTP {response.status_code}") from None
    if not response.ok or result.get("code") != "OK":
        raise SystemExit(f"upload failed: {result.get('message', response.status_code)}")
    data = result.get("data") or {}
    cdn_url = str(data.get("cdn_url") or "").strip()
    if not cdn_url:
        raise SystemExit("upload API returned no cdn_url")
    return cdn_url


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("workspace")
    parser.add_argument("--project-id", default="")
    args = parser.parse_args()
    root = Path(args.workspace)
    if not root.is_dir():
        raise SystemExit(f"workspace directory not found: {root}")
    _assert_workspace(root)
    project = _project_id(args.project_id)
    key = object_key(project, time.time_ns() // 1_000_000)
    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / Path(key).name
        _write_zip(root, archive)
        cdn_url = upload_file(archive, key)
    print(f"OBJECT_KEY={key}")
    print(f"BASE_URL={_base_url(cdn_url)}")
    print(f"ZIP_URL={cdn_url}")


if __name__ == "__main__":
    main()
