// ================================
// EduShield Popup JS - Fixed + Fact-Check via Local Proxy (Improved) + Toast Counts
// ================================

function getFromStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function setToStorage(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

// ---------------------------
// DOM elements
// ---------------------------
const totalBlocklistsEl = document.getElementById("totalBlocklists");

const allowInput = document.getElementById("allowInput");
const addAllowBtn = document.getElementById("addAllowBtn");
const allowListEl = document.getElementById("allowList");
const importAllowBtn = document.getElementById("importAllowBtn");
const exportAllowBtn = document.getElementById("exportAllowBtn");
const clearAllowBtn = document.getElementById("clearAllowBtn");
const showMoreAllow = document.getElementById("showMoreAllow");

const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const customListEl = document.getElementById("customList");
const clearCustomFeedsBtn = document.getElementById("clearCustomFeedsBtn");
const showMoreCustom = document.getElementById("showMoreCustom");

const feedUrlInput = document.getElementById("feedUrlInput");
const addFeedUrlBtn = document.getElementById("addFeedUrlBtn");
const feedUrlListEl = document.getElementById("feedUrlList");
const showMoreFeed = document.getElementById("showMoreFeed");

const flaggedSection = document.getElementById("flaggedDomainSection");
const flaggedDomainEl = document.getElementById("flaggedDomain");
const flaggedSourcesEl = document.getElementById("flaggedSources");
const learnMoreBtn = document.getElementById("learnMoreBtn");
const dismissBtn = document.getElementById("dismissBtn");
const allowBtn = document.getElementById("allowBtn");

const notifEl = document.getElementById("popup-notification");

// ---------------------------
// Fact-Check elements
// ---------------------------
const factCheckInput = document.getElementById("factCheckInput");
const charCounter = document.getElementById("charCounter");
const runFactCheckBtn = document.getElementById("runFactCheckBtn");
const spinner = document.getElementById("spinner");

// ---------------------------
// Floating notification bubble
// ---------------------------
function showPopupNotification(msg, duration = 2500) {
  if (!notifEl) return;
  notifEl.textContent = msg;
  notifEl.style.display = "block";
  notifEl.style.opacity = "1";
  setTimeout(() => {
    notifEl.style.opacity = "0";
    setTimeout(() => { notifEl.style.display = "none"; }, 500);
  }, duration);
}

// ---------------------------
// Toast overlay
// ---------------------------
function showBlocklistToast(msg, duration = 3000) {
  let toast = document.getElementById("blocklist-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "blocklist-toast";
    toast.style.position = "fixed";
    toast.style.top = "50%";
    toast.style.left = "50%";
    toast.style.transform = "translate(-50%, -50%)";
    toast.style.background = "rgba(0,0,0,0.8)";
    toast.style.color = "#fff";
    toast.style.padding = "10px 20px";
    toast.style.borderRadius = "8px";
    toast.style.fontSize = "14px";
    toast.style.zIndex = "9999";
    toast.style.textAlign = "center";
    toast.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.display = "block";
  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.transition = "opacity 0.5s ease";
    toast.style.opacity = "0";
    setTimeout(() => { toast.style.display = "none"; }, 500);
  }, duration);
}

// ---------------------------
// Animate list items
// ---------------------------
function animateListItem(itemEl, action = "add") {
  if (action === "add") {
    itemEl.style.opacity = 0;
    itemEl.style.transform = "translateY(-10px)";
    requestAnimationFrame(() => {
      itemEl.style.transition = "all 0.3s ease";
      itemEl.style.opacity = 1;
      itemEl.style.transform = "translateY(0)";
    });
  } else {
    itemEl.style.transition = "all 0.25s ease";
    itemEl.style.opacity = 0;
    itemEl.style.transform = "translateX(20px)";
    setTimeout(() => itemEl.remove(), 250);
  }
}

// ---------------------------
// Render helpers
// ---------------------------
function renderList(list, element, storageKey) {
  element.innerHTML = "";
  list.slice(0, 5).forEach((item, i) => {
    const li = document.createElement("li");
    li.textContent = item;

    const delBtn = document.createElement("button");
    delBtn.className = "trash-btn";
    delBtn.innerHTML = "🗑";
    delBtn.onclick = async () => {
      list.splice(i, 1);
      await setToStorage({ [storageKey]: list });
      await refreshMergedAndRender();
      showBlocklistToast(`Total blocklist updated. Removed: 1`);
    };

    li.appendChild(delBtn);
    element.appendChild(li);
    animateListItem(li, "add");
  });
}

async function refreshMergedAndRender() {
  chrome.runtime.sendMessage({ type: "refreshMerged" }, async (resp) => {
    if (chrome.runtime.lastError) return;
    if (resp && resp.count != null) {
      await setToStorage({ lastMergedCount: resp.count });
      renderAll();
      // ❌ intentionally NOT showing total count toast
    }
  });
}

async function renderAll() {
  const data = await getFromStorage([
    "allowlist", "customFeeds", "customFeedURLs",
    "flaggedDomain", "flaggedSources"
  ]);

  renderList(data.allowlist || [], allowListEl, "allowlist");
  renderList(data.customFeeds || [], customListEl, "customFeeds");
  renderList(data.customFeedURLs || [], feedUrlListEl, "customFeedURLs");

  if (data.flaggedDomain) {
    flaggedDomainEl.textContent = data.flaggedDomain;
    flaggedSourcesEl.textContent = (data.flaggedSources || []).join(", ");
    flaggedSection.style.display = "block";
  } else {
    flaggedSection.style.display = "none";
  }
}

// ---------------------------
// Load MASTER blocklist count ONCE
// ---------------------------
function loadMasterBlocklistCountOnce() {
  if (!totalBlocklistsEl) return;
  chrome.runtime.sendMessage(
    { type: "getMasterBlocklistCount" },
    res => {
      if (res && typeof res.count === "number") {
        totalBlocklistsEl.textContent = res.count;
      }
    }
  );
}

// ---------------------------
// Allowlist actions
// ---------------------------
addAllowBtn.addEventListener("click", async () => {
  const val = allowInput.value.trim();
  if (!val) return;
  const data = await getFromStorage(["allowlist"]);
  const list = data.allowlist || [];
  if (!list.includes(val)) list.push(val);
  await setToStorage({ allowlist: list });
  await refreshMergedAndRender();
  allowInput.value = "";
});

clearAllowBtn.addEventListener("click", async () => {
  await setToStorage({ allowlist: [] });
  await refreshMergedAndRender();
});

importAllowBtn.addEventListener("click", async () => {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ".txt";
  picker.onchange = async () => {
    const file = picker.files[0];
    if (!file) return;
    const text = await file.text();
    const domains = text.split(/\r?\n/).map(x => x.trim()).filter(x => x);
    const data = await getFromStorage(["allowlist"]);
    const list = data.allowlist || [];
    domains.forEach(d => { if (!list.includes(d)) list.push(d); });
    await setToStorage({ allowlist: list });
    await refreshMergedAndRender();
  };
  picker.click();
});

exportAllowBtn.addEventListener("click", async () => {
  const data = await getFromStorage(["allowlist"]);
  const list = data.allowlist || [];
  if (!list.length) return;
  const blob = new Blob([list.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  if (chrome.downloads && chrome.downloads.download) {
    chrome.downloads.download({ url, filename: "allowlist.txt" });
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = "allowlist.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
});

// ---------------------------
// Custom feeds
// ---------------------------
uploadBtn.addEventListener("click", async () => {
  if (!fileInput.files.length) return;
  const data = await getFromStorage(["customFeeds"]);
  const list = data.customFeeds || [];
  let added = 0;
  for (const file of fileInput.files) {
    const text = await file.text();
    const domains = text.match(/([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g) || [];
    domains.forEach(d => { if (!list.includes(d)) { list.push(d); added++; } });
  }
  await setToStorage({ customFeeds: list });
  await refreshMergedAndRender();

  // ✅ Toast showing added
  showBlocklistToast(`Custom feeds added: ${added}`);
});

clearCustomFeedsBtn.addEventListener("click", async () => {
  await setToStorage({ customFeeds: [] });
  await refreshMergedAndRender();
  showBlocklistToast("Custom feeds cleared");
});

// ---------------------------
// Feed URLs
// ---------------------------
addFeedUrlBtn.addEventListener("click", async () => {
  const url = feedUrlInput.value.trim();
  if (!url) return;
  const data = await getFromStorage(["customFeedURLs"]);
  const list = data.customFeedURLs || [];
  if (!list.includes(url)) {
    list.push(url);
    await setToStorage({ customFeedURLs: list });
    feedUrlInput.value = "";
    await refreshMergedAndRender();

    // ✅ Toast for feed URL
    showBlocklistToast(`Feed URL added`);
  }
});

function openListView(type) {
  chrome.windows.create({ url: `listView.html?type=${type}`, type: "popup", width: 400, height: 500 });
}
showMoreAllow.addEventListener("click", () => openListView("allowlist"));
showMoreCustom.addEventListener("click", () => openListView("customFeeds"));
showMoreFeed.addEventListener("click", () => openListView("customFeedURLs"));

// ---------------------------
// Flagged domain
// ---------------------------
learnMoreBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.google.com/search?q=" + flaggedDomainEl.textContent });
});
dismissBtn.addEventListener("click", async () => {
  await setToStorage({ flaggedDomain: null, flaggedSources: [] });
  await refreshMergedAndRender();
});
allowBtn.addEventListener("click", async () => {
  const domain = flaggedDomainEl.textContent;
  const data = await getFromStorage(["allowlist"]);
  const list = data.allowlist || [];
  if (!list.includes(domain)) list.push(domain);
  await setToStorage({ allowlist: list, flaggedDomain: null, flaggedSources: [] });
  await refreshMergedAndRender();
});

// ---------------------------
// ✅ Fact-Check Integration via Local Proxy (Improved)
// ---------------------------
async function runFactCheck(text) {
  runFactCheckBtn.disabled = true;
  spinner.style.display = "inline-block";

  try {
    // Send request to local proxy
    const response = await fetch("http://127.0.0.1:5000/factcheck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    if (!response.ok) throw new Error(`HTTP error ${response.status}`);

    const result = await response.json();

    // Save to storage and ensure write propagation
    await setToStorage({ lastFactCheckResult: result });

    // Wait until storage is fully written and visible to other pages (polling)
    const waitForStorage = () => new Promise((resolve, reject) => {
      let elapsed = 0;
      const interval = setInterval(async () => {
        const data = await getFromStorage(["lastFactCheckResult"]);
        if (data.lastFactCheckResult) {
          clearInterval(interval);
          resolve();
        }
        elapsed += 100;
        if (elapsed > 2000) { // max 2s wait
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });

    await waitForStorage();

    // Open fact-check view **after result is reliably stored**
    chrome.tabs.create({ url: chrome.runtime.getURL("factcheckview.html") });

  } catch (err) {
    console.error("Fact-check error:", err);
    showPopupNotification("❌ Error connecting to Fact-Check Proxy.");
  } finally {
    spinner.style.display = "none";
    runFactCheckBtn.disabled = false;
  }
}

// ---------------------------
// Character counter + validation
// ---------------------------
factCheckInput.addEventListener("input", () => {
  let text = factCheckInput.value;
  if (text.length > 1750) {
    factCheckInput.value = text.substring(0, 1750);
    text = factCheckInput.value;
  }
  charCounter.textContent = `${text.length} / 1750`;
  runFactCheckBtn.disabled = text.length === 0 || text.length > 1750;
});

runFactCheckBtn.addEventListener("click", () => {
  const text = factCheckInput.value.trim();
  if (!text) return showPopupNotification("Please enter some text for fact-check.");
  runFactCheck(text);
});

// ---------------------------
// Init
// ---------------------------
document.addEventListener("DOMContentLoaded", async () => {
  loadMasterBlocklistCountOnce(); // ✅ snapshot only
  await renderAll();              // ❌ no forced merge
});
