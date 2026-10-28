/**
 * CodeWhy Voice API Router
 * 
 * Endpoints for:
 * - GET  /api/v1/voice/status     (inspect Sarvam configuration & supported languages)
 * - POST /api/v1/voice/transcribe (speech-to-text via Sarvam Saaras v4)
 * - POST /api/v1/voice/speak      (text-to-speech via Sarvam Bulbul v4-flash)
 */

import express from 'express';
import { getSarvamVoiceStatus, transcribeAudio, synthesizeSpeech } from '../services/sarvam.js';

export const voiceRouter = express.Router();

/**
 * GET /api/v1/voice/status
 * Check configuration status and available language codes.
 */
voiceRouter.get('/status', (req, res) => {
  const status = getSarvamVoiceStatus();
  res.json(status);
});

/**
 * POST /api/v1/voice/transcribe
 * Transcribes base64-encoded audio to text using Sarvam Saaras v4.
 */
voiceRouter.post('/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/wav', languageCode = 'en-IN' } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({
        success: false,
        status: 'BAD_REQUEST',
        error: 'Field audioBase64 is required.'
      });
    }

    const result = await transcribeAudio({ audioBase64, mimeType, languageCode });
    if (!result.success) {
      const httpCode = result.status === 'UNCONFIGURED' ? 503 : (result.status === 'INVALID_INPUT' ? 400 : 502);
      return res.status(httpCode).json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      status: 'INTERNAL_ERROR',
      error: `Voice transcription failed: ${err.message}`
    });
  }
});

/**
 * POST /api/v1/voice/speak
 * Synthesizes text to speech using Sarvam Bulbul v4-flash.
 */
voiceRouter.post('/speak', async (req, res) => {
  try {
    const { text, languageCode = 'en-IN', speaker = 'shubh' } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        status: 'BAD_REQUEST',
        error: 'Field text is required.'
      });
    }

    const result = await synthesizeSpeech({ text, languageCode, speaker });
    if (!result.success) {
      const httpCode = result.status === 'UNCONFIGURED' ? 503 : (result.status === 'INVALID_INPUT' ? 400 : 502);
      return res.status(httpCode).json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      status: 'INTERNAL_ERROR',
      error: `Voice speech synthesis failed: ${err.message}`
    });
  }
});
