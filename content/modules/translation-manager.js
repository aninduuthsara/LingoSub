/**
 * YTLingo v2.0.0 - Translation Orchestrator & Live Pre-fetch Manager
 * Architecture: Non-blocking Background Proxy, Streaming Lookahead & Chunked Batching
 * Author: Anindu Uthsara
 */

(function () {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;
  window.YTLingo = window.YTLingo || {};

  class TranslationManager {
    constructor() {
      // Active In-Memory Translated Cues Cache: Map<cueId, translatedText>
      this.translatedCuesMap = new Map();
      this.isTranslatingBatch = false;
      this.isBatchPaused = false;
      this.isBatchCancelled = false;

      // Single word/phrase hover cache
      this.hoverCache = new Map();
      this.inFlightLookaheadRequests = new Set();
    }

    /**
     * Translates a single text phrase (used for hover words or individual lines).
     * @param {string} text
     * @param {string} [targetLang]
     * @returns {Promise<string>}
     */
    async translateSingle(text, targetLang) {
      const clean = text.trim();
      if (!clean) return '';

      const settings = window.YTLingo.storageManager.getSettings();
      const tl = targetLang || settings.translation?.targetLang || 'si';

      if (this.hoverCache.has(`${tl}:${clean}`)) {
        return this.hoverCache.get(`${tl}:${clean}`);
      }

      try {
        const response = await api.runtime.sendMessage({
          type: 'YTL_TRANSLATE_TEXT',
          payload: { text: clean, targetLang: tl, sourceLang: 'auto' }
        });

        if (response && response.success && response.translatedText) {
          this.hoverCache.set(`${tl}:${clean}`, response.translatedText);
          return response.translatedText;
        }
      } catch (err) {
        console.warn('[YTLingo:Translation] Single translate error:', err);
      }
      return clean;
    }

    /**
     * Live Lookahead Pre-fetch Engine:
     * While video is playing, automatically pre-translates the upcoming 10 cues ahead of time.
     * @param {Array<Object>} allCues
     * @param {number} currentTime
     * @param {string} [targetLang]
     */
    async prefetchLookaheadWindow(allCues, currentTime, targetLang) {
      if (!Array.isArray(allCues) || allCues.length === 0) return;

      const settings = window.YTLingo.storageManager.getSettings();
      const tl = targetLang || settings.translation?.targetLang || 'si';

      // Find cues that will play in the next 15-30 seconds
      const upcomingCues = allCues.filter(c => 
        c.start >= currentTime - 1 && 
        c.start <= currentTime + 25 && 
        !this.translatedCuesMap.has(c.id) &&
        !this.inFlightLookaheadRequests.has(c.id)
      ).slice(0, 10);

      if (upcomingCues.length === 0) return;

      upcomingCues.forEach(c => this.inFlightLookaheadRequests.add(c.id));

      const texts = upcomingCues.map(c => c.text);

      try {
        const response = await api.runtime.sendMessage({
          type: 'YTL_TRANSLATE_BATCH_CHUNK',
          payload: { texts, targetLang: tl, sourceLang: 'auto' }
        });

        if (response && response.success && Array.isArray(response.translations)) {
          upcomingCues.forEach((cue, index) => {
            const translated = response.translations[index] || cue.text;
            this.translatedCuesMap.set(cue.id, translated.trim());
          });
        }
      } catch (err) {
        console.warn('[YTLingo:Translation] Lookahead batch error:', err);
      } finally {
        upcomingCues.forEach(c => this.inFlightLookaheadRequests.delete(c.id));
      }
    }

    /**
     * Retrieves the translated version of a cue if ready in memory.
     * @param {number} cueId
     * @returns {string|null}
     */
    getTranslatedCue(cueId) {
      return this.translatedCuesMap.get(cueId) || null;
    }

    /**
     * Batch Full Transcript Translator (Chunks of 20 cues with live progress).
     * @param {Array<Object>} cues
     * @param {string} targetLang
     * @param {Function} onProgress - ({ percent, completedCues, totalCues, remainingSec }) => void
     * @returns {Promise<Array<Object>>} Translated cues array
     */
    /**
     * Robust Batch Translator for 1,000 - 4,000+ Cues with Zero-Crash Rate-Limit Guard.
     * @param {Array<Object>} cues
     * @param {string} targetLang
     * @param {Function} onProgress
     * @returns {Promise<Array<Object>>}
     */
    async translateFullTrackBatch(cues, targetLang, onProgress) {
      if (!Array.isArray(cues) || cues.length === 0) return [];

      this.isTranslatingBatch = true;
      this.isBatchPaused = false;
      this.isBatchCancelled = false;
      this.translatedFullTrackCues = [];

      const CHUNK_SIZE = 18; // Optimal batch chunk size
      const totalCues = cues.length;
      let completedCues = 0;
      const startTime = Date.now();

      for (let i = 0; i < totalCues; i += CHUNK_SIZE) {
        if (this.isBatchCancelled) {
          this.isTranslatingBatch = false;
          throw new Error('Translation cancelled by user.');
        }

        // Handle Pause state gracefully
        while (this.isBatchPaused) {
          if (this.isBatchCancelled) {
            this.isTranslatingBatch = false;
            throw new Error('Translation cancelled by user.');
          }
          await new Promise(r => setTimeout(r, 200));
        }

        const chunk = cues.slice(i, i + CHUNK_SIZE);
        const texts = chunk.map(c => c.text);

        let translations = null;

        // Try chunk translation with 1 retry on network drop
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await api.runtime.sendMessage({
              type: 'YTL_TRANSLATE_BATCH_CHUNK',
              payload: { texts, targetLang, sourceLang: 'auto' }
            });

            if (response && response.success && Array.isArray(response.translations)) {
              translations = response.translations;
              break;
            }
          } catch (netErr) {
            console.warn(`[YTLingo:Translation] Attempt ${attempt + 1} failed for chunk ${i}:`, netErr);
            if (attempt === 0) await new Promise(r => setTimeout(r, 1200)); // Backoff wait
          }
        }

        // If both attempts failed, safely fall back to original texts (never crash!)
        if (!translations || translations.length === 0) {
          translations = texts;
        }

        chunk.forEach((cue, idx) => {
          const trText = (translations[idx] || cue.text).trim();
          this.translatedCuesMap.set(cue.id, trText);
          this.translatedFullTrackCues.push({
            id: cue.id,
            start: cue.start,
            end: cue.end,
            originalText: cue.text,
            text: trText
          });
        });

        completedCues += chunk.length;

        // Crash-Proof Math for progress & remaining time
        const elapsedSec = Math.max((Date.now() - startTime) / 1000, 0.1);
        const cuesPerSec = completedCues / elapsedSec;
        const remainingCues = Math.max(totalCues - completedCues, 0);
        const rawRemainingSec = cuesPerSec > 0 ? Math.round(remainingCues / cuesPerSec) : 0;
        const remainingSec = Number.isFinite(rawRemainingSec) ? rawRemainingSec : 0;
        const percent = Math.min(100, Math.max(0, Math.round((completedCues / totalCues) * 100)));

        if (typeof onProgress === 'function') {
          onProgress({
            percent,
            completedCues: Math.min(completedCues, totalCues),
            totalCues,
            remainingSec,
            currentChunk: Math.ceil(completedCues / CHUNK_SIZE),
            totalChunks: Math.ceil(totalCues / CHUNK_SIZE)
          });
        }

        // Gentle 250ms delay between chunks to strictly avoid Google 429 rate-limiting
        await new Promise(r => setTimeout(r, 250));
      }

      this.isTranslatingBatch = false;
      return this.translatedFullTrackCues;
    }

    getTranslatedFullTrackCues() {
      return this.translatedFullTrackCues || [];
    }

    pauseBatch() {
      this.isBatchPaused = true;
    }

    resumeBatch() {
      this.isBatchPaused = false;
    }

    cancelBatch() {
      this.isBatchCancelled = true;
      this.isTranslatingBatch = false;
    }

    clearCache() {
      this.translatedCuesMap.clear();
      this.hoverCache.clear();
      this.inFlightLookaheadRequests.clear();
    }
  }

  // Export singleton to global namespace
  window.YTLingo.translationManager = new TranslationManager();
})();