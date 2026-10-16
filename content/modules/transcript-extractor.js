/**
 * YTLingo v2.0.0 - Universal Subtitle Parser & YouTube Transcript Extractor
 * Architecture: Automated Native Transcript Panel, PoToken Bypass & Unicode Collision De-roller
 * Author: Anindu Uthsara
 */

(function () {
  'use strict';

  // Scoped internal API resolution (Zero global namespace collision)
  const api = typeof browser !== 'undefined' ? browser : chrome;

  // Initialize global YTLingo namespace safely
  window.YTLingo = window.YTLingo || {};

  const FALLBACK_INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4usWxdG055apXAUIDdqlI';

  class TranscriptExtractor {
    constructor() {
      this.domParser = new DOMParser();
    }

    /**
     * Extracts active YouTube Video ID from URL.
     * @returns {string|null}
     */
    getActiveVideoId() {
      const urlParams = new URLSearchParams(window.location.search);
      const videoId = urlParams.get('v');
      if (videoId) return videoId;

      const pathSegments = window.location.pathname.split('/');
      const shortsIndex = pathSegments.indexOf('shorts');
      if (shortsIndex !== -1 && pathSegments[shortsIndex + 1]) {
        return pathSegments[shortsIndex + 1];
      }

      return null;
    }

    /**
     * Extracts Innertube API key from DOM scripts or defaults.
     * @returns {string}
     */
    getInnertubeApiKey() {
      const scripts = document.getElementsByTagName('script');
      for (let i = scripts.length - 1; i >= 0; i--) {
        const text = scripts[i].textContent || '';
        const match = text.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
        if (match && match[1]) {
          return match[1];
        }
      }
      return FALLBACK_INNERTUBE_KEY;
    }

    /**
     * Balanced bracket parser to safely extract captionTracks JSON array from raw strings.
     * @param {string} rawString
     * @returns {Array<Object>|null}
     */
    extractCaptionTracksFromString(rawString) {
      if (!rawString || !rawString.includes('"captionTracks"')) return null;

      const marker = '"captionTracks":';
      const startIdx = rawString.indexOf(marker);
      if (startIdx === -1) return null;

      const arrayStart = rawString.indexOf('[', startIdx);
      if (arrayStart === -1) return null;

      let depth = 0;
      let inString = false;
      let escape = false;
      let arrayEnd = -1;

      for (let i = arrayStart; i < rawString.length; i++) {
        const char = rawString[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === '[') depth++;
          else if (char === ']') {
            depth--;
            if (depth === 0) {
              arrayEnd = i + 1;
              break;
            }
          }
        }
      }

      if (arrayEnd !== -1) {
        try {
          const tracks = JSON.parse(rawString.substring(arrayStart, arrayEnd));
          if (Array.isArray(tracks) && tracks.length > 0) {
            return tracks;
          }
        } catch (e) {
          console.warn('[YTLingo:Extractor] JSON parsing error on captionTracks:', e);
        }
      }

      return null;
    }

    /**
     * Searches for native transcript panel params in DOM scripts.
     * @returns {string|null}
     */
    findTranscriptParamsInDOM() {
      const scripts = document.getElementsByTagName('script');
      for (let i = scripts.length - 1; i >= 0; i--) {
        const text = scripts[i].textContent || '';
        if (text.includes('getTranscriptEndpoint')) {
          const match = text.match(/"getTranscriptEndpoint"\s*:\s*\{\s*"params"\s*:\s*"([^"]+)"/);
          if (match && match[1]) {
            return match[1];
          }
        }
      }
      return null;
    }

    /**
     * Fetches available tracks reliably across Fresh Tabs, Cold Starts, and SPA Navigations.
     * @param {string} [optionalVideoId]
     * @returns {Promise<Array<Object>>}
     */
    async fetchAvailableTracks(optionalVideoId) {
      const videoId = optionalVideoId || this.getActiveVideoId();
      if (!videoId) return [];

      // PRIORITY 1: Check In-Page DOM Scripts (Fastest if YouTube already injected it)
      const scripts = document.getElementsByTagName('script');
      for (let i = scripts.length - 1; i >= 0; i--) {
        const content = scripts[i].textContent || '';
        if (content.includes('"captionTracks"')) {
          const tracks = this.extractCaptionTracksFromString(content);
          if (tracks && tracks.length > 0) {
            return this.sanitizeTrackList(tracks);
          }
        }
      }

      // PRIORITY 2: Same-Origin Watch Page Fetch (Includes Tab Session & Cookies directly)
      try {
        const res = await fetch(`/watch?v=${videoId}`);
        if (res.ok) {
          const html = await res.text();
          const tracks = this.extractCaptionTracksFromString(html);
          if (tracks && tracks.length > 0) {
            return this.sanitizeTrackList(tracks);
          }
        }
      } catch (_) {}

      // PRIORITY 3: Background Service Worker Fetch Fallback
      try {
        const response = await api.runtime.sendMessage({
          type: 'YTL_FETCH_INNERTUBE_TRACKS',
          payload: { videoId }
        });
        if (response && response.success && response.tracks && response.tracks.length > 0) {
          return this.sanitizeTrackList(response.tracks);
        }
      } catch (_) {}

      return [];
    }

    sanitizeTrackList(rawTracks) {
      return rawTracks.map((track, idx) => ({
        id: idx,
        languageCode: track.languageCode || '',
        name: track.name?.simpleText || track.name?.runs?.[0]?.text || track.languageCode || 'Unknown',
        isAutoGenerated: track.vssId ? track.vssId.startsWith('a.') : false,
        baseUrl: track.baseUrl || ''
      }));
    }

    /**
     * Robust automated native transcript panel scraper (2026 Support)
     * Automatically clicks "Show Transcript", waits for load, extracts, and cleanly closes it.
     */
    async extractFromNativeTranscriptPanel() {
      // 1. Check if segments are already rendered in DOM right now
      let segments = document.querySelectorAll('transcript-segment-view-model, ytd-transcript-segment-renderer');
      if (segments.length > 0) {
        return this.parseSegmentsFromDOM(segments);
      }

      // 2. Expand description if needed to reveal the button
      const expander = document.querySelector(
        '#description-inner #expand, ytd-text-inline-expander #expand, #description-inline-expander #expand, #expand-sizer'
      );
      if (expander && expander.getAttribute('aria-expanded') !== 'true') {
        expander.click();
        await new Promise(r => setTimeout(r, 200));
      }

      // 3. Locate "Show transcript" button
      let transcriptBtn = document.querySelector(
        'ytd-video-description-transcript-section-renderer button, ' +
        'button[aria-label*="transcript" i], ' +
        'ytd-button-renderer[aria-label*="transcript" i] button, ' +
        'yt-button-shape[aria-label*="transcript" i] button'
      );

      // 4. Fallback: If not in description, open via "..." (More actions) menu
      if (!transcriptBtn) {
        const moreActionsBtn = document.querySelector(
          'button[aria-label="More actions"], ytd-menu-renderer button#button, #actions button[aria-label*="More" i]'
        );
        if (moreActionsBtn) {
          moreActionsBtn.click();
          await new Promise(r => setTimeout(r, 250)); // Wait for popup menu

          const popupItems = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item, ytd-menu-navigation-item-renderer');
          for (const item of popupItems) {
            if (/transcript/i.test(item.textContent || '')) {
              item.click();
              transcriptBtn = item;
              break;
            }
          }
        }
      } else {
        transcriptBtn.click();
      }

      // If button totally not found, abort
      if (!transcriptBtn) return null;

      // 5. Wait for segments to render (Polling for up to 5 seconds)
      const startTime = Date.now();
      while (Date.now() - startTime < 5000) {
        await new Promise(r => setTimeout(r, 250));
        segments = document.querySelectorAll('transcript-segment-view-model, ytd-transcript-segment-renderer');
        if (segments.length > 0) break;
      }

      // 6. Extract cues and cleanly close the panel
      if (segments.length > 0) {
        const cues = this.parseSegmentsFromDOM(segments);
        
        // Cleanly close panel so player UI remains clean for the user
        const closeBtn = document.querySelector(
          'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-transcript"] #visibility-button button, ' +
          'button[aria-label*="Close" i]'
        );
        if (closeBtn) closeBtn.click();
        
        return cues;
      }

      return null;
    }

    /**
     * Parses native DOM segments securely.
     * Uses innerText to naturally drop hidden screen-reader text and an upgraded Regex for fail-safes.
     * @param {NodeList|Array} segments
     * @returns {Array<Object>}
     */
    parseSegmentsFromDOM(segments) {
      const parsed = [];
      const timeRegex = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
      // UPGRADED REGEX: Successfully catches "12 seconds", "1 minute, 4 seconds", "1 hour, 2 minutes, 3 seconds"
      const ariaTimeRegex = /^(\d+\s*(hours?|minutes?|seconds?)[,\s]*)+$/i;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];

        let timeStr = '';
        let textStr = '';

        // 1. Primary Strategy: Use innerText (Naturally ignores visually-hidden elements)
        // Split by lines to separate timestamp from the actual lyrics/dialogue
        const rawLines = (seg.innerText || seg.textContent || '').split('\n').map(l => l.trim()).filter(l => l);

        for (const line of rawLines) {
          const isTime = timeRegex.test(line);
          const isAriaTime = ariaTimeRegex.test(line); // Check against commas and spaces

          if (isTime && !timeStr) {
            timeStr = line;
          } else if (!isTime && !isAriaTime && line !== timeStr) {
            // Concatenate valid text lines together (Handles split spans like "♪ Doin' it all night")
            textStr += (textStr ? ' ' : '') + line;
          }
        }

        // 2. Fallback Strategy: If innerText completely failed (Edge cases)
        if (!timeStr || !textStr) {
          const allNodes = seg.querySelectorAll('div, span, yt-formatted-string');
          for (const node of allNodes) {
            // Force skip strictly hidden classes
            const className = node.className || '';
            if (typeof className === 'string' && (className.includes('visually-hidden') || className.includes('offscreen'))) {
              continue;
            }

            const txt = (node.textContent || '').trim();
            const isTime = timeRegex.test(txt);
            const isAriaTime = ariaTimeRegex.test(txt);

            if (isTime && !timeStr) {
              timeStr = txt;
            } else if (txt.length > 0 && !isTime && !isAriaTime && !textStr && txt !== timeStr) {
              textStr = txt;
            }
          }
        }

        // 3. Final Validation: Ensure no rogue timestamps push through
        if (textStr.length > 0 && !timeRegex.test(textStr) && !ariaTimeRegex.test(textStr)) {
          const startSec = this.timeStringToSeconds(timeStr);
          parsed.push({
            id: parsed.length + 1,
            start: startSec,
            end: startSec + 2.5,
            text: this.sanitizeText(textStr)
          });
        }
      }

      // 4. Time Overlap Correction
      for (let i = 0; i < parsed.length - 1; i++) {
        const nextStart = parsed[i + 1].start;
        if (nextStart > parsed[i].start) {
          parsed[i].end = nextStart;
        }
      }

      return this.deduplicateCues(parsed);
    }
    
    /**
     * Fetches transcript via YouTube's official /youtubei/v1/get_transcript endpoint.
     * @param {string} videoId
     * @returns {Promise<Array<Object>>}
     */
    async fetchViaGetTranscript(videoId) {
      const apiKey = this.getInnertubeApiKey();
      const pageParams = this.findTranscriptParamsInDOM();
      const params = pageParams || btoa(String.fromCharCode(10, 11) + videoId);

      const endpoint = `https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}&prettyPrint=false`;
      const body = {
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20261001.00.00',
            hl: 'en',
            gl: 'US'
          }
        },
        params: params
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`get_transcript HTTP ${response.status}`);
      }

      const data = await response.json();
      return this.parseGetTranscriptResponse(data);
    }

    parseGetTranscriptResponse(data) {
      const cues = [];
      const actions = data?.actions || [];

      for (const action of actions) {
        const cueGroups = action?.updateEngagementPanelAction?.content
          ?.transcriptRenderer?.body?.transcriptBodyRenderer?.cueGroups || [];

        for (const group of cueGroups) {
          const cueList = group?.transcriptCueGroupRenderer?.cues || [];
          for (const item of cueList) {
            const r = item?.transcriptCueRenderer;
            if (!r) continue;

            const start = parseInt(r.startOffsetMs || '0', 10) / 1000;
            const dur = parseInt(r.durationMs || '0', 10) / 1000;
            const text = r.cue?.simpleText || r.cue?.runs?.map(x => x.text).join('') || '';

            if (text.trim().length > 0) {
              cues.push({
                id: cues.length + 1,
                start: parseFloat(start.toFixed(3)),
                end: parseFloat((start + dur).toFixed(3)),
                text: this.sanitizeText(text)
              });
            }
          }
        }
      }

      return cues;
    }

    /**
     * Master transcript cues loader with Priority API Network Fetching & Auto-Panel Clicking.
     * @param {string} rawBaseUrl
     * @returns {Promise<Array<Object>>}
     */
    async fetchTrackCues(rawBaseUrl) {
      let cues = [];

      // PRIORITY 1: Direct Network Fetch via baseUrl
      if (rawBaseUrl) {
        let json3Url = rawBaseUrl.includes('fmt=') ? rawBaseUrl.replace(/fmt=[^&]+/, 'fmt=json3') : `${rawBaseUrl}&fmt=json3`;
        try {
          const rawJsonStr = await this.proxyFetchRaw(json3Url);
          if (rawJsonStr && rawJsonStr.trim().length > 0) {
            const jsonData = JSON.parse(rawJsonStr);
            if (jsonData.events && Array.isArray(jsonData.events)) {
              cues = this.parseJSON3(jsonData);
            }
          }
        } catch (_) {}

        if (!cues || cues.length === 0) {
          let srv3Url = rawBaseUrl.includes('fmt=') ? rawBaseUrl.replace(/fmt=[^&]+/, 'fmt=srv3') : `${rawBaseUrl}&fmt=srv3`;
          try {
            const rawXmlStr = await this.proxyFetchRaw(srv3Url);
            if (rawXmlStr && rawXmlStr.trim().length > 0) {
              cues = this.parseXML(rawXmlStr);
            }
          } catch (_) {}
        }
      }

      if (cues && cues.length > 0) {
        return this.deduplicateCues(cues);
      }

      // PRIORITY 2: Innertube API Fallback
      const videoId = this.getActiveVideoId();
      if (videoId) {
        try {
          const apiCues = await this.fetchViaGetTranscript(videoId);
          if (apiCues && apiCues.length > 0) {
            return this.deduplicateCues(apiCues);
          }
        } catch (_) {}
      }

      // PRIORITY 3: Automated Native DOM Scraping (Robot clicking the panel)
      try {
        const panelCues = await this.extractFromNativeTranscriptPanel();
        if (panelCues && panelCues.length > 0) {
          return this.deduplicateCues(panelCues);
        }
      } catch (err) {
        console.warn('[YTLingo:Extractor] Auto-panel fallback failed:', err);
      }

      // If all fails, throw error
      throw new Error('All transcript fetch formats returned empty or un-extractable.');
    }

    /**
     * Same-origin fetch for timedtext.
     */
    async proxyFetchRaw(url) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (err) {
        const response = await api.runtime.sendMessage({
          type: 'YTL_FETCH_RAW_SUBTITLE',
          payload: { url }
        });
        if (!response || !response.success) {
          throw new Error(response?.error || 'Timedtext fetch failed.');
        }
        return response.content;
      }
    }

    // =========================================================================
    // DEDUPLICATION & UNIVERSAL PARSERS
    // =========================================================================

    /**
     * Advanced Timestamp-Collision & Unicode-Aware Rolling De-duplicator
     * Resolves YouTube 2-line rolling duplicates in English, Sinhala, and all languages.
     * @param {Array<Object>} rawCues
     * @returns {Array<Object>}
     */
    deduplicateCues(rawCues) {
      if (!Array.isArray(rawCues) || rawCues.length === 0) return [];

      const sorted = rawCues.slice().sort((a, b) => a.start - b.start);
      const cleaned = [];

      for (let i = 0; i < sorted.length; i++) {
        const curr = sorted[i];
        if (!curr.text || curr.text.trim().length === 0) continue;

        if (cleaned.length === 0) {
          cleaned.push({ ...curr, id: 1 });
          continue;
        }

        const prev = cleaned[cleaned.length - 1];

        // Rule 1: Strict Timestamp Collision (Start times are identical or within 0.4s)
        const timeDiff = Math.abs(curr.start - prev.start);
        if (timeDiff < 0.4) {
          if (curr.text.trim().length > prev.text.trim().length) {
            prev.text = curr.text;
            prev.end = Math.max(prev.end, curr.end);
          }
          continue; // Drop duplicate collision
        }

        // Rule 2: Unicode-Aware Text Matching (Supports Sinhala \u0D80-\u0DFF and English \w)
        // Rule 2: Unicode-Aware Text Matching (Supports Sinhala + ZWJ \u200D & ZWNJ \u200C)
const cleanCurr = curr.text.replace(/[^\w\s\u0D80-\u0DFF\u200C\u200D]/gi, '').trim().toLowerCase();
const cleanPrev = prev.text.replace(/[^\w\s\u0D80-\u0DFF\u200C\u200D]/gi, '').trim().toLowerCase();

        if (cleanCurr === cleanPrev && (curr.start - prev.start) < 3.0) {
          prev.end = Math.max(prev.end, curr.end);
          continue;
        }

        // Rule 3: Rolling Subtitle Overlap (Previous line contained in current or vice-versa)
        if ((cleanPrev.includes(cleanCurr) || cleanCurr.includes(cleanPrev)) && (curr.start - prev.start) < 2.5) {
          if (curr.text.length > prev.text.length) {
            prev.text = curr.text;
            prev.end = Math.max(prev.end, curr.end);
          }
          continue;
        }

        cleaned.push({
          ...curr,
          id: cleaned.length + 1
        });
      }

      return cleaned;
    }

    parseJSON3(data) {
      const cues = [];
      if (!data || !data.events) return cues;

      for (let i = 0; i < data.events.length; i++) {
        const ev = data.events[i];
        if (!ev.segs || ev.segs.length === 0) continue;

        const start = (ev.tStartMs || 0) / 1000;
        const duration = (ev.dDurationMs || 0) / 1000;
        const end = start + duration;

        const textContent = ev.segs
          .map(seg => seg.utf8 || '')
          .join('')
          .replace(/[\r\n]+/g, ' ')
          .trim();

        if (textContent.length > 0) {
          cues.push({
            id: cues.length + 1,
            start: parseFloat(start.toFixed(3)),
            end: parseFloat(end.toFixed(3)),
            text: this.sanitizeText(textContent)
          });
        }
      }

      return this.deduplicateCues(cues);
    }

    parseXML(xmlString) {
      const cues = [];
      if (!xmlString) return cues;

      const xmlDoc = this.domParser.parseFromString(xmlString, 'text/xml');
      const textNodes = xmlDoc.querySelectorAll('text');

      if (textNodes.length > 0) {
        for (let i = 0; i < textNodes.length; i++) {
          const el = textNodes[i];
          const start = parseFloat(el.getAttribute('start') || '0');
          const dur = parseFloat(el.getAttribute('dur') || '0');
          const text = this.sanitizeText(el.textContent || '');

          if (text.length > 0) {
            cues.push({
              id: cues.length + 1,
              start: parseFloat(start.toFixed(3)),
              end: parseFloat((start + dur).toFixed(3)),
              text: text
            });
          }
        }
        return this.deduplicateCues(cues);
      }

      const pNodes = xmlDoc.querySelectorAll('p');
      for (let i = 0; i < pNodes.length; i++) {
        const el = pNodes[i];
        const tStartMs = parseFloat(el.getAttribute('t') || '0');
        const durMs = parseFloat(el.getAttribute('d') || '0');
        const start = tStartMs / 1000;
        const end = (tStartMs + durMs) / 1000;
        const text = this.sanitizeText(el.textContent || '');

        if (text.length > 0) {
          cues.push({
            id: cues.length + 1,
            start: parseFloat(start.toFixed(3)),
            end: parseFloat(end.toFixed(3)),
            text: text
          });
        }
      }

      return this.deduplicateCues(cues);
    }

    parseSRT(srtContent) {
      const cues = [];
      if (!srtContent) return cues;

      const cleanStr = srtContent
        .replace(/^\uFEFF/, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n[ \t]+\n/g, '\n\n'); 

      const blocks = cleanStr.trim().split(/\n\s*\n+/);

      for (let i = 0; i < blocks.length; i++) {
        const lines = blocks[i].trim().split('\n');
        if (lines.length < 2) continue;

        const timeLineIndex = lines.findIndex(l => l.includes('-->'));
        if (timeLineIndex === -1) continue;

        const timeLine = lines[timeLineIndex];
        const timeMatch = timeLine.match(/((?:\d{1,4}:)?\d{2}:\d{2}[,.]\d{3})\s*-->\s*((?:\d{1,4}:)?\d{2}:\d{2}[,.]\d{3})/);
        if (!timeMatch) continue;

        const start = this.timeStringToSeconds(timeMatch[1]);
        const end = this.timeStringToSeconds(timeMatch[2]);
        const textLines = lines.slice(timeLineIndex + 1);
        const text = this.sanitizeText(textLines.join('\n'));

        if (text.length > 0) {
          cues.push({
            id: cues.length + 1,
            start: parseFloat(start.toFixed(3)),
            end: parseFloat(end.toFixed(3)),
            text: text
          });
        }
      }

      return this.deduplicateCues(cues);
    }

    parseVTT(vttContent) {
      const cues = [];
      if (!vttContent) return cues;

      const cleanStr = vttContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = cleanStr.split('\n');

      let i = 0;
      while (i < lines.length && !lines[i].includes('-->')) {
        i++;
      }

      while (i < lines.length) {
        const line = lines[i].trim();
        // Flexible VTT timestamp regex
        const timeMatch = line.match(/((?:\d{1,2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}\.\d{3})/);

        if (timeMatch) {
          const start = this.timeStringToSeconds(timeMatch[1]);
          const end = this.timeStringToSeconds(timeMatch[2]);
          const textLines = [];

          i++;
          while (i < lines.length && lines[i].trim() !== '') {
            textLines.push(lines[i]);
            i++;
          }

          const text = this.sanitizeText(textLines.join('\n'));
          if (text.length > 0) {
            cues.push({
              id: cues.length + 1,
              start: parseFloat(start.toFixed(3)),
              end: parseFloat(end.toFixed(3)),
              text: text
            });
          }
        } else {
          i++;
        }
      }

      return this.deduplicateCues(cues);
    }

    /**
     * Universal Gateway for local files (.srt, .vtt, .xml, .srv3) with master deduplication.
     */
    parseUniversalFile(rawContent, fileName) {
      let cues = [];
      const lower = (fileName || '').toLowerCase();

      if (lower.endsWith('.srt')) {
        cues = this.parseSRT(rawContent);
      } else if (lower.endsWith('.vtt')) {
        cues = this.parseVTT(rawContent);
      } else if (lower.endsWith('.xml') || lower.endsWith('.srv3')) {
        cues = this.parseXML(rawContent);
      } else if (rawContent.includes('WEBVTT')) {
        cues = this.parseVTT(rawContent);
      } else if (rawContent.includes('<timedtext') || rawContent.includes('<transcript') || rawContent.includes('<?xml')) {
        cues = this.parseXML(rawContent);
      } else {
        cues = this.parseSRT(rawContent);
      }

      return this.deduplicateCues(cues);
    }

    // =========================================================================
    // EXPORTER SUBSYSTEM
    // =========================================================================

    exportTranscript(format, cues, baseFileName = 'ytlingo_transcript') {
      if (!cues || cues.length === 0) {
        throw new Error('No subtitle cues available to export.');
      }

      let fileContent = '';
      let mimeType = 'text/plain;charset=utf-8';
      let extension = format.toLowerCase();

      switch (extension) {
        case 'srt':
          fileContent = this.generateSRT(cues);
          mimeType = 'application/x-subrip;charset=utf-8';
          break;
        case 'vtt':
          fileContent = this.generateVTT(cues);
          mimeType = 'text/vtt;charset=utf-8';
          break;
        case 'txt':
          fileContent = this.generateTXT(cues);
          mimeType = 'text/plain;charset=utf-8';
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      const blob = new Blob([fileContent], { type: mimeType });
      const downloadUrl = URL.createObjectURL(blob);
      const tempLink = document.createElement('a');

      tempLink.href = downloadUrl;
      tempLink.download = `${baseFileName}.${extension}`;
      tempLink.style.display = 'none';

      document.body.appendChild(tempLink);
      tempLink.click();

      setTimeout(() => {
        document.body.removeChild(tempLink);
        URL.revokeObjectURL(downloadUrl);
      }, 300);
    }

    generateSRT(cues) {
      return cues
        .map((c, idx) => {
          const startStr = this.secondsToSRTTime(c.start);
          const endStr = this.secondsToSRTTime(c.end);
          return `${idx + 1}\n${startStr} --> ${endStr}\n${c.text}\n`;
        })
        .join('\n');
    }

    generateVTT(cues) {
      const header = 'WEBVTT\n\n';
      const body = cues
        .map((c, idx) => {
          const startStr = this.secondsToVTTTime(c.start);
          const endStr = this.secondsToVTTTime(c.end);
          return `${idx + 1}\n${startStr} --> ${endStr}\n${c.text}\n`;
        })
        .join('\n');
      return header + body;
    }

    generateTXT(cues) {
      return cues
        .map(c => `[${this.secondsToDisplayTime(c.start)}] ${c.text}`)
        .join('\n');
    }

    timeStringToSeconds(timeStr) {
      if (!timeStr) return 0;
      const clean = timeStr.trim().replace(',', '.');
      const parts = clean.split(':');
      let seconds = 0;
      if (parts.length === 3) {
        seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      } else if (parts.length === 2) {
        seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
      } else if (parts.length === 1) {
        seconds = parseFloat(parts[0]);
      }
      return isNaN(seconds) ? 0 : seconds;
    }

    secondsToSRTTime(totalSeconds) {
      const pad = (n, width = 2) => String(n).padStart(width, '0');
      const hrs = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      const secs = Math.floor(totalSeconds % 60);
      const ms = Math.floor((totalSeconds % 1) * 1000);
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
    }

    secondsToVTTTime(totalSeconds) {
      const pad = (n, width = 2) => String(n).padStart(width, '0');
      const hrs = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      const secs = Math.floor(totalSeconds % 60);
      const ms = Math.floor((totalSeconds % 1) * 1000);
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
    }

    secondsToDisplayTime(totalSeconds) {
      const pad = n => String(n).padStart(2, '0');
      const mins = Math.floor(totalSeconds / 60);
      const secs = Math.floor(totalSeconds % 60);
      return `${pad(mins)}:${pad(secs)}`;
    }

    sanitizeText(raw) {
      return raw
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')       
        .replace(/\u00A0/g, ' ')       
        .replace(/[\t ]+/g, ' ')      
        .trim();
    }
  }

  // Bind singleton securely to namespace
  window.YTLingo.transcriptExtractor = new TranscriptExtractor();
})();