/**
 * YTLingo v2.0.0 - Storage & In-Memory Session Manager
 * Architecture: Debounced Local Persistence & Ephemeral In-Memory Cue Cache
 * Author: Anindu Uthsara
 */

(function () {
  'use strict';

  // Scoped internal API resolution (Zero global namespace collision)
  const api = typeof browser !== 'undefined' ? browser : chrome;

  // Initialize global YTLingo namespace safely
  window.YTLingo = window.YTLingo || {};

  const STORAGE_KEY_SETTINGS = 'ytl_user_settings';
  const STORAGE_KEY_ENABLED = 'ytl_extension_enabled';
  const DEBOUNCE_DELAY_MS = 300;

  // Canonical Default Settings Blueprint
  const DEFAULT_SETTINGS = Object.freeze({
    // CARD 1: DISPLAY & MAIN SUBTITLE STUDIO
// CARD 1: DISPLAY & MAIN SUBTITLE STUDIO
    display: {
      showLiveTranscript: true, // Show live transcript card toggle
      textShadow: true,         // Text shadow toggle
      plateBlur: false,         // (NEW): Plate blur toggle button (Default OFF)
      lockPlate: false,          // Lock plate toggle (disable drag & drop)
      plateColor: '#0e0e11',    // Main plate color
      plateOpacity: 50          // Main plate opacity (0-100%)
    },
    mainTrack: {
      fontFamily: 'Roboto',
      fontSize: 25,
      fontWeight: 500,
      textColor: '#ffffff'
    },

    // CARD 2: LIVE TRANSLATION STUDIO
    liveTranslation: {
      enabled: false,
      position: 'bottom',
      fontFamily: 'Roboto',
      fontSize: 22,
      fontWeight: 500,
      textColor: '#00e676'
    },

    // CARD 3: HOVER TRANSLATION STUDIO
    hoverTranslation: {
      enabled: true,
      position: 'top',
      hasShadow: true,
      plateOpacity: 90,
      plateColor: '#0e0e11',
      fontFamily: 'Roboto',
      fontSize: 13,
      fontWeight: 600,
      textColor: '#ffffff',
      wordTextColor: '#ffffff',
      wordBgColor: 'rgba(255, 255, 255, 0.25)'
    },

    // GLOBAL TRANSLATION & SYNC
    translation: {
      sourceLang: 'auto',
      targetLang: 'si'
    },
    physics: {
      verticalOffsetPercent: 88,
      horizontalOffsetPercent: 50,
      syncOffsetSec: 0.0
    }
  });

  class StorageManager {
    constructor() {
      this.cachedSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      this.debounceTimer = null;
      this.changeListeners = new Set();

      /**
       * Ephemeral In-Memory Track Cache (Never written to disk/local storage)
       * Automatically purged on video end or navigation.
       */
      this.sessionTrack = {
        videoId: null,
        fileName: '',
        cues: [],
        cueCount: 0,
        duration: 0
      };
    }

    /**
     * Initializes stored settings and synchronizes in-memory cache.
     * @returns {Promise<Object>}
     */
    async init() {
      try {
        const stored = await api.storage.local.get(STORAGE_KEY_SETTINGS);
        if (stored && stored[STORAGE_KEY_SETTINGS]) {
          this.cachedSettings = this.deepMerge(
            JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
            stored[STORAGE_KEY_SETTINGS]
          );
        } else {
          await api.storage.local.set({
            [STORAGE_KEY_SETTINGS]: this.cachedSettings
          });
        }
      } catch (error) {
        console.warn('[YTLingo:Storage] Local storage unavailable, using defaults:', error);
        this.cachedSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      }

      return this.getSettings();
    }

    /**
     * Checks if the extension Kill Switch is currently active.
     * @returns {Promise<boolean>}
     */
    async isEnabled() {
      try {
        const result = await api.storage.local.get(STORAGE_KEY_ENABLED);
        return result[STORAGE_KEY_ENABLED] !== false;
      } catch (error) {
        console.warn('[YTLingo:Storage] Error reading enabled status:', error);
        return true;
      }
    }

    /**
     * Returns an immutable copy of current active settings.
     * @returns {Object}
     */
    getSettings() {
      return JSON.parse(JSON.stringify(this.cachedSettings));
    }

    /**
     * Updates an individual setting with debounced write to storage.
     * @param {string} category - 'typography' | 'physics'
     * @param {string} key - property name
     * @param {*} value - new property value
     */
    setSetting(category, key, value) {
      if (!this.cachedSettings[category]) {
        this.cachedSettings[category] = {};
      }

      this.cachedSettings[category][key] = value;
      this.notifyListeners(category, key, value);
      this.scheduleDebouncedSave();
    }

    /**
     * Updates multiple settings at once.
     * @param {Object} partialSettings
     */
    updateSettings(partialSettings) {
      this.cachedSettings = this.deepMerge(this.cachedSettings, partialSettings);
      this.notifyListeners('*', '*', this.cachedSettings);
      this.scheduleDebouncedSave();
    }

    /**
     * Resets all subtitle typography and overlay styles back to defaults.
     */
    async resetSettings() {
      this.cachedSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      this.notifyListeners('*', '*', this.cachedSettings);
      try {
        await api.storage.local.set({
          [STORAGE_KEY_SETTINGS]: this.cachedSettings
        });
      } catch (error) {
        console.error('[YTLingo:Storage] Failed resetting settings:', error);
      }
    }

    /**
     * Internal: 300ms debounced disk persistence buffer.
     */
    scheduleDebouncedSave() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(async () => {
        try {
          await api.storage.local.set({
            [STORAGE_KEY_SETTINGS]: this.cachedSettings
          });
        } catch (error) {
          console.error('[YTLingo:Storage] Debounced storage save failed:', error);
        } finally {
          this.debounceTimer = null;
        }
      }, DEBOUNCE_DELAY_MS);
    }

    /**
     * Subscribes a listener to live settings adjustments.
     * @param {Function} callback - (category, key, value, settings) => void
     * @returns {Function} Unsubscribe hook
     */
    onSettingsChange(callback) {
      if (typeof callback === 'function') {
        this.changeListeners.add(callback);
      }
      return () => this.changeListeners.delete(callback);
    }

    /**
     * Internal: Dispatches notification to active listeners.
     */
    notifyListeners(category, key, value) {
      for (const listener of this.changeListeners) {
        try {
          listener(category, key, value, this.getSettings());
        } catch (err) {
          console.error('[YTLingo:Storage] Error in settings listener:', err);
        }
      }
    }

    // =========================================================================
    // EPHEMERAL IN-MEMORY SESSION TRACK MANAGEMENT
    // =========================================================================

    /**
     * Sets active subtitle track exclusively in RAM.
     * @param {Object} trackData
     */
    setSessionTrack({ videoId, fileName, cues, duration }) {
      this.sessionTrack = {
        videoId: videoId || null,
        fileName: fileName || 'Local Track',
        cues: Array.isArray(cues) ? cues : [],
        cueCount: Array.isArray(cues) ? cues.length : 0,
        duration: duration || 0
      };
    }

    /**
     * Retrieves active track from memory.
     * @returns {Object}
     */
    getSessionTrack() {
      return this.sessionTrack;
    }

    /**
     * Checks if a valid track is loaded in memory.
     * @returns {boolean}
     */
    hasActiveTrack() {
      return this.sessionTrack && this.sessionTrack.cues.length > 0;
    }

    /**
     * Completely purges subtitle cues from memory (0 RAM overhead).
     */
    clearSessionTrack() {
      this.sessionTrack = {
        videoId: null,
        fileName: '',
        cues: [],
        cueCount: 0,
        duration: 0
      };
    }

    /**
     * Deep merge helper utility.
     */
    deepMerge(target, source) {
      if (!source) return target;
      for (const key of Object.keys(source)) {
        if (
          source[key] instanceof Object &&
          !Array.isArray(source[key]) &&
          key in target
        ) {
          Object.assign(target[key], this.deepMerge(target[key], source[key]));
        }
      }
      Object.assign(target || {}, source);
      return target;
    }

    /**
     * Complete teardown on Kill Switch deactivation.
     */
    destroy() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.changeListeners.clear();
      this.clearSessionTrack();
    }
  }

  // Bind singleton securely to namespace
  window.YTLingo.storageManager = new StorageManager();
})();