"""Regression tests for the 2026-10-23 review. Uses the temp DB from conftest."""

import json
import re

from app.dependencies import get_session
from app.models import Notebook, Page, Section


def _doc(text: str) -> str:
    return json.dumps({
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    })


def _last_id(response) -> int:
    return int(response.url.path.rstrip("/").split("/")[-1])


def _notebook_with_section(client, title: str):
    created = client.post("/notebooks/", data={"title": title})
    assert created.status_code == 200, created.text[:200]
    nb_id = _last_id(created)
    section = client.post(f"/notebooks/{nb_id}/sections/", data={"title": "Chapter"})
    assert section.status_code == 200, section.text[:200]
    return nb_id, _last_id(section)


def _page_id(section_id: int) -> int:
    db = get_session()
    try:
        page = db.query(Page).filter_by(section_id=section_id, parent_page_id=None).order_by(Page.id).first()
        assert page is not None
        return page.id
    finally:
        db.close()


def test_put_and_post_save_update_same_page(client):
    _nb, section_id = _notebook_with_section(client, "Save probe")
    page_id = _page_id(section_id)
    db = get_session()
    before = db.query(Page).count()
    db.close()

    put = client.put(f"/pages/{page_id}", json={"title": "Saved", "content_json": _doc("from-put")})
    assert put.status_code == 200
    db = get_session()
    page = db.query(Page).filter_by(id=page_id).one()
    assert "from-put" in (page.content_plain or "")
    db.close()

    post = client.post(f"/pages/{page_id}", json={"title": "Saved", "content_json": _doc("from-post")})
    assert post.status_code == 200
    assert post.json()["status"] == "saved"
    db = get_session()
    page = db.query(Page).filter_by(id=page_id).one()
    assert "from-post" in (page.content_plain or "")
    assert "from-put" not in (page.content_plain or "")
    assert db.query(Page).count() == before
    db.close()


def test_script_close_is_escaped_in_editor_json(client):
    _nb, section_id = _notebook_with_section(client, "Script probe")
    page_id = _page_id(section_id)
    body = "before </script><b>x</b> after"
    saved = client.put(f"/pages/{page_id}", json={"content_json": _doc(body)})
    assert saved.status_code == 200

    html = client.get(f"/pages/{page_id}").text
    match = re.search(
        r'<script id="page-content-json" type="application/json">(.*?)</script>',
        html,
        re.S,
    )
    assert match, "editor JSON script tag missing"
    raw = match.group(1)
    assert "</script>" not in raw
    assert "\\u003c" in raw
    parsed = json.loads(raw)
    assert body in parsed["content"][0]["content"][0]["text"]


def test_empty_notebook_name_is_inline_error(client):
    empty = client.post("/notebooks/", data={"title": "   "}, headers={"HX-Request": "true"})
    assert empty.status_code == 200
    assert "Name your notebook first." in empty.text
    assert "hx-redirect" not in {k.lower() for k in empty.headers}
    assert "<html" not in empty.text.lower()

    created = client.post(
        "/notebooks/",
        data={"title": "Named"},
        headers={"HX-Request": "true"},
        follow_redirects=False,
    )
    assert created.status_code == 200
    assert created.headers["hx-redirect"].startswith("/notebooks/")
    assert "<html" not in created.text.lower()
    nb_id = int(created.headers["hx-redirect"].rstrip("/").split("/")[-1])
    empty_section = client.post(
        f"/notebooks/{nb_id}/sections/",
        data={"title": "  "},
        headers={"HX-Request": "true"},
    )
    assert empty_section.status_code == 200
    assert "Name this section first." in empty_section.text


def test_search_quote_is_200_and_snippet_escapes_script(client):
    for q in ['"', "(", "foo:bar"]:
        found = client.get("/search", params={"q": q})
        assert found.status_code == 200, q

    _nb, section_id = _notebook_with_section(client, "Search probe")
    page_id = _page_id(section_id)
    text = "hello <script>alert(1)</script> there"
    saved = client.put(f"/pages/{page_id}", json={"title": "Danger", "content_json": _doc(text)})
    assert saved.status_code == 200

    found = client.get("/search", params={"q": "alert"})
    assert found.status_code == 200
    assert "<script>" not in found.text
    assert "&lt;script&gt;" in found.text


def test_delete_section_and_notebook(client):
    nb_id, section_id = _notebook_with_section(client, "Delete probe")
    parent_id = _page_id(section_id)
    child = client.post("/pages/", data={
        "section_id": section_id,
        "title": "Kid",
        "parent_page_id": parent_id,
    })
    assert child.status_code == 200
    child_id = _last_id(child)

    deleted = client.delete(f"/notebooks/{nb_id}/sections/{section_id}", follow_redirects=False)
    assert deleted.status_code in (200, 302)
    db = get_session()
    try:
        assert db.query(Section).filter_by(id=section_id).first() is None
        assert db.query(Page).filter_by(id=parent_id).first() is None
        assert db.query(Page).filter_by(id=child_id).first() is None
        assert db.query(Notebook).filter_by(id=nb_id).first() is not None
    finally:
        db.close()

    again = client.post(f"/notebooks/{nb_id}/sections/", data={"title": "Still here"})
    assert again.status_code == 200
    gone = client.delete(f"/notebooks/{nb_id}", follow_redirects=False)
    assert gone.status_code in (200, 302)
    db = get_session()
    try:
        assert db.query(Notebook).filter_by(id=nb_id).first() is None
        assert db.query(Section).filter_by(notebook_id=nb_id).count() == 0
        leftover = (
            db.query(Page)
            .join(Section, Page.section_id == Section.id)
            .filter(Section.notebook_id == nb_id)
            .count()
        )
        assert leftover == 0
    finally:
        db.close()


def test_reorder_pages_persists(client):
    _nb, section_id = _notebook_with_section(client, "Reorder probe")
    first = _page_id(section_id)
    second = client.post("/pages/", data={"section_id": section_id, "title": "Second"})
    assert second.status_code == 200
    second_id = _last_id(second)
    moved = client.post("/pages/reorder", json={"ids": [second_id, first]})
    assert moved.status_code == 200
    db = get_session()
    try:
        assert db.query(Page).filter_by(id=second_id).one().position == 0
        assert db.query(Page).filter_by(id=first).one().position == 1
    finally:
        db.close()
