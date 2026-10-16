/**
 * YTLingo v2.0.0 - Master Content Script Coordinator
 * Architecture: SPA Lifecycle State Machine & Resilient Heartbeat Injector
 * Author: Anindu Uthsara
 */

(function () {
  'use strict';

  // Guard against duplicate script injection
  if (window.__YTL_COORDINATOR_ACTIVE__) {
    return;
  }
  window.__YTL_COORDINATOR_ACTIVE__ = true;

  // Scoped internal API resolution (Zero global namespace collision)
  const api = typeof browser !== 'undefined' ? browser : chrome;

  class ContentCoordinator {
    constructor() {
      this.isRunning = false;
      this.currentVideoId = null;

      // Observers and Watchers
      this.playerWaitObserver = null;
      this.controlsObserver = null;
      this.heartbeatTimer = null;
      this.reinjectDebounceTimer = null;

      // Bound event listeners
      this.handleMessage = this.onRuntimeMessage.bind(this);
      this.handleSPANavigation = this.onSPANavigation.bind(this);
    }

    /**
     * Entry bootstrapper.
     */
    async bootstrap() {
      // Listen for Kill Switch toggle signals from background
      api.runtime.onMessage.addListener(this.handleMessage);

      try {
        // Direct storage check (Eliminates async message hang)
        const isEnabled = await window.YTLingo.storageManager.isEnabled();
        if (isEnabled) {
          await this.start();
        } else {
          console.log('[YTLingo:Coordinator] Extension loaded in dormant/disabled state.');
        }
      } catch (error) {
        console.warn('[YTLingo:Coordinator] Initialization error, starting default:', error);
        await this.start();
      }
    }

    /**
     * Starts the YTLingo suite and mounts in-player subsystems.
     */
    async start() {
      if (this.isRunning) return;
      this.isRunning = true;

      console.log('[YTLingo:Coordinator] Starting YTLingo Subtitle Suite (v2.0.0)...');

      // 1. Initialize persistent settings cache
      await window.YTLingo.storageManager.init();

      // 2. Await YouTube Player DOM readiness
      const playerElement = await this.waitForPlayerReady();
      if (!playerElement || !this.isRunning) return;

      // 3. Initialize Subtitle Playback Engine
      window.YTLingo.subtitleEngine.init(playerElement);

      // 4. Inject In-Player Controls & Bento UI Dock
      window.YTLingo.playerInjector.init(playerElement);

      // 5. Register YouTube SPA Navigation listeners
      window.addEventListener('yt-navigate-finish', this.handleSPANavigation, { passive: true });
      window.addEventListener('yt-page-data-updated', this.handleSPANavigation, { passive: true });

      // 6. Monitor controls bar for dynamic re-renders
      this.observeControlsReRender(playerElement);

      // 7. Start lightweight heartbeat guard (Guarantees button visibility)
      this.startHeartbeatGuard(playerElement);

      // 8. Track initial Video ID
      this.currentVideoId = window.YTLingo.transcriptExtractor.getActiveVideoId();
    }

    /**
     * Completely kills all processes, removes DOM, detaches listeners (0 RAM Overhead).
     */
    stop() {
      if (!this.isRunning) return;
      this.isRunning = false;

      console.log('[YTLingo:Coordinator] Kill Switch Engaged -> Shutting down all services.');

      // Stop heartbeat guard
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }

      // Disconnect observers
      if (this.playerWaitObserver) {
        this.playerWaitObserver.disconnect();
        this.playerWaitObserver = null;
      }

      if (this.controlsObserver) {
        this.controlsObserver.disconnect();
        this.controlsObserver = null;
      }

      if (this.reinjectDebounceTimer) {
        clearTimeout(this.reinjectDebounceTimer);
        this.reinjectDebounceTimer = null;
      }

      // Unbind SPA events
      window.removeEventListener('yt-navigate-finish', this.handleSPANavigation);
      window.removeEventListener('yt-page-data-updated', this.handleSPANavigation);

      // Teardown modules in reverse initialization order
      window.YTLingo.playerInjector.destroy();
      window.YTLingo.subtitleEngine.destroy();
      window.YTLingo.storageManager.destroy();

      this.currentVideoId = null;
    }

    /**
     * Handles messages from the background script.
     */
    onRuntimeMessage(message, sender, sendResponse) {
      if (!message || !message.type) return;

      switch (message.type) {
        case 'YTL_KILL_SWITCH_STATUS_CHANGED': {
          const isEnabled = message.payload?.isEnabled;
          if (isEnabled) {
            this.start();
          } else {
            this.stop();
          }
          if (typeof sendResponse === 'function') {
            sendResponse({ acknowledged: true });
          }
          break;
        }
      }
    }

    /**
     * Handles YouTube SPA Navigation ('yt-navigate-finish').
     */
    onSPANavigation() {
      if (!this.isRunning) return;

      const newVideoId = window.YTLingo.transcriptExtractor.getActiveVideoId();

      if (newVideoId !== this.currentVideoId) {
        this.currentVideoId = newVideoId;

        // 1. Clear previous subtitle playback track
        window.YTLingo.subtitleEngine.clearTrack();

        // 2. Reset captions state and UI for the new video
        if (window.YTLingo.playerInjector) {
          window.YTLingo.playerInjector.extractedYouTubeCues = [];
          window.YTLingo.playerInjector.refreshTranscriptBrowserUI();
          window.YTLingo.playerInjector.resetVideoCaptionsState();
          window.YTLingo.playerInjector.toggleDock(false);

          // 3. Immediately trigger fresh availability check for the new video
          setTimeout(() => {
            window.YTLingo.playerInjector.checkCaptionsAvailability(true);
          }, 600);
        }
      }

      // Re-attach live video element and control bar button
      const playerEl = document.querySelector('#movie_player');
      if (playerEl) {
        window.YTLingo.subtitleEngine.init(playerEl);
        const btn = playerEl.querySelector('.ytl-control-bar-btn');
        if (!btn) {
          window.YTLingo.playerInjector.init(playerEl);
        }
      }
    }

    /**
     * Resolves when YouTube's #movie_player and control bar are ready in the DOM.
     * @returns {Promise<HTMLElement>}
     */
    waitForPlayerReady() {
      return new Promise(resolve => {
        const checkReady = () => {
          const player = document.querySelector('#movie_player');
          const video = player?.querySelector('video');
          // 2026 Fix: Check settings button readiness instead of deprecated static container
          const settingsBtn = document.querySelector('.ytp-settings-button');

          if (player && video && settingsBtn) {
            return player;
          }
          return null;
        };

        const immediate = checkReady();
        if (immediate) {
          return resolve(immediate);
        }

        this.playerWaitObserver = new MutationObserver(() => {
          const readyPlayer = checkReady();
          if (readyPlayer) {
            this.playerWaitObserver.disconnect();
            this.playerWaitObserver = null;
            resolve(readyPlayer);
          }
        });

        this.playerWaitObserver.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true
        });
      });
    }

    /**
     * Monitors player controls to restore injected elements if YouTube wipes them during ads.
     * @param {HTMLElement} playerElement
     */
    observeControlsReRender(playerElement) {
      if (this.controlsObserver) {
        this.controlsObserver.disconnect();
      }

      const target = playerElement.querySelector('.ytp-chrome-bottom') || playerElement;

      this.controlsObserver = new MutationObserver(() => {
        if (!this.isRunning) return;

        if (this.reinjectDebounceTimer) clearTimeout(this.reinjectDebounceTimer);

        this.reinjectDebounceTimer = setTimeout(() => {
          this.ensureElementsMounted(playerElement);
        }, 120);
      });

      this.controlsObserver.observe(target, {
        childList: true,
        subtree: true
      });
    }

    /**
     * Lightweight Heartbeat Guard: Checks every 1s that the button & dock exist.
     * Prevents any silent drops caused by YouTube internal DOM teardowns.
     * @param {HTMLElement} playerElement
     */
    startHeartbeatGuard(playerElement) {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

      this.heartbeatTimer = setInterval(() => {
        if (!this.isRunning) return;
        this.ensureElementsMounted(playerElement);
      }, 1000);
    }

    /**
     * Checks and restores any missing injected components.
     * @param {HTMLElement} playerElement
     */
    ensureElementsMounted(playerElement) {
      const hasButton = document.querySelector('.ytl-control-bar-btn');
      if (!hasButton) {
        window.YTLingo.playerInjector.injectControlButton();
      }

      const hasDock = document.querySelector('#ytl-dock-container');
      if (!hasDock) {
        window.YTLingo.playerInjector.injectBentoDock();
      }
    }
  }

  // Instantiate and execute coordinator immediately
  const coordinator = new ContentCoordinator();
  coordinator.bootstrap();
})();