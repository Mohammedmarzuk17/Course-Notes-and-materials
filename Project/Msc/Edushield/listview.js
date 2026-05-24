// ================================
// EduShield ListView JS - Animations + Labels
// ================================
function getFromStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function setToStorage(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

const params = new URLSearchParams(window.location.search);
const type = params.get("type");
const listTitle = document.getElementById("listTitle");
const listContainer = document.getElementById("listContainer");
const backBtn = document.getElementById("backBtn");

let storageKey = type;

// Label adjustments based on type
if (type === "allowlist") listTitle.textContent = "Allowlist (Trusted Sites)";
if (type === "customFeeds") listTitle.textContent = "Custom Feeds (Local Files)";
if (type === "customFeedURLs") listTitle.textContent = "Feed URLs";

// Animate items
function animateListItem(itemEl, action = "add") {
  if (action === "add") {
    itemEl.style.opacity = 0;
    itemEl.style.transform = "translateY(-10px)";
    requestAnimationFrame(() => {
      itemEl.style.transition = "all 0.3s ease";
      itemEl.style.opacity = 1;
      itemEl.style.transform = "translateY(0)";
    });
  } else if (action === "remove") {
    itemEl.style.transition = "all 0.25s ease";
    itemEl.style.opacity = 0;
    itemEl.style.transform = "translateX(20px)";
    setTimeout(() => itemEl.remove(), 250);
  }
}

// Render the list
async function renderList() {
  const data = await getFromStorage([storageKey]);
  const list = data[storageKey] || [];
  listContainer.innerHTML = "";

  list.forEach((item, i) => {
    const li = document.createElement("li");
    
    // Display URL/file hint for clarity
    if (type === "customFeeds") li.textContent = `${item} (file)`;
    else if (type === "customFeedURLs") li.textContent = `${item} (URL)`;
    else li.textContent = item;

    // Delete button
    const delBtn = document.createElement("button");
    delBtn.className = "trash-btn";
    delBtn.innerHTML = "🗑";
    delBtn.onclick = async () => {
      list.splice(i, 1);
      await setToStorage({ [storageKey]: list });
      animateListItem(li, "remove");
    };

    li.appendChild(delBtn);
    listContainer.appendChild(li);
    animateListItem(li, "add");
  });
}

// Back button
backBtn.addEventListener("click", () => window.close());

// Init
renderList();
