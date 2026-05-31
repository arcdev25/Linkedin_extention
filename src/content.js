// src/content.js
(function () {
  let currentProfileId = null;
  let overlayEl = null;
  let highlightMenuEl = null;

  function getLinkedInId() {
    const match = location.pathname.match(/^\/in\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  function extractProfileData() {
    const linkedinId = getLinkedInId();
    const scope = document.querySelector('main') || document.body;
    const structuredData = readStructuredPersonData();
    const titleData = parseProfileTitle(
      getMetaContent('meta[property="og:title"], meta[name="twitter:title"]') || document.title
    );
    const description = getMetaContent('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]');
    const nameHeading = findNameHeading(scope);

    const name = firstValidName([
      readHeadingText(nameHeading),
      structuredData.name,
      findNameFromImageAlt(scope),
      titleData.name
    ]);

    const headline = firstValidHeadline([
      findHeadlineByStableSelectors(scope, name),
      findHeadlineNearName(nameHeading, name),
      structuredData.headline,
      structuredData.jobTitle,
      titleData.headline,
      parseHeadlineFromDescription(description, name)
    ], name);

    // Avatar: check aria-label="Profile photo" div first (confirmed in real LinkedIn HTML)
    // then img[src*="profile-displayphoto"] which is the direct src pattern
    const _photoDiv = document.querySelector('div[aria-label="Profile photo"], a[aria-label="Profile photo"]');
    const _photoImg = _photoDiv
      ? (_photoDiv.querySelector('img[src*="profile-displayphoto"]') ||
         _photoDiv.querySelector('img[src*="media.licdn.com"]') ||
         _photoDiv.querySelector('img'))
      : null;
    const _displayPhotoImg = document.querySelector('img[src*="profile-displayphoto"]');

    const avatar = firstUrl([
      _photoImg?.src,
      _displayPhotoImg?.src,
      findAvatarNearName(nameHeading, name),
      document.querySelector('.pv-top-card__photo img')?.src,
      document.querySelector('img.profile-photo-edit__preview')?.src,
      document.querySelector('.profile-photo img')?.src,
      document.querySelector('img[class*="profile-photo"]')?.src,
      document.querySelector('.pv-top-card__photo-wrapper img')?.src,
      document.querySelector('img[class*="presence-entity__image"]')?.src,
      document.querySelector('img[alt*="profile" i]')?.src,
      getMetaContent('meta[property="og:image"], meta[name="twitter:image"]')
    ]);

    console.log('[ProfileChecker] Final extracted data:', {
      name: name || '(not found)',
      headline: headline ? headline.substring(0, 60) + (headline.length > 60 ? '…' : '') : '(not found)',
      linkedinId,
    });

    return {
      name,
      headline,
      avatarUrl: avatar,
      profileUrl: location.href.split('?')[0],
      linkedinId
    };
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function profileDataScore(data) {
    return (data?.name ? 2 : 0) + (data?.headline ? 2 : 0) + (data?.avatarUrl ? 1 : 0);
  }

  async function waitForProfileData(timeoutMs = 4000) {
    const started = Date.now();
    let best = extractProfileData();

    // Exit immediately if we already have a perfect score
    if (profileDataScore(best) >= 5) return best;

    // Use increasing backoff: 150ms, 300ms, 500ms, 750ms, 1000ms…
    const delays = [150, 300, 500, 750, 1000];
    let delayIdx = 0;

    while (profileDataScore(best) < 4 && Date.now() - started < timeoutMs) {
      const delay = delays[Math.min(delayIdx++, delays.length - 1)];
      await wait(delay);
      const next = extractProfileData();
      if (profileDataScore(next) > profileDataScore(best)) best = next;
      // Stop early if we hit a perfect score
      if (profileDataScore(best) >= 5) break;
    }

    return best;
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getMetaContent(selector) {
    const el = document.querySelector(selector);
    return cleanText(el?.getAttribute('content') || '');
  }

  function readLines(el) {
    const text = el?.innerText || el?.textContent || '';
    return text.split(/\r?\n/)
      .map(cleanText)
      .filter(Boolean);
  }

  function isVisible(el) {
    if (!el || el.closest('#lpc-overlay, #lpc-highlight-menu')) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    return el.getClientRects().length > 0;
  }

  function uniqueElements(elements) {
    return [...new Set(elements.filter(Boolean))];
  }

  function readHeadingText(el) {
    if (!el) return '';
    const visibleText = el.querySelector('[aria-hidden="true"]');
    const visibleLines = readLines(visibleText);
    const visibleName = cleanProfileName(visibleLines[0] || '');
    if (!isBadName(visibleName)) return visibleName;

    const lines = readLines(el);
    return cleanProfileName(lines[0] || '');
  }

  function cleanProfileName(value) {
    return cleanText(value)
      .replace(/\s*[·•\u00b7-]?\s*(?:1st|2nd|3rd|3th)(?:\s+degree connection)?$/i, '')
      .replace(/\s*\((?:he\/him|she\/her|they\/them|she\/they|he\/they|they\/she|they\/he)\)\s*$/i, '')
      .trim();
  }

  function isBadName(value) {
    const text = cleanProfileName(value);
    const lower = text.toLowerCase();
    const blocked = new Set([
      'about', 'activity', 'experience', 'education', 'licenses & certifications',
      'recommendations', 'interests', 'posts', 'comments', 'reactions',
      'sign in', 'join now', 'profile', 'linkedin', 'people also viewed',
      'name not found'
    ]);

    return !text ||
      text.length < 2 ||
      text.length > 120 ||
      blocked.has(lower) ||
      lower.includes('linkedin profile insight') ||
      /^profile\s+/i.test(text) ||
      /^(message|connect|follow|more)$/i.test(text);
  }

  function firstValidName(values) {
    for (const value of values) {
      const text = cleanProfileName(value);
      if (!isBadName(text)) return text;
    }
    return '';
  }

  function isBadHeadline(value, name = '') {
    const text = cleanText(value);
    const lower = text.toLowerCase();
    const nameLower = cleanProfileName(name).toLowerCase();

    if (!text || text.length < 3 || text.length > 500) return true;
    if (/^(?:no headline available|headline not found)$/i.test(text)) return true;
    if (nameLower && cleanProfileName(text).toLowerCase() === nameLower) return true;
    if (isConnectionLabel(text)) return true;
    if (/^\((?:he\/him|she\/her|they\/them|she\/they|he\/they|they\/she|they\/he)\)$/i.test(text)) return true;
    if (/^\d[\d,.+]*\s+(?:followers|connections)$/i.test(text)) return true;
    if (/\b(?:followers|connections)\b/i.test(text) && text.length < 50) return true;
    if (/^(?:contact info|message|connect|follow|more|add profile section|enhance profile|resources|analytics)$/i.test(text)) return true;
    if (/^(?:open to|verified|premium|linkedin premium)\b/i.test(text)) return true;
    if (/^(?:about|activity|experience|education|licenses & certifications|recommendations|interests)$/i.test(text)) return true;
    if (/^view .+ profile on linkedin/i.test(lower)) return true;
    if (lower.includes('linkedin profile insight')) return true;

    return false;
  }

  function isConnectionLabel(value) {
    const text = cleanText(value)
      .replace(/^[\s·•\u00b7.]+/, '')
      .replace(/[\s·•\u00b7.]+$/, '');

    return /^(?:1st|2nd|3rd|3th)(?:\s+degree connection)?$/i.test(text);
  }

  function firstValidHeadline(values, name = '') {
    for (const value of values) {
      const text = cleanText(Array.isArray(value) ? value.join(' ') : value);
      if (!isBadHeadline(text, name)) return text;
    }
    return '';
  }

  function findNameHeading(scope) {
    // Priority: h2 near the profile photo div (confirmed in real LinkedIn HTML)
    const photoArea = document.querySelector('div[aria-label="Profile photo"], a[aria-label="Profile photo"]');
    if (photoArea) {
      // Walk up to find containing section/div, then find h2
      let el = photoArea.parentElement;
      for (let i = 0; i < 12 && el && el !== document.body; i++) {
        const h2 = el.querySelector('h2');
        if (h2 && isVisible(h2)) {
          const txt = readHeadingText(h2);
          if (!isBadName(txt)) return h2;
        }
        el = el.parentElement;
      }
    }

    const candidates = uniqueElements([
      ...scope.querySelectorAll('[data-anonymize="person-name"]'),
      ...scope.querySelectorAll('h1, h2')
    ])
      .filter(isVisible)
      .map(el => ({ el, text: readHeadingText(el), top: el.getBoundingClientRect().top }))
      .filter(item => !isBadName(item.text))
      .sort((a, b) => a.top - b.top);

    return candidates[0]?.el || null;
  }

  function findNameFromImageAlt(scope) {
    for (const img of scope.querySelectorAll('img[alt]')) {
      const alt = cleanText(img.getAttribute('alt'));
      const match = alt.match(/^(.+?)(?:'s|\u2019s)\s+(?:profile|photo|picture)/i);
      if (match && !isBadName(match[1])) return match[1];
    }
    return '';
  }

  function findProfileContainer(nameEl) {
    if (!nameEl) return document.querySelector('main') || document.body;
    return nameEl.closest('section, [class*="top-card"], [class*="pv-text-details"], .ph5') ||
      document.querySelector('main') ||
      document.body;
  }

  function findHeadlineNearName(nameEl, name) {
    // New LinkedIn layout: headline is a <p> sibling of the h2 container
    // Walk up from nameEl to find sibling <p> tags
    if (nameEl) {
      let container = nameEl.parentElement;
      for (let i = 0; i < 6 && container; i++) {
        const paras = Array.from(container.querySelectorAll('p'));
        for (const p of paras) {
          if (!isVisible(p)) continue;
          const txt = cleanText(p.innerText || p.textContent || '');
          if (!isBadHeadline(txt, name) && txt.length > 10) return txt;
        }
        container = container.parentElement;
      }
    }

    // Fallback: text-based scan
    const container = findProfileContainer(nameEl);
    const lines = readLines(container);
    const cleanName = cleanProfileName(name);
    const nameIndex = cleanName
      ? lines.findIndex(line => cleanProfileName(line).toLowerCase() === cleanName.toLowerCase())
      : -1;
    const start = nameIndex >= 0 ? nameIndex + 1 : 0;
    const end = Math.min(lines.length, start + 14);

    for (let i = start; i < end; i += 1) {
      const line = lines[i];
      if (!isBadHeadline(line, name)) return line;
    }

    return '';
  }

  function findHeadlineByStableSelectors(scope, name) {
    const selectors = [
      '[data-anonymize="headline"]',
      '[class*="top-card-layout__headline"]',
      '.pv-text-details__left-panel .text-body-medium',
      '.text-body-medium.break-words',
      '.pv-top-card-section__headline',
      '.profile-section-card__headline'
    ];

    for (const selector of selectors) {
      for (const el of scope.querySelectorAll(selector)) {
        if (!isVisible(el)) continue;
        const text = cleanText(el.innerText || el.textContent || '');
        if (!isBadHeadline(text, name)) return text;
      }
    }

    return '';
  }

  function parseProfileTitle(value) {
    let title = cleanText(value)
      .replace(/\s*\|\s*LinkedIn.*$/i, '')
      .replace(/\s+-\s*LinkedIn.*$/i, '');

    if (!title) return { name: '', headline: '' };

    const parts = title.split(/\s+(?:-|\u2013|\u2014|\|)\s+/).map(cleanText).filter(Boolean);
    if (parts.length > 1) {
      return { name: parts[0], headline: parts.slice(1).join(' - ') };
    }

    return { name: title, headline: '' };
  }

  function parseHeadlineFromDescription(description, name) {
    const text = cleanText(description);
    if (isBadHeadline(text, name)) return '';
    return text;
  }

  function readStructuredPersonData() {
    const result = {};

    function valueToText(value) {
      if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join(' ');
      if (value && typeof value === 'object') return cleanText(value.name || value.title || value.description || '');
      return cleanText(value);
    }

    function visit(node) {
      if (!node || typeof node !== 'object') return;
      const type = valueToText(node['@type']).toLowerCase();

      if (type.includes('person')) {
        result.name ||= valueToText(node.name);
        result.headline ||= valueToText(node.headline || node.description);
        result.jobTitle ||= valueToText(node.jobTitle);
      }

      if (Array.isArray(node)) {
        node.forEach(visit);
      } else {
        Object.values(node).forEach(visit);
      }
    }

    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        visit(JSON.parse(script.textContent || '{}'));
      } catch (e) {
        console.debug('[ProfileChecker] Could not parse LinkedIn structured data:', e);
      }
    });

    return result;
  }

  function findAvatarNearName(nameEl, name = '') {
    const container = findProfileContainer(nameEl);
    const scope = document.querySelector('main') || document.body;
    const selectors = [
      'img.pv-top-card-profile-picture__image',
      '.pv-top-card-profile-picture img',
      '.pv-top-card__photo img',
      '.pv-top-card__photo-wrapper img',
      'img.profile-photo-edit__preview',
      'button[aria-label*="profile photo" i] img',
      'button[aria-label*="photo" i] img',
      '[class*="profile-picture"] img',
      '[class*="profile-photo"] img',
      'img[class*="profile-picture"]',
      'img[class*="profile-photo"]',
      'img[alt*="profile photo" i]',
      'img[alt*="profile picture" i]'
    ];
    const candidates = [];

    for (const root of uniqueElements([container, scope])) {
      for (const selector of selectors) {
        candidates.push(...root.querySelectorAll(selector));
      }
    }

    candidates.push(...scope.querySelectorAll('img[src][alt]'));

    return uniqueElements(candidates)
      .map(img => ({ img, score: scoreAvatarImage(img, name) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.img?.src || '';
  }

  function scoreAvatarImage(img, name = '') {
    if (!img?.src || !/^https?:\/\//i.test(img.src)) return 0;

    const alt = cleanText(img.getAttribute('alt'));
    const classText = cleanText([
      img.className,
      img.id,
      img.parentElement?.className,
      img.closest('[class]')?.className
    ].join(' ')).toLowerCase();
    const haystack = `${alt} ${classText}`.toLowerCase();

    if (/(?:background|banner|cover|company-logo|organization|school-logo)/i.test(haystack)) return 0;

    const rect = img.getBoundingClientRect();
    const width = img.naturalWidth || rect.width;
    const height = img.naturalHeight || rect.height;
    if (width && height && (width / height > 2 || height / width > 2)) return 0;
    if (rect.width && rect.height && (rect.width < 32 || rect.height < 32)) return 0;

    const cleanName = cleanProfileName(name).toLowerCase();
    let score = 1;
    // Highest priority: URL contains profile-displayphoto (confirmed LinkedIn pattern)
    if (/profile-displayphoto/i.test(img.src)) score += 15;
    if (cleanName && alt.toLowerCase().includes(cleanName)) score += 8;
    if (/\b(?:profile|photo|picture)\b/i.test(haystack)) score += 5;
    // Boost if inside div[aria-label="Profile photo"]
    if (img.closest('[aria-label*="Profile photo" i]')) score += 10;
    if (classText.includes('top-card')) score += 3;
    if (classText.includes('profile')) score += 3;
    if (Math.abs(width - height) <= Math.max(width, height) * 0.35) score += 2;
    if (rect.top < window.innerHeight * 0.75) score += 1;

    return score;
  }

  function firstUrl(values) {
    for (const value of values) {
      const url = cleanText(value);
      if (/^https?:\/\//i.test(url)) return url;
    }
    return '';
  }

  function mergeProfileData(extracted, stored = {}) {
    const storedProfile = stored || {};
    const name = firstValidName([extracted.name, storedProfile.name]);
    const headline = firstValidHeadline([extracted.headline, storedProfile.headline], name);

    return {
      ...extracted,
      name,
      headline,
      avatarUrl: extracted.avatarUrl || storedProfile.avatar_url || '',
      profileUrl: extracted.profileUrl || storedProfile.profile_url || location.href.split('?')[0]
    };
  }

  function msg(type, data = {}) {
    return new Promise((res, rej) => {
      chrome.runtime.sendMessage({ type, ...data }, (resp) => {
        if (chrome.runtime.lastError) rej(chrome.runtime.lastError);
        else if (resp?.error) rej(new Error(resp.error));
        else res(resp);
      });
    });
  }

  const STATUS_CONFIG = {
    pending:    { label: 'Pending',    color: '#F59E0B', bg: '#FEF3C7', icon: '⏳' },
    chatting:   { label: 'Chatting',   color: '#3B82F6', bg: '#DBEAFE', icon: '💬' },
    'not interested': { label: 'Not Interested', color: '#EF4444', bg: '#FEE2E2', icon: '🚫' },
    'sent js':  { label: 'Sent JS',        color: '#8B5CF6', bg: '#EDE9FE', icon: '📄' },
    success:      { label: 'Success',      color: '#8B5CF6', bg: '#EDE9FE', icon: '🎉' },
    failed:     { label: 'Failed',     color: '#6B7280', bg: '#F3F4F6', icon: '💀' },
    accept:  {label:'Accept',  color:'#10b981', bg:'rgba(16,185,129,.12)', icon:'✅'},
  };

  // ─── HIGHLIGHT FEATURE ───────────────────────────────────────────────────────

  const HIGHLIGHT_COLORS = [
    { id: 'yellow', label: 'Yellow', bg: '#FEF08A', text: '#713F12' },
    { id: 'green',  label: 'Green',  bg: '#BBF7D0', text: '#14532D' },
    { id: 'blue',   label: 'Blue',   bg: '#BAE6FD', text: '#0C4A6E' },
    { id: 'pink',   label: 'Pink',   bg: '#FBCFE8', text: '#831843' },
    { id: 'orange', label: 'Orange', bg: '#FED7AA', text: '#7C2D12' },
  ];

  function removeHighlightMenu() {
    if (highlightMenuEl) { highlightMenuEl.remove(); highlightMenuEl = null; }
  }

  function showHighlightMenu(x, y, selectedText) {
    removeHighlightMenu();

    const menu = document.createElement('div');
    menu.id = 'lpc-highlight-menu';
    menu.innerHTML = `
      <div class="lpc-hm-label">Highlight as</div>
      <div class="lpc-hm-colors">
        ${HIGHLIGHT_COLORS.map(c => `
          <button class="lpc-hm-color" data-color="${c.id}" title="${c.label}"
            style="background:${c.bg};color:${c.text}">A</button>
        `).join('')}
        <button class="lpc-hm-notebtn" title="Add note">✏️</button>
      </div>
      <div class="lpc-hm-note-area" style="display:none">
        <textarea class="lpc-hm-textarea" placeholder="Add a note…"></textarea>
        <button class="lpc-hm-save">Save with note</button>
      </div>
    `;

    // Position near selection
    const vw = window.innerWidth;
    const left = Math.min(Math.max(x, 10), vw - 220);
    menu.style.left = `${left}px`;
    menu.style.top = `${y - 70}px`;
    document.body.appendChild(menu);
    highlightMenuEl = menu;

    let chosenColor = HIGHLIGHT_COLORS[0];
    let noteVisible = false;

    menu.querySelectorAll('.lpc-hm-color').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        chosenColor = HIGHLIGHT_COLORS.find(c => c.id === btn.dataset.color) || HIGHLIGHT_COLORS[0];
        menu.querySelectorAll('.lpc-hm-color').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (!noteVisible) {
          saveHighlight(selectedText, chosenColor, '');
        }
      });
    });

    menu.querySelector('.lpc-hm-notebtn').addEventListener('mousedown', (e) => {
      e.preventDefault();
      noteVisible = !noteVisible;
      menu.querySelector('.lpc-hm-note-area').style.display = noteVisible ? 'flex' : 'none';
    });

    menu.querySelector('.lpc-hm-save').addEventListener('mousedown', (e) => {
      e.preventDefault();
      const note = menu.querySelector('.lpc-hm-textarea').value.trim();
      saveHighlight(selectedText, chosenColor, note);
    });

    setTimeout(() => {
      document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#lpc-highlight-menu')) removeHighlightMenu();
      }, { once: true });
    }, 100);
  }

  async function saveHighlight(text, color, note) {
    removeHighlightMenu();
    const linkedinId = getLinkedInId();
    if (!linkedinId || !text) return;

    const config = await msg('GET_CONFIG');
    if (!config.current_recruiter_id) {
      alert('[Profile Checker] Select your recruiter account first.');
      return;
    }

    applyDOMHighlight(text, color);

    try {
      await msg('SAVE_HIGHLIGHT', {
        data: { linkedinId, recruiterId: config.current_recruiter_id, text, colorId: color.id, note }
      });
      loadHighlightsSection();
    } catch (e) {
      console.error('[ProfileChecker] Highlight save error:', e);
    }
  }

  function applyDOMHighlight(text, color) {
    const walker = document.createTreeWalker(
      document.querySelector('main') || document.body,
      NodeFilter.SHOW_TEXT
    );

    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (
        node.textContent.includes(text) &&
        !node.parentElement.closest('#lpc-overlay') &&
        !node.parentElement.closest('#lpc-highlight-menu') &&
        node.parentElement.tagName !== 'MARK'
      ) {
        nodes.push(node);
      }
    }

    if (nodes.length > 0) {
      const n = nodes[0];
      const idx = n.textContent.indexOf(text);
      if (idx === -1) return;

      const before = document.createTextNode(n.textContent.slice(0, idx));
      const mark = document.createElement('mark');
      mark.className = 'lpc-highlight';
      mark.dataset.colorId = color.id;
      mark.dataset.text = text;
      mark.textContent = text;
      mark.style.cssText = `background:${color.bg}!important;color:${color.text}!important;border-radius:3px;padding:1px 3px;cursor:default;`;
      const after = document.createTextNode(n.textContent.slice(idx + text.length));

      n.parentNode.insertBefore(before, n);
      n.parentNode.insertBefore(mark, n);
      n.parentNode.insertBefore(after, n);
      n.remove();
    }
  }

  function restoreHighlights(highlights) {
    highlights.forEach(h => {
      const color = HIGHLIGHT_COLORS.find(c => c.id === h.color_id) || HIGHLIGHT_COLORS[0];
      // Skip if already highlighted in DOM
      const already = document.querySelector(`.lpc-highlight[data-text="${CSS.escape(h.highlighted_text)}"]`);
      if (!already) applyDOMHighlight(h.highlighted_text, color);
    });
  }

  // Text selection listener
  document.addEventListener('mouseup', (e) => {
    if (!getLinkedInId()) return;
    if (e.target.closest('#lpc-overlay') || e.target.closest('#lpc-highlight-menu')) return;

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (text && text.length > 2 && text.length < 500) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        showHighlightMenu(
          rect.left + window.scrollX + rect.width / 2 - 90,
          rect.top + window.scrollY,
          text
        );
      } else if (!e.target.closest('#lpc-highlight-menu')) {
        removeHighlightMenu();
      }
    }, 10);
  });

  // ─── Highlights section ───────────────────────────────────────────────────────

  async function loadHighlightsSection() {
    const container = document.getElementById('lpc-highlights-list');
    if (!container) return;

    const linkedinId = getLinkedInId();
    const config = await msg('GET_CONFIG');
    if (!config.current_recruiter_id) {
      container.innerHTML = '<div class="lpc-empty-other">Select your account to see highlights.</div>';
      return;
    }

    try {
      const resp = await msg('GET_HIGHLIGHTS', { linkedinId, recruiterId: config.current_recruiter_id });
      const highlights = resp.highlights || [];

      if (highlights.length === 0) {
        container.innerHTML = '<div class="lpc-empty-other">No highlights yet.</div>';
        return;
      }

      container.innerHTML = highlights.map(h => {
        const color = HIGHLIGHT_COLORS.find(c => c.id === h.color_id) || HIGHLIGHT_COLORS[0];
        return `
          <div class="lpc-highlight-item" style="border-left:3px solid ${color.bg}">
            <div class="lpc-highlight-text" style="background:${color.bg};color:${color.text}">"${h.highlighted_text}"</div>
            ${h.note ? `<div class="lpc-highlight-note">✏️ ${h.note}</div>` : ''}
            <button class="lpc-highlight-del" data-id="${h.id}" data-text="${h.highlighted_text.replace(/"/g, '&quot;')}" title="Delete">✕</button>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.lpc-highlight-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          await msg('DELETE_HIGHLIGHT', { id: btn.dataset.id });
          // Remove DOM mark
          const text = btn.dataset.text;
          document.querySelectorAll(`.lpc-highlight`).forEach(el => {
            if (el.dataset.text === text) {
              el.replaceWith(document.createTextNode(el.textContent));
            }
          });
          loadHighlightsSection();
        });
      });

      restoreHighlights(highlights);
    } catch (e) {
      container.innerHTML = '<div class="lpc-empty-other">Could not load highlights.</div>';
    }
  }

  // ─── Overlay ──────────────────────────────────────────────────────────────────

  function createOverlay() {
    const el = document.createElement('div');
    el.id = 'lpc-overlay';
    el.innerHTML = `
      <div id="lpc-panel">
        <div id="lpc-header">
          <span id="lpc-logo">◈ Profile Checker</span>
          <div id="lpc-header-controls">
            <button id="lpc-minimize" title="Minimize">−</button>
            <button id="lpc-close" title="Close">✕</button>
          </div>
        </div>
        <div id="lpc-body">
          <div id="lpc-loader"><div class="lpc-spinner"></div><span>Loading…</span></div>
          <div id="lpc-content" style="display:none"></div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    
    // Close button
    el.querySelector('#lpc-close').addEventListener('click', () => {
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); overlayEl = null; }, 200);
    });
    
    // Minimize button
    const panel = el.querySelector('#lpc-panel');
    const minimizeBtn = el.querySelector('#lpc-minimize');
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('minimized');
      minimizeBtn.textContent = panel.classList.contains('minimized') ? '+' : '−';
      minimizeBtn.title = panel.classList.contains('minimized') ? 'Maximize' : 'Minimize';
    });
    
    // Drag functionality
    const header = el.querySelector('#lpc-header');
    let isDragging = false;
    let currentX, currentY, initialX, initialY;
    
    header.addEventListener('mousedown', (e) => {
      // Don't drag if clicking on buttons
      if (e.target.closest('#lpc-header-controls')) return;
      
      isDragging = true;
      const rect = el.getBoundingClientRect();
      initialX = e.clientX - rect.left;
      initialY = e.clientY - rect.top;
      
      header.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      
      // Keep within viewport bounds
      const maxX = window.innerWidth - panel.offsetWidth;
      const maxY = window.innerHeight - 50; // At least header visible
      
      currentX = Math.max(0, Math.min(currentX, maxX));
      currentY = Math.max(0, Math.min(currentY, maxY));
      
      el.style.left = currentX + 'px';
      el.style.top = currentY + 'px';
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = 'move';
      }
    });
    
    return el;
  }

// check blocklist from google sheet
  async function checkGoogleSheetUrl() {
    const match = location.pathname.match(/^\/in\/([^/?#]+)/);

    if (!match) return false;

    const linkedinId = match[1];
    const cleanUrl = `https://www.linkedin.com/in/${linkedinId}/`;

    const resp = await chrome.runtime.sendMessage({
      type: 'CHECK_GOOGLE_SHEET_URL',
      url: cleanUrl
    });
    console.log('isExist--', resp)
    return resp?.exists === true;
  }

function renderContent(profileData, dbData, config, existingBlocklist) {
    const { contacts } = dbData;
    const myContact = contacts?.find(c => c.recruiter_id === config.current_recruiter_id);
    const otherContacts = contacts?.filter(c => c.recruiter_id !== config.current_recruiter_id) || [];

    const blocklistIcon = `<svg class="lpc-blocklist-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="30" height="30" style="display:inline-block;vertical-align:middle;margin-right:6px;"><path fill="#A82C1F" fill-rule="nonzero" d="M256 0c70.686 0 134.69 28.658 181.016 74.984C483.342 121.31 512 185.314 512 256c0 70.686-28.658 134.69-74.984 181.016C390.69 483.342 326.686 512 256 512c-70.686 0-134.69-28.658-181.016-74.984C28.658 390.69 0 326.686 0 256c0-70.686 28.658-134.69 74.984-181.016C121.31 28.658 185.314 0 256 0z"/><circle fill="#D03827" cx="256" cy="256" r="226.536"/><path fill="#fff" fill-rule="nonzero" d="M275.546 302.281c-.88 22.063-38.246 22.092-39.099-.007-3.779-37.804-13.444-127.553-13.136-163.074.312-10.946 9.383-17.426 20.99-19.898 3.578-.765 7.512-1.136 11.476-1.132 3.987.007 7.932.4 11.514 1.165 11.989 2.554 21.402 9.301 21.398 20.444l-.044 1.117-13.099 161.385zm-19.55 39.211c14.453 0 26.168 11.717 26.168 26.171 0 14.453-11.715 26.167-26.168 26.167s-26.171-11.714-26.171-26.167c0-14.454 11.718-26.171 26.171-26.171z"/></svg>`;

    const statusOptions = Object.entries(STATUS_CONFIG)
      .map(([key, v]) => `<option value="${key}" ${myContact?.status === key ? 'selected' : ''}>${v.icon} ${v.label}</option>`)
      .join('');

    const otherHtml = otherContacts.length
      ? otherContacts.map(c => {
          const s = STATUS_CONFIG[c.status] || STATUS_CONFIG.pending;
          const date = c.contacted_at ? new Date(c.contacted_at).toLocaleDateString() : '—';
          return `
            <div class="lpc-other-contact">
              <div class="lpc-contact-row">
                <span class="lpc-recruiter-name">👤 ${c.recruiters ? (c.recruiters.company ? `${c.recruiters.name}'s ${c.recruiters.company}` : c.recruiters.name) : 'Unknown'}</span>
                <span class="lpc-badge" style="background:${s.bg};color:${s.color}">${s.icon} ${s.label}</span>
              </div>
              <div class="lpc-contact-meta">First: ${date}</div>
              ${c.notes ? `<div class="lpc-contact-notes">"${c.notes}"</div>` : ''}
            </div>`;
        }).join('')
      : '<div class="lpc-empty-other">No other recruiters contacted this profile.</div>';

    // Format the date this recruiter first contacted the profile
    const myContactDate = myContact?.contacted_at
      ? new Date(myContact.contacted_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : null;
    const myUpdatedDate = myContact?.updated_at
      ? new Date(myContact.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : null;

    // Button is disabled when a contact already exists and nothing has changed yet.
    // It becomes enabled as soon as the user edits status or notes (handled via JS below).
    const btnDisabled = myContact ? 'disabled' : '';

    return `
      <div class="lpc-profile-strip">
        <img class="lpc-avatar" src="${profileData.avatarUrl || ''}" onerror="this.src=''" />
        <div class="lpc-profile-info">
          <div class="lpc-profile-name">${profileData.name || 'Name not found'}</div>
          <div class="lpc-profile-headline">${profileData.headline || 'No headline available'}</div>
        </div>
      </div>

      <div class="lpc-section-title">Your Outreach</div>
      <div class="lpc-my-section">
        <div class="lpc-recruiter-label">Logged as: <strong>${config.current_recruiter_name || '—'}</strong></div>

        ${myContactDate ? `
          <div class="lpc-contact-dates">
            <span>📅 First contact: <strong>${myContactDate}</strong></span>
            ${myUpdatedDate && myUpdatedDate !== myContactDate ? `<span>✏️ Updated: <strong>${myUpdatedDate}</strong></span>` : ''}
          </div>
        ` : ''}

        ${existingBlocklist ? `
          <div class="lpc-blocklist-warning">
            ${blocklistIcon}
            <span>This profile is in your blocklist</span>
          </div>
        ` : `
          <div class="lpc-section-title">Other Recruiters (${otherContacts.length})</div>
          <div class="lpc-others-section">${otherHtml}</div>
        `}

        <div class="lpc-field-row">
          <label>Status</label>
          <select id="lpc-status-select" class="lpc-select">${statusOptions}</select>
        </div>
        <div class="lpc-field-row">
          <label>Notes</label>
          <textarea id="lpc-notes" class="lpc-textarea" placeholder="Add notes…">${myContact?.notes || ''}</textarea>
        </div>
        <button id="lpc-save-btn" class="lpc-btn-primary" ${btnDisabled}>${myContact ? '💾 Update' : '➕ Add Contact'}</button>
        <div id="lpc-save-msg" class="lpc-save-msg"></div>
      </div>
    `;
}

  async function loadOverlayData() {
    if (!overlayEl) return;
    const content = overlayEl.querySelector('#lpc-content');
    const loader = overlayEl.querySelector('#lpc-loader');

    loader.style.display = 'flex';
    content.style.display = 'none';

    try {
      // Kick off all async work in parallel — profile data extraction,
      // config/DB fetch, and blocklist check all run concurrently.
      const linkedinId = getLinkedInId();

      const [profileData, configResp, profileResp, existingBlocklist] = await Promise.all([
        waitForProfileData(),
        msg('GET_CONFIG'),
        msg('GET_PROFILE', { linkedinId }),
        checkGoogleSheetUrl()
      ]);

      if (!configResp.supabase_url) {
        content.innerHTML = `<div class="lpc-not-configured"><div class="lpc-nc-icon">⚙️</div><div class="lpc-nc-title">Not Configured</div><div class="lpc-nc-desc">Click the extension icon to set up Supabase.</div></div>`;
        loader.style.display = 'none';
        content.style.display = 'block';
        return;
      }

      const mergedProfile = mergeProfileData(profileData, profileResp.profile);
      const contacts = profileResp.profile?.contacts || [];
      content.innerHTML = renderContent(mergedProfile, { contacts }, configResp, existingBlocklist);

      const saveBtn = content.querySelector('#lpc-save-btn');
      const statusSelect = content.querySelector('#lpc-status-select');
      const notesArea = content.querySelector('#lpc-notes');
      const saveMsg = content.querySelector('#lpc-save-msg');
      const myContact = contacts.find(c => c.recruiter_id === configResp.current_recruiter_id);

      // Enable the button whenever the user changes status or notes
      function markDirty() {
        saveBtn.disabled = false;
      }
      statusSelect.addEventListener('change', markDirty);
      notesArea.addEventListener('input', markDirty);

      saveBtn.addEventListener('click', async () => {
        const status = statusSelect.value;
        const notes = notesArea.value;

        if (!configResp.current_recruiter_id) {
          saveMsg.textContent = '⚠️ Set your recruiter account first.';
          saveMsg.className = 'lpc-save-msg error';
          return;
        }

        saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
        try {
          await msg('UPSERT_CONTACT', {
            data: { ...mergedProfile, recruiterId: configResp.current_recruiter_id, status, notes }
          });
          saveMsg.textContent = '✅ Saved!';
          saveMsg.className = 'lpc-save-msg success';
          saveBtn.textContent = '💾 Update';
          setTimeout(() => loadOverlayData(), 1000);
        } catch (e) {
          saveMsg.textContent = `❌ Error: ${e.message}`;
          saveMsg.className = 'lpc-save-msg error';
          saveBtn.textContent = myContact ? '💾 Update' : '➕ Add Contact';
          saveBtn.disabled = false;
        }
      });

      loader.style.display = 'none';
      content.style.display = 'block';
      loadHighlightsSection();

    } catch (e) {
      console.error('[ProfileChecker] Error loading overlay:', e);
      content.innerHTML = `<div class="lpc-error">⚠️ ${e.message}</div>`;
      loader.style.display = 'none';
      content.style.display = 'block';
    }
  }

  function checkAndInject() {
    const id = getLinkedInId();
    if (!id) {
      if (overlayEl) { overlayEl.remove(); overlayEl = null; currentProfileId = null; }
      return;
    }
    if (id === currentProfileId && overlayEl) return;

    currentProfileId = id;
    if (overlayEl) overlayEl.remove();

    overlayEl = createOverlay();
    requestAnimationFrame(() => {
      overlayEl.style.opacity = '1';
      overlayEl.querySelector('#lpc-panel').style.transform = 'translateX(0)';
    });
    loadOverlayData();
  }

  let lastPath = location.pathname;
  let debounceTimeout;

  // Only watch for childList changes at the top level — LinkedIn SPA navigation
  // changes the URL and swaps top-level children, so we don't need subtree here.
  new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      removeHighlightMenu();
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(checkAndInject, 500);
    }
  }).observe(document.body, { childList: true, subtree: false });

  // Initial injection — short delay to let LinkedIn's React hydrate
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(checkAndInject, 300));
  } else {
    setTimeout(checkAndInject, 300);
  }
})();
