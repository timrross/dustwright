#!/usr/bin/env python3
"""Extracts a structure saved with `/structure save <name> ... disk` from a Bedrock world's LevelDB.

    python3 -m venv .venv && .venv/bin/pip install amulet-leveldb
    docker compose stop    # the database must be closed; work on a copy if the server must keep running
    .venv/bin/python deploy/test-world/extract-structure.py data/worlds/dustwright-test/db dustwright:roundtrip out.mcstructure

The value stored under `structuretemplate_<name>` is the same little-endian NBT as a `.mcstructure` file, so the
output feeds compare-structure.mjs directly. amulet-leveldb reads Mojang's LevelDB variant (zlib-raw blocks); it
is a verification tool only, never a project dependency.
"""
import sys

import leveldb  # amulet-leveldb


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    db_path, name, out = sys.argv[1:]
    db = leveldb.LevelDB(db_path)
    key = f"structuretemplate_{name}".encode()
    data = db.get(key)
    with open(out, "wb") as f:
        f.write(data)
    print(f"wrote {out} ({len(data)} bytes) from {key.decode()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
