#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Celeste BinaryPacker (.bin) → intermediate room JSON

Parity with maddievision/Celestial celeste_map.rb BinaryPacker read path
(CELESTE MAP + string table + element tree). Local authorized installs only.

Does NOT copy or publish official map binaries. Output goes under data/ (gitignore).

Usage:
  python bin_to_intermediate.py --maps "S:/Steam/steamapps/common/Celeste/Content/Maps" \\
    --out examples/celeste-import/data/intermediate \\
    --maps-filter 0-Intro,1-ForsakenCity \\
    --rooms-per-map 8
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path
from typing import Any


class BinReader:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0

    def remaining(self) -> int:
        return len(self.data) - self.pos

    def read_byte(self) -> int:
        if self.pos >= len(self.data):
            raise EOFError(f"read_byte at {self.pos}")
        b = self.data[self.pos]
        self.pos += 1
        return b

    def read_bool(self) -> bool:
        return self.read_byte() != 0

    def read_u16_le(self) -> int:
        if self.pos + 2 > len(self.data):
            raise EOFError(f"read_u16 at {self.pos}")
        v = struct.unpack_from("<H", self.data, self.pos)[0]
        self.pos += 2
        return v

    def read_s16_le(self) -> int:
        if self.pos + 2 > len(self.data):
            raise EOFError(f"read_s16 at {self.pos}")
        v = struct.unpack_from("<h", self.data, self.pos)[0]
        self.pos += 2
        return v

    def read_s32_le(self) -> int:
        if self.pos + 4 > len(self.data):
            raise EOFError(f"read_s32 at {self.pos}")
        v = struct.unpack_from("<i", self.data, self.pos)[0]
        self.pos += 4
        return v

    def read_f32_le(self) -> float:
        if self.pos + 4 > len(self.data):
            raise EOFError(f"read_f32 at {self.pos}")
        v = struct.unpack_from("<f", self.data, self.pos)[0]
        self.pos += 4
        return v

    def read_varlen_le(self) -> int:
        """7-bit little-endian varint (matches Celestial / .NET style lengths)."""
        result = 0
        shift = 0
        while True:
            b = self.read_byte()
            result |= (b & 0x7F) << shift
            if (b & 0x80) == 0:
                return result
            shift += 7
            if shift > 35:
                raise ValueError("varlen too long")

    def read_str_varlen(self) -> str:
        n = self.read_varlen_le()
        if self.pos + n > len(self.data):
            raise EOFError(f"read_str n={n} at {self.pos}")
        s = self.data[self.pos : self.pos + n].decode("utf-8", errors="replace")
        self.pos += n
        return s


def read_element(rom: BinReader, lookup: list[str]) -> dict[str, Any]:
    name_idx = rom.read_u16_le()
    if name_idx >= len(lookup):
        raise IndexError(f"name index {name_idx} >= lookup {len(lookup)}")
    name = lookup[name_idx]
    attrs: dict[str, Any] = {}
    attr_types: dict[str, str] = {}
    for _ in range(rom.read_byte()):
        key_idx = rom.read_u16_le()
        key = lookup[key_idx]
        vt = rom.read_byte()
        if vt == 0:
            value: Any = rom.read_bool()
            value_type = "boolean"
        elif vt == 1:
            value = rom.read_byte()
            value_type = "u8"
        elif vt == 2:
            value = rom.read_s16_le()
            value_type = "s16"
        elif vt == 3:
            value = rom.read_s32_le()
            value_type = "s32"
        elif vt == 4:
            value = rom.read_f32_le()
            value_type = "float"
        elif vt == 5:
            value = lookup[rom.read_u16_le()]
            value_type = "lookup"
        elif vt == 6:
            count = rom.read_varlen_le()
            value = list(rom.data[rom.pos : rom.pos + count])
            rom.pos += count
            value_type = "bin"
        elif vt == 7:
            count = rom.read_u16_le()
            end = rom.pos + count
            bin_bytes: list[int] = []
            while rom.pos < end:
                num = rom.read_byte()
                val = rom.read_byte()
                bin_bytes.extend([val] * num)
            value = bin_bytes
            value_type = "rle"
        else:
            raise ValueError(f"unknown value type {vt} for key {key}")
        attrs[key] = value
        attr_types[key] = value_type
    children = [read_element(rom, lookup) for _ in range(rom.read_u16_le())]
    return {
        "name": name,
        "attributes": attrs,
        "attribute_types": attr_types,
        "children": children,
    }


def parse_map_bin(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    rom = BinReader(data)
    magic = rom.read_str_varlen()
    if magic != "CELESTE MAP":
        raise ValueError(f"{path}: bad magic {magic!r}")
    package = rom.read_str_varlen()
    n_lookup = rom.read_u16_le()
    lookup = [rom.read_str_varlen() for _ in range(n_lookup)]
    root = read_element(rom, lookup)
    root["package"] = package
    return {
        "type": "CELESTE MAP",
        "package": package,
        "root": root,
        "sourceFile": path.name,
    }


def rle_chars_to_solids_rows(rle_bytes: list[int]) -> list[str]:
    """Decode solids/bg innerText RLE char codes → row strings (\\n = 10)."""
    if not rle_bytes:
        return []
    text = bytes(rle_bytes).decode("latin-1", errors="replace")
    # Split on newline; drop trailing empty from final \\n
    rows = text.split("\n")
    if rows and rows[-1] == "":
        rows.pop()
    # Normalize: space → '0' for intermediate air convention
    out = []
    for row in rows:
        chars = []
        for ch in row:
            if ch in (" ", "\0"):
                chars.append("0")
            else:
                chars.append(ch if ch != "0" else "0")
        out.append("".join(chars))
    return out


def find_children(el: dict[str, Any], name: str) -> list[dict[str, Any]]:
    return [c for c in el.get("children", []) if c.get("name") == name]


def find_child(el: dict[str, Any], name: str) -> dict[str, Any] | None:
    for c in el.get("children", []):
        if c.get("name") == name:
            return c
    return None


def extract_rooms(parsed: dict[str, Any], max_rooms: int | None = None) -> list[dict[str, Any]]:
    package = parsed["package"]
    root = parsed["root"]
    levels_el = find_child(root, "levels")
    if not levels_el:
        # some maps nest differently; walk for level
        levels = []
        stack = [root]
        while stack:
            cur = stack.pop()
            if cur.get("name") == "level":
                levels.append(cur)
            stack.extend(cur.get("children") or [])
    else:
        levels = find_children(levels_el, "level")

    rooms: list[dict[str, Any]] = []
    for level in levels:
        attrs = level.get("attributes") or {}
        room_name = str(attrs.get("name") or "unnamed")
        width = int(attrs.get("width") or 0)
        height = int(attrs.get("height") or 0)

        solids_rows: list[str] = []
        solids_el = find_child(level, "solids")
        if solids_el:
            inner = (solids_el.get("attributes") or {}).get("innerText")
            if isinstance(inner, list):
                solids_rows = rle_chars_to_solids_rows(inner)

        # width/height in Celeste level attrs are often in pixels
        width_tiles = width // 8 if width >= 8 else width
        height_tiles = height // 8 if height >= 8 else height
        if solids_rows:
            width_tiles = max(width_tiles, max(len(r) for r in solids_rows))
            height_tiles = max(height_tiles, len(solids_rows))
            # pad rows to width
            solids_rows = [r.ljust(width_tiles, "0")[:width_tiles] for r in solids_rows]
            while len(solids_rows) < height_tiles:
                solids_rows.append("0" * width_tiles)

        entities: list[dict[str, Any]] = []
        for group_name in ("entities", "triggers"):
            group = find_child(level, group_name)
            if not group:
                continue
            for ent in group.get("children") or []:
                ea = ent.get("attributes") or {}
                item = {
                    "name": ent.get("name") or "unknown",
                    "x": ea.get("x", 0),
                    "y": ea.get("y", 0),
                }
                if "width" in ea:
                    item["width"] = ea["width"]
                if "height" in ea:
                    item["height"] = ea["height"]
                # keep a few useful props without dumping everything huge
                for k in ("type", "direction", "pattern", "color"):
                    if k in ea:
                        item[k] = ea[k]
                entities.append(item)

        rooms.append(
            {
                "sourceMap": package,
                "sourceRoom": room_name,
                "side": "A",
                "widthTiles": width_tiles,
                "heightTiles": height_tiles,
                "solids": solids_rows,
                "entities": entities,
                "_note": "EXTRACTED_LOCAL_AUTHORIZED",
            }
        )
        if max_rooms is not None and len(rooms) >= max_rooms:
            break
    return rooms


def main() -> int:
    ap = argparse.ArgumentParser(description="Celeste .bin → intermediate room JSON")
    ap.add_argument("--maps", required=True, help="Content/Maps directory")
    ap.add_argument("--out", required=True, help="Output directory for intermediate JSON")
    ap.add_argument(
        "--maps-filter",
        default="",
        help="Comma-separated basenames without .bin (empty = all)",
    )
    ap.add_argument(
        "--rooms-per-map",
        type=int,
        default=0,
        help="Max rooms per map (0 = all)",
    )
    ap.add_argument(
        "--prefer-rooms",
        default="",
        help="Comma-separated room name substrings to prioritize (e.g. start,a-00,b-00)",
    )
    args = ap.parse_args()

    maps_dir = Path(args.maps)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not maps_dir.is_dir():
        print(f"ERROR: maps dir not found: {maps_dir}", file=sys.stderr)
        return 1

    filt = {s.strip() for s in args.maps_filter.split(",") if s.strip()}
    prefer = [s.strip() for s in args.prefer_rooms.split(",") if s.strip()]
    max_rooms = args.rooms_per_map if args.rooms_per_map > 0 else None

    bins = sorted(maps_dir.glob("*.bin"))
    if filt:
        bins = [b for b in bins if b.stem in filt]
    if not bins:
        print("ERROR: no .bin matched", file=sys.stderr)
        return 1

    total = 0
    index: list[dict[str, Any]] = []
    for bin_path in bins:
        try:
            parsed = parse_map_bin(bin_path)
        except Exception as e:
            print(f"FAIL {bin_path.name}: {e}", file=sys.stderr)
            continue
        rooms = extract_rooms(parsed, max_rooms=None)
        if prefer:
            def score(r: dict[str, Any]) -> tuple[int, str]:
                name = str(r.get("sourceRoom") or "")
                for i, p in enumerate(prefer):
                    if p.lower() in name.lower():
                        return (i, name)
                return (len(prefer) + 1, name)

            rooms = sorted(rooms, key=score)
        if max_rooms is not None:
            rooms = rooms[:max_rooms]

        for room in rooms:
            safe_map = str(room["sourceMap"]).replace("/", "_")
            safe_room = str(room["sourceRoom"]).replace("/", "_").replace("\\", "_")
            out_name = f"{safe_map}__{safe_room}.json"
            out_path = out_dir / out_name
            out_path.write_text(json.dumps(room, ensure_ascii=False, indent=2), encoding="utf-8")
            total += 1
            index.append(
                {
                    "file": out_name,
                    "sourceMap": room["sourceMap"],
                    "sourceRoom": room["sourceRoom"],
                    "widthTiles": room["widthTiles"],
                    "heightTiles": room["heightTiles"],
                    "entityCount": len(room.get("entities") or []),
                    "solidRows": len(room.get("solids") or []),
                }
            )
            print(f"OK {out_name}  {room['widthTiles']}x{room['heightTiles']}  ents={len(room.get('entities') or [])}")

    (out_dir / "_index.json").write_text(
        json.dumps({"count": total, "rooms": index}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {total} rooms → {out_dir}")
    return 0 if total else 2


if __name__ == "__main__":
    raise SystemExit(main())
