(async () => {
  const all = await chrome.storage.local.get(null);

  const chunkKeys = Object.keys(all)
    .filter(k => k.startsWith("mergedBlocklistChunk"))
    .sort();

  const runtimeList = chunkKeys.flatMap(k => all[k] || []);

  console.log("🔍 RUNTIME BLOCKLIST VERIFICATION");
  console.log("Chunks found:", chunkKeys.length);
  console.log("Runtime blocklist size:", runtimeList.length);

  // Compare with IndexedDB master
  const db = await new Promise(resolve => {
    const req = indexedDB.open("EduShieldBlocklists", 1);
    req.onsuccess = e => resolve(e.target.result);
  });

  const masterList = await new Promise(resolve => {
    const tx = db.transaction("master", "readonly");
    const store = tx.objectStore("master");
    const req = store.get("all");
    req.onsuccess = () => resolve(req.result || []);
  });

  console.log("Master blocklist size:", masterList.length);

  if (runtimeList.length === masterList.length) {
    console.log("✅ RESULT: MASTER blocklist is ACTIVE at runtime");
  } else {
    console.log("⚠️ RESULT: DAILY blocklist is ACTIVE at runtime");
  }
})();
