from jinja2 import Environment, PackageLoader, select_autoescape
from fastapi.templating import Jinja2Templates

templates = Jinja2Templates(directory="app/templates")
