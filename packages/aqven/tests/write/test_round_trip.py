from decimal import Decimal
from typing import Final

import pytest

from aqven.spec import ResearchSettings
from aqven.write.round_trip import ProjectYamlInvalid, with_research

HEAD: Final = """# owned by the platform team
apiVersion: "aqven/v1"
kind: "Project"
description: "Shop"  # shown in Studio
package: "shop"
"""
RENAMES: Final = """renames:
- kind: "node"
  from: "a.b"
  to: "a.c"
  at: "2026-09-17T16:48:45Z"
"""


def research(cap: str) -> ResearchSettings:
    return ResearchSettings(spend_cap_usd=Decimal(cap))


def test_the_block_goes_before_the_renames_journal() -> None:
    edited = with_research(HEAD + RENAMES, research("2.50"))

    assert edited == f"{HEAD}research:\n  spend_cap_usd: 2.50\n{RENAMES}"


def test_an_existing_block_changes_in_place() -> None:
    source = f"{HEAD}research:\n  spend_cap_usd: 1.00  # agreed with finance\n{RENAMES}"

    edited = with_research(source, research("0.40"))

    assert edited == f"{HEAD}research:\n  spend_cap_usd: 0.40  # agreed with finance\n{RENAMES}"


def test_an_empty_block_is_filled_where_it_stands() -> None:
    edited = with_research(f"{HEAD}research:\n{RENAMES}", research("3"))

    assert edited == f"{HEAD}research:\n  spend_cap_usd: 3.00\n{RENAMES}"


@pytest.mark.parametrize(("cap", "written"), [("1E+1", "10.00"), ("0.005", "0.005"), ("2.5", "2.50")])
def test_caps_are_written_in_plain_digits_down_to_cents(cap: str, written: str) -> None:
    assert with_research(HEAD, research(cap)).endswith(f"research:\n  spend_cap_usd: {written}\n")


@pytest.mark.parametrize("source", ["- just\n- a list\n", "apiVersion: [unclosed\n"])
def test_a_file_that_is_not_a_mapping_is_refused(source: str) -> None:
    with pytest.raises(ProjectYamlInvalid):
        with_research(source, research("1"))
