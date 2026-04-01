'use strict';


const textInput        = document.getElementById('textInput');
const languageSelect   = document.getElementById('languageSelect');
const voiceStyleSelect = document.getElementById('voiceStyleSelect');
const pitchSlider      = document.getElementById('pitchSlider');
const rateSlider       = document.getElementById('rateSlider');
const pitchValue       = document.getElementById('pitchValue');
const rateValue        = document.getElementById('rateValue');
const speakBtn         = document.getElementById('speakBtn');
const stopBtn          = document.getElementById('stopBtn');
const downloadBtn      = document.getElementById('downloadBtn');
const statusDiv        = document.getElementById('statusMessage');
const charCounter      = document.getElementById('charCounter');
const waveform         = document.getElementById('waveform');
const translationBox   = document.getElementById('translationBox');
const translationText  = document.getElementById('translationText');


const MAX_TEXT_LEN = 500;
const PITCH_MIN = 0.5, PITCH_MAX = 2.0;
const RATE_MIN  = 0.5, RATE_MAX  = 2.0;

const VALID_LANG_CODES = new Set([
    'default','en-US','en-GB','es-ES','fr-FR','de-DE',
    'it-IT','pt-BR','ja-JP','ko-KR','zh-CN','hi-IN','ru-RU','ar-SA'
]);
const VALID_STYLES = new Set(['default','female','male','expressive','calm']);

const synth = window.speechSynthesis;
let currentUtterance = null;
let availableVoices   = [];
let isDownloading     = false;
let translateDebounce = null;


function sanitizeText(raw) {
    return raw.slice(0, MAX_TEXT_LEN)
              .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
              .trim();
}
function clamp(val, min, max) {
    const n = parseFloat(val);
    return isNaN(n) ? min : Math.min(Math.max(n, min), max);
}
function safeLang(v)  { return VALID_LANG_CODES.has(v) ? v : 'default'; }
function safeStyle(v) { return VALID_STYLES.has(v)     ? v : 'default'; }


function setStatus(msg, type = 'default') {
    statusDiv.textContent = msg;
    statusDiv.className = 'status';
    if (type !== 'default') statusDiv.classList.add(type);
}


function startWaveform() { waveform.classList.add('speaking'); }
function stopWaveform()  { waveform.classList.remove('speaking'); }


function updateCharCounter() {
    const len = textInput.value.length;
    charCounter.textContent = `${len} / ${MAX_TEXT_LEN}`;
    charCounter.classList.remove('warning', 'danger');
    if      (len >= MAX_TEXT_LEN)           charCounter.classList.add('danger');
    else if (len >= MAX_TEXT_LEN * 0.8)     charCounter.classList.add('warning');
}


function hideTranslation() {
    translationBox.style.display = 'none';
    translationText.textContent  = '';
}

function showTranslation(text) {
    translationText.textContent = text;
    translationBox.style.display = 'block';
}

async function fetchTranslation(text, langCode) {
   
    if (langCode === 'default' || langCode === 'en-US' || langCode === 'en-GB') {
        hideTranslation();
        return null;
    }
    if (!text) { hideTranslation(); return null; }

    try {
        const res = await fetch('/translate', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ text, language_code: langCode }),
        });
        if (!res.ok) { hideTranslation(); return null; }
        const data = await res.json();
        if (data.was_translated && data.translated) {
            showTranslation(data.translated);
            return data.translated;
        }
    } catch (_) { /* network error — silent */ }
    hideTranslation();
    return null;
}

function scheduleTranslationPreview() {
    clearTimeout(translateDebounce);
    const text = sanitizeText(textInput.value);
    const lang = safeLang(languageSelect.value);
    if (!text || lang === 'default' || lang === 'en-US' || lang === 'en-GB') {
        hideTranslation();
        return;
    }
    translateDebounce = setTimeout(() => fetchTranslation(text, lang), 600);
}


function loadVoices() {
    return new Promise(resolve => {
        const voices = synth.getVoices();
        if (voices.length) { availableVoices = voices; return resolve(voices); }
        synth.addEventListener('voiceschanged', function handler() {
            synth.removeEventListener('voiceschanged', handler);
            availableVoices = synth.getVoices();
            resolve(availableVoices);
        });
    });
}

function findBestVoice(langCode, style) {
    if (!availableVoices.length) return null;
    let pool = [...availableVoices];

    if (langCode && langCode !== 'default') {
        const byLang = pool.filter(v => v.lang.startsWith(langCode.split('-')[0]));
        if (byLang.length) pool = byLang;
    }

   
    const terms = {
        female:     ['female','samantha','victoria','karen','tessa','moira','zira'],
        male:       ['male','daniel','alex','fred','jorge','david','mark'],
        expressive: ['expressive','lively','samantha'],
        calm:       ['calm','soft','natural','serena'],
    }[style];

    if (terms) {
        const matched = pool.filter(v => terms.some(t => v.name.toLowerCase().includes(t)));
        if (matched.length) return matched[0];
    }
    return pool[0] ?? null;
}

function stopSpeaking() {
    if (synth.speaking || synth.pending) synth.cancel();
    currentUtterance = null;
    stopWaveform();
    setStatus('Stopped');
}


async function speakText() {
    const rawText = sanitizeText(textInput.value);
    if (!rawText) { setStatus('Please enter some text first.', 'error'); textInput.focus(); return; }

    stopSpeaking();

    const langCode  = safeLang(languageSelect.value);
    const stylePref = safeStyle(voiceStyleSelect.value);
    const pitch     = clamp(pitchSlider.value, PITCH_MIN, PITCH_MAX);
    const rate      = clamp(rateSlider.value,  RATE_MIN,  RATE_MAX);

    setStatus('Translating…', 'loading');

    const translated = await fetchTranslation(rawText, langCode);
    const speechText = translated || rawText;

    if (!availableVoices.length) await loadVoices();

    const utterance = new SpeechSynthesisUtterance(speechText);

 
    if (langCode !== 'default') {
        utterance.lang = langCode;
    }
    utterance.pitch = pitch;
    utterance.rate  = rate;

    const voice = findBestVoice(langCode !== 'default' ? langCode : null, stylePref);
    if (voice) {
        utterance.voice = voice;
        setStatus(`Speaking · ${voice.name}`);
    } else {
        setStatus('Speaking…');
    }

    utterance.onstart = () => { startWaveform(); setStatus('Speaking…', 'loading'); };
    utterance.onend   = () => { stopWaveform();  setStatus('Finished.', 'success'); currentUtterance = null; };
    utterance.onerror = e  => {
        stopWaveform();
        console.error('SpeechSynthesisUtterance error:', e.error);
        setStatus(`Error: ${e.error || 'Speech synthesis failed'}`, 'error');
        currentUtterance = null;
    };

    currentUtterance = utterance;
    synth.speak(utterance);
}


async function downloadAudio() {
    if (isDownloading) return;

    const text = sanitizeText(textInput.value);
    if (!text) { setStatus('Please enter text before downloading.', 'error'); textInput.focus(); return; }

    isDownloading = true;
    downloadBtn.disabled = true;
    setStatus('Translating & generating MP3…', 'loading');
    startWaveform();

    try {
        const res = await fetch('/synthesize', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                language_code: safeLang(languageSelect.value),
                voice_style:   safeStyle(voiceStyleSelect.value),
                pitch: clamp(pitchSlider.value, PITCH_MIN, PITCH_MAX),
                rate:  clamp(rateSlider.value,  RATE_MIN,  RATE_MAX),
            }),
        });

        if (!res.ok) {
            let msg = 'Server error. Please try again.';
            try { const e = await res.json(); if (typeof e.error === 'string') msg = e.error; } catch (_) {}
            throw new Error(msg);
        }

        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `tts_${Date.now()}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10_000);

        setStatus('MP3 downloaded!', 'success');

    } catch (err) {
        console.error('Download error:', err);
        setStatus(err.message || 'Download failed.', 'error');
    } finally {
        stopWaveform();
        isDownloading        = false;
        downloadBtn.disabled = false;
    }
}


function updateSliderDisplay(slider, outputEl) {
    const val = clamp(slider.value, parseFloat(slider.min), parseFloat(slider.max));
    outputEl.textContent = val.toFixed(2);
    slider.setAttribute('aria-valuenow', val.toFixed(2));
}


speakBtn.addEventListener('click',    speakText);
stopBtn.addEventListener('click',     stopSpeaking);
downloadBtn.addEventListener('click', downloadAudio);

pitchSlider.addEventListener('input', () => updateSliderDisplay(pitchSlider, pitchValue));
rateSlider.addEventListener('input',  () => updateSliderDisplay(rateSlider,  rateValue));

textInput.addEventListener('input', () => {
    updateCharCounter();
    scheduleTranslationPreview();
});

languageSelect.addEventListener('change', scheduleTranslationPreview);

textInput.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); speakText(); }
});


(async () => {
    try {
        await loadVoices();
        setStatus('Ready — select options and click Speak', 'success');
    } catch { setStatus('Ready — voices will load on first use'); }
    updateCharCounter();
    textInput.focus();
})();