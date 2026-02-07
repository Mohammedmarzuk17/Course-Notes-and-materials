// ================================ 
// EduShield Background Script MV3 - Fixed Full Features + Reliable Blocklist + UGC/AICTE + Logging + IndexedDB
// ================================

// ---------------------
// Domain Normalization
// ---------------------
function toASCII(input) {
  try {
    return input.normalize("NFC").replace(/[^\x00-\x7F]/g, c =>
      "xn--" + Array.from(c).map(ch => ch.codePointAt(0).toString(16)).join("-")
    ).toLowerCase();
  } catch {
    return input.toLowerCase();
  }
}

// ---------------------
// Constants
// ---------------------
const BLOCKLISTS_FOLDER = "https://raw.githubusercontent.com/Mohammedmarzuk17/EduShield/main/blocklists/";
const TRUSTED_DOMAINS = [
  "github.com",
  "raw.githubusercontent.com",
  "chrome.google.com",
  "www.google.com",
  "google.com",
  "google.accounts.com",
  "www.stackoverflow.com",
  "huggingface.co",
  "hf.space",
  "api.huggingface.co",

  // --- Blocklist & Threat Intelligence Sources ---
  "urlhaus.abuse.ch",
  "openphish.com",
  "phishtank.org",
  "phishtank.com",
  "phishing.army",
  "threatfox.abuse.ch"
];





const BASE_CHUNK_SIZE = 3000;
const DEBUG = false;

// ---------------------
// Utilities
// ---------------------
const lastDomainCheck = {}; 

function isDomain(str) {
  if (!str) return false;
  const result = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(str) || /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(str);
  const now = Date.now();
  if (!lastDomainCheck[str] || now - lastDomainCheck[str] > 60 * 1000) {
    if (DEBUG) console.log("[Step] isDomain check:", str, "=>", result);
    lastDomainCheck[str] = now;
  }
  return result;
}

function extractDomainsFromText(text) {
  if (!text) return [];
  const domains = Array.from(new Set(
    (text.match(/(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/g) || [])
      .map(m => m.toLowerCase())
  ));
  if (DEBUG) console.log("[Step] extractDomainsFromText found:", domains.length, "domains");
  return domains;
}

// ---------------------
// Initialization
// ---------------------
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Step] Extension installed. Starting initial setup.");
  const merged = await mergeAndStore();
  await fetchAndStoreUGC_AI();
  scheduleDailyUpdate();
  console.log("[Step] Initial setup complete. Daily updates scheduled.");
});

function scheduleDailyUpdate() {
  chrome.alarms.create("dailyBlocklistRefresh", { when: getNextUTC115(), periodInMinutes: 24 * 60 });
  chrome.alarms.create("dailyUGCAICTERefresh", { when: getNextUTC115(), periodInMinutes: 24 * 60 });
  console.log("[Step] Alarms scheduled for daily refresh.");
}

function getNextUTC115() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 1, 15, 0));
  if (now >= next) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}

// ---------------------
// Alarm Listener
// ---------------------
chrome.alarms.onAlarm.addListener(async alarm => {
  if (DEBUG) console.log("[Step] Alarm triggered:", alarm.name);
  if (alarm.name === "dailyBlocklistRefresh") await mergeAndStore();
  if (alarm.name === "dailyUGCAICTERefresh") await fetchAndStoreUGC_AI();
});

// ---------------------
// Safe Notification
// ---------------------
function safeNotify(options) {
  try {
    if (chrome.notifications && chrome.notifications.create) {
      chrome.notifications.create(options);
      if (DEBUG) console.log("[Step] Notification sent:", options.title, "-", options.message);
    }
  } catch {
    if (DEBUG) console.log("[Step] Notification fallback:", options.title, "-", options.message);
  }
}

// ---------------------
// Fetch & Store UGC + AICTE
// ---------------------
async function fetchAndStoreUGC_AI() {
  try {
    const [ugcResp, aicteResp] = await Promise.allSettled([
      fetch(BLOCKLISTS_FOLDER + "ugc.json"),
      fetch(BLOCKLISTS_FOLDER + "aicte.json")
    ]);

    let ugcList = [], aicteList = [];
    if (ugcResp.status === "fulfilled" && ugcResp.value.ok) ugcList = await ugcResp.value.json();
    if (aicteResp.status === "fulfilled" && aicteResp.value.ok) aicteList = await aicteResp.value.json();
    await chrome.storage.local.set({ ugcList, aicteList });

    if (DEBUG) console.log(`[Step] UGC/AICTE fetched: ${ugcList.length} / ${aicteList.length}`);
  } catch (e) {
    console.error("[Step] Error fetching/storing UGC/AICTE:", e);
  }
}

// ---------------------
// Merge & Store Blocklist
// ---------------------
let lastNotificationSent = 0;
async function mergeAndStore() {
  try {
    const storage = await chrome.storage.local.get(["allowlist","customFeeds","customFeedURLs","customFiles"]);
    const normalized = new Map();
    const sourceCounts = {};

    // Merge remote blocklists
    try {
      const manifest = await (await fetch(BLOCKLISTS_FOLDER + "manifest.json")).json();
      for (const file of manifest.files || []) {
        try {
          const resp = await fetch(BLOCKLISTS_FOLDER + file.file);
          if (!resp.ok) continue;
          const data = await resp.json();
          const baseDomains = Array.isArray(data.domains)?data.domains:[];

          sourceCounts[file.source||file.file] = baseDomains.length;

          baseDomains.forEach(entry => {
            let key, severity="red";
            if (typeof entry==="string") key=entry.toLowerCase();
            else if (entry && entry.domain){ key=entry.domain.toLowerCase(); severity=entry.severity||"red"; }
            if (!key || TRUSTED_DOMAINS.includes(key) || !isDomain(key)) return;
            key = toASCII(key);
            if (!normalized.has(key)) normalized.set(key,{domain:key,severity,sources:[file.source||"remote"]});
            else {
              const existing = normalized.get(key);
              if (!existing.sources.includes(file.source)) existing.sources.push(file.source||"remote");
              if (severity==="red") existing.severity="red";
            }
          });
        } catch(e){ console.error("[Step] Error loading blocklist file:", file.file, e); }
      }
    } catch(e){ console.error("[Step] mergeAndStore blocklist merge error:", e); }

    // Custom feeds / URLs / files
    (storage.customFeeds||[]).forEach(d=>{
      const k = toASCII(String(d).toLowerCase());
      if(!TRUSTED_DOMAINS.includes(k) && isDomain(k)) normalized.set(k,{domain:k,severity:"red",sources:["custom"]});
    });
    for(const u of storage.customFeedURLs||[]){
      try{
        const r = await fetch(u);
        if(!r.ok) continue;
        extractDomainsFromText(await r.text()).forEach(d=>{
          const k = toASCII(d);
          if(!TRUSTED_DOMAINS.includes(k) && isDomain(k)) normalized.set(k,{domain:k,severity:"red",sources:["feedURL"]});
        });
      }catch(e){ console.error("[Step] Error fetching feedURL:",u,e); }
    }
    for(const key in storage.customFiles||{}){
      try{
        const file = storage.customFiles[key];
        if(file && file.text) extractDomainsFromText(file.text).forEach(d=>{
          const k = toASCII(d);
          if(!TRUSTED_DOMAINS.includes(k) && isDomain(k)) normalized.set(k,{domain:k,severity:"red",sources:["file"]});
        });
      }catch(e){ console.error("[Step] Error processing uploaded file:",key,e); }
    }

    // Remove allowlist/trusted
    (storage.allowlist||[]).concat(TRUSTED_DOMAINS).forEach(a=>{
      const na = toASCII(String(a).toLowerCase());
      Array.from(normalized.keys()).forEach(d=>{ if(d===na||d.endsWith("."+na)) normalized.delete(d); });
    });

    // Store in chunks (legacy local storage fallback)
    const merged = Array.from(normalized.values()).sort((a,b)=>a.domain.localeCompare(b.domain));
    let chunkSize=BASE_CHUNK_SIZE, success=false, chunkKeysToKeep=[];
    while(!success){
      const chunks={};
      for(let i=0;i<merged.length;i+=chunkSize){
        const key=`mergedBlocklistChunk${i/chunkSize}`;
        chunks[key]=merged.slice(i,i+chunkSize);
        chunkKeysToKeep.push(key);
      }
      try{ success=true; }
      catch(e){ chunkSize=Math.floor(chunkSize/2); if(chunkSize<100) success=true; }
    }

    // ✅ Store in IndexedDB (daily + master)
    await storeInIndexedDB(merged);

    // Notification
    const totalDomains = merged.length;
    const prevCount = (await chrome.storage.local.get("lastMergedCount")).lastMergedCount||0;
    const diff = totalDomains-prevCount;
    let message = `Blocklist refreshed. Total: ${totalDomains}`;
    if(diff>0) message+=` (Added: ${diff})`; else if(diff<0) message+=` (Removed: ${Math.abs(diff)})`;
    const now = Date.now();
    if(now - lastNotificationSent > 1000){
      chrome.runtime.sendMessage({type:"popupNotification",message},()=>{ if(chrome.runtime.lastError && DEBUG) console.log(chrome.runtime.lastError.message); });
      if(diff!==0) safeNotify({type:"basic",iconUrl:"icons/icon128.png",title:"Blocklist Updated",message});
      lastNotificationSent = now;
    }
    await chrome.storage.local.set({lastMergedCount:totalDomains});

    console.log("==== Blocklist Summary ====");
    for(const [src,count] of Object.entries(sourceCounts)) console.log(`${src}: ${count}`);
    console.log(`total merged Blocklists: ${totalDomains}`);
    console.log("===========================");

    return merged;

  }catch(e){ console.error("[Step] mergeAndStore error:", e); return []; }
}

// ---------------------
// Message Listener
// ---------------------
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  (async()=>{
    try{
      if(!msg||!msg.type) return;
      switch(msg.type){
        case "getBlocklist": {
          const allKeys = Object.keys(await chrome.storage.local.get());
          const chunkKeys = allKeys.filter(k=>k.startsWith("mergedBlocklistChunk"));
          const chunks = await chrome.storage.local.get(chunkKeys);
          const fullList = Object.values(chunks).flat();
          sendResponse(fullList);
          break;
        }
        case "refreshMerged": {
          const count = (await mergeAndStore()).length;
          sendResponse({ok:true,count});
          break;
        }
        case "addToAllowlist": {
          const storage = await chrome.storage.local.get("allowlist");
          const allowlist = storage.allowlist||[];
          if(!allowlist.includes(msg.domain)) allowlist.push(msg.domain);
          await chrome.storage.local.set({allowlist});
          await mergeAndStore();
          sendResponse({ok:true,allowlist});
          break;
        }
        case "dismissWarning":
  sendResponse({ ok: true });
  break;

case "getUGCAICTE": {
  const { ugcList, aicteList } = await chrome.storage.local.get(["ugcList", "aicteList"]);
  sendResponse({ ugcList, aicteList });
  break;
}

case "getMasterBlocklistCount": {
  const db = await openDB();
  const tx = db.transaction("master", "readonly");
  const store = tx.objectStore("master");

  const req = store.get("all");
  req.onsuccess = () => {
    sendResponse({ count: (req.result || []).length });
  };
  req.onerror = () => {
    sendResponse({ count: 0 });
  };
  break;
}

      }
    }catch(e){ console.error("[Step] Message handling error:", e); sendResponse({ok:false,error:e.message}); }
  })();
  return true;
});

// ---------------------
// IndexedDB for Blocklists (Daily + Master) with verification
// ---------------------
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("EduShieldBlocklists", 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("daily")) db.createObjectStore("daily");
      if (!db.objectStoreNames.contains("master")) db.createObjectStore("master");
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e);
  });
}

async function loadRuntimeFromMaster() {
  const db = await openDB();

  const masterList = await new Promise(resolve => {
    const tx = db.transaction("master", "readonly");
    const store = tx.objectStore("master");
    const req = store.get("all");
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });

  console.log("[Runtime] Rebuilding runtime from MASTER:", masterList.length);

  // Clear old runtime chunks
  const all = await chrome.storage.local.get(null);
  const oldChunks = Object.keys(all).filter(k =>
    k.startsWith("mergedBlocklistChunk")
  );
  if (oldChunks.length) {
    await chrome.storage.local.remove(oldChunks);
  }

  // Build new runtime chunks
  const chunks = {};
  for (let i = 0; i < masterList.length; i += BASE_CHUNK_SIZE) {
    chunks[`mergedBlocklistChunk${i / BASE_CHUNK_SIZE}`] =
      masterList.slice(i, i + BASE_CHUNK_SIZE);
  }

  await chrome.storage.local.set(chunks);
  console.log("[Runtime] MASTER runtime chunks ready");
}

async function storeInIndexedDB(merged) {
  const db = await openDB();
  const tx = db.transaction(["daily","master"], "readwrite");
  const dailyStore = tx.objectStore("daily");
  const masterStore = tx.objectStore("master");

  const today = new Date().toISOString().split("T")[0];

  // Save daily
  dailyStore.put(merged, today);

  // Merge into master
  const getMaster = masterStore.get("all");
  getMaster.onsuccess = () => {
    const existing = getMaster.result || [];
    const map = new Map(existing.map(e => [e.domain, e]));
    merged.forEach(e => {
      if (map.has(e.domain)) {
        const ex = map.get(e.domain);
        ex.sources = Array.from(new Set([...ex.sources, ...e.sources]));
        if (e.severity === "red") ex.severity = "red";
      } else {
        map.set(e.domain, e);
      }
    });
    masterStore.put(Array.from(map.values()), "all");
  };

  return new Promise(resolve => {
    tx.oncomplete = async () => {
      console.log(`[IndexedDB] Saved ${merged.length} domains`);

      // 🔥 ONLY HERE runtime rebuild happens
      await loadRuntimeFromMaster();

      resolve();
    };
  });
}
