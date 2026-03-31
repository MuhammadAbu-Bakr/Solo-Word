from flask import Flask
from config import config
import os

def create_app(config_name='default'):
    """Application factory function"""
    app = Flask(__name__)
    
   
    app.config.from_object(config[config_name])
    
   
    os.makedirs(app.instance_path, exist_ok=True)
    
   
    from app.routes import main_bp
    app.register_blueprint(main_bp)
    
    return app