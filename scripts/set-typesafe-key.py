#!/usr/bin/env python3
"""Save a TypeSafe API key using hidden terminal input, outside the repository."""

import getpass
import os
from pathlib import Path
import sys
import tempfile


def main():
    if not sys.stdin.isatty():
        sys.exit("Run this command directly in your terminal for hidden key entry.")

    directory = Path.home() / ".config" / "minisago"
    destination = directory / "typesafe-api-key"
    key = getpass.getpass("TypeSafe API key (hidden): ").strip()
    if not key or any(character.isspace() for character in key):
        sys.exit("No key saved: enter one non-empty key without whitespace.")

    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.is_symlink() or directory.stat().st_uid != os.getuid():
        sys.exit("No key saved: the credential directory must belong to you.")
    directory.chmod(0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=".typesafe-", dir=directory)
    try:
        with os.fdopen(descriptor, "w") as output:
            output.write(key + "\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(f"Key saved to {destination} (owner access only, mode 600).")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        sys.exit("\nCancelled; no key saved.")
