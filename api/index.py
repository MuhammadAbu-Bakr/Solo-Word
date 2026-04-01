import os
import sys


sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from app import create_app

env = os.environ.get("ENV", "production").lower()

app = create_app(config_name=env)


handler = app