#!/usr/bin/env python3
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from export_ms3_adobe_packet_data import markdown_to_plain_text, split_markdown_sections


def test_markdown_to_plain_text_removes_embeds_and_simplifies_links():
    src = """# Orientation

Generated: 2026-06-27

<video src="media/day-in-the-life.mp4" controls></video>

Read the [Interview Guide](?page=pg_interview.md) before rounds.

- Ask directly about safety.
- Escalate early.

| Time | Task |
|---|---|
| AM | Rounds |
"""
    out = markdown_to_plain_text(src)

    assert "<video" not in out
    assert "Generated:" not in out
    assert "Interview Guide" in out
    assert "?page=" not in out
    assert "Ask directly about safety." in out
    assert "Time | Task" in out
    assert "AM | Rounds" in out


def test_split_markdown_sections_uses_h2_boundaries():
    src = """# MS3 Packet

Opening paragraph.

## Safety

Tell the resident now.

## Daily Rhythm

Rounds, interviews, notes.
"""
    sections = split_markdown_sections(src)

    assert [s.heading for s in sections] == ["Overview", "Safety", "Daily Rhythm"]
    assert sections[0].order == 1
    assert sections[0].body == "Opening paragraph."
    assert sections[1].body == "Tell the resident now."
    assert sections[2].body == "Rounds, interviews, notes."
