// src/keyword_highlighter.js
// Runs on ALL pages (non-LinkedIn). Handles keyword auto-highlighting only.
(function keywordHighlighter() {
  const COLORS = {
    yellow: { bg: '#FEF08A', text: '#713F12' },
    green:  { bg: '#BBF7D0', text: '#14532D' },
    blue:   { bg: '#BAE6FD', text: '#0C4A6E' },
    pink:   { bg: '#FBCFE8', text: '#831843' },
    orange: { bg: '#FED7AA', text: '#7C2D12' },
  };

  const SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','IFRAME','TEXTAREA','INPUT','SELECT','CODE','PRE','MARK']);

  function applyKeywordHighlights(keywords) {
    if (!keywords || keywords.length === 0) return;

    // Remove existing keyword highlights first
    document.querySelectorAll('mark.lpc-kw').forEach(el => {
      el.replaceWith(document.createTextNode(el.textContent));
    });

    const escaped = keywords.map(k => k.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!escaped.length) return;
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi');

    // Build a color lookup map for O(1) access
    const colorMap = new Map(keywords.map(k => [k.word.toLowerCase(), COLORS[k.color_id] || COLORS.yellow]));

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const tag = node.parentElement?.tagName;
        if (SKIP_TAGS.has(tag)) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('mark.lpc-kw')) return NodeFilter.FILTER_REJECT;
        if (!node.textContent.trim()) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodesToProcess = [];
    let node;
    while ((node = walker.nextNode())) {
      if (regex.test(node.textContent)) nodesToProcess.push(node);
      regex.lastIndex = 0;
    }

    nodesToProcess.forEach(textNode => {
      const text = textNode.textContent;
      regex.lastIndex = 0;
      if (!regex.test(text)) return;
      regex.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let last = 0;
      let m;

      while ((m = regex.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));

        const color = colorMap.get(m[0].toLowerCase()) || COLORS.yellow;
        const mark = document.createElement('mark');
        mark.className = 'lpc-kw';
        mark.textContent = m[0];
        mark.style.cssText = `background:${color.bg}!important;color:${color.text}!important;border-radius:2px;padding:0 2px;font-style:inherit;font-weight:inherit;`;
        frag.appendChild(mark);
        last = m.index + m[0].length;
      }

      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      if (frag.childNodes.length > 0) textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  async function fetchAndApplyKeywords() {
    try {
      const resp = await new Promise((res, rej) => {
        chrome.runtime.sendMessage({ type: 'GET_KEYWORDS_FOR_PAGE' }, r => {
          if (chrome.runtime.lastError) rej(chrome.runtime.lastError);
          else res(r);
        });
      });
      if (resp?.keywords) applyKeywordHighlights(resp.keywords);
    } catch (e) {
      // Not logged in or extension not ready — silently skip
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'REFRESH_KEYWORDS') fetchAndApplyKeywords();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchAndApplyKeywords);
  } else {
    fetchAndApplyKeywords();
  }
})();
