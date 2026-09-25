from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


class HandlerWire(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    command: str = ""
    rule: str | None = Field(default=None, alias="if")


class GroupWire(BaseModel):
    model_config = ConfigDict(extra="allow")

    matcher: str | None = None
    hooks: list[HandlerWire] = []


class SettingsWire(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    hooks: dict[str, list[GroupWire]] = {}
    approved_servers: list[str] = Field(default=[], alias="enabledMcpjsonServers")

    @classmethod
    def read(cls, path: Path) -> SettingsWire:
        return cls.model_validate_json(path.read_text(encoding="utf-8"))

    def commands(self, event: str) -> list[str]:
        return [handler.command for group in self.hooks.get(event, []) for handler in group.hooks]

    def rules(self, event: str) -> list[str | None]:
        return [handler.rule for group in self.hooks.get(event, []) for handler in group.hooks]

    def matchers(self) -> dict[str, list[str | None]]:
        return {event: [group.matcher for group in groups] for event, groups in self.hooks.items()}
