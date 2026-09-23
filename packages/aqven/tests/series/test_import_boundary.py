import os
import subprocess
import sys
from typing import Final

PROBE: Final = "import sys, aqven.cli, aqven.series; print('scipy' in sys.modules)"


def test_the_cli_and_the_series_contracts_do_not_load_scipy() -> None:
    environment = {key: value for key, value in os.environ.items() if key != "PYTHONPATH"}
    completed = subprocess.run(
        (sys.executable, "-c", PROBE), env=environment, capture_output=True, text=True, timeout=120, check=False
    )

    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.strip() == "False"
