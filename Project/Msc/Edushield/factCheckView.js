async function getFromStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

/* ============================= */
/* Enhanced Recursive Renderer */
/* ============================= */
function renderData(parent, data, depth = 0) {

  if (Array.isArray(data)) {
    const ul = document.createElement("ul");
    ul.style.marginLeft = "16px";
    ul.style.marginBottom = "8px";

    data.forEach(item => {
      const li = document.createElement("li");
      if (typeof item === "object") renderData(li, item, depth + 1);
      else li.textContent = item;
      ul.appendChild(li);
    });

    parent.appendChild(ul);
    return;
  }

  if (typeof data === "object" && data !== null) {
    Object.entries(data).forEach(([key, value]) => {

      const block = document.createElement("div");
      block.style.marginTop = "8px";
      block.style.paddingTop = "6px";
      block.style.borderTop = depth === 0 ? "1px dashed #ccc" : "none";

      const title = document.createElement("div");
      title.style.fontWeight = "600";

      if (key === "keyword") title.textContent = "🔑 Keyword Evidence";
      else if (key === "semantic") title.textContent = "🧠 Semantic Evidence";
      else title.textContent = key + ":";

      block.appendChild(title);
      renderData(block, value, depth + 1);
      parent.appendChild(block);
    });
    return;
  }

  const text = document.createElement("div");
  text.textContent = data;
  parent.appendChild(text);
}

/* ============================= */
/* DOM Ready */
/* ============================= */
document.addEventListener("DOMContentLoaded", async () => {
  const box = document.getElementById("resultBox");
  box.innerHTML = "⏳ Analyzing claims and evidence...";

  const waitForResult = (timeout = 8000) => {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(async () => {
        const data = await getFromStorage(["lastFactCheckResult"]);
        if (data.lastFactCheckResult) {
          clearInterval(interval);
          resolve(data.lastFactCheckResult.result || data.lastFactCheckResult);
        }
        if (Date.now() - start > timeout) {
          clearInterval(interval);
          reject();
        }
      }, 400);
    });
  };

  try {
    const result = await waitForResult();
    box.innerHTML = "";

    const labelMap = {
      "factual claim": { cls: "badge-factual", icon: "✅" },
      "opinion": { cls: "badge-opinion", icon: "💬" },
      "personal anecdote": { cls: "badge-opinion", icon: "🗣️" },
      "other": { cls: "badge-other", icon: "📌" },
      "AI-generated": { cls: "badge-ai", icon: "🤖" },
      "Human": { cls: "badge-human", icon: "👤" }
    };

    function addSection(title, content, isClaimCards = false) {
      const section = document.createElement("div");
      section.className = "section";

      const h3 = document.createElement("h3");
      h3.textContent = title;
      section.appendChild(h3);

      if (isClaimCards && Array.isArray(content)) {
        content.forEach(item => {
          const card = document.createElement("div");
          card.className = "card";

          const info = labelMap[item.label] || { cls: "badge-other", icon: "📄" };

          const header = document.createElement("div");
          header.style.display = "flex";
          header.style.alignItems = "center";
          header.style.marginBottom = "4px";

          const badge = document.createElement("span");
          badge.className = `badge ${info.cls}`;
          badge.textContent = `${info.icon} ${item.label || "Unknown"}`;
          header.appendChild(badge);

          if (item.score != null) {
            const score = document.createElement("span");
            score.className = "score";
            score.textContent = `Score: ${item.score.toFixed(3)}`;
            header.appendChild(score);
          }

          const text = document.createElement("div");
          text.className = "card-text";
          text.textContent = item.text || "";

          card.appendChild(header);
          card.appendChild(text);
          section.appendChild(card);
        });
      } else {
        renderData(section, content);
      }

      box.appendChild(section);
    }

    /* Progressive render */
    const sections = [
      ["Claims", result.claims, true],
      ["Claims AI Detection", result.claims_ai_detection, true],
      ["Claims Fact-Checking", result.claims_fact_checking, false],
      ["Full Text Analysis", result.full_text, false]
    ];

    let i = 0;
    function renderNext() {
      if (i >= sections.length) return;
      const [title, content, isClaims] = sections[i++];
      if (content) addSection(title, content, isClaims);
      setTimeout(renderNext, 50);
    }
    renderNext();

  } catch {
    box.innerHTML = "⚠️ Fact-check results not available. Please try again.";
  }
});
