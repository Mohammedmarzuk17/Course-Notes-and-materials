// ================================
// EduShield Content Script MV3 - Reliable Blocklist + SPA-safe + Banner + Retry + IndexedDB Master
// ================================

(() => {

  // --- Safe helpers
  async function safeGetStorage(key) {
    try {
      if (!chrome.runtime?.id) return null;
      const res = await chrome.storage.local.get(key);
      return res[key];
    } catch (e) {
      if (String(e).includes("Extension context invalidated")) return null;
      console.error("[Blocklist] safeGetStorage error:", e);
      return null;
    }
  }

  function safeSetStorage(obj) {
    try {
      if (!chrome.runtime?.id) return;
      chrome.storage.local.set(obj);
    } catch (e) {
      if (!String(e).includes("Extension context invalidated")) console.error("[Blocklist] safeSetStorage error:", e);
    }
  }

  function safeSendMessage(msg, timeout = 15000) {
    return new Promise(resolve => {
      let resolved = false;
      if (!chrome.runtime?.id) return resolve([]);

      try {
        chrome.runtime.sendMessage(msg, response => {
          if (resolved) return;
          resolved = true;
          resolve(response || []);
        });
      } catch {
        if (!resolved) { resolved = true; resolve([]); }
      }

      setTimeout(() => { if (!resolved) { resolved = true; resolve([]); } }, timeout);
    });
  }

  // --- Domain helpers
  function normalizeDomain(d){ return d ? d.toLowerCase() : ""; }
  function extractHostPort(url){
    try { return new URL(url).hostname.toLowerCase(); } 
    catch(e){ console.error("[Blocklist] extractHostPort error:", e); return null; }
  }

  function similarity(s1,s2){
    if(!s1||!s2) return 0;
    s1=s1.toLowerCase(); s2=s2.toLowerCase();
    const longer = s1.length>s2.length?s1:s2;
    const shorter = s1.length>s2.length?s2:s1;
    if(longer.length===0) return 1.0;
    const matrix=[]; 
    for(let i=0;i<=shorter.length;i++) matrix[i]=[i];
    for(let j=0;j<=longer.length;j++) matrix[0][j]=j;
    for(let i=1;i<=shorter.length;i++){
      for(let j=1;j<=longer.length;j++){
        matrix[i][j] = shorter[i-1]===longer[j-1]
          ? matrix[i-1][j-1]
          : Math.min(matrix[i-1][j-1]+1, matrix[i][j-1]+1, matrix[i-1][j]+1);
      }
    }
    return (longer.length - matrix[shorter.length][longer.length])/longer.length;
  }

  // --- IndexedDB master blocklist helpers
  let dbPromise = null;
  function openMasterDB() {
    if(dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("EduShieldMasterBlocklist", 1);
      req.onupgradeneeded = event => {
        const db = event.target.result;
        if(!db.objectStoreNames.contains("masterBlocklist")) {
          db.createObjectStore("masterBlocklist", { keyPath: "domain" });
        }
      };
      req.onsuccess = event => resolve(event.target.result);
      req.onerror = event => reject(event.target.error);
    });
    return dbPromise;
  }

  async function getMasterBlocklist() {
    try {
      const db = await openMasterDB();
      return new Promise(resolve => {
        const tx = db.transaction("masterBlocklist","readonly");
        const store = tx.objectStore("masterBlocklist");
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });
    } catch(e){ console.error("[Blocklist] getMasterBlocklist error:", e); return []; }
  }

  // --- Banner
  let blocklistBannerShown = false;
  function showBlocklistWarning(entry,severity,contentMatches=[]){
    if(!entry || blocklistBannerShown) return;

    // --- SPA-safe: wait until document.body exists
    if(!document.body){
      setTimeout(()=>showBlocklistWarning(entry,severity,contentMatches),100);
      return;
    }

    const domain = typeof entry==="string"?entry:entry.domain;
    if(!domain) return;
    const sources = entry.sources || ["unknown"];

    const banner=document.createElement("div");
    banner.id="edushield-blocklist-banner";

    // Safe-check banner
    if(!banner) return;

    banner.style.position="fixed"; banner.style.top="-100px"; banner.style.left="0"; banner.style.width="100%";
    banner.style.zIndex="999999"; banner.style.padding="12px"; banner.style.textAlign="center";
    banner.style.fontFamily="Arial, sans-serif"; banner.style.color="white";
    banner.style.boxShadow="0 2px 6px rgba(0,0,0,0.3)";
    banner.style.pointerEvents="none"; 
    banner.style.opacity="0"; banner.style.transition="top 0.5s ease-out, opacity 0.5s ease-out";
    banner.style.backgroundColor =
      severity==="red" ? "rgba(220,20,60,0.95)" :
      severity==="orange" ? "rgba(255,140,0,0.95)" :
      "rgba(255,165,0,0.95)";
    banner.textContent =
      severity==="red" ? `⚠️ WARNING: ${domain} is a confirmed malicious site.` :
      severity==="orange" ? `⚠️ CAUTION: ${domain} looks suspicious.` :
      `🤖 Possibly unsafe: ${domain}`;

    const controls = document.createElement("span"); 
    controls.style.marginLeft="15px"; controls.style.pointerEvents="auto";
    const buttonStyle="margin-left:10px;padding:8px 15px;border:none;border-radius:5px;cursor:pointer;font-weight:bold;transition: opacity 0.2s;";

    const btnLearn=document.createElement("button");
    btnLearn.textContent="Learn More";
    btnLearn.style.cssText=buttonStyle+"background:#007bff;color:white;";
    btnLearn.onclick=()=>{ 
      let msg=`⚠️ ${domain} flagged.`;
      if((entry.sources && entry.sources.includes("heuristic")) || severity==="red") msg+=" Classified as Malicious."; 
      else msg+=" Content may be risky."; 
      msg+="\n\nReported by sources:\n- "+(sources.join("\n- "));
      if(contentMatches.length) msg+="\n\nContent flags detected:\n- "+contentMatches.join("\n- ");
      alert(msg);
    };

    const btnDismiss=document.createElement("button");
    btnDismiss.textContent="Dismiss";
    btnDismiss.style.cssText=buttonStyle+"background:#ff6600;color:white;";
    btnDismiss.onclick=()=>{ slideOutBanner(banner); blocklistBannerShown=false; };

    const btnAllow=document.createElement("button");
    btnAllow.textContent="Allow";
    btnAllow.style.cssText=buttonStyle+"background:#28a745;color:white;";
    btnAllow.onclick = async () => {
  try {
    const currentUrl = domain;

    // --- Instant UI response ---
    slideOutBanner(banner);
    blocklistBannerShown = false;

    // --- Background async update ---
    (async () => {
      try {
        const { allowlist = [] } = await chrome.storage.local.get("allowlist");
        if (!allowlist.includes(currentUrl)) {
          allowlist.push(currentUrl);
          await chrome.storage.local.set({ allowlist });
          await safeSendMessage({ type: "addToAllowlist", domain: currentUrl });
        }
        console.log(`[EduShield] ${currentUrl} added to allowlist.`);
      } catch (err) {
        console.warn("[EduShield] Allowlist update failed:", err);
      }
    })();

    // --- Optional quick visual confirmation (instant, not blocking) ---
    setTimeout(() => {
      alert(`✅ ${currentUrl} added to allowlist.`);
    }, 200);

  } catch (err) {
    console.error("[EduShield] Allow button error:", err);
  }
};


    controls.appendChild(btnLearn); controls.appendChild(btnDismiss); controls.appendChild(btnAllow);
    banner.appendChild(controls);
    document.body.prepend(banner);
    requestAnimationFrame(()=>{ banner.style.top="0"; banner.style.opacity="1"; });
    blocklistBannerShown=true;
  }

  function slideOutBanner(banner){
    banner.style.top="-100px"; banner.style.opacity="0";
    banner.addEventListener("transitionend",()=>{ if(banner.parentNode) banner.parentNode.removeChild(banner); });
  }

  // --- Domain Check
  let checkDomainPending=false;
  async function checkDomain(){
    if(checkDomainPending) return;
    checkDomainPending=true;
    try{
      const current=normalizeDomain(extractHostPort(window.location.href));
      if(!current) return;

      const allowlist=await safeGetStorage("allowlist")||[];
      const trustedDomains = [
  "github.com",
  "gist.github.com",
  "raw.githubusercontent.com",
  "chrome.google.com",
  "www.google.com",
  "google.com",
  "google.accounts.com",
  "www.stackoverflow.com",
  "huggingface.co",
  "api.huggingface.co",
  "hf.space",

  // --- Blocklist & Threat Intelligence Sources ---
  "urlhaus.abuse.ch",
  "openphish.com",
  "phishtank.org",
  "phishtank.com",
  "phishing.army",
  "threatfox.abuse.ch"
];





      if(allowlist.some(d=>current.endsWith(normalizeDomain(d))) || trustedDomains.some(d=>current.endsWith(normalizeDomain(d)))) return;

      // --- Fetch both IndexedDB master + local chunks
      let masterList = await getMasterBlocklist();
      let localList = [];
      for(let i=0;i<20;i++){
        localList=await safeSendMessage({type:"getBlocklist"},15000)||[];
        if(localList.length>0) break;
        await new Promise(r=>setTimeout(r,500));
      }
      const blocklist = [...masterList,...localList];

      if(!blocklist.length){ setTimeout(checkDomain,5000); return; }

      let matchedEntry=null;
      const threshold=0.8;
      for(const entry of blocklist){
        const domainEntry=typeof entry==="string"?{domain:entry,severity:"red",sources:["unknown"]}:entry;
        const entryDomain=normalizeDomain(domainEntry.domain);
        if(current===entryDomain || current.endsWith("."+entryDomain)){
          matchedEntry=domainEntry; break;
        }
        if(similarity(current,entryDomain)>=threshold){
          matchedEntry={...domainEntry,sources:[...(domainEntry.sources||[]),"fuzzy"]}; break;
        }
      }
      if(matchedEntry) showBlocklistWarning(matchedEntry,matchedEntry.severity||"orange",[]);
    }catch(e){ console.error("[Blocklist] checkDomain error:", e); }
    finally{ checkDomainPending=false; }
  }

  // --- SPA-safe observer
  (async()=>{
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',checkDomain);
    else checkDomain();

    let lastUrl=location.href;
    let debounceTimer;
    new MutationObserver(()=>{
      clearTimeout(debounceTimer);
      debounceTimer=setTimeout(()=>{
        const url=location.href;
        if(url!==lastUrl){ lastUrl=url; checkDomain(); }
      },500);
    }).observe(document,{subtree:true,childList:true});
  })();

})();
