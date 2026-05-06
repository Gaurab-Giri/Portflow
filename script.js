document.addEventListener('DOMContentLoaded', () => {
  const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mdaledow';

  // Visit counter (localStorage)
  const VISIT_KEY = 'portfolioVisitCount';
  const visitCountEl = document.getElementById('visitCount');
  const visitResetBtn = document.getElementById('visitResetBtn');
  let visitCount = parseInt(localStorage.getItem(VISIT_KEY) || '0', 10);
  visitCount++;
  localStorage.setItem(VISIT_KEY, String(visitCount));
  if (visitCountEl) visitCountEl.textContent = visitCount;
  visitResetBtn?.addEventListener('click', () => {
    visitCount = 0;
    localStorage.setItem(VISIT_KEY, '0');
    if (visitCountEl) visitCountEl.textContent = '0';
  });

  // 0. Media modal (Experience & Community)
  const mediaModal = document.getElementById('mediaModal');
  const mediaModalImg = document.getElementById('mediaModalImg');
  const mediaModalGallery = document.getElementById('mediaModalGallery');
  const mediaModalVideo = document.getElementById('mediaModalVideo');
  const mediaModalPlaceholder = document.getElementById('mediaModalPlaceholder');

  function isDirectMediaUrl(url) {
    if (!url) return false;
    const u = url.toLowerCase();
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(u) || /\.(mp4|webm|ogg)$/i.test(u);
  }

  function openMediaModal(src, type) {
    mediaModalImg.style.display = 'none';
    if (mediaModalGallery) mediaModalGallery.style.display = 'none';
    mediaModalVideo.style.display = 'none';
    mediaModalPlaceholder.style.display = 'none';
    if (!src || !src.trim()) {
      mediaModalPlaceholder.style.display = 'block';
      mediaModal.classList.add('active');
      return;
    }
    if (type === 'link' || !isDirectMediaUrl(src.split(',')[0].trim())) {
      window.open(src.split(',')[0].trim(), '_blank', 'noopener');
      return;
    }
    if (type === 'video') {
      mediaModalVideo.innerHTML = '';
      const source = document.createElement('source');
      source.src = src.trim();
      const ext = src.split('.').pop().toLowerCase();
      source.type = ext === 'webm' ? 'video/webm' : 'video/mp4';
      mediaModalVideo.appendChild(source);
      mediaModalVideo.style.display = 'block';
      mediaModalVideo.load();
    } else {
      const imgSrcs = src.split(',').map(s => s.trim()).filter(Boolean);
      if (imgSrcs.length > 1) {
        mediaModalGallery.innerHTML = '';
        imgSrcs.forEach(s => {
          const img = document.createElement('img');
          img.src = s;
          img.alt = 'Experience or community media';
          mediaModalGallery.appendChild(img);
        });
        mediaModalGallery.style.display = 'flex';
      } else {
        mediaModalImg.src = imgSrcs[0] || src;
        mediaModalImg.alt = 'Experience or community media';
        mediaModalImg.style.display = 'block';
      }
    }
    mediaModal.classList.add('active');
  }

  function closeMediaModal() {
    mediaModal.classList.remove('active');
    if (mediaModalVideo) {
      mediaModalVideo.pause();
    }
  }

  document.querySelectorAll('.btn-media-icon, .btn-media').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = btn.closest('.item');
      const src = (item && item.dataset.mediaSrc) || '';
      const type = (item && item.dataset.mediaType) || 'image';
      openMediaModal(src, type);
    });
  });


  mediaModal?.querySelector('.media-modal-backdrop').addEventListener('click', closeMediaModal);
  mediaModal?.querySelector('.media-modal-close').addEventListener('click', closeMediaModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mediaModal?.classList.contains('active')) closeMediaModal(); });

  // 1. Tab Navigation
  const tabs = document.querySelectorAll(".tabs li");
  const tabContents = document.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
      tab.addEventListener("click", () => {
          tabs.forEach(t => t.classList.remove("active"));
          tabContents.forEach(c => c.classList.remove("active"));
          tab.classList.add("active");
          const targetId = tab.getAttribute("data-target");
          document.getElementById(targetId).classList.add("active");
          if (targetId === "news") window.dispatchEvent(new CustomEvent("newsTabShown"));
      });
  });

  // Live World News
  const newsContainer = document.getElementById("newsContainer");
  const newsSkeleton = document.getElementById("newsSkeleton");
  const newsError = document.getElementById("newsError");
  const newsCards = document.getElementById("newsCards");
  const newsLastUpdated = document.getElementById("newsLastUpdated");
  const newsRetryBtn = document.getElementById("newsRetryBtn");
  const newsFilterBtns = document.querySelectorAll(".news-filter-btn");
  const NEWS_REFRESH_MS = 5 * 60 * 1000;
  const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;
  const NEWS_CACHE_KEY = "newsCache";
  let newsRefreshTimer = null;
  let newsCurrentCategory = "";

  function getSourceInitials(sourceName) {
    const parts = (sourceName || "N").split(/[\s.-]/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (sourceName || "N").slice(0, 2).toUpperCase();
  }

  function placeholderSvgForSource(sourceName) {
    const initials = getSourceInitials(sourceName).slice(0, 2);
    return "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#0d9488;stop-opacity:0.3"/><stop offset="100%" style="stop-color:#0f766e;stop-opacity:0.5"/></defs><rect width="400" height="250" fill="url(#g)"/><text fill="rgba(255,255,255,0.9)" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="32" font-family="system-ui,sans-serif" font-weight="600">${initials}</text></svg>`
    );
  }

  function imageUrlWithSize(url, w) {
    if (!url || url.startsWith("data:")) return url;
    try {
      const u = new URL(url);
      if (["img.bbci.co.uk", "i.guim.co.uk", "media.guim.co.uk"].some(h => u.hostname.includes(h))) {
        if (!u.searchParams.has("w") && !u.searchParams.has("width")) u.searchParams.set("w", String(w || 400));
        return u.toString();
      }
    } catch (_) {}
    return url;
  }

  function relativeTime(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const sec = Math.floor((now - d) / 1000);
    if (sec < 60) return "Just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return min + " min ago";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + " hr" + (hr > 1 ? "s" : "") + " ago";
    const day = Math.floor(hr / 24);
    return day + " day" + (day > 1 ? "s" : "") + " ago";
  }

  function setNewsState(state) {
    newsSkeleton.style.display = state === "loading" ? "grid" : "none";
    newsError.style.display = state === "error" ? "block" : "none";
    newsCards.style.display = state === "loaded" ? "grid" : "none";
  }

  function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return div.textContent?.trim().slice(0, 500) || "";
  }

  function renderNewsCards(articles) {
    newsCards.innerHTML = "";
    articles.forEach((a) => {
      const source = (a.source?.name || "Source").replace(/\.(com|co\.uk)$/, "");
      const placeholderImg = placeholderSvgForSource(source);
      const imgUrl = a.urlToImage ? imageUrlWithSize(a.urlToImage, 400) : placeholderImg;
      const card = document.createElement("article");
      card.className = "news-card";
      card.dataset.articleId = btoa(encodeURIComponent((a.title || "") + (a.url || ""))).slice(0, 20);
      card.dataset.title = a.title || "";
      card.dataset.description = stripHtml(a.description || "");
      card.innerHTML = `
        <img class="news-card-image" src="${imgUrl}" alt="" loading="lazy" onerror="this.src='${placeholderImg}'">
        <div class="news-card-body">
          <span class="news-card-source">${source}</span>
          <h3 class="news-card-headline">${a.title || "No headline"}</h3>
          <span class="news-card-meta">${relativeTime(a.publishedAt || "")}</span>
          <div class="news-card-actions">
            <button type="button" class="news-summarize-btn" aria-label="Summarize">✦ Summarize</button>
            <a href="${a.url || "#"}" class="news-card-link" target="_blank" rel="noopener">Read more →</a>
          </div>
          <div class="news-summary-panel" hidden></div>
        </div>
      `;
      card.querySelector(".news-summarize-btn").addEventListener("click", () => handleSummarizeClick(card));
      newsCards.appendChild(card);
    });
  }

  async function handleSummarizeClick(card) {
    const panel = card.querySelector(".news-summary-panel");
    const btn = card.querySelector(".news-summarize-btn");
    const cached = panel.dataset.summary;
    if (cached) {
      panel.hidden = !panel.hidden;
      return;
    }
    if (panel.dataset.loading === "true") return;
    const title = card.dataset.title;
    const description = card.dataset.description;
    btn.classList.add("loading");
    btn.setAttribute("aria-busy", "true");
    panel.hidden = false;
    panel.dataset.loading = "true";
    panel.innerHTML = '<span class="news-summary-loading">Generating...</span>';
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description })
      });
      const data = await res.json().catch(() => ({}));
      const summary = data.summary || "";
      if (summary) {
        panel.dataset.summary = summary;
        panel.classList.add("has-summary");
        panel.innerHTML = '<span class="news-summary-badge">AI Summary</span><p>' + summary.replace(/</g, "&lt;") + "</p>";
      } else {
        console.error("FRONTEND ERROR:", data);
        const errMsg = data.error && (typeof data.error === "string" ? data.error : data.error.message || JSON.stringify(data.error));
        panel.innerHTML = '<p class="news-summary-error">' + (errMsg ? "Error: " + errMsg : "Unable to generate summary. Please try again later.") + "</p>";
      }
    } catch (e) {
      console.error("FRONTEND ERROR:", e);
      panel.innerHTML = '<p class="news-summary-error">Could not connect. Please check your connection and try again.</p>';
    }
    panel.dataset.loading = "false";
    btn.classList.remove("loading");
    btn.removeAttribute("aria-busy");
  }

  const RSS_FEEDS = {
    "": ["https://feeds.bbci.co.uk/news/rss.xml", "https://www.theguardian.com/world/rss"],
    technology: ["https://feeds.bbci.co.uk/news/technology/rss.xml", "https://www.theguardian.com/technology/rss"],
    business: ["https://feeds.bbci.co.uk/news/business/rss.xml", "https://www.theguardian.com/business/rss"],
    general: ["https://www.theguardian.com/world/rss", "https://feeds.bbci.co.uk/news/world/rss.xml"],
    science: ["https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", "https://www.theguardian.com/science/rss"]
  };

  function parseRssXml(xmlText) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, "text/xml");
      const parseErr = doc.querySelector("parsererror");
      if (parseErr) return [];
      const items = doc.querySelectorAll("item");
    const articles = [];
    items.forEach((item, i) => {
      if (i >= 21) return;
      const title = item.querySelector("title")?.textContent?.trim() || "";
      const link = item.querySelector("link")?.textContent?.trim() || "";
      const pubDate = item.querySelector("pubDate")?.textContent?.trim() || "";
      const descEl = item.querySelector("description");
      const desc = descEl?.textContent?.trim() || descEl?.innerHTML?.replace(/<[^>]+>/g, " ").trim() || "";
      const enclosure = item.querySelector("enclosure");
      const media = item.querySelector("content");
      const img = enclosure?.getAttribute("url") || media?.getAttribute("url") || "";
      const sourceMatch = link.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/);
      const sourceName = sourceMatch ? sourceMatch[1].replace(/\.(com|co\.uk)$/, "") : "News";
      articles.push({
        title,
        url: link,
        description: desc,
        publishedAt: pubDate,
        urlToImage: img || null,
        source: { name: sourceName }
      });
    });
    return articles;
    } catch (_) { return []; }
  }

  async function fetchNewsFromRss() {
    const feeds = RSS_FEEDS[newsCurrentCategory] || RSS_FEEDS[""];
    const proxies = [
      (url) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
      (url) => "https://corsproxy.io/?" + encodeURIComponent(url)
    ];
    const all = [];
    for (const feedUrl of feeds) {
      for (const toProxy of proxies) {
        try {
          const res = await fetch(toProxy(feedUrl));
          const xml = await res.text();
          if (!xml || xml.length < 100) continue;
          const articles = parseRssXml(xml);
          if (articles.length > 0) {
            all.push(...articles);
            break;
          }
        } catch (_) {}
      }
    }
    all.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
    return all.slice(0, 21);
  }

  function getCachedNews() {
    try {
      const raw = localStorage.getItem(NEWS_CACHE_KEY + "_" + newsCurrentCategory);
      if (!raw) return null;
      const { articles, ts } = JSON.parse(raw);
      if (!Array.isArray(articles) || articles.length === 0) return null;
      if (Date.now() - (ts || 0) > NEWS_CACHE_TTL_MS) return null;
      return articles;
    } catch (_) { return null; }
  }

  function setCachedNews(articles) {
    try {
      localStorage.setItem(NEWS_CACHE_KEY + "_" + newsCurrentCategory, JSON.stringify({
        articles,
        ts: Date.now()
      }));
    } catch (_) {}
  }

  async function fetchNews(silent = false) {
    const cached = getCachedNews();
    const hasValidCache = cached && cached.length > 0;
    if (hasValidCache && !silent) {
      renderNewsCards(cached);
      newsLastUpdated.textContent = "Last updated: " + new Date().toLocaleTimeString() + " (cached)";
      setNewsState("loaded");
    } else if (!silent) {
      setNewsState("loading");
    }
    const apiUrl = "/api/news" + (newsCurrentCategory ? "?category=" + encodeURIComponent(newsCurrentCategory) : "");
    let articles = [];
    try {
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        articles = data.articles || [];
      }
    } catch (_) {}
    if (articles.length === 0) {
      try {
        articles = await fetchNewsFromRss();
      } catch (err) {
        console.warn("RSS fallback failed:", err);
      }
    }
    if (articles.length > 0) {
      setCachedNews(articles);
      renderNewsCards(articles);
      newsLastUpdated.textContent = "Last updated: " + new Date().toLocaleTimeString();
      setNewsState("loaded");
      if (newsRefreshTimer) clearInterval(newsRefreshTimer);
      newsRefreshTimer = setInterval(() => fetchNews(true), NEWS_REFRESH_MS);
    } else if (!cached || cached.length === 0) {
      setNewsState("error");
    }
  }

  newsFilterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      newsFilterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      newsCurrentCategory = btn.dataset.category || "";
      fetchNews();
    });
  });

  newsRetryBtn?.addEventListener("click", () => fetchNews());
  document.addEventListener("newsTabShown", () => { if (newsCards.children.length === 0 && newsError.style.display !== "block") fetchNews(); });

  // Skills Radar Chart (Chart.js) — popup when Programming Languages is clicked
  const skillsChartModal = document.getElementById('skillsChartModal');
  const programmingLanguagesGroup = document.getElementById('programmingLanguagesGroup');
  let skillsChartInstance = null;

  function openSkillsChartModal() {
    skillsChartModal?.classList.add('active');
    if (skillsChartInstance) setTimeout(() => skillsChartInstance.resize(), 50);
  }
  function closeSkillsChartModal() {
    skillsChartModal?.classList.remove('active');
  }

  programmingLanguagesGroup?.addEventListener('click', openSkillsChartModal);
  skillsChartModal?.querySelector('.skills-chart-modal-backdrop')?.addEventListener('click', closeSkillsChartModal);
  skillsChartModal?.querySelector('.skills-chart-modal-close')?.addEventListener('click', closeSkillsChartModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && skillsChartModal?.classList.contains('active')) closeSkillsChartModal(); });

  const skillsCanvas = document.getElementById('skillsChart');
  if (skillsCanvas && typeof Chart !== 'undefined') {
    skillsChartInstance = new Chart(skillsCanvas, {
      type: 'radar',
      data: {
        labels: ['Python', 'JavaScript', 'SQL', 'HTML/CSS', 'C', 'C#'],
        datasets: [{
          label: 'Skill Level',
          data: [9, 8, 7, 7, 8, 6],
          backgroundColor: 'rgba(52, 152, 219, 0.3)',
          borderColor: '#3498db',
          borderWidth: 2,
          pointBackgroundColor: '#3498db',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#3498db'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          r: {
            beginAtZero: true,
            max: 10,
            ticks: { stepSize: 2 }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  // 2. Gemini Chatbot Logic (Gemini + Voice-to-Text + TTS)
  const chatToggle = document.getElementById('chatToggle');
  const chatWidget = document.getElementById('chatWidget');
  const closeChat = document.getElementById('closeChat');
  const chatInput = document.getElementById('chatInput');
  const sendMessage = document.getElementById('sendMessage');
  const voiceBtn = document.getElementById('voiceBtn');
  const ttsToggle = document.getElementById('ttsToggle');
  const videoCallBtn = document.getElementById('videoCallBtn');
  const apiStatusDot = document.getElementById('apiStatusDot');
  const chatMessages = document.getElementById('chatMessages');
  const chatAnchor = document.getElementById('chatAnchor');
  const callOverlay = document.getElementById('callOverlay');
  const hangupCallBtn = document.getElementById('hangupCallBtn');
  const callStatus = document.getElementById('callStatus');
  const anamVideo = document.getElementById('anamVideo');

  let ttsEnabled = false;
  let isLoading = false;
  let messages = []; // { id, role: 'user'|'model', text }
  let callMode = false;
  let anamClient = null;
  let anamSdk = null;

  function setApiStatus(state, titleText) {
    if (!apiStatusDot) return;
    apiStatusDot.classList.remove('api-status-connected', 'api-status-rate-limit', 'api-status-error', 'api-status-unknown');
    switch (state) {
      case 'connected':
        apiStatusDot.classList.add('api-status-connected');
        apiStatusDot.title = titleText || 'API status: Connected';
        apiStatusDot.setAttribute('aria-label', 'API status connected');
        break;
      case 'rate-limit':
        apiStatusDot.classList.add('api-status-rate-limit');
        apiStatusDot.title = titleText || 'API status: Rate limit reached';
        apiStatusDot.setAttribute('aria-label', 'API status rate limit');
        break;
      case 'error':
        apiStatusDot.classList.add('api-status-error');
        apiStatusDot.title = titleText || 'API status: Error or quota exhausted';
        apiStatusDot.setAttribute('aria-label', 'API status error');
        break;
      default:
        apiStatusDot.classList.add('api-status-unknown');
        apiStatusDot.title = titleText || 'API status: Unknown';
        apiStatusDot.setAttribute('aria-label', 'API status unknown');
    }
  }
  setApiStatus('unknown');

  function setCallOverlayOpen(open) {
    if (!callOverlay) return;
    callOverlay.classList.toggle('active', !!open);
    callOverlay.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function setCallStatus(text) {
    if (!callStatus) return;
    callStatus.textContent = text || '';
  }

  function setChatInputEnabled(enabled) {
    if (chatInput) chatInput.disabled = !enabled;
    if (sendMessage) sendMessage.disabled = !enabled;
    if (voiceBtn) voiceBtn.disabled = !enabled;
  }

  async function fetchAnamSessionToken() {
    const res = await fetch('/api/anam-token', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Failed to fetch Anam token (${res.status})`);
    if (!data?.sessionToken) throw new Error('Missing sessionToken from /api/anam-token');
    return data.sessionToken;
  }

  async function loadAnamSdk() {
    if (anamSdk) return anamSdk;
    // Load @anam-ai/js-sdk via jsDelivr ESM. Dynamic import works in classic scripts.
    anamSdk = await import('https://cdn.jsdelivr.net/npm/@anam-ai/js-sdk@4.12.0/+esm');
    return anamSdk;
  }

  async function startCall() {
    if (callMode) return;
    callMode = true;
    stopSpeaking();
    stopListening(true);
    setChatInputEnabled(false);
    setCallOverlayOpen(true);
    setCallStatus('Connecting…');

    try {
      const { createClient, AnamEvent } = await loadAnamSdk();
      const sessionToken = await fetchAnamSessionToken();

      anamClient = createClient(sessionToken, {
        disableInputAudio: false, // mic enabled
        voiceDetection: { endOfSpeechSensitivity: 0.5 },
      });

      anamClient.addListener?.(AnamEvent?.CONNECTION_ESTABLISHED, () => setCallStatus('Connected'));
      anamClient.addListener?.(AnamEvent?.CONNECTION_CLOSED, () => setCallStatus('Call ended'));

      if (!anamVideo?.id) throw new Error('Missing anamVideo element');
      await anamClient.streamToVideoElement(anamVideo.id);
      setCallStatus('Connected — speak to the avatar');
    } catch (e) {
      setCallStatus('Failed to connect');
      addChatMessage('Call failed to start. Please try again.', 'bot');
      await endCall();
    }
  }

  async function endCall() {
    // Always attempt cleanup; safe to call multiple times.
    callMode = false;
    setCallOverlayOpen(false);
    setCallStatus('');
    setChatInputEnabled(true);

    try {
      if (anamClient?.stopStreaming) {
        await anamClient.stopStreaming();
      }
    } catch (_) {}

    // Best-effort: stop any media element playback
    try {
      if (anamVideo) {
        anamVideo.pause?.();
        anamVideo.srcObject = null;
      }
    } catch (_) {}

    anamClient = null;
  }

  let scrollScheduled = false;
  function scrollChatToBottom() {
    if (!chatMessages) return;
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(() => {
      try {
        if (chatAnchor) chatAnchor.scrollIntoView({ behavior: 'auto', block: 'end' });
        chatMessages.scrollTop = chatMessages.scrollHeight;
        setTimeout(() => {
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 50);
      } finally {
        scrollScheduled = false;
      }
    });
  }

  function addChatMessage(text, sender) {
    if (!chatMessages) return null;
    const msg = document.createElement('div');
    msg.className = `message ${sender}`;
    msg.innerText = text;
    if (chatAnchor && chatAnchor.parentElement === chatMessages) {
      chatMessages.insertBefore(msg, chatAnchor);
    } else {
      chatMessages.appendChild(msg);
    }
    scrollChatToBottom();
    return msg;
  }

  function addTypingIndicator() {
    const bubble = addChatMessage('', 'bot');
    if (!bubble) return null;
    bubble.classList.add('typing-indicator');
    bubble.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    return bubble;
  }

  function speakText(text) {
    if (!ttsEnabled) return;
    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1;
    window.speechSynthesis.speak(u);
  }

  function stopSpeaking() {
    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') return;
    window.speechSynthesis.cancel();
  }

  function hexToRgbTuple(hex) {
    if (!hex) return null;
    const h = String(hex).trim().replace('#', '');
    if (![3, 6].includes(h.length)) return null;
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return [r, g, b];
  }

  function setThemeVars({ accent, bg }) {
    const root = document.documentElement;
    if (accent) {
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--primary', accent);
      const rgb = hexToRgbTuple(accent);
      if (rgb) root.style.setProperty('--primary-rgb', `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`);
    }
    if (bg) {
      root.style.setProperty('--bg-color', bg);
    }
  }

  function openTab(target) {
    const tab = document.querySelector(`.tabs li[data-target="${target}"]`);
    if (tab) tab.click();
  }

  function scrollToSection(target) {
    openTab(target);
    const el = document.getElementById(target);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openResume() {
    const link = document.querySelector('a.btn-view');
    const href = link?.getAttribute('href');
    if (href) window.open(href, '_blank', 'noopener');
  }

  function openPortfolio() {
    window.open('https://gaurab-giri.github.io', '_blank', 'noopener');
  }

  function executeSystemCommand(cmd) {
    if (!cmd || typeof cmd !== 'object') return false;
    const type = String(cmd.type || '').toLowerCase();

    if (type === 'theme') {
      const mode = String(cmd.mode || '').toLowerCase();
      if (mode === 'dark') document.body.classList.add('dark-mode');
      if (mode === 'light') document.body.classList.remove('dark-mode');
      setThemeVars({ accent: cmd.accent, bg: cmd.bg });
      return true;
    }

    if (type === 'scroll') {
      const target = String(cmd.target || '').toLowerCase();
      const allowed = new Set(['projects', 'skills', 'experience', 'community', 'education', 'contact', 'news', 'entertainment']);
      if (allowed.has(target)) {
        scrollToSection(target);
        return true;
      }
      return false;
    }

    if (type === 'open') {
      const target = String(cmd.target || '').toLowerCase();
      if (target === 'resume') {
        openResume();
        return true;
      }
      if (target === 'portfolio') {
        openPortfolio();
        return true;
      }
      return false;
    }

    return false;
  }

  function handleSystemCommand(rawText) {
    const text = String(rawText || '');
    const re = /<COMMAND>\s*([\s\S]*?)\s*<\/COMMAND>/g;
    let matchedAny = false;
    let cleaned = text;

    let m;
    while ((m = re.exec(text)) !== null) {
      const jsonStr = (m[1] || '').trim();
      try {
        const cmd = JSON.parse(jsonStr);
        if (executeSystemCommand(cmd)) matchedAny = true;
      } catch (_) {}
    }

    cleaned = cleaned.replace(re, '').trim();
    return { cleanedText: cleaned, executed: matchedAny };
  }

  async function geminiGenerate(userMessages) {
    const model = 'models/gemini-1.5-flash-latest';
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: userMessages, model }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error || `Gemini proxy request failed (${res.status})`);
      err.status = res.status;
      err.detail = data?.detail || null;
      throw err;
    }

    return data?.text?.trim() || 'I received a response but it was empty.';
  }

  async function handleChatSend() {
    if (!chatInput || !sendMessage) return;
    if (isLoading) return;
    if (callMode) {
      addChatMessage('Call Mode is active. Hang up to continue chatting here.', 'bot');
      return;
    }

    const userText = chatInput.value.trim();
    if (!userText) return;

    // Quick local commands (voice/text) without waiting for Gemini
    const t = userText.toLowerCase();
    if (/\b(scroll to projects|go to projects|open projects)\b/.test(t)) {
      chatInput.value = '';
      addChatMessage(userText, 'user');
      scrollToSection('projects');
      addChatMessage('Opening Projects.', 'bot');
      return;
    }
    if (/\b(open resume|show resume)\b/.test(t)) {
      chatInput.value = '';
      addChatMessage(userText, 'user');
      openResume();
      addChatMessage('Opening your resume.', 'bot');
      return;
    }
    if (/\b(make it dark|dark mode)\b/.test(t)) {
      chatInput.value = '';
      addChatMessage(userText, 'user');
      document.body.classList.add('dark-mode');
      addChatMessage('Switched to dark mode.', 'bot');
      return;
    }
    if (/\b(light mode|make it light)\b/.test(t)) {
      chatInput.value = '';
      addChatMessage(userText, 'user');
      document.body.classList.remove('dark-mode');
      addChatMessage('Switched to light mode.', 'bot');
      return;
    }

    chatInput.value = '';
    addChatMessage(userText, 'user');
    messages.push({ id: Date.now().toString() + '-u', role: 'user', text: userText });

    isLoading = true;
    const typing = addTypingIndicator();
    try {
      const reply = await geminiGenerate(messages);
      if (typing) typing.remove();
      const { cleanedText } = handleSystemCommand(reply);
      const shown = cleanedText || 'Done.';
      setApiStatus('connected', 'API status: Connected');
      addChatMessage(shown, 'bot');
      messages.push({ id: Date.now().toString() + '-m', role: 'model', text: shown });
      speakText(shown);
    } catch (err) {
      if (typing) typing.remove();
      const errMsg = String(err?.message || '');
      const detailText = JSON.stringify(err?.detail || '').toLowerCase();
      const combined = `${errMsg.toLowerCase()} ${detailText}`;
      if (combined.includes('quota') || combined.includes('resource_exhausted')) {
        setApiStatus('error', 'API status: Quota exhausted');
      } else if (Number(err?.status) === 429 || combined.includes('rate limit') || combined.includes('too many')) {
        setApiStatus('rate-limit', 'API status: Rate limit reached (too many requests)');
      } else {
        setApiStatus('error', 'API status: Error');
      }
      addChatMessage(
        /api key/i.test(String(err?.message || ''))
          ? 'Gemini API key is not configured on the server.'
          : 'Sorry — I could not reach Gemini. Please try again.',
        'bot'
      );
    } finally {
      isLoading = false;
      scrollChatToBottom();
    }
  }

  // Voice-to-Text (webkitSpeechRecognition)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let voiceListening = false;
  let voiceStarting = false;
  let voiceSeed = '';
  let voiceStartTs = 0;
  let voiceRetryAttempted = false;
  let voiceSessionActive = false;
  let voiceRetryTimeoutId = null;
  let voiceRequested = false;
  let voiceLastErrorAt = 0;

  function emitVoiceError(msg) {
    const now = Date.now();
    if (now - voiceLastErrorAt < 2500) return;
    voiceLastErrorAt = now;
    addChatMessage(msg, 'bot');
  }

  function setVoiceUi(active) {
    if (!voiceBtn) return;
    const on = !!active;
    voiceBtn.classList.toggle('listening', on);
    voiceBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    voiceBtn.title = on ? 'Stop voice input' : 'Start voice input';
    voiceBtn.setAttribute('aria-label', on ? 'Stop voice input' : 'Start voice input');
    voiceBtn.textContent = on ? '■' : '🎤';
  }

  function stopListening(forceAbort = false) {
    if (!recognition) return;
    voiceStarting = false;
    voiceRequested = false;
    voiceSessionActive = false;
    if (voiceRetryTimeoutId) {
      clearTimeout(voiceRetryTimeoutId);
      voiceRetryTimeoutId = null;
    }
    try {
      if (forceAbort) recognition.abort();
      else recognition.stop();
    } catch (_) {}
  }

  function startListening() {
    if (!recognition) {
      addChatMessage('Voice input is not supported in this browser.', 'bot');
      return;
    }
    if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
      addChatMessage('Voice input requires a secure context (HTTPS or localhost).', 'bot');
      return;
    }
    if (navigator.onLine === false) {
      addChatMessage('You appear to be offline. Voice input needs network access.', 'bot');
      return;
    }
    if (voiceListening || voiceStarting) return;

    stopSpeaking();
    voiceRequested = true;
    voiceStarting = true;
    voiceSessionActive = true;
    if (voiceRetryTimeoutId) {
      clearTimeout(voiceRetryTimeoutId);
      voiceRetryTimeoutId = null;
    }
    setVoiceUi(true);
    voiceRetryAttempted = false;
    voiceStartTs = Date.now();
    try {
      recognition.start();
    } catch (_) {
      voiceStarting = false;
      voiceSessionActive = false;
      setVoiceUi(false);
      addChatMessage('Voice input is busy. Try again in a moment.', 'bot');
    }
  }

  if (SpeechRecognition) {
    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        voiceListening = true;
        voiceStarting = false;
        voiceSessionActive = true;
        voiceSeed = (chatInput?.value || '').trim();
        setVoiceUi(true);
      };

      recognition.onresult = (e) => {
        let interim = '';
        let finalText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const transcript = (e.results[i][0]?.transcript || '').trim();
          if (!transcript) continue;
          if (e.results[i].isFinal) finalText += transcript + ' ';
          else interim += transcript + ' ';
        }
        const merged = (finalText || interim).trim();
        if (!merged || !chatInput) return;
        const prefix = voiceSeed ? (voiceSeed.endsWith(' ') ? voiceSeed : voiceSeed + ' ') : '';
        chatInput.value = (prefix + merged).trim();
      };

      recognition.onerror = (e) => {
        voiceListening = false;
        voiceStarting = false;
        voiceSessionActive = false;
        setVoiceUi(false);
        if (e.error === 'aborted') return;

        if (e.error === 'no-speech') return;

        // Hard-stop on common fatal errors to prevent loops.
        if (e.error === 'network' || e.error === 'not-allowed' || e.error === 'audio-capture') {
          voiceRequested = false;
          stopListening(true);
          const msg =
            e.error === 'not-allowed'
              ? 'Microphone access denied.'
              : e.error === 'audio-capture'
                ? 'Microphone not available.'
                : 'Voice service temporarily unavailable.';
          emitVoiceError(msg + ' Click the mic to try again.');
          return;
        }

        voiceRequested = false;
        stopListening(true);
        emitVoiceError('Voice input failed. Click the mic to try again, or type your message.');
      };

      recognition.onend = () => {
        voiceListening = false;
        voiceStarting = false;
        voiceSessionActive = false;
        voiceRequested = false;
        if (voiceRetryTimeoutId) {
          clearTimeout(voiceRetryTimeoutId);
          voiceRetryTimeoutId = null;
        }
        setVoiceUi(false);
      };
    } catch (e) {
      recognition = null;
    }
  }
  setVoiceUi(false);

  voiceBtn?.addEventListener('click', () => {
    if (callMode) return;
    if (voiceListening || voiceStarting) {
      stopListening(false);
      return;
    }
    startListening();
  });

  // Text-to-Speech toggle
  function updateTtsLabel() {
    if (!ttsToggle) return;
    ttsToggle.textContent = `🔊 TTS: ${ttsEnabled ? 'On' : 'Off'}`;
  }

  if (ttsToggle) {
    updateTtsLabel();
    ttsToggle.addEventListener('click', () => {
      ttsEnabled = !ttsEnabled;
      updateTtsLabel();
      if (!ttsEnabled) stopSpeaking();
    });
  }

  // Open/close widget
  if (chatToggle && chatWidget) {
    chatWidget.style.display = 'none';

    chatToggle.addEventListener('click', () => {
      const isOpen = chatWidget.style.display === 'flex';
      chatWidget.style.display = isOpen ? 'none' : 'flex';
      chatWidget.classList.toggle('chat-open', !isOpen);
      if (!isOpen) scrollChatToBottom();
      if (isOpen) stopSpeaking();
    });
  }

  closeChat?.addEventListener('click', () => {
    if (!chatWidget) return;
    chatWidget.style.display = 'none';
    chatWidget.classList.remove('chat-open');
    stopListening(true);
    stopSpeaking();
  });

  videoCallBtn?.addEventListener('click', () => {
    startCall();
  });

  hangupCallBtn?.addEventListener('click', () => {
    endCall();
  });

  sendMessage?.addEventListener('click', handleChatSend);
  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  });

  // Background animation toggle (on by default, click to turn off)
  const bgAnimationToggle = document.getElementById('bgAnimationToggle');
  if (bgAnimationToggle) {
    const saved = localStorage.getItem('bgAnimation');
    if (saved === 'off') document.body.classList.add('bg-animation-off');
    bgAnimationToggle.addEventListener('click', () => {
      document.body.classList.toggle('bg-animation-off');
      localStorage.setItem('bgAnimation', document.body.classList.contains('bg-animation-off') ? 'off' : 'on');
    });
  }

  // 3. Optimized Snake Game
  const canvas = document.getElementById("snakeGame");
  const ctx = canvas.getContext("2d");
  const startBtn = document.getElementById("startGame");
  const scoreEl = document.getElementById("score");

  let box = 20;
  let snake, food, d, nextD, gameScore, game;

  function initGame() {
      snake = [{ x: 7 * box, y: 7 * box }];
      food = { x: Math.floor(Math.random() * 14) * box, y: Math.floor(Math.random() * 14) * box };
      d = nextD = null;
      gameScore = 0;
      scoreEl.innerText = gameScore;
  }

  // Prevent opposite direction turns (prevents self-collision on instant double-press)
  document.addEventListener("keydown", (e) => {
      if (e.keyCode == 37 && d != "RIGHT") nextD = "LEFT";
      else if (e.keyCode == 38 && d != "DOWN") nextD = "UP";
      else if (e.keyCode == 39 && d != "LEFT") nextD = "RIGHT";
      else if (e.keyCode == 40 && d != "UP") nextD = "DOWN";
  });

  function draw() {
      d = nextD;
      ctx.fillStyle = "#2c3e50";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < snake.length; i++) {
          ctx.fillStyle = (i == 0) ? "#3498db" : "#ecf0f1";
          ctx.fillRect(snake[i].x, snake[i].y, box, box);
      }

      ctx.fillStyle = "#e74c3c";
      ctx.fillRect(food.x, food.y, box, box);

      let snakeX = snake[0].x;
      let snakeY = snake[0].y;

      if (d == "LEFT") snakeX -= box;
      if (d == "UP") snakeY -= box;
      if (d == "RIGHT") snakeX += box;
      if (d == "DOWN") snakeY += box;

      if (snakeX == food.x && snakeY == food.y) {
          gameScore++;
          scoreEl.innerText = gameScore;
          food = { x: Math.floor(Math.random() * 14) * box, y: Math.floor(Math.random() * 14) * box };
      } else if (d) {
          snake.pop();
      }

      let newHead = { x: snakeX, y: snakeY };

      if (d && (snakeX < 0 || snakeX >= canvas.width || snakeY < 0 || snakeY >= canvas.height || collision(newHead, snake))) {
          clearInterval(game);
          alert("Game Over! Score: " + gameScore);
          initGame();
          return;
      }
      if (d) snake.unshift(newHead);
  }

  function collision(head, array) {
      for (let i = 0; i < array.length; i++) {
          if (head.x == array[i].x && head.y == array[i].y) return true;
      }
      return false;
  }

  startBtn.addEventListener('click', () => {
      clearInterval(game);
      initGame();
      game = setInterval(draw, 100); // Increased speed for smoothness
  });

  // 4. Higher or Lower Game Logic
  let currentNum = 50;
  let streak = 0;
  window.guess = (direction) => {
    const nextNum = Math.floor(Math.random() * 100) + 1;
    if ((direction === 'higher' && nextNum > currentNum) || (direction === 'lower' && nextNum < currentNum)) {
        streak++;
        alert(`Correct! It was ${nextNum}.`);
    } else {
        streak = 0;
        alert(`Wrong! It was ${nextNum}.`);
    }
    currentNum = nextNum;
    document.getElementById('currentNum').innerText = currentNum;
    document.getElementById('guessScore').innerText = streak;
  };

  // 5. Memory Match Game
  const MEMORY_ICONS = ['★','◆','●','■','▲','♥','♦','♣'];
  let memoryCards = [], flipped = [], moves = 0, lock = false;

  function createMemoryBoard() {
    const board = document.getElementById('memoryBoard');
    const movesEl = document.getElementById('memoryMoves');
    if (!board) return;
    let pairs = MEMORY_ICONS.slice(0, 4).flatMap(i => [i, i]);
    pairs = pairs.sort(() => Math.random() - 0.5);
    board.innerHTML = '';
    flipped = [];
    moves = 0;
    movesEl.textContent = '0';
    lock = false;
    memoryCards = pairs.map((icon, i) => ({
      id: i,
      icon,
      el: (() => {
        const div = document.createElement('div');
        div.className = 'memory-card';
        div.dataset.id = i;
        div.textContent = '?';
        div.addEventListener('click', () => flipCard(i));
        return div;
      })()
    }));
    memoryCards.forEach(c => board.appendChild(c.el));
  }

  function flipCard(id) {
    if (lock || flipped.length >= 2) return;
    const card = memoryCards[id];
    if (card.el.classList.contains('flipped') || card.el.classList.contains('matched')) return;
    card.el.classList.add('flipped');
    card.el.textContent = card.icon;
    flipped.push(card);
    if (flipped.length === 2) {
      moves++;
      document.getElementById('memoryMoves').textContent = moves;
      lock = true;
      if (flipped[0].icon === flipped[1].icon) {
        flipped.forEach(c => c.el.classList.add('matched'));
        flipped = [];
        lock = false;
        if (document.querySelectorAll('.memory-card.matched').length === memoryCards.length) {
          setTimeout(() => alert(`You won in ${moves} moves!`), 200);
        }
      } else {
        setTimeout(() => {
          flipped.forEach(c => {
            c.el.classList.remove('flipped');
            c.el.textContent = '?';
          });
          flipped = [];
          lock = false;
        }, 600);
      }
    }
  }

  document.getElementById('memoryStart')?.addEventListener('click', createMemoryBoard);
  createMemoryBoard();

  // 6. Typing Speed Test
  const TYPING_QUOTES = [
    'The quick brown fox jumps over the lazy dog.',
    'JavaScript is the language of the web and interactive applications.',
    'Practice makes perfect when it comes to typing speed and accuracy.'
  ];
  let typingStartTime = null;

  const typingQuoteEl = document.getElementById('typingQuote');
  const typingInputEl = document.getElementById('typingInput');
  const typingStartBtn = document.getElementById('typingStart');
  const typingWpmEl = document.getElementById('typingWpm');

  if (typingStartBtn && typingQuoteEl && typingInputEl && typingWpmEl) {
    typingStartBtn.addEventListener('click', () => {
      const quote = TYPING_QUOTES[Math.floor(Math.random() * TYPING_QUOTES.length)];
      typingQuoteEl.textContent = quote;
      typingInputEl.value = '';
      typingInputEl.disabled = false;
      typingInputEl.focus();
      typingWpmEl.textContent = '—';
      typingStartTime = Date.now();
      typingInputEl.classList.remove('correct', 'wrong');
    });

    typingInputEl.addEventListener('input', () => {
      const quote = typingQuoteEl.textContent;
      const val = typingInputEl.value;
      if (quote.startsWith(val)) typingInputEl.classList.add('correct'), typingInputEl.classList.remove('wrong');
      else typingInputEl.classList.add('wrong'), typingInputEl.classList.remove('correct');
      if (val === quote && typingStartTime) {
        typingInputEl.disabled = true;
        const minutes = (Date.now() - typingStartTime) / 60000;
        const words = quote.trim().split(/\s+/).length;
        const wpm = Math.round(words / minutes);
        typingWpmEl.textContent = wpm;
      }
    });
  }

  // 7. Weather Integration
  async function fetchWeather() {
      try {
          const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=40.8384&longitude=-74.2789&current_weather=true');
          const data = await res.json();
          document.getElementById('temp-data').innerText = `${data.current_weather.temperature}°C in Caldwell, NJ`;
      } catch (e) {
          document.getElementById('temp-data').innerText = "Caldwell, NJ: 18°C (Estimated)";
      }
  }

  // 8. Contact Form — sends to your email via Formspree
  const RATE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes

  const contactForm = document.getElementById('contactForm');
  contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = contactForm.querySelector('button');
      const lastSubmit = parseInt(localStorage.getItem('contactFormLastSubmit') || '0', 10);

      if (Date.now() - lastSubmit < RATE_LIMIT_MS) {
          const waitMins = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastSubmit)) / 60000);
          btn.innerText = `Limit: 1 per 10 min. Wait ${waitMins} min.`;
          btn.style.background = '#e74c3c';
          setTimeout(() => {
              btn.innerText = 'Send Message';
              btn.style.background = '';
          }, 4000);
          return;
      }

      const formData = new FormData(contactForm);
      const body = Object.fromEntries(formData.entries());
      body._subject = `Portfolio Contact: ${body.subject || 'Inquiry'}`;

      if (FORMSPREE_ENDPOINT.includes('YOUR_FORMSPREE_ID')) {
          btn.innerText = 'Form not configured (see script.js)';
          btn.style.background = '#e67e22';
          setTimeout(() => { btn.innerText = 'Send Message'; btn.style.background = ''; }, 3000);
          return;
      }

      btn.disabled = true;
      btn.innerText = 'Sending...';

      try {
          const res = await fetch(FORMSPREE_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
          });
          if (!res.ok) throw new Error('Send failed');
          localStorage.setItem('contactFormLastSubmit', String(Date.now()));
          btn.innerText = 'Sent Successfully!';
          btn.style.background = '#27ae60';
          contactForm.reset();
      } catch (err) {
          btn.innerText = 'Failed — try again';
          btn.style.background = '#e74c3c';
      }
      btn.disabled = false;
      setTimeout(() => {
          btn.innerText = 'Send Message';
          btn.style.background = '';
      }, 3000);
  });

  // Dynamic GPA Scenario Planner
  const GPA_CREDITS_PER_SEM = 15;
  const GPA_MAX_USER_MODIFY = 2;
  let gpaScenarioChartInstance = null;
  let gpaScenarioState = null; // { currentGpa, credits, goalGpa, n }

  function calcGpaScenario(sliderValues) {
    if (!gpaScenarioState) return null;
    const { currentGpa, credits, goalGpa, n } = gpaScenarioState;
    const totalCreditsEnd = credits + GPA_CREDITS_PER_SEM * n;
    const totalPointsNeeded = goalGpa * totalCreditsEnd;
    const currentPoints = currentGpa * credits;
    let pointsFromSetSems = 0;
    let countUnset = 0;
    for (let i = 0; i < n; i++) {
      const v = sliderValues[i];
      if (v != null && v !== '') {
        pointsFromSetSems += GPA_CREDITS_PER_SEM * parseFloat(v);
      } else {
        countUnset++;
      }
    }
    const pointsStillNeeded = totalPointsNeeded - currentPoints - pointsFromSetSems;
    const remainingCredits = countUnset * GPA_CREDITS_PER_SEM;
    const requiredGpaUnset = remainingCredits > 0 ? pointsStillNeeded / remainingCredits : 0;
    const gpaPath = [];
    for (let i = 0; i < n; i++) {
      const v = sliderValues[i];
      gpaPath.push(v != null && v !== '' ? parseFloat(v) : requiredGpaUnset);
    }
    return gpaPath;
  }

  const gpaUserSetValues = {}; // index -> value for each semester user has independently set

  function getMinGpaForSemester(index, userSetValues) {
    if (!gpaScenarioState) return 0;
    const { currentGpa, credits, goalGpa, n } = gpaScenarioState;
    const totalCreditsEnd = credits + GPA_CREDITS_PER_SEM * n;
    const totalPointsNeeded = goalGpa * totalCreditsEnd;
    const currentPoints = currentGpa * credits;
    let pointsFromOthers = 0;
    let countOthers = 0;
    for (let i = 0; i < n; i++) {
      if (i !== index && userSetValues[i] != null) {
        pointsFromOthers += GPA_CREDITS_PER_SEM * Math.max(0, Math.min(4, parseFloat(userSetValues[i])));
        countOthers++;
      }
    }
    const countUnset = n - 1 - countOthers;
    const remainingCredits = Math.max(0, countUnset) * GPA_CREDITS_PER_SEM;
    const maxPointsForUnset = 4 * remainingCredits;
    const minPointsForThis = totalPointsNeeded - currentPoints - pointsFromOthers - maxPointsForUnset;
    const minGpa = remainingCredits > 0 ? minPointsForThis / GPA_CREDITS_PER_SEM : 0;
    return Math.max(0, Math.min(4, minGpa));
  }

  function rebalanceGPA(userSetValues) {
    if (!gpaScenarioState) return null;
    const { currentGpa, credits, goalGpa, n } = gpaScenarioState;
    const totalCreditsEnd = credits + GPA_CREDITS_PER_SEM * n;
    const totalPointsNeeded = goalGpa * totalCreditsEnd;
    const currentPoints = currentGpa * credits;
    let pointsFromUserSet = 0;
    let countUnset = 0;
    for (let i = 0; i < n; i++) {
      const v = userSetValues[i];
      if (v != null) {
        const clamped = Math.max(0, Math.min(4, parseFloat(v)));
        pointsFromUserSet += GPA_CREDITS_PER_SEM * clamped;
      } else {
        countUnset++;
      }
    }
    const pointsStillNeeded = totalPointsNeeded - currentPoints - pointsFromUserSet;
    const remainingCredits = countUnset * GPA_CREDITS_PER_SEM;
    const requiredGpaUnset = remainingCredits > 0 ? pointsStillNeeded / remainingCredits : 0;
    const result = [];
    for (let i = 0; i < n; i++) {
      const v = userSetValues[i];
      result.push(v != null
        ? Math.max(0, Math.min(4, parseFloat(v)))
        : Math.max(0, Math.min(4, requiredGpaUnset)));
    }
    return result;
  }

  function updateGpaWarning(hasOverflow, limitReached = false) {
    const warningEl = document.getElementById('gpaScenarioWarning');
    if (!warningEl) return;
    if (hasOverflow) {
      warningEl.textContent = 'Impossible goal: Required future GPA exceeds 4.0';
      warningEl.className = 'gpa-scenario-warning gpa-scenario-warning-visible gpa-scenario-warning-error';
    } else if (limitReached) {
      warningEl.textContent = `You can customize up to ${GPA_MAX_USER_MODIFY} semesters. Unlock one to modify another.`;
      warningEl.className = 'gpa-scenario-warning gpa-scenario-warning-visible';
    } else {
      warningEl.textContent = '';
      warningEl.className = 'gpa-scenario-warning';
    }
  }

  function updateGpaScenarioChart(gpaPath) {
    const canvas = document.getElementById('gpaDragChart');
    if (!canvas || !gpaPath || gpaPath.length === 0) return;
    const hasOverflow = gpaPath.some(v => v > 4);
    updateGpaWarning(hasOverflow, false);
    const labels = gpaPath.map((_, i) => `Semester ${i + 1}`);
    if (gpaScenarioChartInstance) {
      gpaScenarioChartInstance.destroy();
      gpaScenarioChartInstance = null;
    }
    gpaScenarioChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Required GPA',
          data: gpaPath,
          backgroundColor: 'rgba(13, 148, 136, 0.08)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.2,
          segment: {
            borderColor: ctx => ((ctx.p1?.parsed?.y ?? ctx.p0?.parsed?.y) > 4 ? '#ef4444' : '#0d9488')
          },
          pointRadius: 5,
          pointHoverRadius: 7,
          pointHitRadius: 20,
          pointBackgroundColor: ctx => (gpaPath[ctx.dataIndex] > 4 ? '#ef4444' : '#0d9488')
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            max: Math.max(4.5, ...gpaPath.map(v => Math.ceil(v * 10) / 10))
          }
        },
        plugins: {
          legend: { display: false },
          dragData: {
            round: 2,
            onDragStart: (event, datasetIndex, index) => {
              if (!gpaScenarioUserSet.has(index) && gpaScenarioUserSet.size >= GPA_MAX_USER_MODIFY) {
                updateGpaWarning(false, true);
                return false;
              }
            },
            onDrag: (event, datasetIndex, index, value) => {
              const minGpa = getMinGpaForSemester(index, { ...gpaUserSetValues, [index]: value });
              if (parseFloat(value) < minGpa - 0.01) return false;
            },
            onDragEnd: (event, datasetIndex, index, value) => {
              if (!gpaScenarioUserSet.has(index) && gpaScenarioUserSet.size >= GPA_MAX_USER_MODIFY) {
                return false;
              }
              const raw = Math.max(0, Math.min(4, parseFloat(value) || 0));
              const minGpa = getMinGpaForSemester(index, { ...gpaUserSetValues, [index]: raw });
              gpaUserSetValues[index] = Math.max(minGpa, raw);
              gpaScenarioUserSet.add(index);
              const newData = rebalanceGPA(gpaUserSetValues);
              if (newData && gpaScenarioChartInstance) {
                gpaScenarioChartInstance.data.datasets[0].data = newData;
                gpaScenarioChartInstance.update('none');
                updateGpaWarning(newData.some(v => v > 4), false);
                const container = document.getElementById('gpaSemesterSliders');
                container?.querySelectorAll('.gpa-slider-item').forEach((item, idx) => {
                  const span = item.querySelector('.gpa-slider-value');
                  const customBadge = item.querySelector('.gpa-slider-custom');
                  const s = item.querySelector('.gpa-semester-slider');
                  s.value = Math.min(4, Math.max(0, newData[idx])).toFixed(1);
                  span.textContent = newData[idx].toFixed(2);
                  customBadge.style.display = gpaScenarioUserSet.has(idx) ? 'inline' : 'none';
                });
              }
            }
          }
        }
      }
    });
  }

  const gpaScenarioUserSet = new Set();

  function runGpaScenarioRecalc() {
    const container = document.getElementById('gpaSemesterSliders');
    if (!container || !gpaScenarioState) return;
    const getSliderValues = () => {
      const vals = [];
      container.querySelectorAll('.gpa-semester-slider').forEach((s, idx) => {
        vals.push(gpaScenarioUserSet.has(idx) ? (s.value || null) : null);
      });
      return vals;
    };
    gpaScenarioUserSet.forEach(idx => {
      const s = container.querySelector(`.gpa-semester-slider[data-sem="${idx}"]`);
      if (s?.value) gpaUserSetValues[idx] = parseFloat(s.value);
    });
    const refreshFromPath = (path) => {
      if (!path) return;
      container.querySelectorAll('.gpa-slider-item').forEach((item, idx) => {
        const span = item.querySelector('.gpa-slider-value');
        const customBadge = item.querySelector('.gpa-slider-custom');
        const s = item.querySelector('.gpa-semester-slider');
        if (!gpaScenarioUserSet.has(idx)) {
          s.value = Math.min(4, Math.max(0, path[idx])).toFixed(1);
        }
        span.textContent = path[idx].toFixed(2);
        customBadge.style.display = gpaScenarioUserSet.has(idx) ? 'inline' : 'none';
      });
    };
    const path = calcGpaScenario(getSliderValues());
    if (path) {
      updateGpaScenarioChart(path);
      refreshFromPath(path);
    }
  }

  function buildSemesterSliders(n) {
    const container = document.getElementById('gpaSemesterSliders');
    container.innerHTML = '';
    gpaScenarioUserSet.clear();
    for (let i = 0; i < n; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'gpa-slider-item';
      wrap.innerHTML = `
        <div class="gpa-slider-header">
          <label>Semester ${i + 1}: <span class="gpa-slider-value">—</span> <span class="gpa-slider-custom" style="display:none">(you set)</span></label>
          <button type="button" class="gpa-slider-unlock" data-sem="${i}" title="Unlock — let system recalculate">↺</button>
        </div>
        <input type="range" class="gpa-semester-slider" data-sem="${i}" min="0" max="4" step="0.1">
      `;
      const slider = wrap.querySelector('input[type="range"]');
      const unlockBtn = wrap.querySelector('.gpa-slider-unlock');
      slider.addEventListener('input', () => {
        if (!gpaScenarioUserSet.has(i) && gpaScenarioUserSet.size >= GPA_MAX_USER_MODIFY) {
          updateGpaWarning(false, true);
          runGpaScenarioRecalc();
          return;
        }
        let val = parseFloat(slider.value) || 0;
        gpaScenarioUserSet.add(i);
        gpaUserSetValues[i] = val;
        const minGpa = getMinGpaForSemester(i, gpaUserSetValues);
        if (val < minGpa) {
          val = minGpa;
          slider.value = val.toFixed(1);
          gpaUserSetValues[i] = val;
        }
        updateGpaWarning(false, false);
        runGpaScenarioRecalc();
      });
      unlockBtn.addEventListener('click', () => {
        gpaScenarioUserSet.delete(i);
        delete gpaUserSetValues[i];
        runGpaScenarioRecalc();
      });
      container.appendChild(wrap);
    }
  }

  document.getElementById('gpaScenarioForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const currentGpa = parseFloat(document.getElementById('currGpa')?.value) || 0;
    const credits = parseFloat(document.getElementById('scenarioCredits')?.value) || 0;
    const goalGpa = parseFloat(document.getElementById('targetGpa')?.value) || 0;
    const n = parseInt(document.getElementById('scenarioRemainingSems')?.value, 10) || 0;
    const warningEl = document.getElementById('gpaScenarioWarning');
    warningEl.textContent = '';
    warningEl.className = 'gpa-scenario-warning';
    if (!currentGpa || !credits || !goalGpa || !n || n < 1) {
      warningEl.textContent = 'Please fill in all fields.';
      warningEl.classList.add('gpa-scenario-warning-visible');
      return;
    }
    gpaScenarioState = { currentGpa, credits, goalGpa, n };
    Object.keys(gpaUserSetValues).forEach(k => delete gpaUserSetValues[k]);
    buildSemesterSliders(n);
    const path = calcGpaScenario(Array(n).fill(null));
    updateGpaScenarioChart(path);
    document.querySelectorAll('.gpa-slider-item').forEach((item, idx) => {
      const vSpan = item.querySelector('.gpa-slider-value');
      const s = item.querySelector('.gpa-semester-slider');
      vSpan.textContent = path[idx].toFixed(2);
      s.value = Math.min(4, path[idx]).toFixed(1);
    });

  });

  document.getElementById('gpaResetEqualBtn')?.addEventListener('click', () => {
    gpaScenarioUserSet.clear();
    Object.keys(gpaUserSetValues).forEach(k => delete gpaUserSetValues[k]);
    runGpaScenarioRecalc();
  });

  initGame();
  fetchWeather();
});