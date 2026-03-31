// DOM elements
const textInput = document.getElementById('textInput');
const languageSelect = document.getElementById('languageSelect');
const voiceStyleSelect = document.getElementById('voiceStyleSelect');
const pitchSlider = document.getElementById('pitchSlider');
const rateSlider = document.getElementById('rateSlider');
const pitchValue = document.getElementById('pitchValue');
const rateValue = document.getElementById('rateValue');
const speakBtn = document.getElementById('speakBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusDiv = document.getElementById('statusMessage');

let speechSynth = window.speechSynthesis;
let currentUtterance = null;
let availableVoices = [];

function loadVoices() {
    return new Promise((resolve) => {
        let voices = speechSynth.getVoices();
        if (voices.length) {
            availableVoices = voices;
            resolve(voices);
        } else {
            speechSynth.onvoiceschanged = () => {
                availableVoices = speechSynth.getVoices();
                resolve(availableVoices);
            };
        }
    });
}

function findBestVoice(langCode, stylePreference) {
    if (!availableVoices.length) return null;
    
    let filtered = [...availableVoices];
    
    if (langCode && langCode !== 'default') {
        filtered = filtered.filter(voice => voice.lang.startsWith(langCode));
    }
    
    if (filtered.length === 0) {
        filtered = [...availableVoices];
    }
    
    
    let styleMatched = [...filtered];
    const style = stylePreference.toLowerCase();
    
    if (style === 'female') {
        styleMatched = filtered.filter(v => 
            v.name.toLowerCase().includes('female') || 
            v.name.toLowerCase().includes('samantha') || 
            v.name.toLowerCase().includes('victoria') ||
            (v.name.toLowerCase().includes('google') && v.name.toLowerCase().includes('female'))
        );
    } else if (style === 'male') {
        styleMatched = filtered.filter(v => 
            v.name.toLowerCase().includes('male') || 
            v.name.toLowerCase().includes('daniel') || 
            v.name.toLowerCase().includes('alex') ||
            (v.name.toLowerCase().includes('google') && v.name.toLowerCase().includes('male'))
        );
    } else if (style === 'expressive') {
        styleMatched = filtered.filter(v => 
            v.name.toLowerCase().includes('expressive') || 
            v.name.toLowerCase().includes('lively') ||
            v.name.toLowerCase().includes('samantha')
        );
    } else if (style === 'calm') {
        styleMatched = filtered.filter(v => 
            v.name.toLowerCase().includes('calm') || 
            v.name.toLowerCase().includes('soft') ||
            v.name.toLowerCase().includes('natural')
        );
    }
    
    
    if (styleMatched.length) {
        return styleMatched[0];
    }
    if (filtered.length) {
        return filtered[0];
    }
    return null;
}


function setStatus(message, isError = false, isSuccess = false, isLoading = false) {
    statusDiv.textContent = message;
    statusDiv.className = 'status';
    if (isError) {
        statusDiv.classList.add('error');
    } else if (isSuccess) {
        statusDiv.classList.add('success');
    } else if (isLoading) {
        statusDiv.classList.add('loading');
    }
}


function stopSpeaking() {
    if (speechSynth.speaking || speechSynth.pending) {
        speechSynth.cancel();
    }
    currentUtterance = null;
    setStatus("⏹️ Stopped", false, true);
}


async function speakText() {
    const text = textInput.value.trim();
    
    if (!text) {
        setStatus("❌ Please enter some text first", true);
        return;
    }
    
    
    stopSpeaking();
    
    
    const langCode = languageSelect.value;
    const stylePref = voiceStyleSelect.value;
    const pitch = parseFloat(pitchSlider.value);
    const rate = parseFloat(rateSlider.value);
    
    
    if (availableVoices.length === 0) {
        await loadVoices();
    }
    
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    
    if (langCode !== 'default') {
        utterance.lang = langCode;
    }
    
   
    utterance.pitch = pitch;
    utterance.rate = rate;
    
    const selectedVoice = findBestVoice(langCode !== 'default' ? langCode : null, stylePref);
    if (selectedVoice) {
        utterance.voice = selectedVoice;
        setStatus(`🎤 Speaking with "${selectedVoice.name}" (${selectedVoice.lang})`, false);
    } else {
        setStatus(`🎤 Speaking with default voice`, false);
    }
    
    
    utterance.onstart = () => {
        setStatus("🔊 Speaking...", false);
    };
    
    utterance.onend = () => {
        setStatus("✅ Speech finished", false, true);
        currentUtterance = null;
    };
    
    utterance.onerror = (event) => {
        console.error("Speech error:", event);
        setStatus(`❌ Error: ${event.error || 'Speech failed'}`, true);
        currentUtterance = null;
    };
    
    currentUtterance = utterance;
    speechSynth.speak(utterance);
}


function downloadAudio() {
    const text = textInput.value.trim();
    
    if (!text) {
        setStatus("❌ Please enter text before downloading", true);
        return;
    }
    
    const lang = languageSelect.options[languageSelect.selectedIndex]?.text || languageSelect.value;
    const style = voiceStyleSelect.options[voiceStyleSelect.selectedIndex]?.text || voiceStyleSelect.value;
    const pitch = pitchSlider.value;
    const rate = rateSlider.value;
    
   
    const voiceData = {
        text: text,
        language_code: languageSelect.value,
        language_name: lang,
        voice_style: voiceStyleSelect.value,
        voice_style_name: style,
        pitch: parseFloat(pitch),
        rate: parseFloat(rate),
        timestamp: new Date().toISOString(),
        note: "Send this JSON to your Flask backend /synthesize endpoint to generate audio file"
    };
    
    
    const jsonStr = JSON.stringify(voiceData, null, 2);
    
    // Create blob and download
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voice_request_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setStatus(`💾 Downloaded voice request (JSON) - Ready for Flask backend`, false, true);
}


function updatePitchValue() {
    pitchValue.textContent = pitchSlider.value;
}

function updateRateValue() {
    rateValue.textContent = rateSlider.value;
}


speakBtn.addEventListener('click', speakText);
stopBtn.addEventListener('click', stopSpeaking);
downloadBtn.addEventListener('click', downloadAudio);

pitchSlider.addEventListener('input', updatePitchValue);
rateSlider.addEventListener('input', updateRateValue);

loadVoices().then(() => {
    setStatus("✅ Ready! Choose language & style, then click Speak", false, true);
}).catch(() => {
    setStatus("⚠️ Speech synthesis loaded", false);
});


textInput.focus();

textInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        speakText();
    }
});