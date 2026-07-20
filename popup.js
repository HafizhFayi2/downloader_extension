// ==========================================
// CHROME PERFORMANCE - POPUP UI
// ==========================================

// Elemen Navigasi Tab
const btnTabPerf = document.getElementById("tab-btn-performance");
const btnTabDl = document.getElementById("tab-btn-downloader");
const panePerf = document.getElementById("pane-performance");
const paneDl = document.getElementById("pane-downloader");

// Elemen DOM (Performance)
const cpuVal = document.getElementById("cpu-val");
const cpuBar = document.getElementById("cpu-bar");
const ramVal = document.getElementById("ram-val");
const ramBar = document.getElementById("ram-bar");
const ramLimitInput = document.getElementById("ram-limit");
const idleTimerInput = document.getElementById("idle-timer");
const ramAlert = document.getElementById("ram-alert");
const tabListEl = document.getElementById("tab-recommendations");

const activeTabsEl = document.getElementById("active-tabs");
const sleepingTabsEl = document.getElementById("sleeping-tabs");

const redirectToggle = document.getElementById("redirect-toggle");
const whitelistContainer = document.getElementById("whitelist-tabs-container");

const idleFlushToggle = document.getElementById("idle-flush-toggle");
const idleFlushMinsInput = document.getElementById("idle-flush-mins");

const btnSaveGeneral = document.getElementById("btn-save-general");
const btnSaveRedirect = document.getElementById("btn-save-redirect");
const btnSaveFlush = document.getElementById("btn-save-flush");
const btnSleepAll = document.getElementById("btn-sleep-all");
const btnClearCache = document.getElementById("btn-clear-cache");
const toast = document.getElementById("toast");

let allTabsCache = [];

// ==========================================
// TOAST NOTIFICATION
// ==========================================
function showToast(message) {
  toast.innerText = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

// ==========================================
// INISIALISASI & LOAD STORAGE
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  muatPengaturan();
  updateStatistikSistem();
  muatDaftarTab();
  setInterval(updateStatistikSistem, 2000);
});

function muatPengaturan() {
  chrome.storage.local.get(
    [
      "ramLimitGB",
      "idleTimerMinutes",
      "blockRedirects",
      "redirectWhitelist",
      "idleFlushEnabled",
      "idleFlushMinutes",
    ],
    (result) => {
      if (result.ramLimitGB) ramLimitInput.value = result.ramLimitGB;
      if (result.idleTimerMinutes) idleTimerInput.value = result.idleTimerMinutes;

      if (result.blockRedirects !== undefined) {
        redirectToggle.checked = result.blockRedirects;
      }
      if (result.idleFlushEnabled !== undefined) {
        idleFlushToggle.checked = result.idleFlushEnabled;
      }
      if (result.idleFlushMinutes) {
        idleFlushMinsInput.value = result.idleFlushMinutes;
      }

      // Populate Whitelist based on open tabs
      renderWhitelistCheckbox(result.redirectWhitelist || "");
    }
  );
}

// ==========================================
// WHITELIST DOMAIN SELECTION
// ==========================================
function getDomainFromUrl(url) {
  if (!url || url.startsWith("chrome")) return null;
  try {
    const urlObj = new URL(url);
    const parts = urlObj.hostname.split('.');
    // ambil root domain sederhana (e.g. youtube.com dari www.youtube.com)
    if (parts.length > 2) {
      return parts.slice(-2).join('.');
    }
    return urlObj.hostname;
  } catch (e) {
    return null;
  }
}

function renderWhitelistCheckbox(savedWhitelistStr) {
  const savedDomains = savedWhitelistStr.split(",").map(d => d.trim()).filter(Boolean);
  
  chrome.tabs.query({}, (tabs) => {
    const uniqueDomains = new Set();
    tabs.forEach(t => {
      const d = getDomainFromUrl(t.url);
      if (d) uniqueDomains.add(d);
    });

    // Tambahkan saved domain yang mungkin sedang tidak ada tab-nya
    savedDomains.forEach(d => uniqueDomains.add(d));

    whitelistContainer.innerHTML = "";
    
    if (uniqueDomains.size === 0) {
      whitelistContainer.innerHTML = `<div style="color:#9aa0a6; font-size:11px; text-align:center; padding: 4px;">Belum ada tab eksternal terbuka.</div>`;
      return;
    }

    const sortedDomains = Array.from(uniqueDomains).sort();
    
    sortedDomains.forEach(domain => {
      const isChecked = savedDomains.includes(domain);
      const div = document.createElement("div");
      div.className = "whitelist-item";
      div.innerHTML = `
        <input type="checkbox" id="wl-${domain}" value="${domain}" ${isChecked ? "checked" : ""}>
        <label for="wl-${domain}" style="cursor:pointer; flex:1;">${domain}</label>
      `;
      whitelistContainer.appendChild(div);
    });
  });
}

// ==========================================
// SIMPAN PENGATURAN (SAVE BUTTONS)
// ==========================================
btnSaveGeneral.addEventListener("click", () => {
  const ramLimitGB = parseFloat(ramLimitInput.value) || 14;
  const idleTimerMinutes = parseInt(idleTimerInput.value) || 60;
  
  chrome.storage.local.set({ ramLimitGB, idleTimerMinutes }, () => {
    showToast("Pengaturan Umum Tersimpan! ✅");
  });
});

btnSaveRedirect.addEventListener("click", () => {
  const blockRedirects = redirectToggle.checked;
  const checkboxes = whitelistContainer.querySelectorAll("input[type='checkbox']");
  
  const selectedDomains = [];
  checkboxes.forEach(cb => {
    if (cb.checked) selectedDomains.push(cb.value);
  });
  
  const redirectWhitelist = selectedDomains.join(", ");
  
  chrome.storage.local.set({ blockRedirects, redirectWhitelist }, () => {
    showToast("Whitelist Redirect Tersimpan! ✅");
  });
});

btnSaveFlush.addEventListener("click", () => {
  const idleFlushEnabled = idleFlushToggle.checked;
  const idleFlushMinutes = parseInt(idleFlushMinsInput.value) || 15;
  
  chrome.storage.local.set({ idleFlushEnabled, idleFlushMinutes }, () => {
    chrome.runtime.sendMessage({
      action: "updateIdleConfig",
      enabled: idleFlushEnabled,
      minutes: idleFlushMinutes,
    });
    showToast("Auto-Flush Tersimpan! ✅");
  });
});

// ==========================================
// STATISTIK CPU & RAM SISTEM
// ==========================================
function updateStatistikSistem() {
  if (chrome.system && chrome.system.cpu) {
    chrome.system.cpu.getInfo((info) => {
      let active = 0, total = 0;
      info.processors.forEach((p) => {
        active += p.usage.kernel + p.usage.user;
        total += p.usage.total;
      });
      const persen = total > 0 ? Math.round((active / total) * 100) : 0;
      cpuVal.innerText = `${persen}%`;
      cpuBar.style.width = `${persen}%`;
      cpuBar.className = "progress-bar " + (persen > 80 ? "high" : persen > 50 ? "medium" : "");
    });
  }

  if (chrome.system && chrome.system.memory) {
    chrome.system.memory.getInfo((info) => {
      const terpakaiBytes = info.capacity - info.availableCapacity;
      const terpakaiGB = (terpakaiBytes / (1024 ** 3)).toFixed(1);
      const totalGB = (info.capacity / (1024 ** 3)).toFixed(1);

      ramVal.innerText = `${terpakaiGB} GB Terpakai / ${totalGB} GB`;
      
      const persenRam = (terpakaiBytes / info.capacity) * 100;
      ramBar.style.width = `${persenRam}%`;
      
      const batasAlert = parseFloat(ramLimitInput.value) || 14;
      if (terpakaiGB >= batasAlert) {
        ramBar.className = "progress-bar high";
        ramAlert.style.display = "block";
      } else {
        ramBar.className = "progress-bar " + (persenRam > 60 ? "medium" : "");
        ramAlert.style.display = "none";
      }
    });
  }
}

// ==========================================
// MANAJEMEN TAB (GROUP, SORTING)
// ==========================================
function getTabStateScore(tab) {
  // Sort priority: Active (0) > Idle (1) > Sleeping (2)
  if (tab.active) return 0;
  if (tab.discarded || (tab.title && tab.title.startsWith("🌙"))) return 2;
  return 1;
}

function getTabStateClass(tab) {
  if (tab.active) return "active-tab";
  if (tab.discarded || (tab.title && tab.title.startsWith("🌙"))) return "sleep-tab";
  return "idle-tab";
}

function getTabStateLabel(tab) {
  if (tab.active) return `<span style="color:#81c995;">📍 Sedang dilihat</span>`;
  if (tab.discarded || (tab.title && tab.title.startsWith("🌙"))) return `🌙 Tertidur`;
  return `⏳ Idle`;
}

function muatDaftarTab() {
  tabListEl.innerHTML = "Memuat data...";
  
  chrome.tabs.query({}, async (tabs) => {
    allTabsCache = tabs;
    
    let activeCount = 0;
    let sleepCount = 0;

    tabs.forEach((t) => {
      if (t.discarded || (t.title && t.title.startsWith("🌙"))) sleepCount++;
      else activeCount++;
    });

    activeTabsEl.innerText = activeCount;
    sleepingTabsEl.innerText = sleepCount;

    // Fetch tab groups for color/title
    let groups = {};
    if (chrome.tabGroups) {
      const gList = await new Promise(r => chrome.tabGroups.query({}, r));
      gList.forEach(g => { groups[g.id] = g; });
    }

    // Ambil data tab dan hitung skor
    const tabDataList = [];
    for (const tab of tabs) {
      tabDataList.push({
        ...tab,
        stateScore: getTabStateScore(tab)
      });
    }

    // Kelompokkan tab by groupId
    const groupedTabs = {};
    const ungroupedTabs = [];

    tabDataList.forEach((tab) => {
      if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        if (!groupedTabs[tab.groupId]) groupedTabs[tab.groupId] = [];
        groupedTabs[tab.groupId].push(tab);
      } else {
        ungroupedTabs.push(tab);
      }
    });

    // Render ke HTML
    let html = "";
    
    // Sort array helper (Active > Idle > Sleep)
    const sortTabs = (a, b) => a.stateScore - b.stateScore;

    // 1. Render Grouped Tabs
    for (const [groupId, gTabs] of Object.entries(groupedTabs)) {
      const groupInfo = groups[groupId];
      const groupName = groupInfo?.title || "Unnamed Group";
      const groupColor = groupInfo?.color || "grey";
      const realColor = getChromeColorHex(groupColor);

      gTabs.sort(sortTabs); // Urutkan tab di dalam group ini

      html += `
        <div class="tab-group-header" style="color: ${realColor};">
          <span style="font-size:16px;">◉</span> ${groupName} <span style="color:#5f6368; font-weight:normal;">──── ${gTabs.length} tab</span>
        </div>
      `;

      gTabs.forEach((tab) => { html += buatHTMLTabItem(tab); });
    }

    // 2. Render Ungrouped Tabs
    if (ungroupedTabs.length > 0) {
      if (Object.keys(groupedTabs).length > 0) {
        html += `<div class="tab-group-header" style="color: #9aa0a6;">TAB TANPA GROUP</div>`;
      }
      ungroupedTabs.sort(sortTabs); // Urutkan
      ungroupedTabs.forEach((tab) => { html += buatHTMLTabItem(tab); });
    }

    tabListEl.innerHTML = html || `<div style="text-align:center; padding: 20px;">Tidak ada tab terbuka</div>`;
  });
}

function buatHTMLTabItem(tab) {
  const isSleep = tab.stateScore === 2;
  const judul = tab.title || "Tab Kosong";
  const favicon = tab.favIconUrl || "icon16.png";
  
  // Format waktu idle atau status
  let resourceHtml = "";
  if (isSleep) {
    resourceHtml = `<span>Mode Hemat Energi</span>`;
  } else {
    // Karena chrome.processes tidak jalan di versi stabil,
    // kita hanya tampilkan status tab
    resourceHtml = tab.active ? `<span>Fokus</span>` : `<span>Berjalan di background</span>`;
  }

  return `
    <div class="tab-item ${getTabStateClass(tab)}">
      <div class="tab-header-row">
        <div class="tab-title">
          <img src="${favicon}" class="tab-favicon" onerror="this.src='icon16.png'">
          ${judul}
        </div>
      </div>
      <div class="tab-stats">
        <div>${getTabStateLabel(tab)}</div>
        <div class="stat-badge">${resourceHtml}</div>
      </div>
    </div>
  `;
}

// Konversi warna grup Chrome
function getChromeColorHex(colorName) {
  const colors = {
    grey: "#dadce0", blue: "#8ab4f8", red: "#f28b82",
    yellow: "#fde293", green: "#81c995", pink: "#ff8bcb",
    purple: "#c58af9", cyan: "#78d9ec", orange: "#fcad70"
  };
  return colors[colorName] || colors.grey;
}

// ==========================================
// TOMBOL AKSI BAWAH (PERFORMANCE)
// ==========================================
btnSleepAll.addEventListener("click", () => {
  btnSleepAll.innerText = "⏳ Sedang Menidurkan...";
  chrome.runtime.sendMessage({ action: "forceSleepAll" }, (res) => {
    setTimeout(() => {
      btnSleepAll.innerText = `Tidurkan Semua Tab Pasif (${res.count} ditidurkan)`;
      muatDaftarTab();
    }, 1000);
  });
});

btnClearCache.addEventListener("click", () => {
  btnClearCache.innerText = "⏳ Membersihkan...";
  chrome.browsingData.removeCache({ since: 0 }, () => {
    setTimeout(() => {
      btnClearCache.innerText = "✅ Cache Dibersihkan!";
      showToast("Cache Browser Dibersihkan! 🧹");
      setTimeout(() => {
        btnClearCache.innerText = "🧹 Bersihkan Cache Browser";
      }, 3000);
    }, 500);
  });
});

// ==========================================
// LOGIKA NAVIGASI TAB UI
// ==========================================
btnTabPerf.addEventListener("click", () => {
  btnTabPerf.classList.add("active");
  btnTabDl.classList.remove("active");
  panePerf.classList.add("active");
  paneDl.classList.remove("active");
});

btnTabDl.addEventListener("click", () => {
  btnTabDl.classList.add("active");
  btnTabPerf.classList.remove("active");
  paneDl.classList.add("active");
  panePerf.classList.remove("active");
  
  // Auto-fill URL aktif saat buka tab downloader
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0 && tabs[0].url && !tabs[0].url.startsWith("chrome")) {
      const el = document.getElementById("dl-urls");
      if (el && !el.value.includes(tabs[0].url)) {
        el.value = el.value ? el.value + "\n" + tabs[0].url : tabs[0].url;
      }
    }
  });
});
// ==========================================
// LOGIKA DOWNLOADER (NATIVE MESSAGING - BULK)
// ==========================================
const btnDownload = document.getElementById("btn-download");
const btnDlFast = document.getElementById("btn-dl-fast");
const btnCancelQueue = document.getElementById("btn-cancel-queue");
const dlUrlsInput = document.getElementById("dl-urls");
const dlFormatSelect = document.getElementById("dl-format");
const dlQualitySelect = document.getElementById("dl-quality");
const dlPlaylistCheck = document.getElementById("dl-playlist");
const dlQueueBox = document.getElementById("dl-queue-box");
const dlQueueList = document.getElementById("dl-queue-list");
const dlQueueSummary = document.getElementById("dl-queue-summary");

const dlFolderInput = document.getElementById("dl-folder");
const dlFolderText = document.getElementById("dl-folder-text");
const btnBrowseFolder = document.getElementById("btn-browse-folder");
const btnToggleHistory = document.getElementById("btn-toggle-history");
const dlHistoryBox = document.getElementById("dl-history-box");
const dlHistoryList = document.getElementById("dl-history-list");
const btnClearHistory = document.getElementById("btn-clear-history");
const btnUpdateEngine = document.getElementById("btn-update-engine");

// Load folder path & history on startup
chrome.storage.local.get(["dlOutputFolder", "dlHistory"], (res) => {
  if (res.dlOutputFolder) {
    dlFolderInput.value = res.dlOutputFolder;
    dlFolderText.textContent = res.dlOutputFolder;
  }
  if (res.dlHistory) renderHistory(res.dlHistory);
});

// Auto-refresh history when background saves a new download (quick_download / ElevenLabs)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.dlHistory) {
    const newHistory = changes.dlHistory.newValue;
    if (newHistory) {
      renderHistory(newHistory);
      // Auto-buka panel Riwayat agar user langsung bisa melihat hasilnya
      dlHistoryBox.style.display = 'block';
      showToast("\u2705 Unduhan baru masuk ke Riwayat!");
    }
  }
});

btnBrowseFolder.addEventListener("click", () => {
  btnBrowseFolder.textContent = "⏳ Membuka...";
  btnBrowseFolder.disabled = true;
  chrome.runtime.sendMessage({
    action: "proxy_native_message",
    payload: { action: "select_folder" }
  }, (response) => {
    btnBrowseFolder.textContent = "Pilih Folder";
    btnBrowseFolder.disabled = false;
    
    if (chrome.runtime.lastError || (response && response.error)) {
      showToast("❌ Gagal terhubung. Jalankan install.bat");
    } else if (response && response.type === "error") {
      showToast("❌ Batal / Error.");
    } else if (response && response.path) {
      dlFolderInput.value = response.path;
      dlFolderText.textContent = response.path;
      chrome.storage.local.set({ dlOutputFolder: response.path });
      showToast("✅ Folder dipilih!");
    }
  });
});

// --- Update Engine ---
btnUpdateEngine.addEventListener("click", () => {
  btnUpdateEngine.disabled = true;
  btnUpdateEngine.textContent = "🔄 Sedang Update...";
  
  try {
    const port = chrome.runtime.connect({ name: "native_proxy" });
    port.postMessage({ action: "update_engine" });
    
    port.onMessage.addListener((msg) => {
      if (msg.type === "item_status") {
        btnUpdateEngine.textContent = msg.text.substring(0, 30) + "...";
      } else if (msg.type === "done" || msg.type === "error") {
        port.disconnect();
        btnUpdateEngine.disabled = false;
        btnUpdateEngine.textContent = "🔄 Update Engine (yt-dlp)";
        showToast(msg.type === "done" ? "✅ Update Berhasil!" : "❌ Update Gagal!");
      }
    });
    
    port.onDisconnect.addListener(() => {
      btnUpdateEngine.disabled = false;
      btnUpdateEngine.textContent = "🔄 Update Engine (yt-dlp)";
      if (chrome.runtime.lastError) {
        showToast("❌ Gagal terhubung ke Host.");
      }
    });
  } catch(err) {
    btnUpdateEngine.disabled = false;
    btnUpdateEngine.textContent = "🔄 Update Engine";
    showToast("❌ Error menjalankan perintah.");
  }
});

// --- Install FFmpeg ---
const btnInstallFfmpeg = document.getElementById("btn-install-ffmpeg");

function checkFfmpegStatus() {
  try {
    const port = chrome.runtime.connect({ name: "native_proxy" });
    port.postMessage({ action: "check_ffmpeg" });
    port.onMessage.addListener((msg) => {
      if (msg.type === "ffmpeg_status") {
        if (msg.installed) {
          btnInstallFfmpeg.textContent = "📦 FFmpeg Terpasang ✅";
          btnInstallFfmpeg.style.color = "#81c995";
          btnInstallFfmpeg.disabled = true;
        }
      }
      port.disconnect();
    });
    port.onDisconnect.addListener(() => {});
  } catch (e) {}
}

btnInstallFfmpeg.addEventListener("click", () => {
  btnInstallFfmpeg.textContent = "⏳ Mengunduh...";
  btnInstallFfmpeg.disabled = true;
  try {
    const port = chrome.runtime.connect({ name: "native_proxy" });
    port.postMessage({ action: "install_ffmpeg" });
    
    port.onMessage.addListener((msg) => {
      if (msg.type === "item_status") {
        btnInstallFfmpeg.textContent = msg.text.substring(0, 20) + "...";
      } else if (msg.type === "done") {
        port.disconnect();
        btnInstallFfmpeg.textContent = "📦 FFmpeg Terpasang ✅";
        btnInstallFfmpeg.style.color = "#81c995";
        showToast("✅ FFmpeg Berhasil Diinstal!");
      } else if (msg.type === "error") {
        port.disconnect();
        btnInstallFfmpeg.textContent = "📦 Install FFmpeg";
        btnInstallFfmpeg.disabled = false;
        showToast("❌ " + msg.text);
      }
    });
    
    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError && btnInstallFfmpeg.textContent !== "📦 FFmpeg Terpasang ✅") {
        btnInstallFfmpeg.textContent = "📦 Install FFmpeg";
        btnInstallFfmpeg.disabled = false;
        showToast("❌ Gagal terhubung ke Host.");
      }
    });
  } catch(err) {
    btnInstallFfmpeg.textContent = "📦 Install FFmpeg";
    btnInstallFfmpeg.disabled = false;
    showToast("❌ Error menjalankan perintah.");
  }
});

// Check status on load
document.addEventListener("DOMContentLoaded", checkFfmpegStatus);

// Track per-item state
const queueItems = {};
let activePort = null;

// --- Helper function to start download ---
function startDownload(urlList) {
  if (urlList.length === 0) {
    showToast("⚠️ Tidak ada URL valid ditemukan.");
    return;
  }

  // Cek apakah ada URL TikTok yang cuma beranda (tanpa ID video)
  const genericTiktokIdx = urlList.findIndex(u => u === 'https://www.tiktok.com/' || u === 'https://tiktok.com/' || u.match(/^https?:\/\/(www\.)?tiktok\.com\/?(\?.*)?$/));
  if (genericTiktokIdx !== -1) {
    showToast("⚠️ Buka/klik videonya dulu! URL tidak boleh cuma Beranda TikTok.");
    return; // Batalkan download
  }

  // Deteksi URL AI Audio (ElevenLabs, Suno, Udio, SoundCloud) — ditangani otomatis via content script
  const isAudioAi = (u) => u.includes('elevenlabs.io') || u.includes('suno.com') || u.includes('udio.com') || u.includes('soundcloud.com');
  const audioAiUrls = urlList.filter(isAudioAi);
  const ytDlpUrls = urlList.filter(u => !isAudioAi(u));

  if (audioAiUrls.length > 0) {
    showToast("🎵 Audio Web: Cukup putar di halaman — audio otomatis tersimpan!");
    // Tunjukkan kartu info di antrian
    dlQueueBox.style.display = "block";
    audioAiUrls.forEach(url => {
      const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
      renderQueueItem(id, url);
      updateQueueItem(id, {
        status: "error",
        error: "🎵 Putar audio di tab aslinya → otomatis tersimpan ke Riwayat"
      });
    });
    if (ytDlpUrls.length === 0) return;
  }

  const format = dlFormatSelect.value;
  const quality = dlQualitySelect.value;
  const playlist = dlPlaylistCheck.checked;

  // Do NOT reset queue UI if we are adding to an existing queue
  if (!activePort) {
    dlQueueList.innerHTML = "";
    Object.keys(queueItems).forEach(k => delete queueItems[k]);
  }
  dlQueueBox.style.display = "block";

  // Build items array & render cards
  const folderVal = dlFolderInput.value.trim();
  const items = urlList.map(url => {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    renderQueueItem(id, url);
    return { id, url, format, quality, playlist, outputFolder: folderVal || null };
  });

  updateQueueSummary();

  // If already connected, just append to existing queue
  if (activePort) {
    activePort.postMessage({
      action: "download",
      urls: items,
      format: format,
      quality: quality,
      outputFolder: folderVal || null
    });
    return;
  }

  // Connect native host
  let port;
  try {
    port = chrome.runtime.connect({ name: "native_proxy" });
    activePort = port;
  } catch (err) {
    showToast("❌ Gagal terhubung ke host. Sudah jalankan install.bat?");
    dlQueueSummary.textContent = "Gagal terhubung ke native host.";
    return;
  }

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
      case "queue_start":
        dlQueueSummary.textContent = `Memulai ${msg.count} unduhan...`;
        break;

      case "queue_progress":
        updateQueueItem(msg.id, { status: "downloading" });
        updateQueueSummary();
        break;

      case "item_progress":
        updateQueueItem(msg.id, {
          percent: msg.percent,
          speed: msg.speed,
          eta: msg.eta,
          size: msg.size,
          status: "downloading"
        });
        break;

      case "item_status":
        // Tampilkan pesan retry/status di meta-left kartu item
        if (msg.id && msg.text) {
          const isRetry = msg.text.startsWith('Retry ');
          if (isRetry) {
            // Ubah badge dan meta jadi mode retrying
            updateQueueItem(msg.id, { status: 'retrying', retryText: msg.text });
          } else {
            const metaL = document.getElementById('meta-left-' + msg.id);
            if (metaL) metaL.textContent = msg.text.substring(0, 50);
          }
        }
        break;

      case "item_done": {
        updateQueueItem(msg.id, { status: "done" });
        updateQueueSummary();
        
        // Auto-remove done item from queue UI after 2s
        setTimeout(() => {
          const el = document.getElementById("qi-" + msg.id);
          if (el) { el.style.opacity = "0"; el.style.transition = "opacity 0.4s"; }
          setTimeout(() => {
            const el2 = document.getElementById("qi-" + msg.id);
            if (el2) el2.remove();
          }, 420);
        }, 2000);
        
        // Remove URL from textarea
        if (queueItems[msg.id] && queueItems[msg.id].url && dlUrlsInput && dlUrlsInput.value) {
          const urlToRemove = queueItems[msg.id].url;
          let lines = dlUrlsInput.value.split("\n");
          lines = lines.filter(line => line.trim() !== urlToRemove);
          dlUrlsInput.value = lines.join("\n").trim();
        }
        
        // Add to history
        chrome.storage.local.get(["dlHistory"], (res) => {
          const history = res.dlHistory || [];
          history.unshift({
            url: msg.url,
            path: msg.path || "unknown",
            date: new Date().toISOString()
          });
          if (history.length > 50) history.pop();
          chrome.storage.local.set({ dlHistory: history }, () => renderHistory(history));
        });
        
        // Check if all done - JANGAN null-kan activePort agar bisa reuse!
        const allDone = Object.values(queueItems).every(i => i.status === "done" || i.status === "error");
        if (allDone) {
          showToast("🎉 Semua unduhan selesai!");
          // Port tetap terbuka untuk download berikutnya
        }
        break;
      }


      case "item_error":
        updateQueueItem(msg.id, { status: "error", error: msg.text });
        updateQueueSummary();
        break;

      case "queue_done":
        showToast("🎉 Antrian selesai!");
        // Port tetap terbuka - jangan di-null, host masih berjalan
        break;

      case "error":
        showToast("❌ " + msg.text);
        dlQueueSummary.textContent = "Error: " + msg.text;
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    activePort = null; // Null hanya saat koneksi benar-benar putus
    if (chrome.runtime.lastError) {
      showToast("❌ Host terputus: " + chrome.runtime.lastError.message);
      dlQueueSummary.textContent = "Host terputus. Cek apakah install.bat sudah dijalankan.";
    }
  });

  // Send bulk download command with full items array
  port.postMessage({
    action: "download",
    urls: items,
    format: format,
    quality: quality,
    outputFolder: folderVal || null
  });
}

// --- "Download Langsung" button ---
btnDlFast.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0 && tabs[0].url && !tabs[0].url.startsWith("chrome")) {
      startDownload([tabs[0].url]);
    } else {
      showToast("Tab aktif tidak memiliki URL video valid.");
    }
  });
});

// --- Render a queue item card ---
function renderQueueItem(id, url) {
  const shortUrl = url.length > 55 ? url.substring(0, 52) + "..." : url;
  const div = document.createElement("div");
  div.className = "dl-queue-item";
  div.id = "qi-" + id;
  div.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
      <div class="item-title" title="${url}">${shortUrl}</div>
      <span class="item-status-badge status-waiting" id="badge-${id}">Menunggu</span>
    </div>
    <div class="item-bar-bg"><div class="item-bar" id="bar-${id}"></div></div>
    <div class="item-meta">
      <span id="meta-left-${id}">—</span>
      <span id="meta-right-${id}">—</span>
    </div>
  `;
  dlQueueList.appendChild(div);
  queueItems[id] = { url, status: 'waiting' };
}

function updateQueueItem(id, { percent, speed, eta, size, status, error, retryText } = {}) {
  const bar = document.getElementById("bar-" + id);
  const badge = document.getElementById("badge-" + id);
  const metaL = document.getElementById("meta-left-" + id);
  const metaR = document.getElementById("meta-right-" + id);

  if (!bar) return;

  if (percent !== undefined) {
    bar.style.width = percent + "%";
    bar.className = "item-bar";
    if (metaL) metaL.textContent = percent.toFixed(1) + "%";
    if (metaR && (speed || eta)) {
      metaR.textContent = [speed, eta ? "ETA " + eta : null].filter(Boolean).join(" • ");
    }
    if (size && metaL) {
      metaL.textContent = percent.toFixed(1) + "% of " + size;
    }
  }

  if (status === "downloading") {
    if (badge) { badge.textContent = "⬇️ Downloading"; badge.className = "item-status-badge status-downloading"; }
    queueItems[id].status = "downloading";
  } else if (status === "done") {
    bar.style.width = "100%";
    if (badge) { badge.textContent = "✅ Selesai"; badge.className = "item-status-badge status-done"; }
    if (metaL) metaL.textContent = "100% — Done!";
    if (metaR) metaR.textContent = "";
    queueItems[id].status = "done";
  } else if (status === "error") {
    bar.className = "item-bar error";
    bar.style.width = "100%";
    if (badge) { badge.textContent = "❌ Error"; badge.className = "item-status-badge status-error"; }
    if (metaL) metaL.textContent = error || "Gagal";
    if (metaR) {
      const url = queueItems[id] && queueItems[id].url;
      if (url && !url.includes('elevenlabs.io')) {
        const btn = document.createElement('button');
        btn.textContent = '🔄 Coba Lagi';
        btn.className = 'retry-btn';
        btn.dataset.retryId = id;
        btn.style.cssText = 'background:#fde293; color:#000; border:none; padding:2px 8px; border-radius:4px; cursor:pointer; font-size:10px;';
        metaR.innerHTML = '';
        metaR.appendChild(btn);
      } else if (url && url.includes('elevenlabs.io')) {
        metaR.innerHTML = '<span style="color:#fde293; font-size:10px;">Bukan error, baca info di kiri</span>';
      }
    }
    queueItems[id].status = "error";
  } else if (status === "retrying") {
    bar.style.width = "0%";
    bar.className = "item-bar";
    bar.style.background = "#fde293";
    if (badge) { badge.textContent = "🔄 Retry..."; badge.className = "item-status-badge status-downloading"; badge.style.background = "#856404"; }
    if (metaL) metaL.textContent = retryText || "Mencoba ulang...";
    if (metaR) metaR.textContent = "";
    queueItems[id].status = "downloading";
  }
}

function updateQueueSummary() {
  const total = Object.keys(queueItems).length;
  const done = Object.values(queueItems).filter(i => i.status === "done").length;
  const err = Object.values(queueItems).filter(i => i.status === "error").length;
  dlQueueSummary.textContent = `${done}/${total} Selesai${err > 0 ? " • " + err + " Gagal" : ""}`;
}

// --- Main download trigger ---
btnDownload.addEventListener("click", () => {
  const rawText = dlUrlsInput.value.trim();
  if (!rawText) {
    showToast("⚠️ Masukkan minimal 1 URL!");
    return;
  }

  // Parse + deduplicate URLs (reclip style)
  const seen = new Set();
  const urlList = rawText.split("\n")
    .map(u => u.trim())
    .filter(u => u && u.startsWith("http") && !seen.has(u) && seen.add(u));

  startDownload(urlList);
});

// --- Cancel Queue ---
btnCancelQueue.addEventListener("click", () => {
  if (activePort) {
    activePort.postMessage({ action: "cancel" });
    activePort.disconnect();
    activePort = null;
  }
  // Clear the UI and queue tracking objects
  dlQueueList.innerHTML = "";
  Object.keys(queueItems).forEach(k => delete queueItems[k]);
  
  dlQueueSummary.textContent = "Antrian dibatalkan & dibersihkan.";
  showToast("🛑 Antrian dibatalkan.");
});

// --- History Logic ---
btnToggleHistory.addEventListener("click", () => {
  const isHidden = dlHistoryBox.style.display === "none";
  dlHistoryBox.style.display = isHidden ? "block" : "none";
});

btnClearHistory.addEventListener("click", () => {
  chrome.storage.local.set({ dlHistory: [] }, () => {
    renderHistory([]);
    showToast("🧹 Riwayat dibersihkan.");
  });
});

function renderHistory(historyArray) {
  if (!historyArray || historyArray.length === 0) {
    dlHistoryList.innerHTML = `<div style="font-size:11px; color:#9aa0a6; text-align:center;">Riwayat kosong.</div>`;
    return;
  }
  dlHistoryList.innerHTML = historyArray.map(h => {
    const d = new Date(h.date);
    const timeStr = d.toLocaleDateString() + " " + d.toLocaleTimeString();
    const shortUrl = h.url.length > 40 ? h.url.substring(0, 37) + "..." : h.url;
    
    let filename = h.path || "unknown";
    if (filename.includes("\\")) filename = filename.substring(filename.lastIndexOf("\\") + 1);
    else if (filename.includes("/")) filename = filename.substring(filename.lastIndexOf("/") + 1);
    
    return `
      <div class="history-item" data-path="${h.path ? h.path.replace(/"/g, '&quot;') : ''}" style="border-bottom: 1px solid #3c4043; padding-bottom: 4px; margin-bottom: 4px; cursor: pointer;" title="Klik 2x untuk membuka file">
        <div style="font-size: 11px; color: #8ab4f8; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${filename}</div>
        <div style="font-size: 10px; color: #9aa0a6; display: flex; justify-content: space-between;">
          <span title="${h.url}">${shortUrl}</span>
          <span>${timeStr}</span>
        </div>
      </div>
    `;
  }).join("");
}

dlHistoryList.addEventListener("dblclick", (e) => {
  const item = e.target.closest('.history-item');
  if (item && item.dataset.path && item.dataset.path !== 'unknown') {
    const targetPath = item.dataset.path;
    try {
      const port = chrome.runtime.connect({ name: "native_proxy" });
      port.postMessage({ action: "open_file", path: targetPath });
      port.onMessage.addListener((msg) => {
        port.disconnect();
        if (msg.type === "error") showToast("❌ " + msg.text);
        else showToast("▶️ Membuka file...");
      });
      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          showToast("❌ Gagal. Jalankan install.bat");
        }
      });
    } catch(err) {
      showToast("❌ Gagal mengirim perintah.");
    }
  }
});

// Listen for background messages (e.g. ElevenLabs saved)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'elevenlabs_saved') {
    if (msg.resp && msg.resp.type === 'item_done') {
      showToast("🎵 ElevenLabs Audio Berhasil Disimpan!");
      // Refresh history
      chrome.storage.local.get(["dlHistory"], (res) => {
        if (res.dlHistory) renderHistory(res.dlHistory);
      });
    } else {
      showToast("❌ Gagal menyimpan audio ElevenLabs.");
    }
  }
});

// --- Retry failed download ---
function retryDownload(id) {
  const item = queueItems[id];
  if (!item || !item.url) return;
  const url = item.url;
  // Remove from queue tracker and element
  delete queueItems[id];
  const el = document.getElementById("qi-" + id);
  if (el) el.remove();
  // Re-queue just this URL
  startDownload([url]);
  showToast("🔄 Mengulang unduhan...");
}

// Event delegation for retry button
dlQueueList.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('retry-btn')) {
    const id = e.target.dataset.retryId;
    if (id) retryDownload(id);
  }
});
