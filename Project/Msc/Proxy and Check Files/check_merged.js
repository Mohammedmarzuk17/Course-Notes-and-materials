void (async function verifyBlocklistJoin() {
  console.log("🔍 Starting IndexedDB verification...");

  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // Open DB with retries
  let db;
  for (let i = 0; i < 5; i++) {
    try {
      db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("EduShieldBlocklists", 1);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e);
      });
      if (db) break;
    } catch (e) {}
    await wait(500);
  }

  if (!db) return console.error("❌ Could not open IndexedDB");

  // Get master list domains only
  const masterDomains = await new Promise((resolve, reject) => {
    const txMaster = db.transaction("master", "readonly");
    const masterStore = txMaster.objectStore("master");
    const req = masterStore.get("all");
    req.onsuccess = () => {
      const data = req.result || [];
      const domains = new Set(data.map(item => item.domain)); // <-- only domain strings
      resolve(domains);
    };
    req.onerror = () => reject("Failed to get master list");
  });

  // Now create a fresh transaction for daily
  const missingDomains = [];
  const txDaily = db.transaction("daily", "readonly");
  const dailyStore = txDaily.objectStore("daily");
  const dailyKeys = await new Promise((resolve, reject) => {
    const req = dailyStore.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject("Failed to get daily keys");
  });

  if (!dailyKeys.length) return console.log("⚠️ No daily blocklists found.");

  let checked = 0;
  for (const key of dailyKeys) {
    const list = await new Promise((resolve, reject) => {
      const tx = db.transaction("daily", "readonly");
      const store = tx.objectStore("daily");
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    for (const item of list) {
      const domain = typeof item === "string" ? item : item.domain;
      if (!masterDomains.has(domain)) missingDomains.push(domain);
    }

    checked++;
    console.log(`Progress: checked ${checked}/${dailyKeys.length} daily lists...`);
  }

  console.log("✅ Verification complete.");
  console.log(
    `✅ Verified join: ${
      missingDomains.length === 0 ? "All daily domains merged" : "Missing domains found!"
    }`
  );
  console.log("Missing domains count:", missingDomains.length);
  if (missingDomains.length) console.log("Sample missing:", missingDomains.slice(0, 50));
})();
