// ================================
// EduShield Content Script - Manual UGC/AICTE + SPA-safe + Banner (IIFE)
// ================================

(() => {

    const SILENT_MODE=false;
    let bannerShown=false, lastMatches=[];

    async function safeGetStorage(key){ try{return (await chrome.storage.local.get(key))[key]; }catch{return null;} }
    function safeSetStorage(obj){ try{ chrome.storage.local.set(obj); }catch{} }

    function showWarning(matches){
      if(SILENT_MODE){ console.warn("[EduShield] Fake UGC/AICTE flagged"); return; }
      if(bannerShown) return;

      lastMatches=matches;
      const existingBanner=document.getElementById("edushield-banner"); if(existingBanner) existingBanner.remove();

      const banner=document.createElement("div");
      banner.id="edushield-banner";
      banner.style.position="fixed"; banner.style.top="-100px"; banner.style.left="0"; banner.style.width="100%";
      banner.style.zIndex="999999"; banner.style.padding="12px"; banner.style.textAlign="center";
      banner.style.fontFamily="Arial, sans-serif"; banner.style.color="white";
      banner.style.boxShadow="0 2px 6px rgba(0,0,0,0.3)"; banner.style.pointerEvents="auto"; 
      banner.style.opacity="0"; banner.style.transition="top 0.5s ease-out, opacity 0.5s ease-out";
      banner.style.backgroundColor="rgba(220,20,60,0.95)";
      banner.textContent="⚠️ Fake UGC/AICTE names flagged";

      const controls=document.createElement("span"); controls.style.marginLeft="15px"; controls.style.pointerEvents="auto";

      const btnMore=document.createElement("button"); btnMore.textContent="Learn More";
      btnMore.style.cssText=`margin-left:10px;padding:8px 15px;border:none;border-radius:5px;cursor:pointer;font-weight:bold;transition: opacity 0.2s;background:#007bff;color:white;`;
      btnMore.onclick=()=>showPopup(lastMatches);

      const btnDismiss=document.createElement("button"); btnDismiss.textContent="Dismiss";
      btnDismiss.style.cssText=`margin-left:10px;padding:8px 15px;border:none;border-radius:5px;cursor:pointer;font-weight:bold;transition: opacity 0.2s;background:#ff6600;color:white;`;
      btnDismiss.onclick=()=>{ slideOutBanner(banner); bannerShown=false; };

      controls.appendChild(btnMore); controls.appendChild(btnDismiss);
      banner.appendChild(controls); document.body.prepend(banner);
      requestAnimationFrame(()=>{ banner.style.top="0"; banner.style.opacity="1"; });
      bannerShown=true;
    }

    function slideOutBanner(banner){ banner.style.top="-100px"; banner.style.opacity="0"; banner.addEventListener("transitionend",()=>{ if(banner.parentNode) banner.parentNode.removeChild(banner); }); }

    function showPopup(matches){
      const popup=document.createElement("div"); popup.style.position="fixed"; popup.style.top="50%"; popup.style.left="50%";
      popup.style.transform="translate(-50%,-50%)"; popup.style.width="400px"; popup.style.height="300px"; popup.style.background="white";
      popup.style.color="black"; popup.style.zIndex="1000000"; popup.style.border="2px solid #333"; popup.style.borderRadius="8px";
      popup.style.boxShadow="0 4px 12px rgba(0,0,0,0.5)"; popup.style.padding="12px"; popup.style.overflowY="scroll";
      popup.style.fontFamily="Arial, sans-serif"; popup.style.fontSize="14px";

      const title=document.createElement("div"); title.textContent="Flagged UGC/AICTE Names (up to 300)";
      title.style.fontWeight="bold"; title.style.marginBottom="8px";
      const content=document.createElement("div");
      const safeMatches=Array.isArray(matches)?matches:Array.from(matches||[]);
      safeMatches.slice(0,300).forEach(m=>{ const div=document.createElement("div"); div.textContent=`${m.name} (${m.source})`; content.appendChild(div); });

      const btnClose=document.createElement("button"); btnClose.textContent="Close";
      btnClose.style.cssText=`margin-top:8px;padding:6px 12px;border:none;border-radius:5px;cursor:pointer;background:#ff6600;color:white;font-weight:bold;`;
      btnClose.onclick=()=>{ if(popup.parentNode) popup.parentNode.removeChild(popup); };

      popup.appendChild(title); popup.appendChild(content); popup.appendChild(btnClose);
      document.body.appendChild(popup);
    }

    function normalizeText(str){ return str?str.toLowerCase().replace(/[^\w\s]/g,'').trim():""; }

    let manualUGC=[], manualAICTE=[];
    async function loadManualLists(){
      try{
        const cached=await safeGetStorage("manualLists");
        if(cached){ manualUGC=cached.ugc||[]; manualAICTE=cached.aicte||[]; return; }

        const [ugcResp,aicteResp]=await Promise.all([
          fetch('https://raw.githubusercontent.com/Mohammedmarzuk17/EduShield/main/manual/manual_ugc.json'),
          fetch('https://raw.githubusercontent.com/Mohammedmarzuk17/EduShield/main/manual/manual_aicte.json')
        ]);

        manualUGC=await ugcResp.json()||[];
        manualAICTE=await aicteResp.json()||[];
        safeSetStorage({ manualLists:{ugc:manualUGC,aicte:manualAICTE} });
      }catch(e){ manualUGC=[]; manualAICTE=[]; console.error("Failed to load manual lists",e); }
    }

    function extractTextFromNode(node){
      let texts=[];
      if(node.nodeType===Node.TEXT_NODE && node.nodeValue.trim()) texts.push(node.nodeValue.trim());
      if(node.shadowRoot) texts.push(...extractTextFromNode(node.shadowRoot));
      node.childNodes.forEach(c=>texts.push(...extractTextFromNode(c)));
      return texts;
    }

    function getPageText(){ if(!document.body) return []; return extractTextFromNode(document.body).join("\n").split(/\n+/).map(s=>s.trim()).filter(Boolean); }

    function checkManualNames(pageText){
  const seen = new Set();
  const matches = [];

  pageText.forEach(line => {
    const normLine = normalizeText(line);

    manualUGC.forEach(item => {
      const name = item?.domain || item;
      if (!name) return;

      const key = normalizeText(name) + "|UGC";
      if (normLine.includes(normalizeText(name)) && !seen.has(key)) {
        seen.add(key);
        matches.push({ name, source: "UGC" });
      }
    });

    manualAICTE.forEach(item => {
      const name = item?.domain || item;
      if (!name) return;

      const key = normalizeText(name) + "|AICTE";
      if (normLine.includes(normalizeText(name)) && !seen.has(key)) {
        seen.add(key);
        matches.push({ name, source: "AICTE" });
      }
    });
  });

  return matches;
}


    async function checkUGCAICTE(){
      await loadManualLists();
      const bodyText=getPageText();
      const matches=checkManualNames(bodyText);
      console.log("UGC/AICTE matches found:",matches);
      if(matches.length) showWarning(matches);
    }

    // --- SPA observer
    (async()=>{
      checkUGCAICTE();
      let lastUrl=location.href;
      new MutationObserver(()=>{
        const url=location.href;
        if(url!==lastUrl){ lastUrl=url; checkUGCAICTE(); }
      }).observe(document,{subtree:true,childList:true});
    })();

})();
