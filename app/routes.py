import logging
import os
import re
import tempfile
import unicodedata
import uuid
from functools import wraps
from typing import Any

from flask import Blueprint, current_app, jsonify, render_template, request, send_file

try:
    from gtts import gTTS
    GTTS_AVAILABLE = True
except ImportError:
    GTTS_AVAILABLE = False

try:
    from deep_translator import GoogleTranslator
    TRANSLATOR_AVAILABLE = True
except ImportError:
    TRANSLATOR_AVAILABLE = False

logger = logging.getLogger(__name__)

main_bp = Blueprint('main', __name__)




GTTS_LANG_MAP: dict[str, str] = {
    'default': 'en',
    'en-US':   'en',
    'en-GB':   'en',
    'es-ES':   'es',
    'fr-FR':   'fr',
    'de-DE':   'de',
    'it-IT':   'it',
    'pt-BR':   'pt',      
    'ja-JP':   'ja',
    'ko-KR':   'ko',
    'zh-CN':   'zh-CN',
    'hi-IN':   'hi',
    'ru-RU':   'ru',
    'ar-SA':   'ar',
}


GTTS_TLD_MAP: dict[str, str] = {
    'default': 'com',
    'en-US':   'com',
    'en-GB':   'co.uk',
    'es-ES':   'es',
    'fr-FR':   'fr',
    'de-DE':   'de',
    'it-IT':   'it',
    'pt-BR':   'com.br',
    'ja-JP':   'co.jp',
    'ko-KR':   'co.kr',
    'zh-CN':   'com',
    'hi-IN':   'co.in',
    'ru-RU':   'ru',
    'ar-SA':   'com',
}


TRANSLATE_LANG_MAP: dict[str, str] = {
    'default': 'en',
    'en-US':   'en',
    'en-GB':   'en',
    'es-ES':   'es',
    'fr-FR':   'fr',
    'de-DE':   'de',
    'it-IT':   'it',
    'pt-BR':   'pt',
    'ja-JP':   'ja',
    'ko-KR':   'ko',
    'zh-CN':   'zh-CN',
    'hi-IN':   'hi',
    'ru-RU':   'ru',
    'ar-SA':   'ar',
}

VALID_VOICE_STYLES: frozenset[str] = frozenset(
    {'default', 'female', 'male', 'expressive', 'calm'}
)

PITCH_MIN, PITCH_MAX = 0.5, 2.0
RATE_MIN,  RATE_MAX  = 0.5, 2.0



def _error(message: str, status: int = 400) -> tuple[Any, int]:
    return jsonify({'error': message}), status


def _sanitize_text(raw: str, max_len: int) -> str:
    text = unicodedata.normalize('NFC', raw)
    text = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]', '', text)
    return text[:max_len].strip()


def _validate_float(value: Any, min_val: float, max_val: float, default: float) -> float:
    try:
        n = float(value)
        return round(min(max(n, min_val), max_val), 3)
    except (TypeError, ValueError):
        return default


def _cleanup_file(path: str) -> None:
    try:
        os.remove(path)
    except OSError as exc:
        logger.warning("Could not delete temp file %s: %s", path, exc)


def _translate(text: str, target_lang_code: str) -> tuple[str, bool]:
    """
    Translate text into target language using deep-translator.
    Returns (translated_text, was_translated).
    Falls back to original text if translation fails or target is English.
    """
    target = TRANSLATE_LANG_MAP.get(target_lang_code, 'en')

    
    if target == 'en':
        return text, False

    if not TRANSLATOR_AVAILABLE:
        logger.warning("deep-translator not installed — skipping translation")
        return text, False

    try:
        translated = GoogleTranslator(source='auto', target=target).translate(text)
        if translated and translated.strip():
            logger.info("Translated to %s: %r → %r", target, text[:40], translated[:40])
            return translated.strip(), True
        return text, False
    except Exception as exc:
        logger.warning("Translation failed (lang=%s): %s", target, exc)
        return text, False


def require_json(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not request.is_json:
            return _error("Content-Type must be application/json", 415)
        return f(*args, **kwargs)
    return decorated




@main_bp.route('/')
def index():
    return render_template('index.html')


@main_bp.route('/synthesize', methods=['POST'])
@require_json
def synthesize():
    """
    1. Validate & sanitize all inputs
    2. Translate text into the selected language
    3. Synthesize translated text with gTTS (correct lang + TLD accent)
    4. Stream MP3 back; delete temp file after response closes
    """
    if not GTTS_AVAILABLE:
        logger.error("gTTS is not installed")
        return _error("Text-to-speech service is unavailable.", 503)

    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return _error("Invalid JSON body.")


    raw_text = data.get('text', '')
    if not isinstance(raw_text, str):
        return _error("'text' must be a string.")

    max_len: int = current_app.config.get('TTS_MAX_TEXT_LENGTH', 500)
    text = _sanitize_text(raw_text, max_len)
    if not text:
        return _error("'text' is required and must not be empty.")

  
    raw_lang = data.get('language_code', 'default')
    if not isinstance(raw_lang, str) or raw_lang not in GTTS_LANG_MAP:
        logger.warning("Invalid language_code: %r — using default", raw_lang)
        raw_lang = 'default'

    gtts_lang = GTTS_LANG_MAP[raw_lang]
    gtts_tld  = GTTS_TLD_MAP[raw_lang]


    raw_style = data.get('voice_style', 'default')
    if not isinstance(raw_style, str) or raw_style not in VALID_VOICE_STYLES:
        raw_style = 'default'

    use_slow = (raw_style == 'calm')


    _pitch = _validate_float(data.get('pitch', 1.0),
                             current_app.config.get('TTS_PITCH_MIN', PITCH_MIN),
                             current_app.config.get('TTS_PITCH_MAX', PITCH_MAX), 1.0)
    _rate  = _validate_float(data.get('rate',  1.0),
                             current_app.config.get('TTS_RATE_MIN', RATE_MIN),
                             current_app.config.get('TTS_RATE_MAX', RATE_MAX), 1.0)


    speech_text, was_translated = _translate(text, raw_lang)


    audio_folder: str = current_app.config['AUDIO_FOLDER']
    tmp_path: str | None = None

    try:
        with tempfile.NamedTemporaryFile(
            dir=audio_folder, prefix='tts_', suffix='.mp3', delete=False
        ) as tmp:
            tmp_path = tmp.name

        tts = gTTS(text=speech_text, lang=gtts_lang, tld=gtts_tld, slow=use_slow)
        tts.save(tmp_path)

        logger.info(
            "Synthesized | lang=%s tld=%s slow=%s translated=%s | %d chars",
            gtts_lang, gtts_tld, use_slow, was_translated, len(speech_text)
        )

        response = send_file(
            tmp_path,
            mimetype='audio/mpeg',
            as_attachment=True,
            download_name=f"tts_{uuid.uuid4().hex[:8]}.mp3",
        )

        @response.call_on_close
        def _remove_tmp():
            _cleanup_file(tmp_path)

        return response

    except Exception as exc:
        if tmp_path:
            _cleanup_file(tmp_path)
        logger.exception("Synthesis failed: %s", exc)
        return _error("Speech synthesis failed. Please try again.", 500)


@main_bp.route('/translate', methods=['POST'])
@require_json
def translate_only():
    """
    Translate text and return it as JSON — used by the frontend
    to show the user what text will actually be spoken before download.

    Request:  { "text": "...", "language_code": "es-ES" }
    Response: { "translated": "...", "was_translated": true, "target_lang": "es" }
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return _error("Invalid JSON body.")

    raw_text = data.get('text', '')
    if not isinstance(raw_text, str) or not raw_text.strip():
        return _error("'text' is required.")

    max_len: int = current_app.config.get('TTS_MAX_TEXT_LENGTH', 500)
    text = _sanitize_text(raw_text, max_len)

    raw_lang = data.get('language_code', 'default')
    if not isinstance(raw_lang, str) or raw_lang not in TRANSLATE_LANG_MAP:
        raw_lang = 'default'

    translated, was_translated = _translate(text, raw_lang)

    return jsonify({
        'translated':     translated,
        'was_translated': was_translated,
        'target_lang':    TRANSLATE_LANG_MAP.get(raw_lang, 'en'),
    })


@main_bp.route('/api/voices', methods=['GET'])
def get_voices():
    languages = [
        {'code': code, 'gtts_lang': GTTS_LANG_MAP[code], 'tld': GTTS_TLD_MAP[code]}
        for code in GTTS_LANG_MAP if code != 'default'
    ]
    return jsonify({
        'languages': languages,
        'styles': [
            {'id': 'default',    'label': 'Default',     'gtts_effect': 'normal speed'},
            {'id': 'calm',       'label': 'Calm & Soft', 'gtts_effect': 'slow speech'},
            {'id': 'female',     'label': 'Female',      'gtts_effect': 'browser only'},
            {'id': 'male',       'label': 'Male',        'gtts_effect': 'browser only'},
            {'id': 'expressive', 'label': 'Expressive',  'gtts_effect': 'browser only'},
        ],
        'translation_available': TRANSLATOR_AVAILABLE,
    })


@main_bp.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status':                 'ok',
        'tts_backend':            'gtts' if GTTS_AVAILABLE else 'unavailable',
        'translation_available':  TRANSLATOR_AVAILABLE,
    })