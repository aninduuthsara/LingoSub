/**
 * YTLingo v2.0.0 - In-Player Control Bar & Bento UI Injector
 * Architecture: Unified Player Execution Context & Event-Isolated Bento Dock
 * Author: Anindu Uthsara
 */

(function () {
    'use strict';

    // Initialize global YTLingo namespace safely
    window.YTLingo = window.YTLingo || {};

    const SWATCH_FONT_COLORS = ['#ff0033', '#00e676', '#00b0ff', '#ffea00', '#ffffff', '#191919'];
  const SWATCH_PLATE_COLORS = ['#0e0e11', '#191919', '#0a192f', '#3b0b14', '#0b2e1b', '#ffffff'];
  const OPACITY_STEPS = [0, 25, 50, 75, 100];

  // Exact 16 Fonts from fonts/ directory
// Exact 14 Bundled Fonts (Sinhala 01 & 02 Removed)
  const AVAILABLE_FONTS = [
    { name: 'Roboto', file: 'Roboto.ttf' },
    { name: 'English+', file: 'English+.ttf' },
    { name: 'Tamil', file: 'Tamil.ttf' },
    { name: 'Hindi', file: 'Hindi.ttf' },
    { name: 'Japanese', file: 'Japanese.ttf' },
    { name: 'Korean', file: 'Korean.ttf' },
    { name: 'Chinese (Simplified)', file: 'Chinese (Simplified).ttf' },
    { name: 'Chinese (Traditional)', file: 'Chinese (Traditional).ttf' },
    { name: 'Russian', file: 'Russian.ttf' },
    { name: 'Casual', file: 'Casual.ttf' },
    { name: 'Cursive', file: 'Cursive.ttf' },
    { name: 'Monospaced Sans-Serif', file: 'Monospaced Sans-Serif.ttf' },
    { name: 'Monospaced Serif', file: 'Monospaced Serif.ttf' },
    { name: 'Proportional Serif', file: 'Proportional Serif.ttf' }
  ];
    class PlayerInjector {
        constructor() {
      this.playerElement = null;
      this.controlButton = null;
      this.dockContainer = null;
      this.isDockVisible = false;
      this.extractedYouTubeCues = [];
      this.exportButtons = [];

      // YouTube Native Menu Navigation Stack
      this.menuStack = ['root'];
      this.panels = new Map();

            // Unsubscribe hooks
            this.unsubscribeCueEngine = null;
            this.unsubscribeSettings = null;

            // Active cue DOM elements map for fast lookups
            this.cueRowElements = [];

            // Bound event listeners
            this.handleDocumentKeydown = this.onDocumentKeydown.bind(this);
            this.handleFileSelected = this.onFileSelected.bind(this);
        }

        // =========================================================================
    // YOUTUBE NATIVE MENU STACK NAVIGATION CONTROLLER
    // =========================================================================

    openSubmenu(panelId) {
      if (!this.panels.has(panelId)) return;
      const currentId = this.menuStack[this.menuStack.length - 1];
      if (currentId === panelId) return;

      const currentPanel = this.panels.get(currentId);
      const nextPanel = this.panels.get(panelId);

      if (currentPanel) {
        currentPanel.classList.remove('ytl-panel-active');
        currentPanel.classList.add('ytl-panel-left');
      }

      if (nextPanel) {
        nextPanel.classList.remove('ytl-panel-right', 'ytl-panel-left');
        nextPanel.classList.add('ytl-panel-active');
        nextPanel.scrollTop = 0;
      }

      this.menuStack.push(panelId);

      const brandHeader = this.dockContainer?.querySelector('.ytl-dock-header');
      if (brandHeader) brandHeader.style.display = 'none';
    }

    goBack() {
      if (this.menuStack.length <= 1) return;
      const currentId = this.menuStack.pop();
      const prevId = this.menuStack[this.menuStack.length - 1];

      const currentPanel = this.panels.get(currentId);
      const prevPanel = this.panels.get(prevId);

      if (currentPanel) {
        currentPanel.classList.remove('ytl-panel-active');
        currentPanel.classList.add('ytl-panel-right');
      }

      if (prevPanel) {
        prevPanel.classList.remove('ytl-panel-left', 'ytl-panel-right');
        prevPanel.classList.add('ytl-panel-active');
      }

      if (this.menuStack.length === 1) {
        const brandHeader = this.dockContainer?.querySelector('.ytl-dock-header');
        if (brandHeader) brandHeader.style.display = 'flex';
      }
    }

    createSubmenuHeader(title) {
      const header = document.createElement('div');
      header.className = 'ytl-submenu-header';

      const backArrow = document.createElement('div');
      backArrow.className = 'ytl-back-arrow';
      backArrow.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" style="pointer-events:none;"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'ytl-submenu-title';
      titleSpan.textContent = title;

      header.appendChild(backArrow);
      header.appendChild(titleSpan);

      header.addEventListener('click', (e) => {
        e.stopPropagation();
        this.goBack();
      });

      return header;
    }

    createMenuRow({ iconName, label, valueText, isSwitch, switchChecked, onSwitchChange, onClick }) {
      const row = document.createElement('div');
      row.className = 'ytl-menu-row';

      // Left Section: Icon + Label
      const left = document.createElement('div');
      left.className = 'ytl-menu-row-left';

      const iconDiv = document.createElement('div');
      iconDiv.className = 'ytl-menu-icon';
      const api = typeof browser !== 'undefined' ? browser : chrome;
      const iconImg = document.createElement('img');
      iconImg.src = api.runtime.getURL(`assets/icons/menu/${iconName}`);
      iconImg.alt = label;
      iconDiv.appendChild(iconImg);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'ytl-menu-label';
      labelSpan.textContent = label;

      left.appendChild(iconDiv);
      left.appendChild(labelSpan);
      row.appendChild(left);

      // Right Section: Switch OR Inline Value + Subtle Chevron (Exact Match to Image 2)
      const right = document.createElement('div');
      right.className = 'ytl-menu-row-right';

      if (isSwitch) {
        const toggle = this.createToggleSwitchComponent({
          checked: switchChecked,
          onChange: onSwitchChange
        });
        right.appendChild(toggle);
      } else {
        if (valueText) {
          const valSpan = document.createElement('span');
          valSpan.className = 'ytl-menu-value-text';
          valSpan.textContent = valueText;
          right.appendChild(valSpan);
        }

        // Native subtle chevron right next to the value (e.g. 'Off ›')
        const chevron = document.createElement('div');
        chevron.className = 'ytl-menu-chevron';
        chevron.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9.29 6.71a.996.996 0 0 0 0 1.41L13.88 12l-4.59 4.59a.996.996 0 1 0 1.41 1.41l5.3-5.3a.996.996 0 0 0 0-1.41l-5.3-5.3a.996.996 0 0 0-1.41 0z"/></svg>';
        right.appendChild(chevron);
      }

      row.appendChild(right);

      row.addEventListener('click', (e) => {
        if (isSwitch) {
          if (!e.target.closest('.ytl-switch-label')) {
            const toggleCb = row.querySelector('input[type="checkbox"]');
            if (toggleCb) {
              toggleCb.click();
            }
          }
        } else if (onClick) {
          onClick(e);
        }
      });

      return row;
    }
        /**
         * Initializes UI injection into the designated YouTube Player element.
         * @param {HTMLElement} playerEl - #movie_player
         */
        init(playerEl) {
      if (!playerEl) return;
      this.playerElement = playerEl;

      this.injectCustomFontFaces(); // Injects all 16 TTF font-faces safely at runtime
      this.injectControlButton();
            this.injectBentoDock();
            this.bindCueSyncObserver();
            this.subscribeToSettingsChanges();

            document.removeEventListener('keydown', this.handleDocumentKeydown);
            document.addEventListener('keydown', this.handleDocumentKeydown);
        }

        // =========================================================================
        // 1. YOUTUBE BOTTOM CONTROL BAR INJECTION
        // =========================================================================

        injectControlButton() {
            // Locate the native settings or subtitles button directly
            const settingsButton = this.playerElement?.querySelector('.ytp-settings-button') || document.querySelector('.ytp-settings-button');
            const subtitlesButton = this.playerElement?.querySelector('.ytp-subtitles-button') || document.querySelector('.ytp-subtitles-button');

            // Prevent duplicate buttons
            const existingBtn = document.querySelector('.ytl-control-bar-btn');
            if (existingBtn) existingBtn.remove();

            this.controlButton = document.createElement('button');
            this.controlButton.className = 'ytp-button ytl-control-bar-btn';
            this.controlButton.setAttribute('aria-label', 'YTLingo Subtitle Studio');
            this.controlButton.setAttribute('title', 'YTLingo Subtitle Studio (v2.0.0)');

            // Inline styles to guarantee instant rendering
            this.controlButton.style.display = 'inline-flex';
            this.controlButton.style.alignItems = 'center';
            this.controlButton.style.justifyContent = 'center';
            this.controlButton.style.width = '48px';
            this.controlButton.style.minWidth = '40px';
            this.controlButton.style.height = '100%';
            this.controlButton.style.verticalAlign = 'top';
            this.controlButton.style.cursor = 'pointer';
            this.controlButton.style.background = 'transparent';
            this.controlButton.style.border = 'none';

            // Vector SVG Icon
            // Custom External SVG Icon (mini_icon.svg)
            const iconImg = document.createElement('img');
            const api = typeof browser !== 'undefined' ? browser : chrome;
            iconImg.src = api.runtime.getURL('assets/branding/mini_icon.svg');

            iconImg.style.width = '24px';
            iconImg.style.height = '24px';

            iconImg.style.pointerEvents = 'none';
            iconImg.style.objectFit = 'contain';

            this.controlButton.appendChild(iconImg);

            this.controlButton.addEventListener('click', e => {
                e.stopPropagation();
                this.toggleDock();
            });

            // 2026 Split Layout Fix: Insert using the button's TRUE direct parent
            if (settingsButton && settingsButton.parentElement) {
                settingsButton.parentElement.insertBefore(this.controlButton, settingsButton);
            } else if (subtitlesButton && subtitlesButton.parentElement) {
                subtitlesButton.parentElement.insertBefore(this.controlButton, subtitlesButton.nextSibling);
            } else {
                const container = this.playerElement?.querySelector('.ytp-right-controls-right, .ytp-right-controls-left, .ytp-right-controls');
                if (container) container.appendChild(this.controlButton);
            }
        }

        // =========================================================================
        // 2. IN-PLAYER BENTO CONTROL DOCK CONSTRUCTION
        // =========================================================================

        injectBentoDock() {
      const existingDock = this.playerElement?.querySelector('#ytl-dock-container');
      if (existingDock) existingDock.remove();

      this.dockContainer = document.createElement('div');
      this.dockContainer.id = 'ytl-dock-container';

      const stopPropagationHandler = e => e.stopPropagation();
this.dockContainer.addEventListener('keydown', stopPropagationHandler);
this.dockContainer.addEventListener('keyup', stopPropagationHandler);
this.dockContainer.addEventListener('keypress', stopPropagationHandler);
this.dockContainer.addEventListener('click', stopPropagationHandler);
this.dockContainer.addEventListener('mousedown', stopPropagationHandler);
this.dockContainer.addEventListener('pointerdown', stopPropagationHandler);
this.dockContainer.addEventListener('dblclick', stopPropagationHandler);
this.dockContainer.addEventListener('wheel', stopPropagationHandler, { passive: true });

      // Top Branding Header
      this.dockContainer.appendChild(this.createDockHeader());

      // Nested Menu Sliding Viewport
      const viewport = document.createElement('div');
      viewport.className = 'ytl-menu-viewport';

      this.menuStack = ['root'];
      this.panels = new Map();

      // 1. Root Main Menu (8 Clean Rows)
      const rootPanel = this.createRootMenuPanel();
      rootPanel.classList.add('ytl-panel-active');
      this.panels.set('root', rootPanel);
      viewport.appendChild(rootPanel);

      // 2. Sub-Menus (Slide-in Panels)
// 2. Sub-Menus (Slide-in Panels)
      // 2. Sub-Menus (Slide-in Panels)
      const subStyling = this.createSubmenuStyling();
      subStyling.classList.add('ytl-panel-right');
      this.panels.set('styling', subStyling);
      viewport.appendChild(subStyling);

      const subLiveTranslation = this.createSubmenuLiveTranslation();
      subLiveTranslation.classList.add('ytl-panel-right');
      this.panels.set('liveTranslation', subLiveTranslation);
      viewport.appendChild(subLiveTranslation);

      const subLanguage = this.createSubmenuLanguage();
      subLanguage.classList.add('ytl-panel-right');
      this.panels.set('language', subLanguage);
      viewport.appendChild(subLanguage);

      const subHover = this.createSubmenuHover();
      subHover.classList.add('ytl-panel-right');
      this.panels.set('hover', subHover);
      viewport.appendChild(subHover);

      const subLiveTranscript = this.createSubmenuLiveTranscript();
      subLiveTranscript.classList.add('ytl-panel-right');
      this.panels.set('transcript', subLiveTranscript);
      viewport.appendChild(subLiveTranscript);

      const subExtractor = this.createSubmenuExtractor();
      subExtractor.classList.add('ytl-panel-right');
      this.panels.set('extractor', subExtractor);
      viewport.appendChild(subExtractor);

    
      const subAbout = this.createSubmenuAbout();
      subAbout.classList.add('ytl-panel-right');
      this.panels.set('about', subAbout);
      viewport.appendChild(subAbout);

      this.dockContainer.appendChild(viewport);
      this.playerElement.appendChild(this.dockContainer);
    }

        createDockHeader() {
            const header = document.createElement('div');
            header.className = 'ytl-dock-header';

            const brandBadge = document.createElement('div');
            brandBadge.className = 'ytl-brand-badge';

            const logoImg = document.createElement('img');
            const api = typeof browser !== 'undefined' ? browser : chrome;
            logoImg.src = api.runtime.getURL('assets/branding/Main.png');
            logoImg.style.width = '26px'; 
            logoImg.style.height = '26px';
            logoImg.alt = 'YTLingo';

            const title = document.createElement('span');
            title.className = 'ytl-brand-title';
            title.textContent = 'LingoSub';

            const version = document.createElement('span');
            version.className = 'ytl-brand-version';
            version.textContent = 'v2.0.0';

            brandBadge.appendChild(logoImg);
            brandBadge.appendChild(title);
            brandBadge.appendChild(version);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'ytl-btn-close';
            closeBtn.setAttribute('title', 'Close Studio (Esc)');

            const closeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            closeSvg.setAttribute('viewBox', '0 0 24 24');
            const closePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            closePath.setAttribute('d', 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z');
            closeSvg.appendChild(closePath);
            closeBtn.appendChild(closeSvg);

            closeBtn.addEventListener('click', () => this.toggleDock(false));

            header.appendChild(brandBadge);
            header.appendChild(closeBtn);
            return header;
        }

       getYTColors() {
      return [
        { value: '#ffffff', label: 'White' },
        { value: '#e5e5e5', label: 'Light Gray' },
        { value: '#aaaaaa', label: 'Gray' },
        { value: '#ffea00', label: 'Yellow' },
        { value: '#00e676', label: 'Green' },
        { value: '#00b0ff', label: 'Cyan' },
        { value: '#0e0e11', label: 'Black' }
      ];
    }

        // =========================================================================
        // 3. CARD: LOCAL FILE INGESTION
        // =========================================================================

        createCardIngestion() {
            const card = document.createElement('div');
            card.className = 'ytl-bento-card';

            const title = document.createElement('div');
            title.className = 'ytl-bento-card-title';
            title.textContent = 'Local Track Ingestion';

            const pickerBtn = document.createElement('button');
            pickerBtn.className = 'ytl-file-picker-btn';

            const uploadSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            uploadSvg.setAttribute('viewBox', '0 0 24 24');
            const uploadPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            uploadPath.setAttribute('d', 'M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z');
            uploadSvg.appendChild(uploadPath);

            this.filePickerLabel = document.createElement('span');
            this.filePickerLabel.textContent = 'Choose Subtitles (.srt, .vtt, .xml, .srv3)';

            pickerBtn.appendChild(uploadSvg);
            pickerBtn.appendChild(this.filePickerLabel);

            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'file';
            hiddenInput.className = 'ytl-hidden-input';
            hiddenInput.accept = '.srt,.vtt,.xml,.srv3';

            pickerBtn.addEventListener('click', () => hiddenInput.click());
            hiddenInput.addEventListener('change', this.handleFileSelected);

            card.appendChild(title);
            card.appendChild(pickerBtn);
            card.appendChild(hiddenInput);
            return card;
        }

        onFileSelected(event) {
            const file = event.target.files?.[0];
            if (!file) return;

            const self = this; 
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const content = e.target.result;
                    const cues = window.YTLingo.transcriptExtractor.parseUniversalFile(content, file.name);

                    if (cues.length === 0) {
                        alert('YTLingo: Could not extract any valid subtitle cues from this file.');
                        return;
                    }

                    self.extractedYouTubeCues = [];

                    window.YTLingo.subtitleEngine.loadTrack(cues, file.name);
                    if (self.filePickerLabel) {
                        self.filePickerLabel.textContent = `Loaded: ${file.name}`;
                        self.filePickerLabel.style.color = '#d8d8d8';
                    }
                    self.refreshTranscriptBrowserUI();
                } catch (err) {
                    console.error('[YTLingo:Injector] File reading error:', err);
                    alert('Failed to parse subtitle file: ' + err.message);
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        }

    // =========================================================================
    // 1. ROOT MAIN MENU PANEL (FIXED UNIQUE IDs & ALL 16 LANGUAGES)
    // =========================================================================
    createRootMenuPanel() {
      const panel = document.createElement('div');
      panel.className = 'ytl-menu-panel ytl-panel-root';

      const scrollArea = document.createElement('div');
      scrollArea.className = 'ytl-panel-scroll-area';

      const settings = window.YTLingo.storageManager.getSettings();
      const display = settings.display || {};
      const liveTrans = settings.liveTranslation || {};
      const transLang = settings.translation?.targetLang || 'si';

      // ALL 16 Supported Languages Map (No more 'RU' or raw codes!)
      const langNames = {
        si: 'Sinhala', en: 'English', es: 'Spanish', ta: 'Tamil',
        hi: 'Hindi', ja: 'Japanese', ko: 'Korean', 'zh-CN': 'Chinese',
        ru: 'Russian', de: 'German', fr: 'French', it: 'Italian',
        pt: 'Portuguese', ar: 'Arabic', tr: 'Turkish', bn: 'Bengali'
      };

      // 1. LOCAL SUBTITLES
      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'file';
      hiddenInput.className = 'ytl-hidden-input';
      hiddenInput.accept = '.srt,.vtt,.xml,.srv3';
      hiddenInput.addEventListener('change', (e) => {
        this.handleFileSelected(e);
        const vcValue = scrollArea.querySelector('#ytl-vc-val');
        if (vcValue && vcValue.textContent !== 'Unavailable') {
          vcValue.textContent = 'Available';
        }
      });
      scrollArea.appendChild(hiddenInput);

      const localRow = this.createMenuRow({
        iconName: 'folder.svg',
        label: 'Local Subtitles',
        valueText: 'Choose File',
        onClick: () => hiddenInput.click()
      });
      scrollArea.appendChild(localRow);

      // 2. VIDEO CAPTIONS
      const vcWrapper = document.createElement('div');
      vcWrapper.style.display = 'flex';
      vcWrapper.style.flexDirection = 'column';

      const vcRow = this.createMenuRow({
        iconName: 'transcript.svg',
        label: 'Video Captions',
        valueText: 'Checking...',
        onClick: async () => {}
      });
      vcRow.id = 'ytl-vc-row'; // ID added for reliable selection
      const vcValSpan = vcRow.querySelector('.ytl-menu-value-text');
      vcValSpan.id = 'ytl-vc-val';
      vcRow.classList.add('ytl-row-disabled');

      const progressWrapper = document.createElement('div');
      progressWrapper.className = 'ytl-mini-progress-wrapper';
      const progressTrack = document.createElement('div');
      progressTrack.className = 'ytl-mini-progress-track';
      const progressFill = document.createElement('div');
      progressFill.className = 'ytl-mini-progress-fill';
      progressTrack.appendChild(progressFill);
      progressWrapper.appendChild(progressTrack);

      vcWrapper.appendChild(vcRow);
      vcWrapper.appendChild(progressWrapper);
      scrollArea.appendChild(vcWrapper);

      const divider = document.createElement('div');
      divider.className = 'ytl-source-group-divider';
      scrollArea.appendChild(divider);

      // Smart Multi-Stage Polling (800ms, 2200ms, 4500ms - Never gets stuck on cold starts!)
      this.availableYouTubeTracks = [];
      [800, 2200, 4500].forEach(delay => {
        setTimeout(async () => {
          if (!this.availableYouTubeTracks || this.availableYouTubeTracks.length === 0) {
            await this.checkCaptionsAvailability();
          }
        }, delay);
      });

      vcRow.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!this.availableYouTubeTracks || this.availableYouTubeTracks.length === 0) return;

        const trackToLoad = this.availableYouTubeTracks.find(t => t.languageCode === 'en') || this.availableYouTubeTracks[0];
        vcRow.classList.add('ytl-row-disabled');
        vcValSpan.textContent = 'Fetching...';
        progressWrapper.classList.add('ytl-expanded');
        progressFill.style.width = '30%';

        try {
          const cues = await window.YTLingo.transcriptExtractor.fetchTrackCues(trackToLoad.baseUrl);
          progressFill.style.width = '80%';
          if (cues && cues.length > 0) {
            window.YTLingo.subtitleEngine.loadTrack(cues, `YouTube: ${trackToLoad.name}`);
            this.refreshTranscriptBrowserUI();
            progressFill.style.width = '100%';
            setTimeout(() => {
              progressWrapper.classList.remove('ytl-expanded');
              vcValSpan.textContent = 'Active';
              vcValSpan.style.color = '#00e676';
              vcRow.classList.remove('ytl-row-disabled');
              const fileVal = localRow.querySelector('.ytl-menu-value-text');
              if (fileVal) fileVal.textContent = 'Choose File';
            }, 400);
          }
        } catch (err) {
          progressWrapper.classList.remove('ytl-expanded');
          vcValSpan.textContent = 'Error';
          vcRow.classList.remove('ytl-row-disabled');
        }
      });

      // 3. SUBTITLE STYLING (Fixed Unique ID)
      const stylingRow = this.createMenuRow({
        iconName: 'palette.svg',
        label: 'Subtitle Styling',
        valueText: `${settings.mainTrack?.fontSize || 25}px`,
        onClick: () => this.openSubmenu('styling')
      });
      const styleVal = stylingRow.querySelector('.ytl-menu-value-text');
      if (styleVal) styleVal.id = 'ytl-val-styling';
      scrollArea.appendChild(stylingRow);

      // 4. LIVE TRANSLATION
      const liveTransRow = this.createMenuRow({
        iconName: 'translate.svg',
        label: 'Live Translation',
        valueText: liveTrans.enabled === true ? 'On' : 'Off',
        onClick: () => this.openSubmenu('liveTranslation')
      });
      const liveVal = liveTransRow.querySelector('.ytl-menu-value-text');
      if (liveVal) liveVal.id = 'ytl-val-live';
      scrollArea.appendChild(liveTransRow);

      // 5. TARGET LANGUAGE (Fixed Unique ID - Guaranteed No Mismatch!)
      const langRow = this.createMenuRow({
        iconName: 'language.svg',
        label: 'Target Language',
        valueText: langNames[transLang] || 'English',
        onClick: () => this.openSubmenu('language')
      });
      const langVal = langRow.querySelector('.ytl-menu-value-text');
      if (langVal) langVal.id = 'ytl-val-lang';
      scrollArea.appendChild(langRow);

      // 6. HOVER TRANSLATION
      const hoverRow = this.createMenuRow({
        iconName: 'hover.svg',
        label: 'Hover Translation',
        valueText: settings.hoverTranslation?.enabled !== false ? 'On' : 'Off',
        onClick: () => this.openSubmenu('hover')
      });
      const hoverVal = hoverRow.querySelector('.ytl-menu-value-text');
      if (hoverVal) hoverVal.id = 'ytl-val-hover';
      scrollArea.appendChild(hoverRow);

      // 7. LIVE TRANSCRIPT
      const transcriptRow = this.createMenuRow({
        iconName: 'transcript.svg',
        label: 'Live Transcript',
        valueText: 'Stream',
        onClick: () => {
          this.openSubmenu('transcript');
          requestAnimationFrame(() => {
            setTimeout(() => { this.refreshTranscriptBrowserUI(); }, 60);
          });
        }
      });
      scrollArea.appendChild(transcriptRow);

      // 8. CAPTIONS EXTRACTOR
      const extractorRow = this.createMenuRow({
        iconName: 'extractor.svg',
        label: 'Captions Extractor',
        valueText: 'Download',
        onClick: () => this.openSubmenu('extractor')
      });
      scrollArea.appendChild(extractorRow);

      // 9. ABOUT DEVELOPER
      const aboutRow = this.createMenuRow({
        iconName: 'developer.svg',
        label: 'About Developer',
        valueText: 'Anindu',
        onClick: (e) => {
          if (e) e.stopPropagation();
          this.openSubmenu('about');
        }
      });
      scrollArea.appendChild(aboutRow);

      panel.appendChild(scrollArea);
      return panel;
    }

    /**
     * Resets video captions row state on video navigation
     */
    resetVideoCaptionsState() {
      const vcRow = this.dockContainer?.querySelector('#ytl-vc-row');
      const vcValSpan = this.dockContainer?.querySelector('#ytl-vc-val');
      if (vcValSpan) {
        vcValSpan.textContent = 'Checking...';
        vcValSpan.style.color = '';
      }
      if (vcRow) {
        vcRow.classList.add('ytl-row-disabled');
      }
      this.availableYouTubeTracks = [];
    }

    /**
     * Reusable, resilient caption availability checker.
     * @param {boolean} [force=false]
     */
    async checkCaptionsAvailability(force = false) {
      const vcRow = this.dockContainer?.querySelector('#ytl-vc-row');
      const vcValSpan = this.dockContainer?.querySelector('#ytl-vc-val');
      if (!vcRow || !vcValSpan) return false;

      // Only skip if already active/fetching and not forced
      if (!force && (vcValSpan.textContent.includes('Active') || vcValSpan.textContent.includes('Fetching'))) {
        return true;
      }

      if (this.availableYouTubeTracks && this.availableYouTubeTracks.length > 0 && !force) {
        vcValSpan.textContent = 'Available';
        vcRow.classList.remove('ytl-row-disabled');
        return true;
      }

      vcValSpan.textContent = 'Checking...';

      try {
        const tracks = await window.YTLingo.transcriptExtractor.fetchAvailableTracks();
        if (tracks && tracks.length > 0) {
          this.availableYouTubeTracks = tracks;
          vcValSpan.textContent = 'Available';
          vcValSpan.style.color = '';
          vcRow.classList.remove('ytl-row-disabled');
          return true;
        } else {
          vcValSpan.textContent = 'Unavailable';
          vcValSpan.style.color = '';
          vcRow.classList.add('ytl-row-disabled');
          return false;
        }
      } catch (e) {
        vcValSpan.textContent = 'Unavailable';
        vcValSpan.style.color = '';
        vcRow.classList.add('ytl-row-disabled');
        return false;
      }
    }

    // =========================================================================
    // SUB-MENU 1: SUBTITLE STYLING (YOUTUBE MINIMALIST ACCORDION ARCHITECTURE)
    // =========================================================================
    createSubmenuStyling() {
      const panel = document.createElement('div');
      panel.className = 'ytl-menu-panel ytl-panel-sub';

      panel.appendChild(this.createSubmenuHeader('Subtitle Styling'));

      const scrollArea = document.createElement('div');
      scrollArea.className = 'ytl-panel-scroll-area';

      const settings = window.YTLingo.storageManager.getSettings();
      const display = settings.display || {};
      const mainTrack = settings.mainTrack || settings.typography || {};

      // 1. TEXT SHADOW (Full-Row Clickable Toggle)
      const shadowRow = this.createMinimalToggleRow({
        label: 'Text Shadow',
        checked: display.textShadow !== false,
        onToggle: val => {
          window.YTLingo.storageManager.setSetting('display', 'textShadow', val);
          window.YTLingo.subtitleEngine.applyInitialSettings();
          window.YTLingo.subtitleEngine.forceRerenderCurrentCue();
        }
      });
      scrollArea.appendChild(shadowRow);

      // 2. TYPEFACE (Expandable Accordion List with Checkmarks)
      const fontList = AVAILABLE_FONTS.map(f => ({ value: f.name, label: f.name }));
      const typefaceRow = this.createMinimalAccordionRow({
        label: 'Typeface',
        initialValue: mainTrack.fontFamily || 'Sinhala - 01',
        options: fontList,
        onSelect: fontName => {
          window.YTLingo.storageManager.setSetting('mainTrack', 'fontFamily', fontName);
          window.YTLingo.subtitleEngine.forceRerenderCurrentCue();
        }
      });
      scrollArea.appendChild(typefaceRow);

       // 1.1 PLATE BLUR (NEW: Full-Row Clickable Toggle)
// 1.1 PLATE BLUR (NEW: Full-Row Clickable Toggle)
      const blurRow = this.createMinimalToggleRow({
        label: 'Plate Blur',
        checked: display.plateBlur === true,
        onToggle: val => {
          window.YTLingo.storageManager.setSetting('display', 'plateBlur', val);
          window.YTLingo.subtitleEngine.applyInitialSettings();
          window.YTLingo.subtitleEngine.forceRerenderCurrentCue();
        }
      });
      scrollArea.appendChild(blurRow);

      // 1.2 LOCK SUBTITLE PLATE (NEW: lock.svg & unlock.svg Icon Toggle)
      const lockRow = this.createLockToggleRow({
        checked: display.lockPlate === true,
        onChange: val => {
          window.YTLingo.storageManager.setSetting('display', 'lockPlate', val);
          window.YTLingo.subtitleEngine.applyInitialSettings();
        }
      });
      scrollArea.appendChild(lockRow);

      // 3. FONT SIZE (Wheel Scrollable: Scroll up = +1px, Scroll down = -1px)
// 3. FONT SIZE (Wheel Scrollable: Scroll up = +1px, Scroll down = -1px)
      const sizeRow = this.createMinimalWheelScrollRow({
        label: 'Font Size',
        initialValue: mainTrack.fontSize || 25,
        unit: 'px',
        min: 12,
        max: 60,
        step: 1,
        onChange: val => {
          window.YTLingo.storageManager.setSetting('mainTrack', 'fontSize', val);
          window.YTLingo.subtitleEngine.applyInitialSettings();
          window.YTLingo.subtitleEngine.forceRerenderCurrentCue();

          // EXACT ID UPDATE: Update Subtitle Styling row via ID
          const styleRowVal = document.getElementById('ytl-val-styling');
          if (styleRowVal) styleRowVal.textContent = `${val}px`;
        }
      });
      scrollArea.appendChild(sizeRow);

      // 4. FONT WEIGHT (Wheel Scrollable or Accordion)
// 4. FONT WEIGHT (Instant Synchronous Update Fix)
      const weightRow = this.createMinimalWheelScrollRow({
        label: 'Font Weight',
        initialValue: mainTrack.fontWeight || 500,
        unit: '',
        min: 200,
        max: 800,
        step: 100,
        onChange: val => {
          window.YTLingo.storageManager.setSetting('mainTrack', 'fontWeight', val);
          window.YTLingo.subtitleEngine.applyInitialSettings();
          window.YTLingo.subtitleEngine.forceRerenderCurrentCue();
        }
      });
      scrollArea.appendChild(weightRow);

      // 5. FONT COLOR (Expandable Clean Accordion List)
      const colorRow = this.createMinimalAccordionRow({
        label: 'Font Color',
        initialValue: mainTrack.textColor || '#ffffff',
        options: this.getYTColors(),
        onSelect: colorHex => {
          window.YTLingo.storageManager.setSetting('mainTrack', 'textColor', colorHex);
          window.YTLingo.subtitleEngine.forceRerenderCurrentCue();
        }
      });
      scrollArea.appendChild(colorRow);

      // 6. PLATE OPACITY (Wheel Scrollable: 0% to 100% in 5% steps)
      const opacityRow = this.createMinimalWheelScrollRow({
        label: 'Plate Opacity',
        initialValue: display.plateOpacity ?? 50,
        unit: '%',
        min: 0,
        max: 100,
        step: 5,
        onChange: val => {
          window.YTLingo.storageManager.setSetting('display', 'plateOpacity', val);
          window.YTLingo.subtitleEngine.applyInitialSettings();
        }
      });
      scrollArea.appendChild(opacityRow);

      // 7. PLATE COLOR (Expandable Clean Accordion List)
      const plateColorRow = this.createMinimalAccordionRow({
        label: 'Plate Color',
        initialValue: display.plateColor || '#0e0e11',
        options: this.getYTColors(),
        onSelect: colorHex => {
          if ((window.YTLingo.storageManager.getSettings().display?.plateOpacity ?? 0) === 0) {
            window.YTLingo.storageManager.setSetting('display', 'plateOpacity', 50);
          }
          window.YTLingo.storageManager.setSetting('display', 'plateColor', colorHex);
          window.YTLingo.subtitleEngine.applyInitialSettings();
        }
      });
      scrollArea.appendChild(plateColorRow);

      panel.appendChild(scrollArea);
      return panel;
    }

    // =========================================================================
    // YOUTUBE MINIMALIST COMPONENT BUILDERS (CLICKABLE ROWS & WHEEL SCROLL)
    // =========================================================================

    // 1. Full Row Clickable Toggle Switch
    createMinimalToggleRow({ label, checked, onToggle }) {
      const row = document.createElement('div');
      row.className = 'ytl-sub-row';

      const left = document.createElement('div');
      left.className = 'ytl-sub-row-left';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'ytl-sub-row-label';
      labelSpan.textContent = label;
      left.appendChild(labelSpan);

      const right = document.createElement('div');
      right.className = 'ytl-sub-row-right';
      const toggle = this.createToggleSwitchComponent({
        checked: checked,
        onChange: onToggle
      });
      right.appendChild(toggle);

      row.appendChild(left);
      row.appendChild(right);

      // When click anywhere on the row (except the switch itself), toggle the switch
      row.addEventListener('click', (e) => {
        if (!e.target.closest('.ytl-switch-label')) {
          const cb = row.querySelector('input[type="checkbox"]');
          if (cb) cb.click();
        }
      });

      return row;
    }

    // =========================================================================
    // NEW LOOK LOCK/UNLOCK ICON TOGGLE ROW (USING lock.svg & unlock.svg)
    // =========================================================================
    createLockToggleRow({ checked, onChange }) {
      let isLocked = checked;
      const row = document.createElement('div');
      row.className = 'ytl-sub-row';

      const left = document.createElement('div');
      left.className = 'ytl-sub-row-left';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'ytl-sub-row-label';
      labelSpan.textContent = 'Lock Subtitle Plate';
      left.appendChild(labelSpan);

      const right = document.createElement('div');
      right.className = 'ytl-sub-row-right';

      // Minimalist Icon Toggle Pill Button
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'ytl-lock-toggle-pill' + (isLocked ? ' ytl-locked' : '');
      toggleBtn.type = 'button';

      const iconImg = document.createElement('img');
      iconImg.className = 'ytl-lock-svg-icon';
      const api = typeof browser !== 'undefined' ? browser : chrome;

      const statusText = document.createElement('span');
      statusText.className = 'ytl-lock-status-text';

      const updateUI = () => {
        iconImg.src = api.runtime.getURL(isLocked ? 'assets/icons/menu/lock.svg' : 'assets/icons/menu/unlock.svg');
        iconImg.alt = isLocked ? 'Locked' : 'Unlocked';
        toggleBtn.classList.toggle('ytl-locked', isLocked);
        statusText.textContent = isLocked ? 'LOCKED' : 'UNLOCKED';
      };

      updateUI();

      toggleBtn.appendChild(iconImg);
      toggleBtn.appendChild(statusText);
      right.appendChild(toggleBtn);

      row.appendChild(left);
      row.appendChild(right);

      // When click anywhere on the row (except the switch itself), toggle the switch
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        isLocked = !isLocked;
        updateUI();
        onChange(isLocked);
      });

      return row;
    }

    // 2. Mouse Wheel Scrollable Number Adjustment Row (1px steps)
    createMinimalWheelScrollRow({ label, initialValue, unit, min, max, step, onChange }) {
      let currentVal = initialValue;

      const row = document.createElement('div');
      row.className = 'ytl-sub-row';

      const left = document.createElement('div');
      left.className = 'ytl-sub-row-left';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'ytl-sub-row-label';
      labelSpan.textContent = label;
      left.appendChild(labelSpan);

      const right = document.createElement('div');
      right.className = 'ytl-sub-row-right';
      
      const badge = document.createElement('span');
      badge.className = 'ytl-wheel-badge';
      badge.title = 'Scroll mouse wheel over here to change';
      badge.textContent = `${currentVal}${unit}`;
      right.appendChild(badge);

      row.appendChild(left);
      row.appendChild(right);

      // Mouse Wheel එකෙන් අගය වෙනස් කිරීම (Wheel Up = +, Wheel Down = -)
      row.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.deltaY < 0) {
          // Scroll Up: 
          if (currentVal + step <= max) currentVal += step;
        } else {
          // Scroll Down: 
          if (currentVal - step >= min) currentVal -= step;
        }

        badge.textContent = `${currentVal}${unit}`;
        onChange(currentVal);
      }, { passive: false });

      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        currentVal = (currentVal + step > max) ? min : currentVal + step;
        badge.textContent = `${currentVal}${unit}`;
        onChange(currentVal);
      });

      return row;
    }

    // 3. Clean Expandable Accordion Row (Typeface, Colors)
    createMinimalAccordionRow({ label, initialValue, options, onSelect }) {
      let selectedVal = initialValue;
      const initialOpt = options.find(o => o.value === selectedVal);
      let displayLabel = initialOpt ? initialOpt.label : selectedVal;

      const wrapper = document.createElement('div');
      wrapper.className = 'ytl-accordion-wrapper';

      const row = document.createElement('div');
      row.className = 'ytl-sub-row';

      const left = document.createElement('div');
      left.className = 'ytl-sub-row-left';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'ytl-sub-row-label';
      labelSpan.textContent = label;
      left.appendChild(labelSpan);

      const right = document.createElement('div');
      right.className = 'ytl-sub-row-right';

      const valSpan = document.createElement('span');
      valSpan.className = 'ytl-sub-row-value';
      valSpan.textContent = displayLabel;
      right.appendChild(valSpan);

      const chevron = document.createElement('div');
      chevron.className = 'ytl-chevron-icon';
      chevron.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9.29 6.71a.996.996 0 0 0 0 1.41L13.88 12l-4.59 4.59a.996.996 0 1 0 1.41 1.41l5.3-5.3a.996.996 0 0 0 0-1.41l-5.3-5.3a.996.996 0 0 0-1.41 0z"/></svg>';
      right.appendChild(chevron);

      row.appendChild(left);
      row.appendChild(right);
      wrapper.appendChild(row);

      // Expandable Drawer Container
      const drawer = document.createElement('div');
      drawer.className = 'ytl-accordion-drawer';

      // Options Render
      options.forEach(opt => {
        const item = document.createElement('div');
        item.className = 'ytl-accordion-item';
        if (opt.value === selectedVal) item.classList.add('ytl-selected');

        const check = document.createElement('div');
        check.className = 'ytl-item-check';
        check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = opt.label;

        item.appendChild(check);
        item.appendChild(nameSpan);

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedVal = opt.value;
          valSpan.textContent = opt.label;

          drawer.querySelectorAll('.ytl-accordion-item').forEach(el => el.classList.remove('ytl-selected'));
          item.classList.add('ytl-selected');

          onSelect(opt.value);

          drawer.classList.remove('ytl-expanded');
          chevron.classList.remove('ytl-chevron-rotated');
        });

        drawer.appendChild(item);
      });

      wrapper.appendChild(drawer);

      row.addEventListener('click', () => {
        const isExpanded = drawer.classList.contains('ytl-expanded');
        drawer.classList.toggle('ytl-expanded', !isExpanded);
        chevron.classList.toggle('ytl-chevron-rotated', !isExpanded);
      });

      return wrapper;
    }

    // =========================================================================
    // SUB-MENU: LIVE TRANSLATION (YOUTUBE MINIMALIST ARCHITECTURE)
    // =========================================================================
    createSubmenuLiveTranslation() {
      const panel = document.createElement('div');
      panel.className = 'ytl-menu-panel ytl-panel-sub';

      panel.appendChild(this.createSubmenuHeader('Live Translation'));

      const scrollArea = document.createElement('div');
      scrollArea.className = 'ytl-panel-scroll-area';

      const settings = window.YTLingo.storageManager.getSettings();
      const liveTrans = settings.liveTranslation || {};

      // 1. Live Subtitles (Toggle Switch)
      scrollArea.appendChild(this.createMinimalToggleRow({
        label: 'Live Subtitles',
        checked: liveTrans.enabled === true,
        onToggle: val => {
          window.YTLingo.storageManager.setSetting('liveTranslation', 'enabled', val);
          window.YTLingo.subtitleEngine.forceRerenderCurrentCue();
          const rowVal = this.dockContainer?.querySelector('.ytl-panel-root .ytl-menu-row:nth-child(4) .ytl-menu-value-text');
          if (rowVal) rowVal.textContent = val ? 'On' : 'Off';
        }
      }));

      // 2. Position (Bottom / Top Expandable)
      scrollArea.appendChild(this.createMinimalAccordionRow({
        label: 'Position',
        initialValue: liveTrans.position || 'bottom',
        options: [
          { value: 'bottom', label: 'Bottom' },
          { value: 'top', label: 'Top' }
        ],
        onSelect: pos => {
          window.YTLingo.storageManager.setSetting('liveTranslation', 'position', pos);
          window.YTLingo.subtitleEngine.forceRerenderCurrentCue();
        }
      }));

      // 3. Typeface (Expandable List)
      const fontList = AVAILABLE_FONTS.map(f => ({ value: f.name, label: f.name }));
      scrollArea.appendChild(this.createMinimalAccordionRow({
        label: 'Typeface',
        initialValue: liveTrans.fontFamily || 'Sinhala - 01',
        options: fontList,
        onSelect: fontName => {
          window.YTLingo.storageManager.setSetting('liveTranslation', 'fontFamily', fontName);
          window.YTLingo.subtitleEngine.forceRerenderCurrentCue();
        }
      }));

      // 4. Font Size (Wheel Scrollable - Clean Text)
      scrollArea.appendChild(this.createMinimalWheelScrollRow({
        label: 'Font Size',
        initialValue: liveTrans.fontSize || 22,
        unit: 'px',
        min: 12,
        max: 60,
        step: 1,
        onChange: val => {
          window.YTLingo.storageManager.setSetting('liveTranslation', 'fontSize', val);
          window.YTLingo.subtitleEngine.forceRerenderCurrentCue();
        }
      }));

      // 5. Font Weight (Wheel Scrollable - Clean Text)
      scrollArea.appendChild(this.createMinimalWheelScrollRow({
        label: 'Font Weight',
        initialValue: liveTrans.fontWeight || 500,
        unit: '',
        min: 200,
        max: 800,
        step: 100,
        onChange: val => {
          window.YTLingo.storageManager.setSetting('liveTranslation', 'fontWeight', val);
          window.YTLingo.subtitleEngine.forceRerenderCurrentCue();
        }
      }));

      // 6. Font Color (Expandable Colors)
      scrollArea.appendChild(this.createMinimalAccordionRow({
        label: 'Font Color',
        initialValue: liveTrans.textColor || '#00e676',
        options: this.getYTColors(),
        onSelect: color => {
          window.YTLingo.storageManager.setSetting('liveTranslation', 'textColor', color);
          window.YTLingo.subtitleEngine.forceRerenderCurrentCue();
        }
      }));

      panel.appendChild(scrollArea);
      return panel;
    }

    // =========================================================================
    // SUB-MENU 2: TARGET LANGUAGE (CACHE-CLEAR & EXACT ID UPDATE FIX)
    // =========================================================================
    createSubmenuLanguage() {
      const panel = document.createElement('div');
      panel.className = 'ytl-menu-panel ytl-panel-sub';

      panel.appendChild(this.createSubmenuHeader('Target Language'));

      const listContainer = document.createElement('div');
      listContainer.className = 'ytl-lang-list-container';

      const languages = [
        { code: 'si', name: 'Sinhala (සිංහල)', short: 'Sinhala' },
        { code: 'en', name: 'English', short: 'English' },
        { code: 'es', name: 'Spanish (Español)', short: 'Spanish' },
        { code: 'ta', name: 'Tamil (தமிழ்)', short: 'Tamil' },
        { code: 'hi', name: 'Hindi (हिन्दी)', short: 'Hindi' },
        { code: 'ja', name: 'Japanese (日本語)', short: 'Japanese' },
        { code: 'ko', name: 'Korean (한국어)', short: 'Korean' },
        { code: 'zh-CN', name: 'Chinese (中文)', short: 'Chinese' },
        { code: 'ru', name: 'Russian (Русский)', short: 'Russian' },
        { code: 'de', name: 'German (Deutsch)', short: 'German' },
        { code: 'fr', name: 'French (Français)', short: 'French' },
        { code: 'it', name: 'Italian (Italiano)', short: 'Italian' },
        { code: 'pt', name: 'Portuguese (Português)', short: 'Portuguese' },
        { code: 'ar', name: 'Arabic (العربية)', short: 'Arabic' },
        { code: 'tr', name: 'Turkish (Türkçe)', short: 'Turkish' },
        { code: 'bn', name: 'Bengali (বাংলা)', short: 'Bengali' }
      ];

      const renderList = () => {
        listContainer.innerHTML = '';
        const currentLang = window.YTLingo.storageManager.getSettings().translation?.targetLang || 'si';

        languages.forEach(lang => {
          const row = document.createElement('div');
          row.className = 'ytl-lang-list-row';
          const isSelected = lang.code === currentLang;

          if (isSelected) {
            row.classList.add('ytl-lang-selected');
          }

          // Checkmark
          const checkDiv = document.createElement('div');
          checkDiv.className = 'ytl-lang-checkmark';
          checkDiv.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>';
          row.appendChild(checkDiv);

          // Language Name
          const nameSpan = document.createElement('span');
          nameSpan.className = 'ytl-lang-name';
          nameSpan.textContent = lang.name;
          row.appendChild(nameSpan);

          row.addEventListener('click', () => {
            // 1. Save new language setting
            window.YTLingo.storageManager.setSetting('translation', 'targetLang', lang.code);

            // 2. CRITICAL FIX: Clear old translation cache completely!
            if (window.YTLingo.translationManager) {
              window.YTLingo.translationManager.clearCache();
            }

            // 3. TARGETED UPDATE: Update the EXACT 'Target Language' row via ID (No more nth-child bugs!)
            const targetLangVal = document.getElementById('ytl-val-lang');
            if (targetLangVal) {
              targetLangVal.textContent = lang.short;
            }

            // 4. Force immediate rerender with fresh translation for active subtitle
            window.YTLingo.subtitleEngine.forceRerenderCurrentCue();

            renderList();

            // Smooth slide back to main menu
            setTimeout(() => this.goBack(), 160);
          });

          listContainer.appendChild(row);
        });
      };

      renderList();
      panel.appendChild(listContainer);
      return panel;
    }

    // =========================================================================
    // SUB-MENU: HOVER TRANSLATION (YOUTUBE MINIMALIST ARCHITECTURE)
    // =========================================================================
    createSubmenuHover() {
      const panel = document.createElement('div');
      panel.className = 'ytl-menu-panel ytl-panel-sub';

      panel.appendChild(this.createSubmenuHeader('Hover Translation'));

      const scrollArea = document.createElement('div');
      scrollArea.className = 'ytl-panel-scroll-area';

      const settings = window.YTLingo.storageManager.getSettings();
      const hoverTrans = settings.hoverTranslation || {};

      // 1. Hover to Translate Toggle
      scrollArea.appendChild(this.createMinimalToggleRow({
        label: 'Hover to Translate',
        checked: hoverTrans.enabled !== false,
        onToggle: val => {
          window.YTLingo.storageManager.setSetting('hoverTranslation', 'enabled', val);
          window.YTLingo.subtitleEngine.forceRerenderCurrentCue();
          const rowVal = this.dockContainer?.querySelector('.ytl-panel-root .ytl-menu-row:nth-child(6) .ytl-menu-value-text');
          if (rowVal) rowVal.textContent = val ? 'On' : 'Off';
        }
      }));

      // 2. Position (Top / Bottom)
      scrollArea.appendChild(this.createMinimalAccordionRow({
        label: 'Tooltip Position',
        initialValue: hoverTrans.position || 'top',
        options: [
          { value: 'top', label: 'Top' },
          { value: 'bottom', label: 'Bottom' }
        ],
        onSelect: pos => {
          window.YTLingo.storageManager.setSetting('hoverTranslation', 'position', pos);
          window.YTLingo.subtitleEngine.applyInitialSettings();
        }
      }));

      // 3. Tooltip Shadow Toggle
      scrollArea.appendChild(this.createMinimalToggleRow({
        label: 'Tooltip Shadow',
        checked: hoverTrans.hasShadow !== false,
        onToggle: val => {
          window.YTLingo.storageManager.setSetting('hoverTranslation', 'hasShadow', val);
          window.YTLingo.subtitleEngine.applyInitialSettings();
        }
      }));

      // 4. Plate Opacity (Wheel Scroll)
      scrollArea.appendChild(this.createMinimalWheelScrollRow({
        label: 'Plate Opacity',
        initialValue: hoverTrans.plateOpacity ?? 90,
        unit: '%',
        min: 0,
        max: 100,
        step: 5,
        onChange: val => {
          window.YTLingo.storageManager.setSetting('hoverTranslation', 'plateOpacity', val);
          window.YTLingo.subtitleEngine.applyInitialSettings();
        }
      }));

      // 5. Plate Color
      scrollArea.appendChild(this.createMinimalAccordionRow({
        label: 'Plate Color',
        initialValue: hoverTrans.plateColor || '#0e0e11',
        options: this.getYTColors(),
        onSelect: color => {
          window.YTLingo.storageManager.setSetting('hoverTranslation', 'plateColor', color);
          window.YTLingo.subtitleEngine.applyInitialSettings();
        }
      }));

      // Divider: Tooltip Typography
      const header1 = document.createElement('div');
      header1.className = 'ytl-menu-section-header';
      header1.textContent = 'Tooltip Typography';
      scrollArea.appendChild(header1);

      // 6. Tooltip Typeface
      const fontList = AVAILABLE_FONTS.map(f => ({ value: f.name, label: f.name }));
      scrollArea.appendChild(this.createMinimalAccordionRow({
        label: 'Typeface',
        initialValue: hoverTrans.fontFamily || 'Sinhala - 01',
        options: fontList,
        onSelect: val => {
          window.YTLingo.storageManager.setSetting('hoverTranslation', 'fontFamily', val);
          window.YTLingo.subtitleEngine.applyInitialSettings();
        }
      }));

      // 7. Tooltip Font Size
      scrollArea.appendChild(this.createMinimalWheelScrollRow({
        label: 'Font Size',
        initialValue: hoverTrans.fontSize || 13,
        unit: 'px',
        min: 10,
        max: 26,
        step: 1,
        onChange: val => {
          window.YTLingo.storageManager.setSetting('hoverTranslation', 'fontSize', val);
          window.YTLingo.subtitleEngine.applyInitialSettings();
        }
      }));

      // 8. Tooltip Font Color
      scrollArea.appendChild(this.createMinimalAccordionRow({
        label: 'Font Color',
        initialValue: hoverTrans.textColor || '#00e676',
        options: this.getYTColors(),
        onSelect: color => {
          window.YTLingo.storageManager.setSetting('hoverTranslation', 'textColor', color);
          window.YTLingo.subtitleEngine.applyInitialSettings();
        }
      }));

      // Divider: Word Highlight
      const header2 = document.createElement('div');
      header2.className = 'ytl-menu-section-header';
      header2.textContent = 'Word Highlight on Track';
      scrollArea.appendChild(header2);

      // 9. Word Highlight Color
      scrollArea.appendChild(this.createMinimalAccordionRow({
        label: 'Highlight Text Color',
        initialValue: hoverTrans.wordTextColor || '#ffffff',
        options: this.getYTColors(),
        onSelect: color => {
          window.YTLingo.storageManager.setSetting('hoverTranslation', 'wordTextColor', color);
          window.YTLingo.subtitleEngine.applyInitialSettings();
        }
      }));

      // 10. Word Highlight Background
      scrollArea.appendChild(this.createMinimalAccordionRow({
        label: 'Highlight Background',
        initialValue: hoverTrans.wordBgColor || 'rgba(255, 255, 255, 0.25)',
        options: this.getYTHoverBgColors(),
        onSelect: color => {
          window.YTLingo.storageManager.setSetting('hoverTranslation', 'wordBgColor', color);
          window.YTLingo.subtitleEngine.applyInitialSettings();
        }
      }));

      panel.appendChild(scrollArea);
      return panel;
    }

    // =========================================================================
    // SUB-MENU 4: LIVE TRANSCRIPT STREAM (LOCAL FILE)
    // =========================================================================
    createSubmenuLiveTranscript() {
      const panel = document.createElement('div');
      panel.className = 'ytl-menu-panel ytl-panel-sub';

      panel.appendChild(this.createSubmenuHeader('Live Transcript'));

      const content = document.createElement('div');
      content.className = 'ytl-submenu-content';

      const metaRow = document.createElement('div');
      metaRow.className = 'ytl-cue-metadata';
      const fileNameSpan = document.createElement('span');
      fileNameSpan.id = 'ytl-meta-filename';
      fileNameSpan.textContent = 'No track active';
      const countSpan = document.createElement('span');
      countSpan.id = 'ytl-meta-cuecount';
      countSpan.textContent = '0 cues';
      metaRow.appendChild(fileNameSpan);
      metaRow.appendChild(countSpan);
      content.appendChild(metaRow);

      const cueList = document.createElement('div');
      cueList.className = 'ytl-cue-list';
      cueList.id = 'ytl-cues-list';
      cueList.style.maxHeight = '280px';
      content.appendChild(cueList);

      panel.appendChild(content);
      return panel;
    }

    // =========================================================================
    // SUB-MENU 5: CAPTIONS EXTRACTOR & DOWNLOADER
    // =========================================================================
    createSubmenuExtractor() {
      const panel = document.createElement('div');
      panel.className = 'ytl-menu-panel ytl-panel-sub';

      panel.appendChild(this.createSubmenuHeader('Captions Extractor'));

      const content = document.createElement('div');
      content.className = 'ytl-submenu-content';

      // Attach existing extractor controls cleanly inside submenu content
      const extractorCard = this.createCardExtractor();
      content.appendChild(extractorCard);

      const fetchedCard = this.createCardFetchedTranscript();
      content.appendChild(fetchedCard);

      panel.appendChild(content);
      return panel;
    }

    // =========================================================================
    // 7. DEVELOPER & IN-PLACE FEEDBACK PANEL (UNIFIED SINGLE-SCROLL ARCHITECTURE)
    // =========================================================================
    createSubmenuAbout() {
      const panel = document.createElement('div');
      panel.className = 'ytl-menu-panel ytl-panel-sub';

      panel.appendChild(this.createSubmenuHeader('About Developer'));

      const scrollArea = document.createElement('div');
      scrollArea.className = 'ytl-panel-scroll-area';
      scrollArea.appendChild(this.createCardAbout());

      panel.appendChild(scrollArea);
      return panel;
    }

    createCardAbout() {
      const container = document.createElement('div');
      container.className = 'ytl-about-box';

      // -------------------------------------------------------------
      // SECTION 1: DEVELOPER PROFILE & SOCIALS
      // -------------------------------------------------------------
      const profileRow = document.createElement('div');
      profileRow.className = 'ytl-dev-profile';

      const avatarImg = document.createElement('img');
      const api = typeof browser !== 'undefined' ? browser : chrome;
      avatarImg.className = 'ytl-dev-avatar';
      avatarImg.src = api.runtime.getURL('assets/branding/developer-avatar.png');
      avatarImg.alt = 'Anindu Uthsara';

      const details = document.createElement('div');
      details.className = 'ytl-dev-details';

      const name = document.createElement('span');
      name.className = 'ytl-dev-name';
      name.textContent = 'Anindu Uthsara';

      const role = document.createElement('span');
      role.className = 'ytl-dev-role';
      role.textContent = 'Creator & Developer • Biology Student';

      details.appendChild(name);
      details.appendChild(role);

      profileRow.appendChild(avatarImg);
      profileRow.appendChild(details);
      container.appendChild(profileRow);

      // Clean Bio
      const bio = document.createElement('p');
      bio.className = 'ytl-dev-bio';
      bio.textContent = 'Hi there! I am a Biology student who fell in love with computer programming. Coding is my biggest hobby and creative outlet. I listen to what real people struggle with every day on the web.';
      container.appendChild(bio);

      // Email Contact Row
      const emailBadge = document.createElement('a');
      emailBadge.className = 'ytl-dev-email-badge';
      emailBadge.href = 'mailto:aninduuthsara.communexus@gmail.com';
      emailBadge.title = 'Send Email to Developer';
      emailBadge.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
        <span>aninduuthsara.communexus@gmail.com</span>
      `;
      container.appendChild(emailBadge);

      // 3 Action Buttons (GitHub, Support ♥, 𝕏) - Feedback Button 100% Removed
      const actionsRow = document.createElement('div');
      actionsRow.className = 'ytl-dev-actions-row';

      // (1) Support (Pulsing Beating Heart SVG)
      const supportBtn = document.createElement('a');
      supportBtn.className = 'ytl-dev-action-btn ytl-dev-btn-support';
      supportBtn.href = 'https://buymeacoffee.com/aninduuthsara';
      supportBtn.target = '_blank';
      supportBtn.rel = 'noopener noreferrer';
      supportBtn.innerHTML = `
        <span class="ytl-beating-heart">
          <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </span>
        <span>Support</span>
      `;

      // (2) GitHub
      const githubBtn = document.createElement('a');
      githubBtn.className = 'ytl-dev-action-btn';
      githubBtn.href = 'https://github.com/aninduuthsara';
      githubBtn.target = '_blank';
      githubBtn.rel = 'noopener noreferrer';
      githubBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
        <span>GitHub</span>
      `;

      // (3) 𝕏
      const twitterBtn = document.createElement('a');
      twitterBtn.className = 'ytl-dev-action-btn';
      twitterBtn.href = 'https://x.com/aninduuthsara';
      twitterBtn.target = '_blank';
      twitterBtn.rel = 'noopener noreferrer';
      twitterBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        <span>Follow</span>
      `;

      actionsRow.appendChild(supportBtn);
      actionsRow.appendChild(githubBtn);
      actionsRow.appendChild(twitterBtn);
      container.appendChild(actionsRow);

      // -------------------------------------------------------------
      // SECTION 2: IN-PLACE FEEDBACK FORM (ALWAYS VISIBLE ON SCROLL)
      // -------------------------------------------------------------
      const sectionDivider = document.createElement('div');
      sectionDivider.className = 'ytl-menu-section-header';
      sectionDivider.style.padding = '14px 0 6px 0';
      sectionDivider.textContent = 'Feedback & Suggestions';
      container.appendChild(sectionDivider);

      // Simple English Note (Zero Emojis)
      const note = document.createElement('p');
      note.className = 'ytl-fb-note';
      note.textContent = 'No matter your age or position, feel free to ask questions, report bugs, or share ideas that bother you. I will do my best to improve it in the next update.';
      container.appendChild(note);

      // Topic Segmented Selector (Zero Emojis)
      const topics = ['Feature', 'Bug Report', 'Ask Question'];
      let selectedTopic = 'Feature';

      const topicGrid = document.createElement('div');
      topicGrid.className = 'ytl-unified-topic-bar';

      topics.forEach((top, idx) => {
        const pill = document.createElement('button');
        pill.className = 'ytl-topic-pill' + (idx === 0 ? ' ytl-active' : '');
        pill.textContent = top;
        pill.type = 'button';
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          topicGrid.querySelectorAll('.ytl-topic-pill').forEach(p => p.classList.remove('ytl-active'));
          pill.classList.add('ytl-active');
          selectedTopic = top;
        });
        topicGrid.appendChild(pill);
      });
      container.appendChild(topicGrid);

      // Minimal Star Rating Bar (Zero Boxes)
      const starsRow = document.createElement('div');
      starsRow.className = 'ytl-stars-row';

      let currentRating = 5;
      // Modern Geometric Minimalist Star Shape (Crisp & Symmetrical)
      const starSVG = `<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

      for (let i = 1; i <= 5; i++) {
        const starBtn = document.createElement('button');
        starBtn.className = 'ytl-star-btn' + (i <= currentRating ? ' ytl-star-active' : '');
        starBtn.innerHTML = starSVG;
        starBtn.type = 'button';
        starBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          currentRating = i;
          starsRow.querySelectorAll('.ytl-star-btn').forEach((s, sIdx) => {
            s.classList.toggle('ytl-star-active', sIdx < currentRating);
          });
        });
        starsRow.appendChild(starBtn);
      }
      container.appendChild(starsRow);

      // UNIFIED INSET CARD (One single box with clean hairline dividers)
      const unifiedBox = document.createElement('div');
      unifiedBox.className = 'ytl-unified-form-box';

      const nameInput = document.createElement('input');
      nameInput.className = 'ytl-form-field';
      nameInput.type = 'text';
      nameInput.placeholder = 'Your Name *';
      unifiedBox.appendChild(nameInput);

      const emailInput = document.createElement('input');
      emailInput.className = 'ytl-form-field';
      emailInput.type = 'email';
      emailInput.placeholder = 'Your Email (to reply) *';
      unifiedBox.appendChild(emailInput);

      const countryInput = document.createElement('input');
      countryInput.className = 'ytl-form-field';
      countryInput.type = 'text';
      countryInput.placeholder = 'Country (Optional)';
      unifiedBox.appendChild(countryInput);

      const subjectInput = document.createElement('input');
      subjectInput.className = 'ytl-form-field';
      subjectInput.type = 'text';
      subjectInput.placeholder = 'Subject / Title *';
      unifiedBox.appendChild(subjectInput);

      const messageInput = document.createElement('textarea');
      messageInput.className = 'ytl-form-field ytl-form-textarea';
      messageInput.placeholder = 'Describe your thoughts, bug, or question in detail... *';
      messageInput.rows = 3;
      unifiedBox.appendChild(messageInput);

      container.appendChild(unifiedBox);

      // Status text
      const statusText = document.createElement('div');
      statusText.className = 'ytl-form-status';
      statusText.style.display = 'none';
      container.appendChild(statusText);

      // Submit Button (Full width sleek YouTube pill)
      const submitBtn = document.createElement('button');
      submitBtn.className = 'ytl-minimal-btn ytl-minimal-btn-primary';
      submitBtn.type = 'button';
      submitBtn.style.margin = '4px 0 16px 0';
      submitBtn.style.width = '100%';
      submitBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
        <span>Send Feedback</span>
      `;

      submitBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const country = countryInput.value.trim();
        const subject = subjectInput.value.trim();
        const message = messageInput.value.trim();

        if (!name) {
          showStatus('Please enter your name.', '#ff4d6d');
          nameInput.focus();
          return;
        }
        if (!email || !email.includes('@')) {
          showStatus('Please enter a valid email address.', '#ff4d6d');
          emailInput.focus();
          return;
        }
        if (!subject) {
          showStatus('Please provide a subject.', '#ff4d6d');
          subjectInput.focus();
          return;
        }
        if (!message) {
          showStatus('Message body cannot be empty.', '#ff4d6d');
          messageInput.focus();
          return;
        }

        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.6';
        submitBtn.innerHTML = '<span>Sending securely...</span>';
        showStatus('Sending your feedback to developer...', '#00b0ff');

        // Obfuscated Web App URL Resolution (Prevents static GitHub scraping)
        const _p1 = 'aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy8=';
        const _p2 = 'AKfycbzydHDQkdcOGpTO-4JAzN_CjrOf0LwhEzGt9nwv7fxoJvH-ITscoRLZSAGNWXqLv8s';
        const _p3 = 'L2V4ZWM=';
        const SECURE_ENDPOINT = atob(_p1) + _p2 + atob(_p3);

        const payload = {
          secretToken: 'LINGOSUB_SECURE_TOKEN_2026', // Handshake security token
          type: selectedTopic,
          rating: currentRating,
          name: name,
          email: email,
          country: country || 'Not provided',
          subject: subject,
          message: message,
          sysInfo: navigator.userAgent
        };

        try {
          const res = await fetch(SECURE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            showStatus('Feedback sent successfully! Thank you.', '#00e676');
            nameInput.value = '';
            emailInput.value = '';
            countryInput.value = '';
            subjectInput.value = '';
            messageInput.value = '';
            submitBtn.innerHTML = '<span>Sent Successfully ✓</span>';

            setTimeout(() => {
              submitBtn.disabled = false;
              submitBtn.style.opacity = '1';
              submitBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
                <span>Send Feedback</span>
              `;
              statusText.style.display = 'none';
            }, 3000);
          } else {
            throw new Error('Server error');
          }
        } catch (err) {
          showStatus('Failed to send. Please check your internet connection.', '#ff4d6d');
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
          submitBtn.innerHTML = '<span>Retry Sending</span>';
        }
      });

      function showStatus(msg, color) {
        statusText.textContent = msg;
        statusText.style.color = color;
        statusText.style.display = 'block';
      }

      container.appendChild(submitBtn);
      return container;
    }

    // =========================================================================
    // REUSABLE UI BUILDER HELPERS FOR 3-TIER ARCHITECTURE
    // =========================================================================

    // Pure Minimalist Colors (No Red)
    getYTColors() {
      return [
        { value: '#ffffff', label: 'White' },
        { value: '#e5e5e5', label: 'Light Gray' },
        { value: '#aaaaaa', label: 'Gray' },
        { value: '#ffea00', label: 'Yellow' },
        { value: '#00e676', label: 'Green' },
        { value: '#00b0ff', label: 'Cyan' },
        { value: '#0e0e11', label: 'Black' }
      ];
    }

    // Translucent Colors for Hover Word Background
    getYTHoverBgColors() {
      return [
        { value: 'rgba(255, 255, 255, 0.25)', label: 'White Glass' },
        { value: 'rgba(255, 234, 0, 0.25)', label: 'Yellow Glass' },
        { value: 'rgba(0, 230, 118, 0.25)', label: 'Green Glass' },
        { value: 'rgba(0, 176, 255, 0.25)', label: 'Blue Glass' },
        { value: 'rgba(0, 0, 0, 0.45)', label: 'Dark Glass' }
      ];
    }

    /**
     * Universal Cycler Component (Replaces Dropdowns and Swatches completely)
     * e.g.,  < White >  or  < Green Glass >
     */
    createUniversalCyclerComponent({ options, initialValue, onChange }) {
      let currentIdx = options.findIndex(o => o.value === initialValue);
      if (currentIdx === -1) currentIdx = 0;

      const cycler = document.createElement('div');
      cycler.className = 'ytl-stepper';

      const prevBtn = document.createElement('button');
      prevBtn.className = 'ytl-stepper-btn';
      prevBtn.innerHTML = '&#10094;';

      const display = document.createElement('span');
      display.className = 'ytl-stepper-value';
      display.style.minWidth = '90px'; // Keeps buttons stable
      display.textContent = options[currentIdx].label;

      const nextBtn = document.createElement('button');
      nextBtn.className = 'ytl-stepper-btn';
      nextBtn.innerHTML = '&#10095;';

      const updateVal = (step) => {
        currentIdx = (currentIdx + step + options.length) % options.length;
        display.textContent = options[currentIdx].label;
        onChange(options[currentIdx].value);
      };

      prevBtn.addEventListener('click', (e) => { e.stopPropagation(); updateVal(-1); });
      nextBtn.addEventListener('click', (e) => { e.stopPropagation(); updateVal(1); });

      cycler.appendChild(prevBtn);
      cycler.appendChild(display);
      cycler.appendChild(nextBtn);
      return cycler;
    }

    createFontCyclerComponent({ initialFont, onChange }) {
      const fontFamilies = AVAILABLE_FONTS.map(f => f.name);
      let currentIdx = fontFamilies.indexOf(initialFont);
      if (currentIdx === -1) currentIdx = 0; // Default to 'Sinhala - 01'
      if (currentIdx === -1) currentIdx = 0;

      const cycler = document.createElement('div');
      cycler.className = 'ytl-stepper';

      const prevBtn = document.createElement('button');
      prevBtn.className = 'ytl-stepper-btn';
      prevBtn.innerHTML = '&#10094;';

      const display = document.createElement('span');
      display.className = 'ytl-stepper-value';
      display.style.minWidth = '120px';
      display.textContent = fontFamilies[currentIdx];

      const nextBtn = document.createElement('button');
      nextBtn.className = 'ytl-stepper-btn';
      nextBtn.innerHTML = '&#10095;';

      prevBtn.addEventListener('click', () => {
        currentIdx = (currentIdx - 1 + fontFamilies.length) % fontFamilies.length;
        display.textContent = fontFamilies[currentIdx];
        onChange(fontFamilies[currentIdx]);
      });

      nextBtn.addEventListener('click', () => {
        currentIdx = (currentIdx + 1) % fontFamilies.length;
        display.textContent = fontFamilies[currentIdx];
        onChange(fontFamilies[currentIdx]);
      });

      cycler.appendChild(prevBtn);
      cycler.appendChild(display);
      cycler.appendChild(nextBtn);
      return cycler;
    }

    createToggleSwitchComponent({ checked, onChange }) {
      const label = document.createElement('label');
      label.className = 'ytl-switch-label';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = checked;
      
      const slider = document.createElement('span');
      slider.className = 'ytl-slider-switch';

      // 100% Pure Native Event Handling (Browser handles rapid double clicks securely)
      checkbox.addEventListener('change', e => onChange(e.target.checked));

      label.appendChild(checkbox);
      label.appendChild(slider);
      return label;
    }

    createPositionPillsComponent({ initialPosition, options = ['bottom', 'top'], onChange }) {
      const group = document.createElement('div');
      group.className = 'ytl-segmented-group';
      group.style.width = '140px';

      options.forEach(opt => {
        const pill = document.createElement('button');
        pill.className = 'ytl-segment-pill';
        pill.textContent = opt.toUpperCase();
        if ((initialPosition || options[0]) === opt) {
          pill.classList.add('ytl-pill-active');
        }

        pill.addEventListener('click', () => {
          group.querySelectorAll('.ytl-segment-pill').forEach(p => p.classList.remove('ytl-pill-active'));
          pill.classList.add('ytl-pill-active');
          onChange(opt);
        });

        group.appendChild(pill);
      });
      return group;
    }

    /**
     * Injects @font-face rules for all 16 TTF files dynamically at runtime.
     */
    injectCustomFontFaces() {
      if (document.getElementById('ytl-injected-fonts')) return;
      const style = document.createElement('style');
      style.id = 'ytl-injected-fonts';
      const api = typeof browser !== 'undefined' ? browser : chrome;

      let css = '';
      AVAILABLE_FONTS.forEach(font => {
        const fontUrl = api.runtime.getURL(`fonts/${encodeURIComponent(font.file)}`);
        css += `
          @font-face {
            font-family: "${font.name}";
            src: url("${fontUrl}") format("truetype");
            font-weight: 400; /* 100 900 වෙනුවට 400 කිරීමෙන් Browser එකට Bold synthesize කිරීමට ඉඩ ලැබේ */
            font-style: normal;
            font-display: swap;
          }
        `;
      });
      style.textContent = css;
      document.head.appendChild(style);
    }

    /**
     * 3D Horizontal Cylindrical Language Roller Component.
     * Curved perspective cylinder with mouse wheel scrolling and click navigation!
     */
    create3DHorizontalLanguageRollerComponent({ initialLang = 'si', onSelect }) {
      const languages = [
        { code: 'si', name: 'Sinhala' },
        { code: 'en', name: 'English' },
        { code: 'es', name: 'Spanish' },
        { code: 'ta', name: 'Tamil' },
        { code: 'hi', name: 'Hindi' },
        { code: 'ja', name: 'Japanese' },
        { code: 'ko', name: 'Korean' },
        { code: 'zh-CN', name: 'Chinese' },
        { code: 'ru', name: 'Russian' },
        { code: 'de', name: 'German' },
        { code: 'fr', name: 'French' },
        { code: 'it', name: 'Italian' },
        { code: 'pt', name: 'Portuguese' },
        { code: 'ar', name: 'Arabic' },
        { code: 'tr', name: 'Turkish' },
        { code: 'bn', name: 'Bengali' }
      ];

      let currentIndex = languages.findIndex(l => l.code === initialLang);
      if (currentIndex === -1) currentIndex = 0;

      const box = document.createElement('div');
      box.className = 'ytl-3d-roller-box';

      // Left Navigation Button
      const leftBtn = document.createElement('button');
      leftBtn.className = 'ytl-3d-arrow-btn';
      leftBtn.innerHTML = '&#10094;';

      // 3D Viewport
      const viewport = document.createElement('div');
      viewport.className = 'ytl-3d-viewport';

      const drum = document.createElement('div');
      drum.className = 'ytl-3d-drum';
      viewport.appendChild(drum);

      // Right Navigation Button
      const rightBtn = document.createElement('button');
      rightBtn.className = 'ytl-3d-arrow-btn';
      rightBtn.innerHTML = '&#10095;';

      box.appendChild(leftBtn);
      box.appendChild(viewport);
      box.appendChild(rightBtn);

      const totalLangs = languages.length;

      // Render 5 visible slots along the 3D cylindrical arc (-2, -1, 0, +1, +2)
      const renderCylinder = () => {
        drum.innerHTML = '';

        const offsets = [-2, -1, 0, 1, 2];

        offsets.forEach(offset => {
          const langIdx = (currentIndex + offset + totalLangs) % totalLangs;
          const lang = languages[langIdx];

          const item = document.createElement('div');
          item.className = 'ytl-3d-item';
          item.textContent = lang.name;

          // 3D Cylinder Spatial Coordinates:
          // X: Horizontal translation along arc
          // Z: Depth recession into background (translateZ negative)
          // RotateY: 3D curvature angle towards viewer
          if (offset === 0) {
            item.classList.add('ytl-3d-center');
            item.style.transform = 'translateX(0px) translateZ(0px) rotateY(0deg) scale(1)';
            item.style.opacity = '1';
          } else if (offset === -1) {
            item.style.transform = 'translateX(-110px) translateZ(-45px) rotateY(32deg) scale(0.85)';
            item.style.opacity = '0.55';
          } else if (offset === 1) {
            item.style.transform = 'translateX(110px) translateZ(-45px) rotateY(-32deg) scale(0.85)';
            item.style.opacity = '0.55';
          } else if (offset === -2) {
            item.style.transform = 'translateX(-185px) translateZ(-95px) rotateY(55deg) scale(0.7)';
            item.style.opacity = '0.2';
          } else if (offset === 2) {
            item.style.transform = 'translateX(185px) translateZ(-95px) rotateY(-55deg) scale(0.7)';
            item.style.opacity = '0.2';
          }

          // Click any adjacent 3D language to rotate it directly to center
          item.addEventListener('click', e => {
            e.stopPropagation();
            if (offset !== 0) {
              stepCylinder(offset);
            }
          });

          drum.appendChild(item);
        });
      };

      const stepCylinder = (step) => {
        currentIndex = (currentIndex + step + totalLangs) % totalLangs;
        renderCylinder();
        if (typeof onSelect === 'function') {
          onSelect(languages[currentIndex].code);
        }
      };

      // Mouse Wheel 3D Scroll Rotation!
      viewport.addEventListener('wheel', e => {
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY > 0) {
          stepCylinder(1); // Spin to next (e.g. Sinhala -> English)
        } else {
          stepCylinder(-1); // Spin to previous
        }
      }, { passive: false });

      // Button Clicks
      leftBtn.addEventListener('click', e => {
        e.stopPropagation();
        stepCylinder(-1);
      });

      rightBtn.addEventListener('click', e => {
        e.stopPropagation();
        stepCylinder(1);
      });

      renderCylinder();
      return box;
    }

        // =========================================================================
        // 5. CARD: LIVE TRANSCRIPT BROWSER
        // =========================================================================

        createCardTranscriptBrowser() {
            const card = document.createElement('div');
            card.className = 'ytl-bento-card';
            card.id = 'ytl-card-transcript';

            const titleRow = document.createElement('div');
            titleRow.className = 'ytl-bento-card-title';

            const titleText = document.createElement('span');
            titleText.textContent = 'Live Transcript';

            const clearBtn = document.createElement('button');
            clearBtn.className = 'ytl-btn-link';
            clearBtn.textContent = 'Clear Track';
            clearBtn.addEventListener('click', () => {
                window.YTLingo.subtitleEngine.clearTrack();
                this.refreshTranscriptBrowserUI();
            });

            titleRow.appendChild(titleText);
            titleRow.appendChild(clearBtn);
            card.appendChild(titleRow);

            const metaRow = document.createElement('div');
            metaRow.className = 'ytl-cue-metadata';

            const fileNameSpan = document.createElement('span');
            fileNameSpan.id = 'ytl-meta-filename';
            fileNameSpan.textContent = 'No track active';

            const countSpan = document.createElement('span');
            countSpan.id = 'ytl-meta-cuecount';
            countSpan.textContent = '0 cues';

            metaRow.appendChild(fileNameSpan);
            metaRow.appendChild(countSpan);
            card.appendChild(metaRow);

            const cueList = document.createElement('div');
            cueList.className = 'ytl-cue-list';
            cueList.id = 'ytl-cues-list';

            this.isUserHoveringCueList = false;
            this.userManualScrolling = false;
            this.userManualScrollTimeout = null;

            cueList.addEventListener('mouseenter', () => { this.isUserHoveringCueList = true; });
            cueList.addEventListener('mouseleave', () => {
                this.isUserHoveringCueList = false;
                this.userManualScrolling = false;
            });
            cueList.addEventListener('wheel', () => {
                this.userManualScrolling = true;
                if (this.userManualScrollTimeout) clearTimeout(this.userManualScrollTimeout);
                this.userManualScrollTimeout = setTimeout(() => {
                    this.userManualScrolling = false;
                }, 4000); 
            }, { passive: true });

            card.appendChild(cueList);

            return card;
        }

        refreshTranscriptBrowserUI() {
            const session = window.YTLingo.storageManager.getSessionTrack();

            const activeDock = document.querySelector('#ytl-dock-container') || this.dockContainer;
            const fileNameEl = activeDock?.querySelector('#ytl-meta-filename');
            const countEl = activeDock?.querySelector('#ytl-meta-cuecount');
            const cueListEl = activeDock?.querySelector('#ytl-cues-list');

            if (!fileNameEl || !countEl || !cueListEl) return;

            this.cueRowElements = [];
            while (cueListEl.firstChild) {
                cueListEl.removeChild(cueListEl.firstChild);
            }

            if (!session || !session.cues || session.cues.length === 0) {
                fileNameEl.textContent = 'No track active';
                countEl.textContent = '0 cues';
                return;
            }

            fileNameEl.textContent = session.fileName || 'Active Track';
            countEl.textContent = `${session.cueCount} cues`;

            const cues = session.cues;
            for (let i = 0; i < cues.length; i++) {
                const cue = cues[i];
                const line = document.createElement('div');
                line.className = 'ytl-cue-line';
                line.dataset.index = String(i);

                const time = document.createElement('span');
                time.className = 'ytl-cue-timestamp';
                time.textContent = window.YTLingo.transcriptExtractor.secondsToDisplayTime(cue.start);

                const text = document.createElement('span');
                text.className = 'ytl-cue-text';
                text.textContent = cue.text;

                line.appendChild(time);
                line.appendChild(text);

                line.addEventListener('click', () => {
                    window.YTLingo.subtitleEngine.seekTo(cue.start);
                });

                cueListEl.appendChild(line);
                this.cueRowElements.push(line);
            }
        }

        bindCueSyncObserver() {
            this.unsubscribeCueEngine = window.YTLingo.subtitleEngine.onCueChange((activeCue, activeIndex) => {
                if (!this.isDockVisible) return;

                for (let i = 0; i < this.cueRowElements.length; i++) {
                    this.cueRowElements[i].classList.remove('ytl-cue-active');
                }

                if (activeIndex >= 0 && activeIndex < this.cueRowElements.length) {
                    const targetEl = this.cueRowElements[activeIndex];
                    targetEl.classList.add('ytl-cue-active');

                    if (!this.isUserHoveringCueList && !this.userManualScrolling) {
    const parentContainer = targetEl.closest('.ytl-cue-list');
    if (parentContainer) {
        const targetOffsetTop = targetEl.offsetTop;
        const containerHeight = parentContainer.clientHeight;
        const elementHeight = targetEl.clientHeight;
        parentContainer.scrollTo({
            top: targetOffsetTop - (containerHeight / 2) + (elementHeight / 2),
            behavior: 'smooth'
        });
    }
}
                }
            });
        }

    // =========================================================================
    // MINIMALIST YOUTUBE CAPTIONS EXTRACTOR CARD (FIXED RESET & BUTTONS)
    // =========================================================================
    createCardExtractor() {
      const card = document.createElement('div');
      card.className = 'ytl-bento-card';
      card.style.padding = '8px 0';

      const fetchBtn = document.createElement('button');
      fetchBtn.className = 'ytl-minimal-btn ytl-minimal-btn-primary';
      fetchBtn.textContent = 'Fetch Video Captions';

      const resetBtn = document.createElement('button');
      resetBtn.className = 'ytl-minimal-btn';
      resetBtn.textContent = 'Reset Extractor';
      resetBtn.style.display = 'none';

      const trackListContainer = document.createElement('div');
      trackListContainer.className = 'ytl-accordion-drawer';
      trackListContainer.style.display = 'none';

      const loadBtn = document.createElement('button');
      loadBtn.className = 'ytl-minimal-btn ytl-minimal-btn-primary';
      loadBtn.textContent = 'Load Selected Track';
      loadBtn.style.display = 'none';

      let availableTracks = [];
      let selectedTrackId = null;

      // 1. Reset Button Listener (Fixed: Reset text back to "Fetch Video Captions")
      resetBtn.addEventListener('click', () => {
        availableTracks = [];
        selectedTrackId = null;
        this.extractedYouTubeCues = [];

        trackListContainer.innerHTML = '';
        trackListContainer.style.display = 'none';
        trackListContainer.classList.remove('ytl-expanded');

        loadBtn.style.display = 'none';
        resetBtn.style.display = 'none';

        fetchBtn.style.display = 'flex';
        fetchBtn.textContent = 'Fetch Video Captions';
        fetchBtn.disabled = false;

        const fetchedCard = document.querySelector('#ytl-card-fetched-transcript');
        if (fetchedCard) fetchedCard.style.display = 'none';
      });

      fetchBtn.addEventListener('click', async () => {
        fetchBtn.textContent = 'Fetching Captions...';
        fetchBtn.disabled = true;

        try {
          availableTracks = await window.YTLingo.transcriptExtractor.fetchAvailableTracks();
          trackListContainer.innerHTML = '';

          if (availableTracks.length === 0) {
            alert('No captions found for this video.');
            fetchBtn.textContent = 'Fetch Video Captions';
            fetchBtn.disabled = false;
            return;
          }

          availableTracks.forEach((t, index) => {
            const item = document.createElement('div');
            item.className = 'ytl-accordion-item';
            if (index === 0) {
              item.classList.add('ytl-selected');
              selectedTrackId = t.id;
            }

            const check = document.createElement('div');
            check.className = 'ytl-item-check';
            check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>';

            const label = document.createElement('span');
            label.textContent = `${t.name} (${t.languageCode})${t.isAutoGenerated ? ' [Auto]' : ''}`;

            item.appendChild(check);
            item.appendChild(label);

            item.addEventListener('click', () => {
              trackListContainer.querySelectorAll('.ytl-accordion-item').forEach(el => el.classList.remove('ytl-selected'));
              item.classList.add('ytl-selected');
              selectedTrackId = t.id;
            });

            trackListContainer.appendChild(item);
          });

          trackListContainer.style.display = 'block';
          trackListContainer.classList.add('ytl-expanded');
          loadBtn.style.display = 'flex';
          resetBtn.style.display = 'flex';
          fetchBtn.style.display = 'none';
        } catch (err) {
          alert('Caption extraction failed: ' + err.message);
          fetchBtn.textContent = 'Fetch Video Captions';
          fetchBtn.disabled = false;
        }
      });

      loadBtn.addEventListener('click', async () => {
        if (selectedTrackId === null) return;
        const selectedTrack = availableTracks.find(t => t.id === selectedTrackId);
        if (!selectedTrack) return;

        loadBtn.textContent = 'Extracting Track...';
        loadBtn.disabled = true;

        try {
          const cues = await window.YTLingo.transcriptExtractor.fetchTrackCues(selectedTrack.baseUrl);
          this.extractedYouTubeCues = cues;
          this.updateFetchedTranscriptCard(selectedTrack.name, cues);
          loadBtn.textContent = 'Extracted Successfully ✓';
          setTimeout(() => {
            loadBtn.textContent = 'Load Selected Track';
            loadBtn.disabled = false;
          }, 1500);
        } catch (err) {
          alert('Failed to load track: ' + err.message);
          loadBtn.textContent = 'Load Selected Track';
          loadBtn.disabled = false;
        }
      });

      card.appendChild(fetchBtn);
      card.appendChild(trackListContainer);
      card.appendChild(loadBtn);
      card.appendChild(resetBtn);

      return card;
    }

        // =========================================================================
        // SEPARATE DEDICATED CARD FOR FETCHED YOUTUBE TRANSCRIPTS (EXPORT & VIEW)
        // =========================================================================

        createCardFetchedTranscript() {
      const card = document.createElement('div');
      card.className = 'ytl-bento-card';
      card.id = 'ytl-card-fetched-transcript';
      card.style.display = 'none';

      const titleRow = document.createElement('div');
      titleRow.className = 'ytl-bento-card-title';

      const titleText = document.createElement('span');
      titleText.textContent = 'Extracted Video Captions';

      const clearBtn = document.createElement('button');
      clearBtn.className = 'ytl-btn-link';
      clearBtn.textContent = 'Close';
      clearBtn.addEventListener('click', () => {
        card.style.display = 'none';
        this.extractedYouTubeCues = [];
        if (window.YTLingo.translationManager) {
          window.YTLingo.translationManager.cancelBatch();
        }
      });

      titleRow.appendChild(titleText);
      titleRow.appendChild(clearBtn);
      card.appendChild(titleRow);

      const metaRow = document.createElement('div');
      metaRow.className = 'ytl-cue-metadata';

      const fileNameSpan = document.createElement('span');
      fileNameSpan.id = 'ytl-fetched-filename';
      fileNameSpan.textContent = '';

      const countSpan = document.createElement('span');
      countSpan.id = 'ytl-fetched-count';
      countSpan.textContent = '0 cues';

      metaRow.appendChild(fileNameSpan);
      metaRow.appendChild(countSpan);
      card.appendChild(metaRow);

      // Scrollable Preview List
      const previewList = document.createElement('div');
      previewList.className = 'ytl-cue-list';
      previewList.id = 'ytl-fetched-cues-list';
      previewList.style.maxHeight = '130px';
      card.appendChild(previewList);

      // =======================================================================
      // BATCH FULL TRANSCRIPT TRANSLATION WIDGET
      // =======================================================================
      const translateActionBtn = document.createElement('button');
      translateActionBtn.className = 'ytl-action-btn ytl-btn-primary';
      translateActionBtn.style.marginTop = '6px';
      translateActionBtn.textContent = 'Translate Full Transcript';

      // Progress Box (Hidden initially)
      const progressBox = document.createElement('div');
      progressBox.className = 'ytl-batch-progress-box';
      progressBox.style.display = 'none';

      const progressHeader = document.createElement('div');
      progressHeader.className = 'ytl-progress-header';

      const progressStatus = document.createElement('span');
      progressStatus.textContent = 'Translating: 0%';

      const progressStats = document.createElement('span');
      progressStats.className = 'ytl-progress-stats';
      progressStats.textContent = '0 cues • ~0s remaining';

      progressHeader.appendChild(progressStatus);
      progressHeader.appendChild(progressStats);

      const progressTrack = document.createElement('div');
      progressTrack.className = 'ytl-progress-track';
      const progressFill = document.createElement('div');
      progressFill.className = 'ytl-progress-fill';
      progressTrack.appendChild(progressFill);

      // Batch Controls: Pause/Resume, Cancel
      const batchControlsRow = document.createElement('div');
      batchControlsRow.className = 'ytl-batch-btn-row';

      const pauseResumeBtn = document.createElement('button');
      pauseResumeBtn.className = 'ytl-btn-batch-control';
      pauseResumeBtn.textContent = 'Pause';

      let isPausedState = false;
      pauseResumeBtn.addEventListener('click', () => {
        if (!window.YTLingo.translationManager) return;
        isPausedState = !isPausedState;
        if (isPausedState) {
          window.YTLingo.translationManager.pauseBatch();
          pauseResumeBtn.textContent = 'Resume';
        } else {
          window.YTLingo.translationManager.resumeBatch();
          pauseResumeBtn.textContent = 'Pause';
        }
      });

      const cancelBatchBtn = document.createElement('button');
      cancelBatchBtn.className = 'ytl-btn-batch-control ytl-btn-batch-cancel';
      cancelBatchBtn.textContent = 'Cancel';

      cancelBatchBtn.addEventListener('click', () => {
        if (window.YTLingo.translationManager) {
          window.YTLingo.translationManager.cancelBatch();
        }
        progressBox.style.display = 'none';
        translateActionBtn.style.display = 'flex';
        translateActionBtn.disabled = false;
        translateActionBtn.textContent = 'Translate Full Transcript';
      });

      batchControlsRow.appendChild(pauseResumeBtn);
      batchControlsRow.appendChild(cancelBatchBtn);

      progressBox.appendChild(progressHeader);
      progressBox.appendChild(progressTrack);
      progressBox.appendChild(batchControlsRow);

      card.appendChild(translateActionBtn);
      card.appendChild(progressBox);

      // =======================================================================
      // DUAL EXPORT ROWS: ORIGINAL vs TRANSLATED
      // =======================================================================

      // 1. Export Original Track
      const originalExportTitle = document.createElement('span');
      originalExportTitle.className = 'ytl-export-section-title';
      originalExportTitle.textContent = 'Export Original Track:';

      const originalExportRow = document.createElement('div');
      originalExportRow.className = 'ytl-action-btn-row';

      ['SRT', 'VTT', 'TXT'].forEach(fmt => {
        const btn = document.createElement('button');
        btn.className = 'ytl-action-btn';
        btn.textContent = `.${fmt}`;

        btn.addEventListener('click', () => {
          if (!this.extractedYouTubeCues || this.extractedYouTubeCues.length === 0) {
            alert('No extracted captions available to export.');
            return;
          }
          const baseTitle = this.getCleanVideoTitle();
          window.YTLingo.transcriptExtractor.exportTranscript(fmt.toLowerCase(), this.extractedYouTubeCues, baseTitle);
        });

        originalExportRow.appendChild(btn);
      });

      card.appendChild(originalExportTitle);
      card.appendChild(originalExportRow);

      // 2. Export Translated Track (Initially Disabled until translation finishes)
      const transExportTitle = document.createElement('span');
      transExportTitle.className = 'ytl-export-section-title';
      transExportTitle.textContent = 'Export Translated Track:';

      const transExportRow = document.createElement('div');
      transExportRow.className = 'ytl-action-btn-row';
      this.translatedExportButtons = [];

      ['SRT', 'VTT', 'TXT'].forEach(fmt => {
        const btn = document.createElement('button');
        btn.className = 'ytl-action-btn';
        btn.textContent = `.${fmt}`;
        btn.disabled = true; // Disabled until translated

        btn.addEventListener('click', () => {
          const transCues = window.YTLingo.translationManager?.getTranslatedFullTrackCues();
          if (!transCues || transCues.length === 0) {
            alert('Please translate the transcript first before exporting.');
            return;
          }
          const settings = window.YTLingo.storageManager.getSettings();
          const targetLang = settings.translation?.targetLang || 'si';
          const baseTitle = `${this.getCleanVideoTitle()}_${targetLang}`;
          window.YTLingo.transcriptExtractor.exportTranscript(fmt.toLowerCase(), transCues, baseTitle);
        });

        this.translatedExportButtons.push(btn);
        transExportRow.appendChild(btn);
      });

      card.appendChild(transExportTitle);
      card.appendChild(transExportRow);

      // Translate Full Track Action Listener
      translateActionBtn.addEventListener('click', async () => {
        if (!this.extractedYouTubeCues || this.extractedYouTubeCues.length === 0) {
          alert('Please extract a YouTube track first.');
          return;
        }

        const settings = window.YTLingo.storageManager.getSettings();
        const targetLang = settings.translation?.targetLang || 'si';

        translateActionBtn.style.display = 'none';
        progressBox.style.display = 'flex';
        progressFill.style.width = '0%';
        isPausedState = false;
        pauseResumeBtn.textContent = 'Pause';

        try {
          const translatedCues = await window.YTLingo.translationManager.translateFullTrackBatch(
            this.extractedYouTubeCues,
            targetLang,
            progress => {
              progressFill.style.width = `${progress.percent}%`;
              progressStatus.textContent = `Translating: ${progress.percent}%`;
              progressStats.textContent = `${progress.completedCues}/${progress.totalCues} cues (${progress.currentChunk}/${progress.totalChunks} chunks) • ~${progress.remainingSec}s remaining`;
            }
          );

          // Update preview list with translated text
          this.updateFetchedTranscriptCard(
            `${fileNameSpan.textContent || 'YouTube Track'} (${targetLang})`,
            translatedCues
          );

          // Enable Translated Export Buttons!
          this.translatedExportButtons.forEach(b => { b.disabled = false; });

          progressStatus.textContent = 'Translation Complete ✓';
          progressStats.textContent = `${translatedCues.length} cues ready for export`;
          progressFill.style.width = '100%';
          batchControlsRow.style.display = 'none';

          setTimeout(() => {
            progressBox.style.display = 'none';
            translateActionBtn.style.display = 'flex';
            translateActionBtn.textContent = 'Re-translate Full Transcript';
          }, 3000);
        } catch (err) {
          if (err.message !== 'Translation cancelled by user.') {
            console.error('[YTLingo:Batch] Translation error:', err);
            alert('Batch translation error: ' + err.message);
          }
          progressBox.style.display = 'none';
          translateActionBtn.style.display = 'flex';
          translateActionBtn.textContent = 'Translate Full Transcript';
        }
      });

      return card;
    }

        updateFetchedTranscriptCard(trackName, cues) {
            const card = document.querySelector('#ytl-card-fetched-transcript');
            if (!card) return;

            const nameEl = card.querySelector('#ytl-fetched-filename');
            const countEl = card.querySelector('#ytl-fetched-count');
            const listEl = card.querySelector('#ytl-fetched-cues-list');

            if (nameEl) nameEl.textContent = trackName || 'YouTube Track';
            if (countEl) countEl.textContent = `${cues.length} cues (Cleaned)`;

            if (listEl) {
                listEl.innerHTML = '';
                // Render preview lines
                cues.slice(0, 100).forEach(c => {
                    const line = document.createElement('div');
                    line.className = 'ytl-cue-line';

                    const time = document.createElement('span');
                    time.className = 'ytl-cue-timestamp';
                    time.textContent = window.YTLingo.transcriptExtractor.secondsToDisplayTime(c.start);

                    const txt = document.createElement('span');
                    txt.className = 'ytl-cue-text';
                    txt.textContent = c.text;

                    line.appendChild(time);
                    line.appendChild(txt);
                    listEl.appendChild(line);
                });
            }

            card.style.display = 'flex';
const subContent = card.closest('.ytl-submenu-content');
if (subContent) {
    subContent.scrollTo({ top: card.offsetTop - 50, behavior: 'smooth' });
}
        }

        /**
     * Extracts clean YouTube video title preserving Unicode (Sinhala) and spaces,
     * stripping notifications like (12) and invalid OS filename characters.
     * @returns {string}
     */
        getCleanVideoTitle() {
            const h1 = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, ytd-watch-metadata #title, h1.title');
            let title = h1?.textContent?.trim();

            if (!title) {
                title = document.title
                    .replace(/^\(\d+\)\s*/, '') 
                    .replace(/\s*-\s*YouTube$/, '') 
                    .trim();
            }

            const sanitized = (title || 'ytlingo_transcript')
                .replace(/[\\/:*?"<>|\r\n\t]/g, '')
                .trim();

            return sanitized || 'ytlingo_transcript';
        }

        // =========================================================================
        // 7. UI COMPONENT BUILDERS (STEPPERS, SWATCHES, PILLS)
        // =========================================================================

        createStepperComponent({ initialValue, unit, step, min, max, onChange }) {
            let val = initialValue;
            const element = document.createElement('div');
            element.className = 'ytl-stepper';

            const minusBtn = document.createElement('button');
            minusBtn.className = 'ytl-stepper-btn';
            minusBtn.textContent = '−';

            const valueText = document.createElement('span');
            valueText.className = 'ytl-stepper-value';
            valueText.textContent = `${val}${unit}`;

            const plusBtn = document.createElement('button');
            plusBtn.className = 'ytl-stepper-btn';
            plusBtn.textContent = '+';

            minusBtn.addEventListener('click', () => {
                if (val - step >= min) {
                    val -= step;
                    valueText.textContent = `${val}${unit}`;
                    onChange(val);
                }
            });

            plusBtn.addEventListener('click', () => {
                if (val + step <= max) {
                    val += step;
                    valueText.textContent = `${val}${unit}`;
                    onChange(val);
                }
            });

            element.appendChild(minusBtn);
            element.appendChild(valueText);
            element.appendChild(plusBtn);

            return {
                element,
                setValue: newVal => {
                    val = newVal;
                    valueText.textContent = `${val}${unit}`;
                }
            };
        }

        createDiscreteStepperComponent({ steps, initialIndex, unit, onChange }) {
            let idx = initialIndex;
            const element = document.createElement('div');
            element.className = 'ytl-stepper';

            const minusBtn = document.createElement('button');
            minusBtn.className = 'ytl-stepper-btn';
            minusBtn.textContent = '−';

            const valueText = document.createElement('span');
            valueText.className = 'ytl-stepper-value';
            valueText.textContent = `${steps[idx]}${unit}`;

            const plusBtn = document.createElement('button');
            plusBtn.className = 'ytl-stepper-btn';
            plusBtn.textContent = '+';

            minusBtn.addEventListener('click', () => {
                if (idx > 0) {
                    idx--;
                    valueText.textContent = `${steps[idx]}${unit}`;
                    onChange(steps[idx]);
                }
            });

            plusBtn.addEventListener('click', () => {
                if (idx < steps.length - 1) {
                    idx++;
                    valueText.textContent = `${steps[idx]}${unit}`;
                    onChange(steps[idx]);
                }
            });

            element.appendChild(minusBtn);
            element.appendChild(valueText);
            element.appendChild(plusBtn);

            return {
                element,
                setValue: targetVal => {
                    const foundIdx = steps.indexOf(targetVal);
                    if (foundIdx !== -1) {
                        idx = foundIdx;
                        valueText.textContent = `${steps[idx]}${unit}`;
                    }
                }
            };
        }


        createSegmentedAlignmentPills(currentAlign) {
            const group = document.createElement('div');
            group.className = 'ytl-segmented-group';
            const alignments = ['left', 'center', 'right', 'justify'];
            const pills = [];

            alignments.forEach(align => {
                const pill = document.createElement('button');
                pill.className = 'ytl-segment-pill';
                pill.textContent = align.toUpperCase();

                if (align === currentAlign) {
                    pill.classList.add('ytl-pill-active');
                }

                pill.addEventListener('click', () => {
                    pills.forEach(p => p.classList.remove('ytl-pill-active'));
                    pill.classList.add('ytl-pill-active');
                    window.YTLingo.storageManager.setSetting('typography', 'textAlign', align);
                });

                pills.push(pill);
                group.appendChild(pill);
            });

            return group;
        }

        // =========================================================================
        // 8. DOCK TOGGLE & LIFECYCLE
        // =========================================================================

        toggleDock(forceState) {
            this.isDockVisible = typeof forceState === 'boolean' ? forceState : !this.isDockVisible;

            if (this.dockContainer) {
                if (this.isDockVisible) {
                    this.dockContainer.style.visibility = 'visible';
                    this.dockContainer.classList.add('ytl-visible');
                    this.refreshTranscriptBrowserUI();

                    if (!this.availableYouTubeTracks || this.availableYouTubeTracks.length === 0) {
                        this.checkCaptionsAvailability(true);
                    }
                } else {
                    this.dockContainer.classList.remove('ytl-visible');
                    this.dockContainer.style.visibility = 'hidden';

                    // Reset menu panels smoothly to root
                    this.panels.forEach((panel, id) => {
                        panel.classList.remove('ytl-panel-active', 'ytl-panel-left');
                        if (id === 'root') {
                            panel.classList.add('ytl-panel-active');
                        } else {
                            panel.classList.add('ytl-panel-right');
                        }
                    });
                    this.menuStack = ['root'];
                    const brandHeader = this.dockContainer.querySelector('.ytl-dock-header');
                    if (brandHeader) brandHeader.style.display = 'flex';
                }
            }

            if (this.controlButton) {
                this.controlButton.classList.toggle('ytl-active', this.isDockVisible);
            }
        }

        onDocumentKeydown(event) {
            if (event.key === 'Escape' && this.isDockVisible) {
                this.toggleDock(false);
            }
        }

        subscribeToSettingsChanges() {
            this.unsubscribeSettings = window.YTLingo.storageManager.onSettingsChange((cat, key, val) => {
                if (cat === 'physics' && key === 'verticalOffsetPercent') {
                    const slider = this.dockContainer?.querySelector('.ytl-capsule-slider');
                    if (slider && document.activeElement !== slider) {
                        slider.value = String(val);
                    }
                }
            });
        }


        /**
         * Complete Teardown on Kill Switch (0 RAM Overhead).
         */
        destroy() {
            document.removeEventListener('keydown', this.handleDocumentKeydown);

            if (this.unsubscribeCueEngine) {
                this.unsubscribeCueEngine();
                this.unsubscribeCueEngine = null;
            }

            if (this.unsubscribeSettings) {
                this.unsubscribeSettings();
                this.unsubscribeSettings = null;
            }

            if (this.controlButton) {
                this.controlButton.remove();
                this.controlButton = null;
            }

            if (this.dockContainer) {
                this.dockContainer.remove();
                this.dockContainer = null;
            }

            this.cueRowElements = [];
            this.playerElement = null;
            this.isDockVisible = false;
        }
    }

    // Bind singleton securely to namespace
    window.YTLingo.playerInjector = new PlayerInjector();
})();