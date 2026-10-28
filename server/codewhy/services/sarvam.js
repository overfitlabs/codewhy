/**
 * Sarvam AI Voice Integration Service
 * 
 * Implements official Sarvam AI API client for Speech-to-Text (Saaras v4)
 * and Text-to-Speech (Bulbul v4-flash) across Indian languages and English.
 * 
 * Documentation Reference:
 * - STT: POST https://api.sarvam.ai/speech-to-text (model: saaras:v4)
 * - TTS: POST https://api.sarvam.ai/text-to-speech (model: bulbul:v4-flash)
 * - Auth: api-subscription-key header
 */

const SARVAM_BASE_URL = 'https://api.sarvam.ai';

export const SUPPORTED_VOICE_LANGUAGES = [
  { code: 'en-IN', name: 'English (India)' },
  { code: 'hi-IN', name: 'Hindi (हिंदी)' },
  { code: 'bn-IN', name: 'Bengali (বাংলা)' },
  { code: 'ta-IN', name: 'Tamil (தமிழ்)' },
  { code: 'te-IN', name: 'Telugu (తెలుగు)' },
  { code: 'kn-IN', name: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ml-IN', name: 'Malayalam (മലയാളം)' },
  { code: 'mr-IN', name: 'Marathi (मराठी)' },
  { code: 'gu-IN', name: 'Gujarati (ગુજરાતી)' },
  { code: 'pa-IN', name: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'od-IN', name: 'Odia (ଓଡ଼ିଆ)' }
];

/**
 * Returns current status of Sarvam AI voice integration.
 */
export function getSarvamVoiceStatus() {
  const apiKey = process.env.SARVAM_API_KEY;
  const isConfigured = Boolean(apiKey && apiKey.trim().length > 0);

  return {
    provider: 'sarvam_ai',
    configured: isConfigured,
    sttModel: 'saaras:v4',
    ttsModel: 'bulbul:v4-flash',
    supportedLanguages: SUPPORTED_VOICE_LANGUAGES,
    operationalMode: isConfigured ? 'live_sarvam' : 'unconfigured_text_fallback',
    message: isConfigured 
      ? 'Sarvam AI Speech API active with Saaras v4 STT and Bulbul v4 TTS.'
      : 'SARVAM_API_KEY is not set in environment. Voice enhancement disabled; standard text workflow fully operational.'
  };
}

/**
 * Transcribes audio via Sarvam Saaras Speech-to-Text API.
 * 
 * @param {Object} params
 * @param {string} params.audioBase64 Base64 encoded audio
 * @param {string} [params.mimeType='audio/wav'] Audio MIME type
 * @param {string} [params.languageCode='en-IN'] Language code (e.g. 'en-IN', 'hi-IN')
 * @returns {Promise<{success: boolean, transcript?: string, status: string, error?: string}>}
 */
export async function transcribeAudio({ audioBase64, mimeType = 'audio/wav', languageCode = 'en-IN' }) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return {
      success: false,
      status: 'UNCONFIGURED',
      error: 'SARVAM_API_KEY is not configured in environment variables. Please set it in .env or use text query input.'
    };
  }

  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return {
      success: false,
      status: 'INVALID_INPUT',
      error: 'Valid audioBase64 string is required.'
    };
  }

  try {
    const buffer = Buffer.from(audioBase64, 'base64');
    const blob = new Blob([buffer], { type: mimeType });

    const formData = new FormData();
    formData.append('file', blob, 'audio_query.wav');
    formData.append('model', 'saaras:v4');
    formData.append('language_code', languageCode);
    formData.append('mode', 'transcribe');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`${SARVAM_BASE_URL}/speech-to-text`, {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey.trim()
      },
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        success: false,
        status: 'API_ERROR',
        error: `Sarvam STT failed with HTTP ${res.status}: ${sanitizeError(errText)}`
      };
    }

    const data = await res.json();
    const transcript = data.transcript || '';

    return {
      success: true,
      status: 'OK',
      transcript,
      languageCode: data.language_code || languageCode
    };
  } catch (err) {
    return {
      success: false,
      status: err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      error: err.name === 'AbortError' ? 'Sarvam STT request timed out (12s).' : `Sarvam STT network error: ${sanitizeError(err.message)}`
    };
  }
}

/**
 * Synthesizes text to speech via Sarvam Bulbul Text-to-Speech API.
 * 
 * @param {Object} params
 * @param {string} params.text Text to synthesize (max 2500 chars)
 * @param {string} [params.languageCode='en-IN'] Language code
 * @param {string} [params.speaker='shubh'] Speaker voice ID
 * @returns {Promise<{success: boolean, audioBase64?: string, status: string, error?: string}>}
 */
export async function synthesizeSpeech({ text, languageCode = 'en-IN', speaker = 'shubh' }) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return {
      success: false,
      status: 'UNCONFIGURED',
      error: 'SARVAM_API_KEY is not configured in environment variables.'
    };
  }

  if (!text || typeof text !== 'string' || !text.trim()) {
    return {
      success: false,
      status: 'INVALID_INPUT',
      error: 'Text string is required for speech synthesis.'
    };
  }

  try {
    const payload = {
      text: text.slice(0, 2000),
      language_code: languageCode,
      model: 'bulbul:v4-flash',
      speaker,
      speech_sample_rate: 22050,
      enable_preprocessing: true
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`${SARVAM_BASE_URL}/text-to-speech`, {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey.trim(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        success: false,
        status: 'API_ERROR',
        error: `Sarvam TTS failed with HTTP ${res.status}: ${sanitizeError(errText)}`
      };
    }

    const data = await res.json();
    const audioBase64 = data.audios?.[0] || null;

    if (!audioBase64) {
      return {
        success: false,
        status: 'EMPTY_AUDIO',
        error: 'Sarvam returned empty audio data.'
      };
    }

    return {
      success: true,
      status: 'OK',
      audioBase64,
      format: 'wav',
      languageCode
    };
  } catch (err) {
    return {
      success: false,
      status: err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      error: err.name === 'AbortError' ? 'Sarvam TTS request timed out (12s).' : `Sarvam TTS network error: ${sanitizeError(err.message)}`
    };
  }
}

function sanitizeError(msg) {
  if (!msg) return 'Unknown error';
  return String(msg).replace(/[a-zA-Z0-9_\-]{20,}/g, '[REDACTED]').slice(0, 200);
}
