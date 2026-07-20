// ==========================================
// CHROME PERFORMANCE - BACKGROUND SERVICE WORKER v3.0
// ==========================================
"use strict";

// Setup Side Panel (hanya Chrome — Brave belum support sidePanel)
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(console.error);
}
// Fallback untuk Brave: buka popup via action click
// (Chrome dengan sidePanel akan ignore ini karena popup sudah di-handle sidePanel)


// ==========================================
// REDIRECT BLOCKER STATE
// ==========================================
let redirectBlockEnabled = true;
let whitelistDomains = [
  "google.com", "mail.google.com", "whatsapp.com",
  "tiktok.com", "instagram.com", "youtube.com",
];

// URL bawaan yang SELALU diizinkan
const BUILTIN_ALLOWED_PREFIXES = [
  "chrome://", "edge://", "about:", "chrome-extension://",
  "moz-extension://", "devtools://",
];

// ===================================================================
// FIX: Track tab yang sudah pernah load halaman NYATA (bukan newtab)
// Tab yang BARU dibuka (fresh new tab) diizinkan untuk navigasi pertama
// ===================================================================
const initializedTabs = new Set(); // tabId yang sudah pernah load halaman nyata

function isInternalUrl(url) {
  if (!url || url.trim() === "") return true;
  for (const prefix of BUILTIN_ALLOWED_PREFIXES) {
    if (url.startsWith(prefix)) return true;
  }
  return false;
}

// Inisialisasi dari tab yang sudah ada
chrome.tabs.query({}, (tabs) => {
  if (chrome.runtime.lastError || !tabs) return;
  tabs.forEach((tab) => {
    if (tab.url && !isInternalUrl(tab.url)) {
      initializedTabs.add(tab.id);
    }
  });
});

// Hapus dari tracking saat tab ditutup
chrome.tabs.onRemoved.addListener((tabId) => {
  initializedTabs.delete(tabId);
});

// ==========================================
// LOAD KONFIGURASI DARI STORAGE
// ==========================================
chrome.storage.local.get(
  ["blockRedirects", "redirectWhitelist"],
  (result) => {
    if (chrome.runtime.lastError) return;
    redirectBlockEnabled = result.blockRedirects !== false;
    if (result.redirectWhitelist) {
      whitelistDomains = result.redirectWhitelist
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    }
  }
);

// Sinkronkan perubahan konfigurasi real-time
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.blockRedirects !== undefined) {
    redirectBlockEnabled = changes.blockRedirects.newValue !== false;
  }
  if (changes.redirectWhitelist !== undefined) {
    whitelistDomains = (changes.redirectWhitelist.newValue || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
});

/**
 * Cek apakah URL diizinkan berdasarkan whitelist
 */
function isUrlAllowed(url) {
  if (!url) return true;
  if (isInternalUrl(url)) return true;

  try {
    const urlObj = new URL(url);
    return whitelistDomains.some(
      (domain) =>
        urlObj.hostname === domain ||
        urlObj.hostname.endsWith("." + domain) ||
        urlObj.hostname.includes(domain)
    );
  } catch (e) {
    return true;
  }
}

// ==========================================
// REDIRECT BLOCKER — TAB BARU (popup/target="_blank")
// Logika dari Tyson3101/Redirect-Blocker:
// Poll URL setiap 20ms sampai tersedia, lalu cek whitelist
// ==========================================
chrome.tabs.onCreated.addListener((tab) => {
  if (!redirectBlockEnabled) return;

  // Hanya blokir tab yang dibuka OLEH website (openerTabId ada)
  // Tab yang dibuka manual user (Ctrl+T, tombol +) TIDAK diblokir
  if (!tab.openerTabId) return;

  let elapsedMs = 0;
  const MAX_WAIT_MS = 1000;
  const POLL_MS = 20;

  const poll = setInterval(async () => {
    elapsedMs += POLL_MS;
    if (elapsedMs >= MAX_WAIT_MS) {
      clearInterval(poll);
      return;
    }

    const updatedTab = await chrome.tabs.get(tab.id).catch(() => null);
    if (!updatedTab) { clearInterval(poll); return; }

    const url = updatedTab.pendingUrl || updatedTab.url;
    if (!url) return; // Belum ada URL, tunggu

    clearInterval(poll);

    if (!isUrlAllowed(url)) {
      console.log("[Chrome Performance] Tab baru diblokir:", url);
      chrome.tabs.remove(tab.id).catch(() => {});
    }
    // Jika diizinkan, tandai tab sebagai initialized
    else if (!isInternalUrl(url)) {
      initializedTabs.add(tab.id);
    }
  }, POLL_MS);
});

// ==========================================
// REDIRECT BLOCKER — TAB YANG SAMA (same-tab redirect)
// Gunakan webNavigation.onCommitted
// FIX: Izinkan navigasi dari new tab / internal page
// ==========================================
if (chrome.webNavigation && chrome.webNavigation.onCommitted) {
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (!redirectBlockEnabled) return;
    if (details.frameId !== 0) return; // Hanya main frame

    // Izinkan navigasi yang diinisiasi langsung oleh user
    const userInitiatedTypes = [
      "typed",           // Ketik URL di address bar
      "auto_bookmark",   // Klik tile di new tab page, bookmark
      "generated",       // Search di address bar
      "keyword",         // Keyword search
      "keyword_generated",
      "start_page",      // Start page / new tab
      "form_submit",     // Submit form
      "reload",          // Refresh halaman
    ];

    if (userInitiatedTypes.includes(details.transitionType)) {
      // Tandai tab sebagai initialized jika navigasi ke halaman nyata
      if (!isInternalUrl(details.url)) {
        initializedTabs.add(details.tabId);
      }
      return; // Izinkan
    }

    // Izinkan URL yang ada di whitelist
    if (isUrlAllowed(details.url)) {
      if (!isInternalUrl(details.url)) {
        initializedTabs.add(details.tabId);
      }
      return;
    }

    // =====================================================
    // FIX UTAMA: Jika tab ini BELUM pernah load halaman nyata
    // (fresh new tab), izinkan navigasi PERTAMA ini
    // =====================================================
    if (!initializedTabs.has(details.tabId)) {
      console.log(
        "[Chrome Performance] Navigasi dari new tab diizinkan:",
        details.url
      );
      // Tandai sebagai initialized setelah navigasi pertama
      if (!isInternalUrl(details.url)) {
        initializedTabs.add(details.tabId);
      }
      return; // Izinkan!
    }

    // Jangan blokir navigasi back/forward
    if (
      details.transitionQualifiers &&
      details.transitionQualifiers.includes("forward_back")
    ) return;

    console.log(
      "[Chrome Performance] Redirect diblokir:",
      details.url,
      "(type:", details.transitionType + ")"
    );

    // Kembali ke halaman sebelumnya, atau tutup tab jika tidak ada history
    chrome.tabs.goBack(details.tabId).catch(() => {
      // Jika goBack gagal (tidak ada history), tab adalah fresh → jangan tutup!
      // Navigasikan ke new tab saja
      chrome.tabs.update(details.tabId, { url: "chrome://newtab/" }).catch(() => {});
    });
  });
}

// ==========================================
// AUTO-SLEEP (EDGE MODE)
// ==========================================
chrome.alarms.create("edgeModeCheck", { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "edgeModeCheck") return;

  chrome.storage.local.get(["idleTimerMinutes"], (result) => {
    const timerMins = result.idleTimerMinutes || 60;
    if (timerMins <= 0) return;

    const batasWaktu = Date.now() - timerMins * 60 * 1000;
    chrome.tabs.query({ active: false, discarded: false }, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.lastAccessed && tab.lastAccessed < batasWaktu) {
          eksekusiTidurEdge(tab);
        }
      });
    });
  });
});

// Agresif: saat pindah tab, tidurkan tab terlama jika > 5 tab pasif
chrome.tabs.onActivated.addListener((activeInfo) => {
  // Pulihkan judul tab yang dibangunkan
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (tab?.title?.startsWith("🌙 ")) {
      const judulAsli = tab.title.replace("🌙 ", "");
      chrome.tabs
        .sendMessage(tab.id, { action: "pulihkanJudul", title: judulAsli })
        .catch(() => {});
    }
  });

  chrome.tabs.query({ active: false, discarded: false }, (tabs) => {
    if (tabs.length > 5) {
      const tabTertua = tabs.reduce((prev, cur) =>
        (prev.lastAccessed || 0) < (cur.lastAccessed || 0) ? prev : cur
      );
      eksekusiTidurEdge(tabTertua);
    }
  });
});

/**
 * Tidurkan tab (beri tanda 🌙 lalu discard)
 * Proteksi: tab yang di-PIN atau BERSUARA tidak ditidurkan
 * Alasan:
 * - Pinned (📌): Biasanya tab penting (WA, Gmail) → data bisa hilang jika di-discard
 * - Audible (🔊): Sedang memutar audio/video → jangan ganggu
 */
function eksekusiTidurEdge(tab) {
  if (!tab?.id) return;
  if (tab.audible || tab.pinned) return; // Proteksi
  if (tab.title?.includes("Downloading")) return;

  const judulBaru = `🌙 ${tab.title || "Tab"}`;
  chrome.tabs
    .sendMessage(tab.id, { action: "ubahJudulTidur", title: judulBaru })
    .catch(() => {})
    .finally(() => {
      chrome.tabs.discard(tab.id).catch(() => {});
      updateBadge();
    });
}

// ==========================================
// BADGE (jumlah tab yang tidur)
// ==========================================
function updateBadge() {
  chrome.tabs.query({ discarded: true }, (tabs) => {
    if (tabs.length > 0) {
      chrome.action.setBadgeText({ text: tabs.length.toString() });
      chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  });
}

setInterval(updateBadge, 60000);
setTimeout(updateBadge, 2000);

// ==========================================
// PERSISTENT NATIVE HOST PORT MANAGER
// Menggunakan satu koneksi terus-menerus agar tidak perlu
// restart host.js setiap kali download baru.
// ==========================================
let nativePort = null;
let portListeners = []; // { tabId, downloadId, handler }

function getNativePort() {
  if (nativePort) return nativePort;

  try {
    nativePort = chrome.runtime.connectNative('com.antigravity.downloader');

    nativePort.onMessage.addListener((msg) => {
      // Broadcast ke semua listener yang terdaftar
      for (const entry of portListeners) {
        entry.handler(msg);
      }
    });

    nativePort.onDisconnect.addListener(() => {
      const wasError = chrome.runtime.lastError;
      console.warn('[NativeHost] Port terputus:', wasError ? wasError.message : 'unknown');
      nativePort = null;
      // Beritahu semua listener aktif bahwa koneksi putus
      for (const entry of portListeners) {
        entry.handler({ type: '__port_disconnected__', error: wasError ? wasError.message : null });
      }
      portListeners = [];
    });
  } catch (e) {
    nativePort = null;
  }

  return nativePort;
}

function addPortListener(tabId, downloadId, handler) {
  portListeners.push({ tabId, downloadId, handler });
}

function removePortListener(downloadId) {
  portListeners = portListeners.filter(e => e.downloadId !== downloadId);
}

// ==========================================
// MESSAGE LISTENER DARI POPUP
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "proxy_native_message") {
    const np = getNativePort();
    if (!np) {
      sendResponse({ error: "No host" });
      return false;
    }
    const reqId = "pnm_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    // Some messages like "select_folder" expect a response. Since we share the port,
    // we need to listen for a response that matches. Actually, the host script just responds 
    // without an ID for select_folder. We will just wait for the next message from host.
    // To make it robust, we can just use sendNativeMessage for one-offs!
    // Wait, the whole point is we CANNOT use sendNativeMessage from popup.
    // Can we use sendNativeMessage from background? Yes!
    chrome.runtime.sendNativeMessage("com.antigravity.downloader", request.payload, (resp) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse(resp);
      }
    });
    return true; // async response
  }

  if (request.action === "forceSleepAll") {
    chrome.tabs.query({ active: false, discarded: false }, (tabs) => {
      let count = 0;
      tabs.forEach((tab) => {
        if (!tab.audible && !tab.pinned) {
          eksekusiTidurEdge(tab);
          count++;
        }
      });
      sendResponse({ success: true, count, skipped: tabs.length - count });
    });
    return true;
  }

  if (request.action === "updateIdleConfig") {
    if (request.enabled && request.minutes > 0) {
      chrome.idle.setDetectionInterval(request.minutes * 60);
    }
    sendResponse({ success: true });
    return false;
  }

  if (request.action === 'quick_download') {
    const url = request.url;
    const format = request.format || 'mp4';
    const quality = request.quality || 'best';
    const senderTabId = sender.tab ? sender.tab.id : null;

    // Notifikasi saat mulai mengunduh
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: '⏳ Mulai Mengunduh',
      message: 'Video sedang diunduh di latar belakang...'
    });

    chrome.storage.local.get(['dlOutputFolder'], (res) => {
      const port = getNativePort();
      if (!port) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: '\u274c Host Tidak Ditemukan',
          message: 'Silakan jalankan install.bat terlebih dahulu.'
        });
        return;
      }

      const id = 'qd_' + Date.now().toString(36);
      let isDone = false;

      addPortListener(senderTabId, id, (msg) => {
        // Hanya proses pesan untuk download ID ini
        if (msg.id && msg.id !== id && msg.type !== '__port_disconnected__') return;

        if (msg.type === 'item_progress') {
          if (senderTabId) {
            chrome.tabs.sendMessage(senderTabId, {
              action: 'dl_progress',
              id: id,
              percent: msg.percent
            }).catch(() => {});
          }
        } else if (msg.type === 'item_done') {
          isDone = true;
          removePortListener(id);
          const filename = msg.path ? msg.path.split('\\').pop() : 'video';

          if (senderTabId) {
            chrome.tabs.sendMessage(senderTabId, { action: 'dl_done', id: id }).catch(() => {});
          }

          // Save to history
          chrome.storage.local.get(['dlHistory'], (hRes) => {
            let hist = hRes.dlHistory || [];
            hist.unshift({
              url: url,
              path: msg.path,
              filename: filename,
              date: new Date().toLocaleString()
            });
            if (hist.length > 50) hist = hist.slice(0, 50);
            chrome.storage.local.set({ dlHistory: hist });
          });
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon48.png',
            title: '\u2705 Download Selesai!',
            message: `Tersimpan: ${filename}`
          });
        } else if (msg.type === 'item_error' || msg.type === 'error') {
          isDone = true;
          removePortListener(id);

          if (senderTabId) {
            chrome.tabs.sendMessage(senderTabId, { action: 'dl_error', id: id }).catch(() => {});
          }
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon48.png',
            title: '\u274c Download Gagal!',
            message: msg.text || 'Terjadi error saat mengunduh video ini.'
          });
        } else if (msg.type === '__port_disconnected__') {
          if (!isDone) {
            isDone = true;
            if (senderTabId) {
              chrome.tabs.sendMessage(senderTabId, { action: 'dl_error', id: id }).catch(() => {});
            }
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icon48.png',
              title: '🛑 Download Batal/Gagal',
              message: 'Host terputus. Coba download lagi atau jalankan install.bat'
            });
          }
        }
      });

      port.postMessage({
        action: 'download',
        urls: [{ id, url, format, quality, playlist: false }],
        outputFolder: res.dlOutputFolder || null
      });
      sendResponse({ ok: true, id: id });
    });
    return true;
  }
});

// ==========================================
// NATIVE PROXY UNTUK POPUP.JS
// ==========================================
chrome.runtime.onConnect.addListener((extPort) => {
  if (extPort.name === 'native_proxy') {
    const np = getNativePort();
    if (!np) {
      extPort.disconnect();
      return;
    }
    
    // Teruskan pesan dari popup ke native host
    extPort.onMessage.addListener((msg) => {
      np.postMessage(msg);
    });

    // Teruskan pesan dari native host ke popup
    const proxyId = 'proxy_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    addPortListener(null, proxyId, (msg) => {
      if (msg.type === '__port_disconnected__') {
        extPort.disconnect();
      } else {
        try { extPort.postMessage(msg); } catch (e) {}
      }
    });

    extPort.onDisconnect.addListener(() => {
      removePortListener(proxyId);
    });
  }
});

// ==========================================
// IDLE CACHE FLUSHER
// ==========================================
chrome.storage.local.get(["idleFlushEnabled", "idleFlushMinutes"], (result) => {
  if (result.idleFlushEnabled && result.idleFlushMinutes) {
    chrome.idle.setDetectionInterval(result.idleFlushMinutes * 60);
  }
});

chrome.idle.onStateChanged.addListener((newState) => {
  chrome.storage.local.get(["idleFlushEnabled"], (result) => {
    if (
      result.idleFlushEnabled &&
      (newState === "idle" || newState === "locked")
    ) {
      chrome.browsingData.removeCache({ since: 0 }, () => {
        console.log("[Chrome Performance] Cache dibersihkan saat idle.");
      });
    }
  });
});

// ==========================================
// UNIVERSAL AUDIO SAVE (via content script)
// ==========================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'universal_audio_captured') return false;

  chrome.storage.local.get(['dlOutputFolder'], (res) => {
    const port = getNativePort();
    if (!port) return;

    const id = 'aud_' + Date.now().toString(36);

    addPortListener(null, id, (resp) => {
      if (resp.id && resp.id !== id) return;
      if (resp.type === 'item_done' || resp.type === 'error' || resp.type === '__port_disconnected__') {
        removePortListener(id);
      }
      if (resp && resp.type === 'item_done') {
        // Save to history
        chrome.storage.local.get(["dlHistory"], (hRes) => {
          let hist = hRes.dlHistory || [];
          hist.unshift({
            url: msg.url || 'Universal Audio',
            path: resp.path,
            filename: msg.filename,
            date: new Date().toLocaleString()
          });
          if (hist.length > 50) hist = hist.slice(0, 50);
          chrome.storage.local.set({ dlHistory: hist });
        });
      }
      // Notify popup if it's open
      chrome.runtime.sendMessage({ type: 'audio_saved', resp, filename: msg.filename }).catch(() => {});
    });

    port.postMessage({
      action: 'save_blob',
      id: id,
      data: msg.data,
      filename: msg.filename,
      url: msg.url,
      outputFolder: res.dlOutputFolder || null
    });
  });

  return false;
});
