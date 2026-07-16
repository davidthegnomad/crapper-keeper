"""
Content conversion utilities: ProseMirror JSON ↔ HTML ↔ plain text.

Uses TipTap's HTML generation pattern: each ProseMirror node type maps
to an HTML tag with attributes. The schema follows TipTap's default
extensions (doc, paragraph, text, heading, bulletList, orderedList,
listItem, bold, italic, underline, strike, link, image, hardBreak).

content_json is authoritative — content_html and content_plain are derived.
"""

from __future__ import annotations

import json
import re
from typing import Any


# ── JSON → HTML ───────────────────────────────────────────────────────────────

def json_to_html(content_json: dict | str) -> str:
    """Convert ProseMirror JSON to HTML."""
    if isinstance(content_json, str):
        content_json = json.loads(content_json)
    doc = content_json.get("content", [])
    return "".join(_render_nodes(doc))


def _render_nodes(nodes: list) -> str:
    return "".join(_render_node(n) for n in nodes)


def _render_node(node: dict) -> str:
    ntype = node.get("type", "")
    attrs = node.get("attrs", {})
    content = node.get("content", [])
    marks = node.get("marks", [])
    text = node.get("text", "")

    # Text node
    if ntype == "text":
        t = _escape_html(text)
        for mark in marks:
            t = _apply_mark(t, mark)
        return t

    # Block nodes
    if ntype == "doc":
        return _render_nodes(content)

    if ntype == "paragraph":
        inner = _render_nodes(content) or "&#8203;"  # zero-width space for empty
        return f"<p>{inner}</p>"

    if ntype == "heading":
        level = attrs.get("level", 1)
        inner = _render_nodes(content)
        return f"<h{level}>{inner}</h{level}>"

    if ntype == "bulletList":
        inner = _render_nodes(content)
        return f"<ul>{inner}</ul>"

    if ntype == "orderedList":
        inner = _render_nodes(content)
        return f"<ol>{inner}</ol>"

    if ntype == "listItem":
        inner = _render_nodes(content)
        return f"<li>{inner}</li>"

    if ntype == "blockquote":
        inner = _render_nodes(content)
        return f"<blockquote>{inner}</blockquote>"

    if ntype == "codeBlock":
        inner = _render_nodes(content)
        lang = attrs.get("language", "")
        cls = f' class="language-{lang}"' if lang else ""
        return f"<pre><code{cls}>{inner}</code></pre>"

    if ntype == "horizontalRule":
        return "<hr>"

    if ntype == "hardBreak":
        return "<br>"

    if ntype == "image":
        src = attrs.get("src", "")
        alt = attrs.get("alt", "")
        title = attrs.get("title", "")
        title_attr = f' title="{_escape_html(title)}"' if title else ""
        return f'<img src="{_escape_html(src)}" alt="{_escape_html(alt)}"{title_attr}>'

    # Fallback
    return _render_nodes(content)


def _apply_mark(text: str, mark: dict) -> str:
    mtype = mark.get("type", "")
    if mtype == "bold":
        return f"<strong>{text}</strong>"
    if mtype == "italic":
        return f"<em>{text}</em>"
    if mtype == "underline":
        return f"<u>{text}</u>"
    if mtype == "strike":
        return f"<s>{text}</s>"
    if mtype == "code":
        return f"<code>{text}</code>"
    if mtype == "link":
        href = mark.get("attrs", {}).get("href", "")
        return f'<a href="{_escape_html(href)}">{text}</a>'
    if mtype == "highlight":
        return f"<mark>{text}</mark>"
    return text


def _escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


# ── HTML → Plain Text ─────────────────────────────────────────────────────────

_TAG_RE = re.compile(r"<[^>]+>")


def html_to_plain_text(html: str) -> str:
    """Strip HTML tags and whitespace-normalize for FTS indexing."""
    # Replace block-level tags with newlines
    text = re.sub(r"</?(?:p|div|h[1-6]|li|br|tr|blockquote|pre)[^>]*>", "\n", html)
    # Remove all remaining tags
    text = _TAG_RE.sub("", text)
    # Decode entities
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&#8203;", "")
    # Collapse whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" +", " ", text)
    return text.strip()


# ── Full pipeline ─────────────────────────────────────────────────────────────

def generate_derived(content_json: dict | str) -> tuple[str, str]:
    """Generate (content_html, content_plain) from content_json."""
    html = json_to_html(content_json)
    plain = html_to_plain_text(html)
    return html, plain
