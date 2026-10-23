from markupsafe import Markup
from fastapi.templating import Jinja2Templates

templates = Jinja2Templates(directory="app/templates")


def embed_json(value) -> Markup:
    """JSON text safe to place inside a <script> tag. Escapes < so the HTML parser cannot close the tag."""
    raw = value if isinstance(value, str) and value else "{}"
    safe = (
        raw.replace("&", "\\u0026")
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )
    return Markup(safe)


templates.env.filters["embed_json"] = embed_json
