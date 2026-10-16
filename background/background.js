/**
 * YTLingo v2.0.0 - Background Service Worker & Controller
 * Architecture: In-Player Dock Network Proxy & Kill Switch Engine
 * Author: Anindu Uthsara
 */

'use strict';

// Polyfill check for Firefox native WebExtensions API
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// State management keys & paths
const STORAGE_KEY_ENABLED = 'ytl_extension_enabled';
const STORAGE_KEY_SETTINGS = 'ytl_user_settings';

const ICON_ACTIVE = {
  48: 'assets/icons/icon48.png',
  96: 'assets/icons/icon96.png',
  128: 'assets/icons/icon128.png'
};

const ICON_DISABLED = {
  48: 'assets/icons/disable48.png',
  96: 'assets/icons/disable96.png',
  128: 'assets/icons/disable128.png'
};

const TITLE_ACTIVE = 'YTLingo: Active (Click to Disable & Kill Services)';
const TITLE_DISABLED = 'YTLingo: Disabled (Click to Enable Suite)';

// Default settings blueprint (Persisted across sessions)
const DEFAULT_SETTINGS = {
  typography: {
    fontFamily: 'Noto Sans Sinhala',
    fontSize: 25,
    fontWeight: 500,
    textColor: '#ffffff',
    plateColor: '#0e0e11',
    plateOpacity: 50,
    textAlign: 'center'
  },
  physics: {
    verticalOffsetPercent: 88,
    horizontalOffsetPercent: 50,
    syncOffsetSec: 0.0
  }
};

/**
 * Updates the browser action icon and title dynamically based on the state.
 * @param {boolean} isEnabled
 */
async function updateActionDisplay(isEnabled) {
  try {
    const iconPaths = isEnabled ? ICON_ACTIVE : ICON_DISABLED;
    const titleText = isEnabled ? TITLE_ACTIVE : TITLE_DISABLED;

    await browserAPI.action.setIcon({ path: iconPaths });
    await browserAPI.action.setTitle({ title: titleText });
  } catch (error) {
    console.error('[YTLingo:Background] Failed to update action appearance:', error);
  }
}

/**
 * Broadcasts kill switch or state changes to all matching YouTube tabs safely.
 * @param {boolean} isEnabled
 */
async function broadcastKillSwitchState(isEnabled) {
  try {
    const tabs = await browserAPI.tabs.query({ url: '*://*.youtube.com/*' });
    
    const dispatchPromises = tabs.map(tab => {
      if (!tab.id) return Promise.resolve();
      
      return browserAPI.tabs.sendMessage(tab.id, {
        type: 'YTL_KILL_SWITCH_STATUS_CHANGED',
        payload: { isEnabled }
      }).catch(() => {
        // Suppress benign connection errors when content script is not yet mounted in discarded/sleeping tabs
      });
    });

    await Promise.allSettled(dispatchPromises);
  } catch (error) {
    console.error('[YTLingo:Background] Failed to broadcast state to YouTube tabs:', error);
  }
}

/**
 * Toggles the Kill Switch state, updates storage, changes icon, and notifies tabs.
 */
async function handleActionClick() {
  try {
    const data = await browserAPI.storage.local.get(STORAGE_KEY_ENABLED);
    // If not set previously, default state was true; so toggle flips it to false
    const currentState = data[STORAGE_KEY_ENABLED] !== false;
    const nextState = !currentState;

    await browserAPI.storage.local.set({ [STORAGE_KEY_ENABLED]: nextState });
    await updateActionDisplay(nextState);
    await broadcastKillSwitchState(nextState);

    console.log(`[YTLingo:Background] Kill Switch toggled -> Enabled: ${nextState}`);
  } catch (error) {
    console.error('[YTLingo:Background] Error toggling Kill Switch:', error);
  }
}

/**
 * Initializes storage defaults and sets the initial toolbar icon status.
 */
async function initializeExtensionState() {
  try {
    const data = await browserAPI.storage.local.get([STORAGE_KEY_ENABLED, STORAGE_KEY_SETTINGS]);

    const isEnabled = data[STORAGE_KEY_ENABLED] !== false;
    const updatePayload = {};

    if (data[STORAGE_KEY_ENABLED] === undefined) {
      updatePayload[STORAGE_KEY_ENABLED] = true;
    }

    if (!data[STORAGE_KEY_SETTINGS]) {
      updatePayload[STORAGE_KEY_SETTINGS] = DEFAULT_SETTINGS;
    }

    if (Object.keys(updatePayload).length > 0) {
      await browserAPI.storage.local.set(updatePayload);
    }

    await updateActionDisplay(isEnabled);
  } catch (error) {
    console.error('[YTLingo:Background] Initialization error:', error);
  }
}

// Register browser action click listener (Popup-free architecture)
browserAPI.action.onClicked.addListener(handleActionClick);

// Handle installation or extension updates
browserAPI.runtime.onInstalled.addListener(async () => {
  await initializeExtensionState();
});

// Handle browser startup
browserAPI.runtime.onStartup.addListener(async () => {
  await initializeExtensionState();
});

/**
 * Centralized Message Dispatcher for Content Scripts
 */
/**
 * Centralized Message Dispatcher for Content Scripts (Native Promise Architecture)
 */
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'YTL_QUERY_INITIAL_STATE': {
      return browserAPI.storage.local.get([STORAGE_KEY_ENABLED, STORAGE_KEY_SETTINGS])
        .then(data => ({
          success: true,
          isEnabled: data[STORAGE_KEY_ENABLED] !== false,
          settings: data[STORAGE_KEY_SETTINGS] || DEFAULT_SETTINGS
        }))
        .catch(err => ({ success: false, error: err.message }));
    }

    case 'YTL_FETCH_INNERTUBE_TRACKS': {
      const { videoId } = message.payload;
      
      // Fallback: Fetch watch page HTML directly from background
      fetch(`https://www.youtube.com/watch?v=${videoId}`)
        .then(res => res.text())
        .then(html => {
          const marker = '"captionTracks":';
          const startIdx = html.indexOf(marker);
          if (startIdx === -1) {
            sendResponse({ success: false, error: 'No captions in page HTML' });
            return;
          }

          const arrayStart = html.indexOf('[', startIdx);
          let depth = 0;
          let inString = false;
          let escape = false;
          let arrayEnd = -1;

          for (let i = arrayStart; i < html.length; i++) {
            const char = html[i];
            if (escape) { escape = false; continue; }
            if (char === '\\') { escape = true; continue; }
            if (char === '"') { inString = !inString; continue; }
            if (!inString) {
              if (char === '[') depth++;
              else if (char === ']') {
                depth--;
                if (depth === 0) { arrayEnd = i + 1; break; }
              }
            }
          }

          if (arrayEnd !== -1) {
            const tracks = JSON.parse(html.substring(arrayStart, arrayEnd));
            sendResponse({ success: true, tracks });
          } else {
            sendResponse({ success: false, error: 'Parsing captionTracks array failed' });
          }
        })
        .catch(err => {
          sendResponse({ success: false, error: err.message });
        });

      return true; // Keep channel open
    }

    case 'YTL_FETCH_RAW_SUBTITLE': {
      const { url } = message.payload;
      return fetch(url)
        .then(res => {
          if (!res.ok) throw new Error(`Subtitle HTTP ${res.status}`);
          return res.text();
        })
        .then(rawContent => ({ success: true, content: rawContent }))
        .catch(err => ({ success: false, error: err.message }));
    }

    case 'YTL_TRANSLATE_TEXT': {
      const { text, targetLang, sourceLang } = message.payload;
      return handleTranslationRequest(text, targetLang, sourceLang)
        .then(result => ({ success: true, ...result }))
        .catch(err => ({ success: false, error: err.message }));
    }

    case 'YTL_TRANSLATE_BATCH_CHUNK': {
      // Bulletproof Tokenized Delimiter: Google Translate will not strip or translate this token
      const { texts, targetLang, sourceLang } = message.payload;
      if (!Array.isArray(texts) || texts.length === 0) {
        return Promise.resolve({ success: true, translations: [] });
      }

      const delimiter = '\n⟦YTL⟧\n';
      const combinedText = texts.join(delimiter);

      return handleTranslationRequest(combinedText, targetLang, sourceLang)
        .then(result => {
          // Split by custom token with safe fallback
          let splitTranslations = result.translatedText.split(/\s*⟦YTL⟧\s*/);

          // Worst-Case Guard: If Google dropped a token and counts mismatch
          if (splitTranslations.length !== texts.length) {
            console.warn('[YTLingo:Background] Chunk split count mismatch, attempting newline fallback...');
            const lineSplit = result.translatedText.split('\n').filter(l => l.trim().length > 0);
            if (lineSplit.length === texts.length) {
              splitTranslations = lineSplit;
            } else {
              // Graceful padding: use translated text where available, original where missing
              splitTranslations = texts.map((original, i) => splitTranslations[i] || original);
            }
          }

          return {
            success: true,
            translations: splitTranslations,
            detectedLang: result.detectedLang
          };
        })
        .catch(err => ({ success: false, error: err.message }));
    }
  }
});

// =============================================================================
// GOOGLE TRANSLATE ENGINE (ZERO-CSP FIREFOX RESILIENT ARCHITECTURE)
// =============================================================================

const TRANSLATE_PRIMARY_URL = 'https://clients5.google.com/translate_a/t';
const TRANSLATE_SECONDARY_URL = 'https://translate.googleapis.com/translate_a/single';
const TRANSLATION_CACHE_LIMIT = 300;
const translationLRUCache = new Map();

/**
 * Retrieves translated text from in-memory LRU cache (0ms instant return).
 */
function getTranslationFromCache(sl, tl, text) {
  const key = `${sl}:${tl}:${text.trim()}`;
  if (translationLRUCache.has(key)) {
    const value = translationLRUCache.get(key);
    // Refresh LRU order
    translationLRUCache.delete(key);
    translationLRUCache.set(key, value);
    return value;
  }
  return null;
}

/**
 * Stores translation in LRU cache with FIFO purge limit.
 */
function saveTranslationToCache(sl, tl, text, data) {
  const key = `${sl}:${tl}:${text.trim()}`;
  if (translationLRUCache.size >= TRANSLATION_CACHE_LIMIT) {
    const oldestKey = translationLRUCache.keys().next().value;
    translationLRUCache.delete(oldestKey);
  }
  translationLRUCache.set(key, data);
}

/**
 * Primary Engine: Ultra-fast Google Dictionary Client (clients5) with 3s Timeout.
 */
async function translateViaPrimary(text, tl, sl = 'auto') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  const url = `${TRANSLATE_PRIMARY_URL}?client=dict-chrome-ex&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Primary translate returned HTTP ${response.status}`);
    }

    const json = await response.json();
    let translated = '';

    if (Array.isArray(json) && json.length > 0) {
      translated = typeof json[0] === 'string' ? json[0] : (Array.isArray(json[0]) ? json[0][0] : String(json[0]));
    } else if (typeof json === 'string') {
      translated = json;
    }

    return {
      translatedText: translated.trim(),
      detectedLang: sl,
      engine: 'primary'
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Secondary Engine: Full-Sentence Fallback (gtx) with 3s Timeout & Auto-Flip.
 */
async function translateViaSecondary(text, tl, sl = 'auto') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  const url = `${TRANSLATE_SECONDARY_URL}?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Secondary translate returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const translated = Array.isArray(data[0]) ? data[0].map(item => item[0]).join('') : '';
    const detectedLang = data[2] || sl;

    return {
      translatedText: translated.trim(),
      detectedLang: detectedLang,
      engine: 'secondary'
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Long-Text / Paragraph Mode (> 1000 chars) via POST to prevent HTTP 414 errors.
 */
async function translateViaPost(text, tl, sl = 'auto') {
  const body = new URLSearchParams({
    client: 'gtx',
    sl: sl,
    tl: tl,
    dt: 't',
    q: text
  });

  const response = await fetch(TRANSLATE_SECONDARY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString()
  });

  if (!response.ok) {
    throw new Error(`POST translate returned HTTP ${response.status}`);
  }

  const data = await response.json();
  const translated = Array.isArray(data[0]) ? data[0].map(item => item[0]).join('') : '';
  return {
    translatedText: translated.trim(),
    detectedLang: data[2] || sl,
    engine: 'post'
  };
}

/**
 * Master Translator Controller: Handles Cache -> LongText -> Primary -> Secondary Failover.
 */
async function handleTranslationRequest(text, targetLang = 'si', sourceLang = 'auto') {
  const clean = text.trim();
  if (!clean) return { translatedText: '', detectedLang: 'en' };

  // 1. Check in-memory LRU Cache (0ms)
  const cached = getTranslationFromCache(sourceLang, targetLang, clean);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  // 2. Long text paragraph mode (> 1000 chars)
  if (clean.length > 1000) {
    const postResult = await translateViaPost(clean, targetLang, sourceLang);
    saveTranslationToCache(sourceLang, targetLang, clean, postResult);
    return postResult;
  }

  // 3. Fast Failover: Try Primary (dict-chrome-ex) -> Fallback Secondary (gtx)
  try {
    const primaryResult = await translateViaPrimary(clean, targetLang, sourceLang);
    saveTranslationToCache(sourceLang, targetLang, clean, primaryResult);
    return primaryResult;
  } catch (primaryErr) {
    console.warn('[YTLingo:Background] Primary translate engine failed, switching to gtx secondary:', primaryErr.message);
    const secondaryResult = await translateViaSecondary(clean, targetLang, sourceLang);
    saveTranslationToCache(sourceLang, targetLang, clean, secondaryResult);
    return secondaryResult;
  }
}