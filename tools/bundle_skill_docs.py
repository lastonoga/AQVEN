import argparse
import posixpath
import re
import sys
import unicodedata
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from itertools import dropwhile, groupby
from pathlib import Path, PurePosixPath
from typing import Final

from front_matter import FrontMatterError, split_document, text_field

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
SITE_DOCS: Final = REPO_ROOT / "apps" / "site" / "src" / "content" / "docs"
DOCS_TOKENS: Final = REPO_ROOT / "apps" / "site" / "docs.tokens.mjs"
SKILLS_ROOT: Final = REPO_ROOT / "packages" / "aqven" / "src" / "aqven" / "agent_plugin" / "skills"
MANIFEST: Final = "references.txt"
REFERENCES: Final = "references"
PAGE_SUFFIX: Final = ".md"
INDEX_PAGE: Final = "index.md"
ENCODING: Final = "utf-8"
TOC_THRESHOLD: Final = 100
TOC_TITLE: Final = "Contents"
TOC_LEVELS: Final = frozenset({2, 3})
SLUG_KEPT: Final = frozenset({"-", "_"})
SLUG_DROPPED_CATEGORIES: Final = ("P", "S")
TOKEN: Final = re.compile(r"\{\{([A-Z_]+)\}\}")
TOKEN_DEFINITION: Final = re.compile(r'^\s*(?P<key>[A-Z][A-Z_]*):\s*"(?P<value>[^"]*)",?\s*$', re.MULTILINE)
LINK: Final = re.compile(r"(?P<image>!?)\[(?P<text>[^\]]*)\]\((?P<target>[^)\s]+)\)")
FENCE: Final = re.compile(r"^\s*(?P<marker>`{3,}|~{3,})")
HEADING: Final = re.compile(r"^(?P<marks>#{1,6})\s+(?P<text>.+?)\s*$")
HTML_COMMENT_LINE: Final = re.compile(r"^\s*<!--.*-->\s*$")
SITE_PAGE_TARGET: Final = re.compile(r"^/(?P<path>[a-z0-9-]+(?:/[a-z0-9-]+)*)?/?(?P<anchor>#.*)?$")
CLOSING_HASHES: Final = re.compile(r"\s+#+\s*$")
IN_SYNC: Final = "skill references: in sync"
OUT_OF_SYNC: Final = "skill references: out of sync; run uv run --frozen python tools/bundle_skill_docs.py"
EXIT_OK: Final = 0
EXIT_FAILED: Final = 1


class ManifestError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class SiteLink:
    page: PurePosixPath
    anchor: str


@dataclass(slots=True)
class Slugger:
    seen: dict[str, int] = field(default_factory=dict[str, int])

    def slug(self, heading: str) -> str:
        base = heading_slug(heading)
        count = self.seen.get(base, 0)
        self.seen[base] = count + 1
        return base if count == 0 else f"{base}-{count}"


@dataclass(frozen=True, slots=True)
class PageContext:
    source: PurePosixPath
    bundled: frozenset[PurePosixPath]
    tokens: Mapping[str, str]


def docs_tokens(path: Path = DOCS_TOKENS) -> Mapping[str, str]:
    text = path.read_text(encoding=ENCODING)
    return {match.group("key"): match.group("value") for match in TOKEN_DEFINITION.finditer(text)}


def replace_tokens(text: str, tokens: Mapping[str, str]) -> str:
    return TOKEN.sub(lambda match: tokens.get(match.group(1), match.group(0)), text)


def manifest_problem(line: str, site_docs: Path) -> str | None:
    page = PurePosixPath(line)
    if page.is_absolute() or ".." in page.parts:
        return f"{line}: must be a path relative to the site docs"
    if page.suffix != PAGE_SUFFIX:
        return f"{line}: must name a {PAGE_SUFFIX} page"
    if not (site_docs / page).is_file():
        return f"{line}: no such site page"
    return None


def read_manifest(skill: Path, site_docs: Path) -> tuple[PurePosixPath, ...]:
    manifest = skill / MANIFEST
    if not manifest.is_file():
        return ()
    lines = [line.strip() for line in manifest.read_text(encoding=ENCODING).splitlines() if line.strip()]
    problems = [problem for line in lines if (problem := manifest_problem(line, site_docs)) is not None]
    duplicates = sorted({line for line in lines if lines.count(line) > 1})
    problems.extend(f"{line}: listed more than once" for line in duplicates)
    if problems:
        raise ManifestError("\n".join(f"{skill.name}/{MANIFEST}: {problem}" for problem in problems))
    return tuple(PurePosixPath(line) for line in lines)


def site_link(target: str) -> SiteLink | None:
    match = SITE_PAGE_TARGET.match(target)
    if match is None:
        return None
    folder = match.group("path") or ""
    anchor = match.group("anchor") or ""
    if not folder:
        return SiteLink(PurePosixPath(INDEX_PAGE), anchor)
    return SiteLink(PurePosixPath(f"{folder}{PAGE_SUFFIX}"), anchor)


def index_candidate(link: SiteLink) -> PurePosixPath:
    return PurePosixPath(link.page.with_suffix("").as_posix(), INDEX_PAGE)


def bundled_page(link: SiteLink, bundled: frozenset[PurePosixPath]) -> PurePosixPath | None:
    candidates = (link.page, index_candidate(link))
    return next((candidate for candidate in candidates if candidate in bundled), None)


def relative_target(source: PurePosixPath, page: PurePosixPath, anchor: str) -> str:
    return f"{posixpath.relpath(page.as_posix(), source.parent.as_posix() or '.')}{anchor}"


def rewrite_link(match: re.Match[str], context: PageContext) -> str:
    target = match.group("target")
    if not target.startswith("/"):
        return match.group(0)
    link = site_link(target)
    page = None if link is None else bundled_page(link, context.bundled)
    if link is None or page is None:
        return match.group("text")
    image = match.group("image")
    return f"{image}[{match.group('text')}]({relative_target(context.source, page, link.anchor)})"


def rewrite_links(line: str, context: PageContext) -> str:
    return LINK.sub(lambda match: rewrite_link(match, context), line)


def heading_text(raw: str) -> str:
    return CLOSING_HASHES.sub("", LINK.sub(lambda match: match.group("text"), raw)).strip()


def heading_slug(text: str) -> str:
    kept = "".join(
        character
        for character in text.lower()
        if character in SLUG_KEPT or not unicodedata.category(character).startswith(SLUG_DROPPED_CATEGORIES)
    )
    return kept.replace(" ", "-")


def outside_fences(lines: Sequence[str]) -> Iterator[tuple[int, str]]:
    marker: str | None = None
    for index, line in enumerate(lines):
        fence = FENCE.match(line)
        if fence is not None and marker is None:
            marker = fence.group("marker")[0]
            continue
        if fence is not None and fence.group("marker")[0] == marker:
            marker = None
            continue
        if marker is None:
            yield index, line


def segments(lines: Sequence[str]) -> Iterator[tuple[bool, list[str]]]:
    prose = {index for index, _ in outside_fences(lines)}
    for is_prose, group in groupby(enumerate(lines), key=lambda item: item[0] in prose):
        yield is_prose, [line for _, line in group]


def prose_lines(lines: Sequence[str], context: PageContext) -> list[str]:
    kept = [line for line in lines if not HTML_COMMENT_LINE.match(line)]
    return rewrite_links("\n".join(kept), context).split("\n")


def transformed_body(body: str, context: PageContext) -> list[str]:
    lines = replace_tokens(body, context.tokens).split("\n")
    transformed: list[str] = []
    for is_prose, group in segments(lines):
        transformed.extend(prose_lines(group, context) if is_prose else group)
    return transformed


def headings(lines: Sequence[str]) -> Iterator[tuple[int, str]]:
    for _, line in outside_fences(lines):
        match = HEADING.match(line)
        if match is not None:
            yield len(match.group("marks")), heading_text(match.group("text"))


def contents(title: str, lines: Sequence[str]) -> list[str]:
    slugger = Slugger()
    slugger.slug(title)
    slugger.slug(TOC_TITLE)
    entries: list[str] = []
    for level, text in headings(lines):
        slug = slugger.slug(text)
        if level in TOC_LEVELS:
            entries.append(f"{'  ' * (level - min(TOC_LEVELS))}- [{text}](#{slug})")
    return [f"## {TOC_TITLE}", "", *entries, ""]


def joined(lines: Sequence[str]) -> str:
    return "\n".join(lines).strip("\n") + "\n"


def render_page(text: str, context: PageContext) -> str:
    document = split_document(text)
    title = text_field(document, "title")
    if title is None:
        raise FrontMatterError(f"{context.source}: front matter has no title")
    description = text_field(document, "description")
    header = [f"# {replace_tokens(title, context.tokens)}", ""]
    if description is not None:
        header.extend([replace_tokens(description, context.tokens), ""])
    body = list(dropwhile(lambda line: not line.strip(), transformed_body(document.body, context)))
    if len(header) + len(body) <= TOC_THRESHOLD:
        return joined([*header, *body])
    return joined([*header, *contents(title, body), *body])


def skill_folders(skills_root: Path) -> tuple[Path, ...]:
    return tuple(sorted(path for path in skills_root.iterdir() if path.is_dir() and not path.name.startswith(".")))


def expected_bundle(skills_root: Path, site_docs: Path, tokens: Mapping[str, str]) -> dict[PurePosixPath, bytes]:
    expected: dict[PurePosixPath, bytes] = {}
    for skill in skill_folders(skills_root):
        pages = read_manifest(skill, site_docs)
        bundled = frozenset(pages)
        for page in pages:
            context = PageContext(page, bundled, tokens)
            text = (site_docs / page).read_text(encoding=ENCODING)
            expected[PurePosixPath(skill.name, REFERENCES, page)] = render_page(text, context).encode(ENCODING)
    return expected


def current_bundle(skills_root: Path) -> dict[PurePosixPath, bytes]:
    found: dict[PurePosixPath, bytes] = {}
    for skill in skill_folders(skills_root):
        references = skill / REFERENCES
        files = sorted(path for path in references.rglob("*") if path.is_file()) if references.is_dir() else []
        found.update({PurePosixPath(path.relative_to(skills_root).as_posix()): path.read_bytes() for path in files})
    return found


def differences(expected: Mapping[PurePosixPath, bytes], current: Mapping[PurePosixPath, bytes]) -> tuple[str, ...]:
    missing = tuple(f"missing: {path}" for path in sorted(set(expected) - set(current)))
    extra = tuple(f"extra: {path}" for path in sorted(set(current) - set(expected)))
    shared = sorted(set(expected) & set(current))
    changed = tuple(f"changed: {path}" for path in shared if expected[path] != current[path])
    return missing + extra + changed


def remove_empty_folders(references: Path) -> None:
    if not references.is_dir():
        return
    folders = sorted((path for path in references.rglob("*") if path.is_dir()), reverse=True)
    for folder in (*folders, references):
        if not any(folder.iterdir()):
            folder.rmdir()


def write_bundle(skills_root: Path, expected: Mapping[PurePosixPath, bytes]) -> None:
    for stale in set(current_bundle(skills_root)) - set(expected):
        (skills_root / stale).unlink()
    for path, content in expected.items():
        target = skills_root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    for skill in skill_folders(skills_root):
        remove_empty_folders(skill / REFERENCES)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="copy the site pages named in each skill's references.txt")
    parser.add_argument("--check", action="store_true", help="fail if the copies differ from the site pages")
    arguments = parser.parse_args(argv)
    try:
        expected = expected_bundle(SKILLS_ROOT, SITE_DOCS, docs_tokens())
    except (ManifestError, FrontMatterError) as error:
        print(error, file=sys.stderr)
        return EXIT_FAILED
    found = differences(expected, current_bundle(SKILLS_ROOT))
    if arguments.check and found:
        print("\n".join((OUT_OF_SYNC, *found)), file=sys.stderr)
        return EXIT_FAILED
    if arguments.check:
        print(IN_SYNC)
        return EXIT_OK
    write_bundle(SKILLS_ROOT, expected)
    print(f"skill references: {len(expected)} pages written, {len(found)} changed")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
