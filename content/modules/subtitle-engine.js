/**
 * YTLingo v2.0.0 - Subtitle Playback & Physics Engine
 * Architecture: O(log N) Binary Search, Safe DOM Typography & Pointer Physics
 * Author: Anindu Uthsara
 */

(function () {
  'use strict';

  // Initialize global YTLingo namespace safely
  window.YTLingo = window.YTLingo || {};

  class SubtitleEngine {
    constructor() {
      this.playerElement = null;
      this.videoElement = null;

      // DOM Node references
      this.overlayContainer = null;
      this.stageElement = null;
      this.plateElement = null;
      this.textElement = null;
      this.dragHandle = null;

      // Track & Cue state
      this.cues = [];
      this.currentCueIndex = -1;
      this.currentText = '';

      // Pointer Drag Physics State
// Pointer Drag Physics State
      this.isDragging = false;
      this.dragStartPointerX = 0;
      this.dragStartPointerY = 0;

      // Translation Engine State & Tooltip
      this.hoverTooltipEl = null;
      this.lastPrefetchTime = 0;
      this.activeCueObj = null;
      this.initialStageLeftPercent = 50;
      this.initialStageTopPercent = 88;

      // Subscriptions
      this.cueChangeCallbacks = new Set();
      this.unsubscribeSettings = null;

      // Bound handlers for clean unbinding / garbage collection
      this.handleVideoTimeUpdate = this.syncPlayback.bind(this);
      this.handleVideoSeek = this.syncPlayback.bind(this);
      this.handleVideoEnded = this.onVideoEnded.bind(this);
      this.handlePointerDown = this.onDragStart.bind(this);
      this.handlePointerMove = this.onDragMove.bind(this);
      this.handlePointerUp = this.onDragEnd.bind(this);
      this.handlePointerCancel = this.onDragEnd.bind(this);
    }

    /**
     * Initializes engine against the active YouTube player DOM.
     * @param {HTMLElement} playerEl - #movie_player
     */
    init(playerEl) {
      if (!playerEl) return;
      this.playerElement = playerEl;
      this.videoElement = playerEl.querySelector('video');

      if (!this.videoElement) {
        console.warn('[YTLingo:Engine] Target HTML5 video element not found.');
        return;
      }

      this.constructOverlayDOM();
      this.bindVideoEvents();
      this.subscribeToSettings();
      this.applyInitialSettings();
    }

    /**
     * Mounts safe DOM elements for subtitle visualization.
     */
    constructOverlayDOM() {
      // Remove any pre-existing overlay container
      const existing = this.playerElement.querySelector('#ytl-subtitle-container');
      if (existing) existing.remove();

      this.overlayContainer = document.createElement('div');
      this.overlayContainer.id = 'ytl-subtitle-container';

      this.stageElement = document.createElement('div');
      this.stageElement.className = 'ytl-subtitle-stage ytl-collision-avoidance';

      // 2026 Minimalist 6-Dot Grip Vector Handle
      this.dragHandle = document.createElement('div');
      this.dragHandle.className = 'ytl-drag-handle';
      this.dragHandle.appendChild(this.createGripIconSVG());

      this.plateElement = document.createElement('div');
      this.plateElement.className = 'ytl-sub-plate';
      this.plateElement.style.display = 'none';

      this.textElement = document.createElement('span');
      this.textElement.className = 'ytl-sub-text';

      this.plateElement.appendChild(this.textElement);
      this.stageElement.appendChild(this.dragHandle);
      this.stageElement.appendChild(this.plateElement);
      this.overlayContainer.appendChild(this.stageElement);

      // Floating Hover Tooltip Mount
      this.hoverTooltipEl = document.createElement('div');
      this.hoverTooltipEl.id = 'ytl-hover-tooltip';
      this.overlayContainer.appendChild(this.hoverTooltipEl);

      this.playerElement.appendChild(this.overlayContainer);

      // Attach pointer drag listeners to the stage
      // Attach pointer drag listeners strictly to the drag handle
this.dragHandle.addEventListener('pointerdown', this.handlePointerDown);
    }

    /**
     * Creates a lightweight SVG 6-dot grip icon (AMO Compliant).
     * @returns {SVGElement}
     */
    createGripIconSVG() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 16 8');
      svg.setAttribute('fill', 'currentColor');

      const circleCoords = [
        [3, 2], [8, 2], [13, 2],
        [3, 6], [8, 6], [13, 6]
      ];

      circleCoords.forEach(([cx, cy]) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(cx));
        circle.setAttribute('cy', String(cy));
        circle.setAttribute('r', '1.2');
        svg.appendChild(circle);
      });

      return svg;
    }

    
    ensureLiveVideoElement() {
      const currentVideo = this.playerElement?.querySelector('video') || document.querySelector('video');
      if (currentVideo && currentVideo !== this.videoElement) {
        if (this.videoElement) {
          this.videoElement.removeEventListener('timeupdate', this.handleVideoTimeUpdate);
          this.videoElement.removeEventListener('seeking', this.handleVideoSeek);
          this.videoElement.removeEventListener('seeked', this.handleVideoSeek);
          this.videoElement.removeEventListener('ratechange', this.handleVideoSeek);
          this.videoElement.removeEventListener('ended', this.handleVideoEnded);
        }
        this.videoElement = currentVideo;
        this.bindVideoEvents();
      }
      return this.videoElement;
    }

    /**
     * Attaches HTML5 Video listeners for event-driven synchronization.
     */
    bindVideoEvents() {
      if (!this.videoElement) return;

      this.videoElement.addEventListener('timeupdate', this.handleVideoTimeUpdate, { passive: true });
      this.videoElement.addEventListener('seeking', this.handleVideoSeek, { passive: true });
      this.videoElement.addEventListener('seeked', this.handleVideoSeek, { passive: true });
      this.videoElement.addEventListener('ratechange', this.handleVideoSeek, { passive: true });
      this.videoElement.addEventListener('ended', this.handleVideoEnded, { passive: true });
    }

    /**
     * Loads an array of parsed subtitle cues into the engine.
     * @param {Array<Object>} cues - Sorted cues [{ id, start, end, text }]
     * @param {string} trackName - File name or language title
     */
    loadTrack(cues, trackName) {
      if (!Array.isArray(cues) || cues.length === 0) {
        this.clearTrack();
        return;
      }

      this.cues = cues.slice().sort((a, b) => a.start - b.start);
      this.currentCueIndex = -1;
      this.currentText = '';

      // Activate suppression of YouTube native CC
      this.playerElement.classList.add('ytl-track-active');
      this.suppressNativeYouTubeCC();

      // Store in ephemeral memory session cache
      const duration = this.cues[this.cues.length - 1].end || 0;
      window.YTLingo.storageManager.setSessionTrack({
        videoId: window.YTLingo.transcriptExtractor?.getActiveVideoId() || '',
        fileName: trackName,
        cues: this.cues,
        duration: duration
      });

      // Synchronize immediately to current playhead
      this.syncPlayback();
    }

    /**
     * Clears current subtitle track from memory and screen.
     */
    clearTrack() {
      this.cues = [];
      this.currentCueIndex = -1;
      this.currentText = '';

      if (this.plateElement) {
        this.plateElement.classList.remove('ytl-plate-visible');
      }
      if (this.stageElement) {
        this.stageElement.classList.remove('ytl-has-subtitles');
      }
      if (this.textElement) {
        this.textElement.textContent = '';
      }

      if (this.playerElement) {
        this.playerElement.classList.remove('ytl-track-active');
      }

      window.YTLingo.storageManager.clearSessionTrack();
      this.notifyCueChange(null, -1);
    }

    /**
     * Synchronizes playback time with cues using O(log N) binary search.
     */
    syncPlayback() {
      this.ensureLiveVideoElement(); 
      if (!this.videoElement || this.cues.length === 0) return;

      const settings = window.YTLingo.storageManager.getSettings();
      const syncOffset = settings.physics?.syncOffsetSec || 0;
      const currentTime = this.videoElement.currentTime + syncOffset;

      const match = this.findActiveCueBinarySearch(currentTime);

      if (match) {
        // Throttled Lookahead Prefetch (Every 2 seconds during playback)
        if (window.YTLingo.translationManager && currentTime - this.lastPrefetchTime > 2.0) {
          this.lastPrefetchTime = currentTime;
          window.YTLingo.translationManager.prefetchLookaheadWindow(this.cues, currentTime);
        }

        if (this.currentCueIndex !== match.index) {
          this.currentCueIndex = match.index;
          this.currentText = match.cue.text;
          this.renderCueText(match.cue.text, match.cue); // Pass cue object for translation
          this.notifyCueChange(match.cue, match.index);
        }
      } else {
        if (this.currentCueIndex !== -1) {
          this.currentCueIndex = -1;
          this.currentText = '';
          this.renderCueText('');
          this.notifyCueChange(null, -1);
        }
      }
    }

    /**
     * High-speed O(log N) binary search to locate active cue.
     * @param {number} time - Active playback seconds
     * @returns {{ cue: Object, index: number } | null}
     */
    /**
     * High-speed O(log N) binary search with micro-gap tolerance
     */
    findActiveCueBinarySearch(time) {
      const len = this.cues.length;
      if (len === 0) return null;

      let low = 0;
      let high = len - 1;
      let candidateIdx = -1;

      // Find greatest index where cues[index].start <= time
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (this.cues[mid].start <= time + 0.15) { // 0.15s tolerance so early cues are never missed
          candidateIdx = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (candidateIdx !== -1) {
        const candidate = this.cues[candidateIdx];
        if (time >= candidate.start - 0.2 && time <= candidate.end + 0.2) {
          return { cue: candidate, index: candidateIdx };
        }

        // Check adjacent cues for slight overlaps
        for (let i = candidateIdx - 1; i >= 0 && i >= candidateIdx - 3; i--) {
          if (time >= this.cues[i].start - 0.2 && time <= this.cues[i].end + 0.2) {
            return { cue: this.cues[i], index: i };
          }
        }
      }

      return null;
    }

    /**
     * Renders cue text using safe AMO-compliant DOM text nodes.
     * Supports Independent Typography, Dual Plate (Original + Translated),
     * High-contrast Text Shadow, and Word Tokenizer Hovering.
     * @param {string} text
     * @param {Object} [cueObj]
     */
    renderCueText(text, cueObj = null) {
      if (!this.plateElement || !this.textElement) return;

      this.activeCueObj = cueObj;

      // 1. Empty text = hide plate & hide handle completely (Zero ghost shapes)
      if (!text || text.trim().length === 0) {
        this.plateElement.classList.remove('ytl-plate-visible');
        this.stageElement.classList.remove('ytl-has-subtitles');
        while (this.textElement.firstChild) {
          this.textElement.removeChild(this.textElement.firstChild);
        }
        this.hideHoverTooltip();
        return;
      }

      const settings = window.YTLingo.storageManager.getSettings();
      const display = settings.display || {};
      const liveTrans = settings.liveTranslation || settings.translation || {};
      const hoverTrans = settings.hoverTranslation || {};

      const isLiveEnabled = liveTrans.enabled === true || liveTrans.liveTranslate === true;
      const isHoverEnabled = hoverTrans.enabled !== false;
      const livePos = liveTrans.position || 'bottom';

      // 2. Top / Bottom Position Class applied to BOTH plate and text container
      if (livePos === 'top') {
        this.plateElement.classList.add('ytl-trans-top');
        this.textElement.classList.add('ytl-trans-top');
      } else {
        this.plateElement.classList.remove('ytl-trans-top');
        this.textElement.classList.remove('ytl-trans-top');
      }

      // 3. Ensure Text Shadow class is strictly synchronized
      const isShadowActive = (display.textShadow !== false);
      this.plateElement.classList.toggle('ytl-has-shadow', isShadowActive);
      this.stageElement.classList.toggle('ytl-has-shadow', isShadowActive);

      // Clean existing nodes safely
      while (this.textElement.firstChild) {
        this.textElement.removeChild(this.textElement.firstChild);
      }

      // 4. Main / Original Subtitle Line
      const originalLine = document.createElement('span');
      originalLine.className = 'ytl-sub-original';

      if (isHoverEnabled) {
        this.tokenizeTextIntoHoverWords(originalLine, text);
      } else {
        this.appendLinesWithBreaks(originalLine, text);
      }
      this.textElement.appendChild(originalLine);

      // 5. Live Translated Line (If Live Subtitle Translation is Active)
      if (isLiveEnabled && cueObj && window.YTLingo.translationManager) {
        const transLine = document.createElement('span');
        transLine.className = 'ytl-sub-translated';

        const cached = window.YTLingo.translationManager.getTranslatedCue(cueObj.id);
        if (cached) {
          this.appendLinesWithBreaks(transLine, cached);
        } else {
          transLine.textContent = '...';
          window.YTLingo.translationManager.translateSingle(text)
            .then(res => {
              // Ensure this cue is still active before updating DOM to prevent race conditions
              if (this.activeCueObj?.id === cueObj.id && transLine.parentNode) {
                while (transLine.firstChild) transLine.removeChild(transLine.firstChild);
                this.appendLinesWithBreaks(transLine, res);
              }
            })
            .catch(() => {});
        }
        this.textElement.appendChild(transLine);
      }

      // 6. Mark plate as visible only when text is rendered
      this.plateElement.classList.add('ytl-plate-visible');
      this.stageElement.classList.add('ytl-has-subtitles');
    }

    /**
     * Forces immediate re-render of currently visible subtitle on screen.
     * Guarantees 0ms real-time visual update when user toggles TOP/BOTTOM or colors.
     */
    forceRerenderCurrentCue() {
      if (this.currentCueIndex !== -1 && this.cues[this.currentCueIndex]) {
        const cue = this.cues[this.currentCueIndex];
        this.renderCueText(cue.text, cue);
      }
    }

    /**
     * Safely breaks text lines with <br> elements.
     */
    appendLinesWithBreaks(container, str) {
      const lines = str.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) container.appendChild(document.createElement('br'));
        container.appendChild(document.createTextNode(lines[i]));
      }
    }

    /**
     * Splits text into hoverable interactive words without unsafe innerHTML.
     */
    tokenizeTextIntoHoverWords(container, fullText) {
      const lines = fullText.split('\n');
      lines.forEach((line, lIdx) => {
        if (lIdx > 0) container.appendChild(document.createElement('br'));

        const tokens = line.split(/(\s+)/);
        tokens.forEach(token => {
          if (/^\s+$/.test(token)) {
            container.appendChild(document.createTextNode(token));
          } else if (token.trim().length > 0) {
            const wordSpan = document.createElement('span');
            wordSpan.className = 'ytl-hover-word';
            wordSpan.textContent = token;

            wordSpan.addEventListener('mouseenter', e => this.onHoverWordEnter(e, token));
            wordSpan.addEventListener('mouseleave', () => this.hideHoverTooltip());

            container.appendChild(wordSpan);
          }
        });
      });
    }

    async onHoverWordEnter(event, word) {
      if (!this.hoverTooltipEl || !window.YTLingo.translationManager) return;

      const settings = window.YTLingo.storageManager.getSettings();
      const hoverTrans = settings.hoverTranslation || {};
      if (hoverTrans.enabled === false) return;

      const cleanWord = word.replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, '').trim();
      if (!cleanWord) return;

      const wordRect = event.target.getBoundingClientRect();
      const playerRect = this.playerElement.getBoundingClientRect();

      // Horizontal centering relative to the hovered word
      const leftPx = wordRect.left - playerRect.left + (wordRect.width / 2);
      const tooltipPos = hoverTrans.position || 'top';

      this.hoverTooltipEl.classList.remove('ytl-tooltip-top', 'ytl-tooltip-bottom');
      if (tooltipPos === 'bottom') {
        this.hoverTooltipEl.classList.add('ytl-tooltip-bottom');
        this.hoverTooltipEl.style.top = `${wordRect.bottom - playerRect.top}px`;
      } else {
        this.hoverTooltipEl.classList.add('ytl-tooltip-top');
        this.hoverTooltipEl.style.top = `${wordRect.top - playerRect.top}px`;
      }

      this.hoverTooltipEl.style.left = `${leftPx}px`;
      this.hoverTooltipEl.textContent = '...';
      this.hoverTooltipEl.classList.add('ytl-tooltip-visible');

      const translated = await window.YTLingo.translationManager.translateSingle(cleanWord);
      if (this.hoverTooltipEl.classList.contains('ytl-tooltip-visible')) {
        this.hoverTooltipEl.textContent = translated;
      }
    }

    hideHoverTooltip() {
      if (this.hoverTooltipEl) {
        this.hoverTooltipEl.classList.remove('ytl-tooltip-visible');
      }
    }

    /**
     * Suppresses YouTube default CC if currently engaged.
     */
    suppressNativeYouTubeCC() {
      try {
        const ccBtn = this.playerElement?.querySelector('.ytp-subtitles-button');
        if (ccBtn && ccBtn.getAttribute('aria-pressed') === 'true') {
          ccBtn.click();
        }
      } catch (err) {
        console.warn('[YTLingo:Engine] Unable to toggle native CC:', err);
      }
    }

    /**
     * Seeks HTML5 video to designated timestamp.
     * @param {number} timeSeconds
     */
    seekTo(timeSeconds) {
      this.ensureLiveVideoElement();
      if (this.videoElement && Number.isFinite(timeSeconds)) {
        this.videoElement.currentTime = Math.max(0, timeSeconds);
        this.syncPlayback();
      }
    }

    // =========================================================================
    // DUAL-AXIS POINTER DRAG & DROP PHYSICS
    // =========================================================================

    onDragStart(event) {
      if (event.button !== 0 || !this.stageElement) return;

      const settings = window.YTLingo.storageManager.getSettings();

      if (settings.display?.lockPlate === true) {
        return;
      }

      this.isDragging = true;
      this.stageElement.setPointerCapture(event.pointerId);
      this.stageElement.classList.add('ytl-dragging');

      this.dragStartPointerX = event.clientX;
      this.dragStartPointerY = event.clientY;

      this.initialStageLeftPercent = settings.physics?.horizontalOffsetPercent ?? 50;
      this.initialStageTopPercent = settings.physics?.verticalOffsetPercent ?? 88;

      window.addEventListener('pointermove', this.handlePointerMove);
      window.addEventListener('pointerup', this.handlePointerUp);
      window.addEventListener('pointercancel', this.handlePointerCancel);

      event.preventDefault();
    }

    onDragMove(event) {
      if (!this.isDragging || !this.playerElement) return;

      const playerRect = this.playerElement.getBoundingClientRect();
      if (playerRect.width === 0 || playerRect.height === 0) return;

      const deltaX = event.clientX - this.dragStartPointerX;
      const deltaY = event.clientY - this.dragStartPointerY;

      const deltaXPercent = (deltaX / playerRect.width) * 100;
      const deltaYPercent = (deltaY / playerRect.height) * 100;

      let newX = Math.max(5, Math.min(95, this.initialStageLeftPercent + deltaXPercent));
      let newY = Math.max(5, Math.min(95, this.initialStageTopPercent + deltaYPercent));

      this.stageElement.style.setProperty('--ytl-pos-x', `${newX}%`);
      this.stageElement.style.setProperty('--ytl-pos-y', `${newY}%`);

      if (newY < 70) {
        this.stageElement.classList.remove('ytl-collision-avoidance');
      } else {
        this.stageElement.classList.add('ytl-collision-avoidance');
      }
    }

    onDragEnd(event) {
      if (!this.isDragging) return;

      this.isDragging = false;
      this.stageElement.classList.remove('ytl-dragging');

      try {
        this.stageElement.releasePointerCapture(event.pointerId);
      } catch (_) {}

      window.removeEventListener('pointermove', this.handlePointerMove);
      window.removeEventListener('pointerup', this.handlePointerUp);
      window.removeEventListener('pointercancel', this.handlePointerCancel);

      const posX = parseFloat(this.stageElement.style.getPropertyValue('--ytl-pos-x')) || this.initialStageLeftPercent;
      const posY = parseFloat(this.stageElement.style.getPropertyValue('--ytl-pos-y')) || this.initialStageTopPercent;

      window.YTLingo.storageManager.setSetting('physics', 'horizontalOffsetPercent', Math.round(posX));
      window.YTLingo.storageManager.setSetting('physics', 'verticalOffsetPercent', Math.round(posY));
    }

    // =========================================================================
    // SETTINGS SUBSCRIPTION & TYPOGRAPHY STYLING
    // =========================================================================

    subscribeToSettings() {
      this.unsubscribeSettings = window.YTLingo.storageManager.onSettingsChange((cat, key, val, allSettings) => {
        this.applySettings(allSettings);
      });
    }

    applyInitialSettings() {
      const settings = window.YTLingo.storageManager.getSettings();
      this.applySettings(settings);
    }

    applySettings(settings) {
      if (!this.stageElement || !this.plateElement || !this.textElement) return;

      const display = settings.display || {};
      const mainTrack = settings.mainTrack || settings.typography || {};
      const liveTrans = settings.liveTranslation || settings.translation || {};
      const hoverTrans = settings.hoverTranslation || {};
      const physics = settings.physics || {};

      // 1. Plate Locking & Physics Positioning
      const isLocked = display.lockPlate === true;
      this.stageElement.classList.toggle('ytl-plate-locked', isLocked);

      const posX = physics.horizontalOffsetPercent ?? 50;
      const posY = physics.verticalOffsetPercent ?? 88;
      this.stageElement.style.setProperty('--ytl-pos-x', `${posX}%`);
      this.stageElement.style.setProperty('--ytl-pos-y', `${posY}%`);

      if (posY < 70) {
        this.stageElement.classList.remove('ytl-collision-avoidance');
      } else {
        this.stageElement.classList.add('ytl-collision-avoidance');
      }

      // 2. Display Studio: Main Plate Background, Text Shadow & Plate Blur
      const plateHex = display.plateColor || settings.typography?.plateColor || '#0e0e11';
      const plateOpacity = display.plateOpacity ?? settings.typography?.plateOpacity ?? 50;
      this.plateElement.style.backgroundColor = this.hexToRgba(plateHex, plateOpacity / 100);

      // Plate Blur Toggle Handle (ON / OFF)
      const isBlurOn = display.plateBlur === true;
      this.plateElement.classList.toggle('ytl-has-blur', isBlurOn);
      if (isBlurOn) {
        this.plateElement.style.backdropFilter = 'blur(8px)';
        this.plateElement.style.webkitBackdropFilter = 'blur(8px)';
      } else {
        this.plateElement.style.backdropFilter = 'none';
        this.plateElement.style.webkitBackdropFilter = 'none';
      }

      // Dynamic Text Shadow Variable applied to Stage element
// Text Shadow Toggle: Purely relies on display.textShadow (Ignores stale old keys)
      // 3. Main Track Typography Variables (Dynamic Stroke Calculation for True Bold)
      const mainWeight = parseInt(mainTrack.fontWeight || 500, 10);
      const mainStroke = mainWeight > 500 ? (((mainWeight - 500) / 300) * 1.15).toFixed(2) + 'px' : '0px';

      this.stageElement.style.setProperty('--ytl-main-font', `"${mainTrack.fontFamily || 'Roboto'}", sans-serif`);
      this.stageElement.style.setProperty('--ytl-main-size', `${mainTrack.fontSize || 25}px`);
      this.stageElement.style.setProperty('--ytl-main-weight', String(mainWeight));
      this.stageElement.style.setProperty('--ytl-main-stroke', mainStroke);
      this.stageElement.style.setProperty('--ytl-main-color', mainTrack.textColor || '#ffffff');

      // 4. Live Translation Typography Variables
      const livePos = liveTrans.position || 'bottom';
      this.plateElement.classList.toggle('ytl-trans-top', livePos === 'top');
      this.textElement.classList.toggle('ytl-trans-top', livePos === 'top');

      const liveWeight = parseInt(liveTrans.fontWeight || 500, 10);
      const liveStroke = liveWeight > 500 ? (((liveWeight - 500) / 300) * 1.15).toFixed(2) + 'px' : '0px';

      this.stageElement.style.setProperty('--ytl-live-font', `"${liveTrans.fontFamily || 'Roboto'}", sans-serif`);
      this.stageElement.style.setProperty('--ytl-live-size', `${liveTrans.fontSize || 22}px`);
      this.stageElement.style.setProperty('--ytl-live-weight', String(liveWeight));
      this.stageElement.style.setProperty('--ytl-live-stroke', liveStroke);
      this.stageElement.style.setProperty('--ytl-live-color', liveTrans.textColor || liveTrans.translatedColor || '#00e676');

      // 5. Hover Translation Tooltip & Word Highlight Variables
      // 5. Hover Translation Tooltip & Word Highlight Variables
      const hoverPlateHex = hoverTrans.plateColor || '#0e0e11';
      const hoverPlateOpacity = hoverTrans.plateOpacity ?? 90;
      const hoverPlateRgba = this.hexToRgba(hoverPlateHex, hoverPlateOpacity / 100);

      if (this.overlayContainer) {
        this.overlayContainer.style.setProperty('--ytl-hover-plate-bg', hoverPlateRgba);
        this.overlayContainer.style.setProperty('--ytl-hover-font', `"${hoverTrans.fontFamily || 'Noto Sans Sinhala'}", sans-serif`);
        this.overlayContainer.style.setProperty('--ytl-hover-size', `${hoverTrans.fontSize || 13}px`);
        this.overlayContainer.style.setProperty('--ytl-hover-weight', `${hoverTrans.fontWeight || 600}`);
        this.overlayContainer.style.setProperty('--ytl-hover-color', hoverTrans.textColor || '#00e676');
        this.overlayContainer.style.setProperty('--ytl-hover-word-color', hoverTrans.wordTextColor || '#ffea00');
        this.overlayContainer.style.setProperty('--ytl-hover-word-bg', hoverTrans.wordBgColor || 'rgba(255, 255, 255, 0.22)');
      }

      if (this.hoverTooltipEl) {
        this.hoverTooltipEl.style.backgroundColor = hoverPlateRgba;
        this.hoverTooltipEl.style.fontFamily = `"${hoverTrans.fontFamily || 'Noto Sans Sinhala'}", sans-serif`;
        this.hoverTooltipEl.style.fontSize = `${hoverTrans.fontSize || 13}px`;
        this.hoverTooltipEl.style.fontWeight = `${hoverTrans.fontWeight || 600}`;
        this.hoverTooltipEl.style.color = hoverTrans.textColor || '#00e676';
        this.hoverTooltipEl.classList.toggle('ytl-tooltip-no-shadow', hoverTrans.hasShadow === false);
      }
    }

    hexToRgba(hex, alpha) {
      let cleanHex = hex.replace('#', '');
      if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(c => c + c).join('');
      }
      const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
      const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
      const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // =========================================================================
    // LIFECYCLE & CLEANUP
    // =========================================================================

    onVideoEnded() {
      this.clearTrack();
    }

    onCueChange(callback) {
      if (typeof callback === 'function') {
        this.cueChangeCallbacks.add(callback);
      }
      return () => this.cueChangeCallbacks.delete(callback);
    }

    notifyCueChange(cue, index) {
      for (const cb of this.cueChangeCallbacks) {
        try {
          cb(cue, index);
        } catch (e) {
          console.error('[YTLingo:Engine] Cue change callback error:', e);
        }
      }
    }

    /**
     * Complete teardown on Kill Switch deactivation (0 RAM).
     */
    destroy() {
      if (this.videoElement) {
        this.videoElement.removeEventListener('timeupdate', this.handleVideoTimeUpdate);
        this.videoElement.removeEventListener('seeking', this.handleVideoSeek);
        this.videoElement.removeEventListener('seeked', this.handleVideoSeek);
        this.videoElement.removeEventListener('ratechange', this.handleVideoSeek);
        this.videoElement.removeEventListener('ended', this.handleVideoEnded);
      }

      if (this.stageElement) {
        this.stageElement.removeEventListener('pointerdown', this.handlePointerDown);
      }

      window.removeEventListener('pointermove', this.handlePointerMove);
      window.removeEventListener('pointerup', this.handlePointerUp);
      window.removeEventListener('pointercancel', this.handlePointerCancel);

      if (this.unsubscribeSettings) {
        this.unsubscribeSettings();
        this.unsubscribeSettings = null;
      }

      if (this.overlayContainer) {
        this.overlayContainer.remove();
        this.overlayContainer = null;
      }

      if (this.playerElement) {
        this.playerElement.classList.remove('ytl-track-active');
      }

      this.cueChangeCallbacks.clear();
      this.clearTrack();

      this.playerElement = null;
      this.videoElement = null;
      this.stageElement = null;
      this.plateElement = null;
      this.textElement = null;
      this.dragHandle = null;
    }
  }

  // Bind singleton securely to namespace
  window.YTLingo.subtitleEngine = new SubtitleEngine();
})();