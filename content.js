// ==========================================
// CHROME PERFORMANCE - CONTENT SCRIPT v4.1
// ==========================================

// ==========================================
// SECTION 1: TITLE MANAGEMENT & MEMORY
// ==========================================
(function () {
  "use strict";

  try {
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
      if (request.action === "ubahJudulTidur") {
        document.title = request.title;
        sendResponse({ success: true });
        return false;
      }
      if (request.action === "pulihkanJudul") {
        document.title = request.title;
        sendResponse({ success: true });
        return false;
      }
      if (request.action === "getMemory") {
        const mem = (performance && performance.memory)
          ? performance.memory.usedJSHeapSize
          : 0;
        sendResponse({ memory: mem });
        return false;
      }
    });
  } catch (e) { /* chrome.runtime not available */ }

  // ==========================================
  // SECTION 2: YOUTUBE OPTIMIZATIONS
  // ==========================================
  let userShowedComments = false;
  let lastCleanedUrl = "";

  function bersihkanHalamanYouTube() {
    if (!window.location.hostname.includes("youtube.com")) return;
    const currentUrl = window.location.href;
    if (currentUrl === lastCleanedUrl) return;
    lastCleanedUrl = currentUrl;
    userShowedComments = false;
    const tombolBugLoop = document.querySelector("#actions.ytd-watch-metadata");
    if (tombolBugLoop) tombolBugLoop.style.display = "none";
  }

  function kendalikanKomentar() {
    if (!window.location.hostname.includes("youtube.com")) return;
    if (userShowedComments) return;
    const areaKomentar = document.querySelector("ytd-comments");
    if (!areaKomentar) return;
    if (!document.querySelector("#btn-hemat-ram-komentar")) {
      areaKomentar.style.display = "none";
      const tombolBuka = document.createElement("button");
      tombolBuka.id = "btn-hemat-ram-komentar";
      tombolBuka.innerText = "💬 Tampilkan Komentar (Mode Hemat RAM)";
      tombolBuka.style.cssText = "width:100%;padding:14px;margin:20px 0;background:#1f1f1f;color:#3ea6ff;border:1px solid #3e3e3e;border-radius:24px;cursor:pointer;font-weight:bold;font-size:14px;";
      tombolBuka.onclick = () => {
        userShowedComments = true;
        areaKomentar.style.display = "block";
        tombolBuka.remove();
      };
      if (areaKomentar.parentNode) {
        areaKomentar.parentNode.insertBefore(tombolBuka, areaKomentar);
      }
    }
  }

  function optimalkanPemutarVideo() {
    if (!window.location.hostname.includes("youtube.com")) return;
    const player = document.querySelector(".html5-video-player");
    const video = document.querySelector("video");
    if (player && video) {
      if (typeof player.setPlaybackQualityRange === "function") {
        player.setPlaybackQualityRange("hd1080", "default");
      }
      if (!video._perfListenerAdded) {
        video._perfListenerAdded = true;
        video.addEventListener("pause", () => { video.preload = "none"; });
      }
    }
  }

  const handleYouTubeNavigate = () => {
    lastCleanedUrl = "";
    userShowedComments = false;
    const oldBtn = document.querySelector("#btn-hemat-ram-komentar");
    if (oldBtn) oldBtn.remove();
    bersihkanHalamanYouTube();
    kendalikanKomentar();
    optimalkanPemutarVideo();
  };

  window.addEventListener("yt-navigate-finish", handleYouTubeNavigate);
  setInterval(() => { kendalikanKomentar(); optimalkanPemutarVideo(); }, 3000);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handleYouTubeNavigate);
  } else {
    handleYouTubeNavigate();
  }

  // ==========================================
  // SECTION 3: POPUP / REDIRECT BLOCKER
  // ==========================================
  let popupBlockEnabled = true;
  let whitelistArr = [];

  function isUrlWhitelisted(url) {
    if (!url) return true;
    if (url.startsWith("chrome://") || url.startsWith("edge://") ||
        url.startsWith("about:") || url.startsWith("chrome-extension://") ||
        url.startsWith("moz-extension://")) return true;
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname === window.location.hostname) return true;
      return whitelistArr.some((domain) => urlObj.hostname.includes(domain));
    } catch (e) { return true; }
  }

  const _originalWindowOpen = window.open;
  window.open = function (url, name, features) {
    if (!popupBlockEnabled || !url) return _originalWindowOpen.apply(this, arguments);
    if (isUrlWhitelisted(url)) return _originalWindowOpen.apply(this, arguments);
    console.log("[Chrome Performance] Popup diblokir:", url);
    return null;
  };

  document.addEventListener("click", (e) => {
    if (!popupBlockEnabled) return;
    const target = e.target.closest("a");
    if (!target || !target.href) return;
    try {
      const urlObj = new URL(target.href);
      const params = new URLSearchParams(urlObj.search);
      const redirectUrl = params.get("url") || params.get("target") || params.get("link") ||
                          params.get("r") || params.get("redirect") || params.get("goto");
      if (redirectUrl) {
        const decoded = decodeURIComponent(redirectUrl);
        if (!isUrlWhitelisted(decoded)) { e.preventDefault(); e.stopPropagation(); return; }
        if (!isUrlWhitelisted(urlObj.href)) { e.preventDefault(); window.location.href = decoded; return; }
      }
      if (target.target === "_blank" && urlObj.hostname !== window.location.hostname && !isUrlWhitelisted(target.href)) {
        e.preventDefault();
        e.stopPropagation();
      }
    } catch (err) { /* invalid URL */ }
  }, true);

  try {
    chrome.storage.local.get(["blockRedirects", "redirectWhitelist"], (result) => {
      if (chrome.runtime.lastError) return;
      popupBlockEnabled = result.blockRedirects !== false;
      const wl = result.redirectWhitelist || "google.com,mail.google.com,whatsapp.com,tiktok.com,instagram.com,youtube.com";
      whitelistArr = wl.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.blockRedirects !== undefined) popupBlockEnabled = changes.blockRedirects.newValue !== false;
      if (changes.redirectWhitelist !== undefined) {
        whitelistArr = (changes.redirectWhitelist.newValue || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      }
    });
  } catch (e) { /* storage not available */ }

})();

// ==========================================
// SECTION 4: UNIVERSAL AUDIO INTERCEPTOR LISTENER
// Listens for events from audio_interceptor.js (running in MAIN world)
// ==========================================
(function setupAudioInterceptorListener() {
  const AUDIO_HOSTS = ['elevenlabs.io', 'suno.com', 'udio.com', 'soundcloud.com'];
  if (!AUDIO_HOSTS.some(h => location.hostname.includes(h))) return;

  const prefixMap = { 'elevenlabs.io': 'ElevenLabs', 'suno.com': 'SunoAI', 'udio.com': 'Udio', 'soundcloud.com': 'SoundCloud' };
  const sitePrefix = Object.keys(prefixMap).reduce((acc, key) => location.hostname.includes(key) ? prefixMap[key] : acc, 'Audio');

  // Listen for the CustomEvent from Main World and store it, DO NOT relay automatically
  window.lastCapturedAudio = null;
  window.addEventListener('UniversalAudioCaptured', (e) => {
    try {
      window.lastCapturedAudio = e.detail;
      console.log('[Chrome Performance] Audio siap diunduh dari ' + sitePrefix + ': ' + e.detail.filename);
      
      // Tampilkan tombol melayang jika ada (untuk web audio)
      const wrapper = document.getElementById('cp-float-wrapper');
      if (wrapper) wrapper.style.display = 'flex';
      
      const label = wrapper ? wrapper.querySelector('div') : null; // Label tooltip
      if (label) {
        label.textContent = '🎵 Audio Siap Diunduh!';
        label.style.opacity = '1';
        setTimeout(() => { label.style.opacity = '0'; }, 3000);
      }
    } catch (err) {
      console.error('[Chrome Performance] Gagal catch audio:', err);
    }
  });
})();

// ==========================================
// SECTION 5: FLOATING DOWNLOAD BUTTON
// With quality selector, progress ring, TikTok FYP support
// ==========================================
(function injectFloatingDownloadButton() {
  const SUPPORTED_HOSTS = ['youtube.com', 'tiktok.com', 'instagram.com', 'twitter.com', 'x.com', 'facebook.com', 'bilibili.com', 'vimeo.com', 'dailymotion.com'];
  const AUDIO_ONLY_HOSTS = ['elevenlabs.io', 'suno.com', 'udio.com', 'soundcloud.com'];
  const hostname = window.location.hostname;

  const isAudioHost = AUDIO_ONLY_HOSTS.some(h => hostname.includes(h));
  const isVideoHost = SUPPORTED_HOSTS.some(h => hostname.includes(h));

  if (!isAudioHost && !isVideoHost) return;
  if (document.getElementById('cp-float-wrapper')) return;

  // --- Wrapper ---
  const wrapper = document.createElement('div');
  wrapper.id = 'cp-float-wrapper';
  wrapper.style.cssText = 'position:fixed;bottom:88px;right:18px;z-index:2147483647;width:50px;height:50px;display:flex;flex-direction:column;align-items:center;';

  // Sembunyikan default untuk situs audio, munculkan hanya jika audio berhasil ditangkap
  if (isAudioHost) {
    wrapper.style.display = 'none';
  }


  // --- Main Button ---
  const btn = document.createElement('div');
  btn.title = 'Download video ini (Chrome Performance)';
  btn.style.cssText = 'width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#1a73e8 0%,#6c47ff 100%);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(26,115,232,0.5);transition:transform .2s ease,box-shadow .2s ease;user-select:none;border:2px solid rgba(255,255,255,0.2);position:relative;';

  // Only simple SVG icon for main button
  btn.innerHTML = [
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="white" style="position:relative;z-index:2;">',
    '  <path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-7 4h14v-2H5v2z"/>',
    '</svg>'
  ].join('');

  // --- Tooltip label ---
  const label = document.createElement('div');
  label.style.cssText = 'position:absolute;bottom:62px;right:0;background:rgba(0,0,0,0.85);color:#fff;padding:4px 10px;border-radius:6px;font-size:11px;font-family:sans-serif;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .2s;z-index:3;';
  label.textContent = 'Download Video';

  // --- Active Downloads State ---
  const activeDownloads = {};
  
  // Container for floating bubbles
  const bubbleContainer = document.createElement('div');
  bubbleContainer.style.cssText = 'position:absolute;bottom:60px;display:flex;flex-direction:column-reverse;gap:8px;align-items:center;width:100%;';
  
  // Inject keyframes for bubble pop in
  if (!document.getElementById('cp-styles')) {
    const style = document.createElement('style');
    style.id = 'cp-styles';
    style.textContent = '@keyframes cpPopIn { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }';
    document.head.appendChild(style);
  }

  function createBubble(url) {
    const bubble = document.createElement('div');
    bubble.title = 'Downloading: ' + url;
    bubble.style.cssText = 'width:40px;height:40px;border-radius:50%;background:#1e293b;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.4);position:relative;transition:all .3s ease;animation:cpPopIn 0.3s ease-out;';
    
    bubble.innerHTML = [
      '<div class="bubble-text" style="position:relative;z-index:2;color:white;font-size:11px;font-weight:bold;font-family:sans-serif;text-align:center;line-height:1;">⏳</div>',
      '<svg width="44" height="44" viewBox="0 0 44 44" style="position:absolute;top:-2px;left:-2px;transform:rotate(-90deg);pointer-events:none;">',
      '  <circle cx="22" cy="22" r="20" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"></circle>',
      '  <circle class="bubble-ring" cx="22" cy="22" r="20" fill="none" stroke="#34a853" stroke-width="3" stroke-dasharray="125.6" stroke-dashoffset="125.6" style="transition:stroke-dashoffset 0.4s ease;"></circle>',
      '</svg>'
    ].join('');
    
    bubbleContainer.appendChild(bubble);
    return {
      el: bubble,
      text: bubble.querySelector('.bubble-text'),
      ring: bubble.querySelector('.bubble-ring'),
      dash: 125.6
    };
  }



  // --- TikTok FYP: Detect the currently visible video's URL ---
  function getTiktokActiveVideoUrl() {
    const videos = document.querySelectorAll('video');
    let bestVideo = null;
    let maxScore = 0;
    for (const v of videos) {
      const rect = v.getBoundingClientRect();
      const visibleTop = Math.max(0, rect.top);
      const visibleBottom = Math.min(window.innerHeight, rect.bottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const score = visibleHeight * (v.paused ? 1 : 100);
      if (score > maxScore) { maxScore = score; bestVideo = v; }
    }
    if (bestVideo) {
      const container = bestVideo.closest('[data-e2e="recommend-list-item-container"]') || bestVideo.closest('[data-e2e="explore-item"]') || bestVideo.closest('[class*="ItemContainer"]');
      if (container) {
        const link = container.querySelector('a[href*="/video/"]');
        if (link && link.href) return link.href;
      }
      let el = bestVideo.parentElement; let depth = 0;
      while (el && el !== document.body && depth < 6) {
        const link = el.querySelector('a[href*="/video/"]');
        if (link && link.href) return link.href;
        el = el.parentElement; depth++;
      }
    }
    return null;
  }

  // --- Main Download Trigger ---
  function triggerDownload(format, quality) {
    let url = window.location.href;
    
    if (url.includes('tiktok.com') && !url.includes('/video/') && !url.includes('/@')) {
      const foundUrl = getTiktokActiveVideoUrl();
      if (foundUrl) { url = foundUrl; } 
      else {
        label.textContent = '⚠️ Klik dulu videonya!';
        label.style.opacity = '1';
        setTimeout(() => { label.style.opacity = '0'; label.textContent = 'Download Video'; }, 3000);
        return;
      }
    }
    
    
    if (format === 'audio_intercept') {
      if (!window.lastCapturedAudio) {
        label.textContent = '⚠️ Putar audio dulu!';
        label.style.opacity = '1';
        setTimeout(() => { label.style.opacity = '0'; label.textContent = 'Download Video'; }, 3000);
        return;
      }
      url = window.lastCapturedAudio.url || 'Universal Audio';
    }
    
    const bubbleObj = createBubble(url);
    
    // Animasi klik pada tombol utama
    btn.style.transform = 'scale(0.85)';
    setTimeout(() => { btn.style.transform = 'scale(1.12)'; }, 150);

    if (format === 'audio_intercept') {
      try {
        chrome.runtime.sendMessage({
          action: 'universal_audio_captured',
          data: window.lastCapturedAudio.base64,
          mimeType: window.lastCapturedAudio.mimeType,
          filename: window.lastCapturedAudio.filename,
          url: window.lastCapturedAudio.url
        });
        bubbleObj.text.textContent = '✅';
        bubbleObj.el.style.background = '#15803d';
        setTimeout(() => bubbleObj.el.remove(), 4000);
      } catch (err) {
        bubbleObj.text.textContent = '❌';
        bubbleObj.el.style.background = '#b91c1c';
        setTimeout(() => bubbleObj.el.remove(), 4000);
      }
      return;
    }

    try {
      chrome.runtime.sendMessage({ action: 'quick_download', url, format, quality }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok || !resp.id) {
          bubbleObj.text.textContent = '❌';
          bubbleObj.el.style.background = '#b91c1c';
          setTimeout(() => bubbleObj.el.remove(), 4000);
        } else {
          bubbleObj.text.textContent = '0%';
          activeDownloads[resp.id] = bubbleObj;
        }
      });
    } catch (e) {
      bubbleObj.text.textContent = '❌';
      bubbleObj.el.style.background = '#b91c1c';
      setTimeout(() => bubbleObj.el.remove(), 4000);
    }
  }

  // --- Progress & Done events from background.js ---
  try {
    chrome.runtime.onMessage.addListener((request) => {
      if (!request.id || !activeDownloads[request.id]) return;
      const b = activeDownloads[request.id];
      
      if (request.action === 'dl_progress') {
        b.text.textContent = Math.round(request.percent) + '%';
        b.ring.style.strokeDashoffset = b.dash - (request.percent / 100) * b.dash;
      } else if (request.action === 'dl_done') {
        b.text.textContent = '✅';
        b.el.style.background = '#15803d';
        b.ring.style.strokeDashoffset = 0;
        setTimeout(() => { b.el.remove(); delete activeDownloads[request.id]; }, 4000);
      } else if (request.action === 'dl_error') {
        b.text.textContent = '❌';
        b.el.style.background = '#b91c1c';
        setTimeout(() => { b.el.remove(); delete activeDownloads[request.id]; }, 5000);
      }
    });
  } catch (e) { /* extension context not ready */ }

  // --- Hover events ---
  wrapper.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.12)';
    btn.style.boxShadow = '0 8px 24px rgba(26,115,232,0.65)';
  });
  wrapper.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 16px rgba(26,115,232,0.5)';
  });

  // Default click
  btn.addEventListener('click', (e) => {
    triggerDownload(isAudioHost ? 'audio_intercept' : 'mp4', 'best');
  });

  // --- Assemble and inject ---
  wrapper.appendChild(label);
  wrapper.appendChild(bubbleContainer);
  wrapper.appendChild(btn);

  function injectWrapper() {
    if (!document.getElementById('cp-float-wrapper') && document.body) {
      document.body.appendChild(wrapper);
    }
  }
  injectWrapper();

  // SPA navigation support (YouTube, TikTok, etc.)
  let lastHref = location.href;
  new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      setTimeout(injectWrapper, 600);
    }
  }).observe(document.documentElement, { subtree: true, childList: true });
})();
