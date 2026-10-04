"""Count lines, words and characters of a file.

Usage: run.py <path>  (path relative to the workspace root, e.g. data/notes.md)
"""

import sys


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: run.py <path>", file=sys.stderr)
        return 2
    with open(sys.argv[1], encoding="utf-8") as handle:
        text = handle.read()
    print(f"lines: {len(text.splitlines())}")
    print(f"words: {len(text.split())}")
    print(f"characters: {len(text)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
