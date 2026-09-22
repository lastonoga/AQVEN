import errno
import os
import socket
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Final

OWNER_ONLY_FILE: Final = 0o600
OWNER_ONLY_DIRECTORY: Final = 0o700
PORT_BUSY_ERRNOS: Final = frozenset({errno.EADDRINUSE, errno.EACCES})


@dataclass(frozen=True, slots=True)
class DetachOptions:
    new_session: bool
    creation_flags: int


if sys.platform == "win32":
    import msvcrt

    OWNER_PERMISSIONS: Final = False

    def try_lock(descriptor: int) -> bool:
        try:
            msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
        except OSError:
            return False
        return True

    def unlock(descriptor: int) -> None:
        msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)

    def process_alive(pid: int) -> bool:
        return pid > 0

    def reserve_port_option(listener: socket.socket) -> None:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)

    def detach_options() -> DetachOptions:
        flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
        return DetachOptions(new_session=False, creation_flags=flags)

else:
    import fcntl

    OWNER_PERMISSIONS: Final = True

    def try_lock(descriptor: int) -> bool:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return False
        return True

    def unlock(descriptor: int) -> None:
        fcntl.flock(descriptor, fcntl.LOCK_UN)

    def process_alive(pid: int) -> bool:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return False
        except PermissionError:
            return True
        return True

    def reserve_port_option(listener: socket.socket) -> None:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    def detach_options() -> DetachOptions:
        return DetachOptions(new_session=True, creation_flags=0)


def restrict(path: Path, mode: int) -> None:
    if not OWNER_PERMISSIONS:
        return
    os.chmod(path, mode)


def ensure_private_directory(path: Path) -> Path:
    path.mkdir(mode=OWNER_ONLY_DIRECTORY, parents=True, exist_ok=True)
    return path


def ensure_private_file(path: Path) -> Path:
    ensure_private_directory(path.parent)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, OWNER_ONLY_FILE)
    os.close(descriptor)
    restrict(path, OWNER_ONLY_FILE)
    return path


def write_private_text(path: Path, text: str) -> Path:
    ensure_private_directory(path.parent)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.part")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, OWNER_ONLY_FILE)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        stream.write(text)
    restrict(temporary, OWNER_ONLY_FILE)
    os.replace(temporary, path)
    return path


def permission_bits(path: Path) -> int:
    return path.stat().st_mode & 0o777
