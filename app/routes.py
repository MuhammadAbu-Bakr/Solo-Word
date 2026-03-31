from flask import Blueprint, render_template, request, jsonify, send_file
import os
import uuid
import json
from gtts import gTTS

main_bp = Blueprint('main', __name__)


LANGUAGE_MAP = {
    'en-US': 'en',
    'en-GB': 'en',
    'es-ES': 'es',
    'fr-FR': 'fr',
    'de-DE': 'de',
    'it-IT': 'it',
    'pt-BR': 'pt',
    'ja-JP': 'ja',
    'ko-KR': 'ko',
    'zh-CN': 'zh-CN',
    'hi-IN': 'hi',
    'ru-RU': 'ru',
    'ar-SA': 'ar'
}

@main_bp.route('/')
def index():
    """Serve the main page"""
    return render_template('index.html')

@main_bp.route('/synthesize', methods=['POST'])
def synthesize():
    """
    Generate audio from text using gTTS
    Expects JSON: {
        "text": "string",
        "language_code": "en-US",
        "voice_style": "default",
        "pitch": 1.0,
        "rate": 1.0
    }
    """
    try:
        data = request.json
        
        # Get parameters
        text = data.get('text', '').strip()
        language_code = data.get('language_code', 'en-US')
        voice_style = data.get('voice_style', 'default')
        pitch = data.get('pitch', 1.0)
        rate = data.get('rate', 1.0)
        
        # Validate text
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
       
        lang = LANGUAGE_MAP.get(language_code, 'en')
        
       
        tts = gTTS(text=text, lang=lang, slow=False)
        
        
        filename = f"speech_{uuid.uuid4().hex}.mp3"
        filepath = os.path.join(os.path.dirname(__file__), 'instance', filename)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        tts.save(filepath)
        
       
        return send_file(
            filepath,
            as_attachment=True,
            download_name=f"voice_output_{uuid.uuid4().hex[:8]}.mp3",
            mimetype='audio/mpeg'
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main_bp.route('/api/voices', methods=['GET'])
def get_voices():
    """Returns available voice information"""
    voices = [
        {'id': 'default', 'name': 'Default', 'gender': 'neutral'},
        {'id': 'female', 'name': 'Female Voice', 'gender': 'female'},
        {'id': 'male', 'name': 'Male Voice', 'gender': 'male'},
        {'id': 'expressive', 'name': 'Expressive', 'gender': 'neutral'},
        {'id': 'calm', 'name': 'Calm & Soft', 'gender': 'neutral'}
    ]
    return jsonify(voices)

@main_bp.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'message': 'Text to Voice API is running'})