"""Seed Crapper Keeper with sample notebooks, sections, and pages."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.dependencies import get_session, get_engine
from app.models import Notebook, Section, SectionGroup, Page
from app.utils.prose_mirror import generate_derived

import json

def seed():
    get_engine()  # triggers PRAGMA
    db = get_session()

    try:
        # ── Notebook 1: Personal ──────────────────────────────────────────
        nb = Notebook(title="My Notes", color="#5B9BD5", position=0)
        db.add(nb)
        db.flush()

        # Sections
        s1 = Section(notebook_id=nb.id, title="Quick Notes", color="#5B9BD5", position=0)
        s2 = Section(notebook_id=nb.id, title="Ideas", color="#E57373", position=1)
        db.add_all([s1, s2])
        db.flush()

        # Pages for Quick Notes
        content1 = {
            "type": "doc",
            "content": [{
                "type": "paragraph",
                "content": [{"type": "text", "text": "Welcome to Crapper Keeper! This is your first page. Start typing to take notes."}]
            }]
        }
        html1, plain1 = generate_derived(content1)
        p1 = Page(section_id=s1.id, title="Getting Started", content_json=json.dumps(content1),
                  content_html=html1, content_plain=plain1, position=0, tree_path="0000")
        db.add(p1)

        content2 = {
            "type": "doc",
            "content": [{
                "type": "paragraph",
                "content": [{"type": "text", "text": "Jot down anything here — grocery lists, random thoughts, meeting notes."}]
            }]
        }
        html2, plain2 = generate_derived(content2)
        p2 = Page(section_id=s1.id, title="Quick Scratchpad", content_json=json.dumps(content2),
                  content_html=html2, content_plain=plain2, position=1, tree_path="0001")
        db.add(p2)

        # Pages for Ideas
        content3 = {
            "type": "doc",
            "content": [{
                "type": "paragraph",
                "content": [{"type": "text", "text": "Project ideas, business ideas, app ideas — all go here."}]
            }]
        }
        html3, plain3 = generate_derived(content3)
        p3 = Page(section_id=s2.id, title="Brainstorms", content_json=json.dumps(content3),
                  content_html=html3, content_plain=plain3, position=0, tree_path="0000")
        db.add(p3)

        # ── Notebook 2: Work ──────────────────────────────────────────────
        nb2 = Notebook(title="Work", color="#81C784", position=1)
        db.add(nb2)
        db.flush()

        # Section Group
        sg = SectionGroup(notebook_id=nb2.id, title="Project Alpha", position=0)
        db.add(sg)
        db.flush()

        s3 = Section(notebook_id=nb2.id, section_group_id=sg.id, title="Meetings", color="#81C784", position=0)
        s4 = Section(notebook_id=nb2.id, section_group_id=sg.id, title="Design", color="#FFB74D", position=1)
        s5 = Section(notebook_id=nb2.id, title="Misc", color="#9575CD", position=1)
        db.add_all([s3, s4, s5])
        db.flush()

        # Standup page
        content4 = {
            "type": "doc",
            "content": [
                {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Daily Standup"}]},
                {"type": "paragraph", "content": [{"type": "text", "text": "What I did yesterday: "}]},
                {"type": "bulletList", "content": [
                    {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Designed new landing page"}]}]},
                    {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Fixed auth bug in API"}]}]}
                ]}
            ]
        }
        html4, plain4 = generate_derived(content4)
        p4 = Page(section_id=s3.id, title="Standup Notes", content_json=json.dumps(content4),
                  content_html=html4, content_plain=plain4, position=0, tree_path="0000")
        db.add(p4)

        db.commit()
        print("Seed complete! Created 2 notebooks, 5 sections, 1 section group, 4 pages.")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
