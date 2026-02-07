const request = indexedDB.open("EduShieldBlocklists", 1);

request.onsuccess = async (event) => {
  const db = event.target.result;

  // Daily counts per date
  const txDaily = db.transaction("daily", "readonly");
  const dailyStore = txDaily.objectStore("daily");
  const dailyCounts = {};
  dailyStore.openCursor().onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      dailyCounts[cursor.key] = cursor.value.length;
      cursor.continue();
    } else {
      console.log("[IndexedDB] Daily blocklist counts per day:", dailyCounts);
    }
  };

  // Master count
  const txMaster = db.transaction("master", "readonly");
  const masterStore = txMaster.objectStore("master");
  const getMaster = masterStore.get("all");
  getMaster.onsuccess = () => {
    const masterList = getMaster.result || [];
    console.log("[IndexedDB] Master blocklist total entries:", masterList.length);
  };
};

request.onerror = (e) => console.error("IndexedDB open error:", e);
