from pathlib import Path
from typing import Final

from openai_codex.client import CodexClient
from openai_codex.generated.v2_all import SkillsExtraRootsSetResponse, SkillsListResponse
from openai_codex.models import JsonObject

from aqven.chat.agent_plugin import SKILLS_LOGGER, SkillLoadReport, agent_skills_root

EXTRA_ROOTS_METHOD: Final = "skills/extraRoots/set"
SKILLS_LIST_METHOD: Final = "skills/list"


def listed_skill_names(response: SkillsListResponse) -> tuple[str, ...]:
    return tuple(skill.name for entry in response.data for skill in entry.skills if skill.enabled)


def load_codex_skills(client: CodexClient, project_root: Path) -> SkillLoadReport:
    roots: JsonObject = {"extraRoots": [str(agent_skills_root())]}
    client.request(EXTRA_ROOTS_METHOD, roots, response_model=SkillsExtraRootsSetResponse)
    listing: JsonObject = {"cwds": [str(project_root)], "forceReload": True}
    listed = client.request(SKILLS_LIST_METHOD, listing, response_model=SkillsListResponse)
    return SkillLoadReport.of("Codex", listed_skill_names(listed))


def register_codex_skills(client: CodexClient, project_root: Path) -> None:
    try:
        report = load_codex_skills(client, project_root)
    except Exception as error:
        SKILLS_LOGGER.error("Codex chat could not load the aqven skills from %s: %s", agent_skills_root(), error)
        return
    report.log()
