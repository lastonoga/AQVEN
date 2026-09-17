from dataclasses import dataclass
from pathlib import Path
from typing import Final

from fastapi import FastAPI
from starlette.responses import FileResponse, PlainTextResponse, Response

from aqven.server.errors import not_found

INDEX_FILE: Final = "index.html"
PACKAGED_STUDIO: Final = Path(__file__).parent / "static"
DEVELOPMENT_STUDIO: Final = Path("apps") / "studio" / "dist"
RESERVED_PREFIXES: Final = ("api", "mcp")
NO_CACHE: Final = {"Cache-Control": "no-cache"}
MISSING_BUNDLE: Final = "Studio bundle not found: build apps/studio or pass --studio-dist"


def packaged_studio() -> Path | None:
    return PACKAGED_STUDIO if (PACKAGED_STUDIO / INDEX_FILE).is_file() else None


def development_studio() -> Path | None:
    candidates = (folder / DEVELOPMENT_STUDIO for folder in Path(__file__).resolve().parents)
    return next((candidate for candidate in candidates if (candidate / INDEX_FILE).is_file()), None)


def default_studio() -> Path | None:
    return packaged_studio() or development_studio()


def reserved(path: str) -> bool:
    head = path.split("/", 1)[0]
    return head in RESERVED_PREFIXES


@dataclass(frozen=True, slots=True)
class StudioBundle:
    directory: Path | None

    def response(self, path: str) -> Response:
        if reserved(path):
            raise not_found(f"route /{path} not found")
        if self.directory is None:
            return PlainTextResponse(MISSING_BUNDLE, status_code=404)
        root = self.directory.resolve()
        candidate = (root / path).resolve()
        if path and candidate.is_relative_to(root) and candidate.is_file():
            return FileResponse(candidate)
        index = root / INDEX_FILE
        if not index.is_file():
            return PlainTextResponse(MISSING_BUNDLE, status_code=404)
        return FileResponse(index, headers=NO_CACHE)


def mount_studio(app: FastAPI, bundle: StudioBundle) -> None:
    async def studio_asset(path: str) -> Response:
        return bundle.response(path)

    app.add_api_route(
        "/{path:path}",
        studio_asset,
        methods=["GET", "HEAD"],
        include_in_schema=False,
        name="studio_asset",
    )
