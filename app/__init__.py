import logging
import os
import sys

from flask import Flask
from config import config


def create_app(config_name: str = 'default') -> Flask:
    """
    Create and configure the Flask application.

    Args:
        config_name: One of 'development', 'production', 'testing', 'default'.

    Returns:
        Configured Flask app instance.
    """

    app = Flask(__name__, instance_relative_config=True)

    cfg_class = config.get(config_name, config['default'])
    app.config.from_object(cfg_class)

    if config_name == 'production' and hasattr(cfg_class, 'validate'):
        cfg_class.validate()


    is_vercel = os.environ.get("VERCEL") == "1"

    if is_vercel:
       
        app.config['AUDIO_FOLDER'] = None
    else:
        
        audio_folder = os.path.join(app.instance_path, 'audio_tmp')
        os.makedirs(audio_folder, exist_ok=True)
        app.config['AUDIO_FOLDER'] = audio_folder

    _configure_logging(app)


    from app.routes import main_bp
    app.register_blueprint(main_bp)

    app.logger.info(
        "App created | env=%s | audio_folder=%s",
        config_name,
        app.config.get("AUDIO_FOLDER"),
    )

    return app


def _configure_logging(app: Flask) -> None:
    """Set up structured logging for the application."""

    level = logging.DEBUG if app.config.get('DEBUG') else logging.INFO

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    handler.setFormatter(logging.Formatter(
        '[%(asctime)s] %(levelname)s %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    ))

    # Replace default Flask logger handlers
    app.logger.handlers.clear()
    app.logger.addHandler(handler)
    app.logger.setLevel(level)
    app.logger.propagate = False