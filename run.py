import os
from app import create_app


env = os.environ.get('ENV', 'development').lower()

app = create_app(config_name=env)

if __name__ == '__main__':
    host = os.environ.get('HOST', '127.0.0.1')
    try:
        port = int(os.environ.get('PORT', '5000'))
    except ValueError:
        port = 5000

    app.run(host=host, port=port)