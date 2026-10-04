---
name: count-words
description: Count lines, words and characters of a data file. Use when the user wants basic stats about a file.
---

# Count Words

Count lines, words and characters of a file.

## When to use

- The user asks how long a file is, how many words or lines it has.

## How to do it

1. Run the `count-words` skill with the file path as argument (relative to
   the workspace root, e.g. `data/notes.md`).
2. Report the counts to the user.

## Rules

- The skill runs a pre-designed local script; do not read the file yourself
  just to count — let the script do it.
