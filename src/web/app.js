// ─── State ──────────────────────────────────────────
let figmaJson = "";
let generatedFiles = { html: "", scss: "", ts: "" };
let activeTab = "html";
let activeSource = "figma-url";

// Pipeline state (for Figma URL mode)
let pipelineScreens = []; // { name, id }[]
let selectedNodeId = "";

// Design system state
let dsFormat = "css";
let dsCssContent = "";

// ─── DOM Refs ───────────────────────────────────────
const $ = (id) => document.getElementById(id);

// Source tabs
const sourceTabs = document.querySelectorAll(".source-tab");
const figmaUrlPanel = $("figmaUrlPanel");
const jsonPastePanel = $("jsonPastePanel");

// Figma URL inputs
const figmaUrlInput = $("figmaUrlInput");
const figmaTokenInput = $("figmaTokenInput");
const fetchFileBtn = $("fetchFileBtn");

// Pipeline
const pipelineStatus = $("pipelineStatus");
const stepFetch = $("stepFetch");
const stepSelect = $("stepSelect");
const stepScreenshot = $("stepScreenshot");
const stepGenerate = $("stepGenerate");
const screenshotPreview = $("screenshotPreview");
const screenshotImg = $("screenshotImg");

// JSON inputs
const uploadZone = $("uploadZone");
const fileInput = $("fileInput");
const browseBtn = $("browseBtn");
const jsonInput = $("jsonInput");

// Shared
const screenGroup = $("screenGroup");
const screenSelect = $("screenSelect");
const aiToggle = $("aiToggle");
const generateBtn = $("generateBtn");

// Output
const codeTabs = $("codeTabs");
const emptyState = $("emptyState");
const codePanel = $("codePanel");
const codeContent = $("codeContent");
const componentNameEl = $("componentName");
const copyBtn = $("copyBtn");

// Design System
const designSystemBtn = $("designSystemBtn");
const formatToggle = $("formatToggle");
const designSystemResults = $("designSystemResults");
const dsSourceBadge = $("dsSourceBadge");
const dsStats = $("dsStats");
const dsCodeContent = $("dsCodeContent");
const dsCopyBtn = $("dsCopyBtn");
const dsDownloadBtn = $("dsDownloadBtn");

// ─── Token Persistence (sessionStorage) ─────────────
const TOKEN_KEY = "figma_pat";
(() => {
  const stored = sessionStorage.getItem(TOKEN_KEY);
  if (stored && figmaTokenInput) figmaTokenInput.value = stored;
})();

if (figmaTokenInput) {
  figmaTokenInput.addEventListener("input", () => {
    sessionStorage.setItem(TOKEN_KEY, figmaTokenInput.value);
  });
}

// ─── Source Tab Switching ────────────────────────────
sourceTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const source = tab.dataset.source;
    if (source === activeSource) return;
    activeSource = source;

    sourceTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    figmaUrlPanel.classList.toggle("active", source === "figma-url");
    jsonPastePanel.classList.toggle("active", source === "json-paste");

    // Reset screens when switching
    resetScreenSelector();
    updateGenerateBtn();
  });
});

// ─── Figma URL Pipeline ─────────────────────────────
fetchFileBtn.addEventListener("click", async () => {
  const url = figmaUrlInput.value.trim();
  const token = figmaTokenInput.value.trim();

  if (!url || !token) {
    showToast("Please enter both a Figma URL and access token.", "error");
    return;
  }

  // Show pipeline
  pipelineStatus.hidden = false;
  screenshotPreview.hidden = true;
  resetPipelineSteps();
  setStepState(stepFetch, "active");
  fetchFileBtn.classList.add("loading");
  fetchFileBtn.disabled = true;

  try {
    const res = await fetch("/api/fetch-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ figmaUrl: url, figmaToken: token }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    setStepState(stepFetch, "done");
    pipelineScreens = data.screens || [];

    if (pipelineScreens.length === 0) {
      showToast("No screens found in this file.", "error");
      setStepState(stepSelect, "error");
      return;
    }

    // Populate screen selector
    populateScreenSelector(pipelineScreens.map((s) => s.name));
    setStepState(stepSelect, "active");

    showToast(
      `Found ${pipelineScreens.length} screens in "${data.fileName}"`,
      "success",
    );

    // Enable design system button once we have a valid file
    designSystemBtn.disabled = false;
  } catch (err) {
    setStepState(stepFetch, "error");
    showToast(err.message, "error");
  } finally {
    fetchFileBtn.classList.remove("loading");
    fetchFileBtn.disabled = false;
  }
});

// ─── Screen Selection (handles both modes) ──────────
screenSelect.addEventListener("change", async () => {
  const selected = screenSelect.value;
  if (!selected) {
    generateBtn.disabled = true;
    return;
  }

  if (activeSource === "figma-url") {
    // Find the node ID for this screen name
    const screen = pipelineScreens.find((s) => s.name === selected);
    if (screen) {
      selectedNodeId = screen.id;

      // Load screenshot
      setStepState(stepSelect, "done");
      setStepState(stepScreenshot, "active");

      try {
        const res = await fetch("/api/screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            figmaUrl: figmaUrlInput.value.trim(),
            figmaToken: figmaTokenInput.value.trim(),
            nodeId: selectedNodeId,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (data.url) {
          screenshotImg.src = data.url;
          screenshotPreview.hidden = false;
        }

        setStepState(stepScreenshot, "done");
      } catch (err) {
        // Screenshot is non-blocking
        setStepState(stepScreenshot, "error");
        console.warn("Screenshot failed:", err.message);
      }
    }
  }

  generateBtn.disabled = false;
});

// ─── Upload / Paste (JSON mode) ─────────────────────
browseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("drag-over");
});
uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("drag-over");
});
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

async function handleFile(file) {
  try {
    const text = await file.text();
    jsonInput.value = text;
    figmaJson = text;
    uploadZone.classList.add("has-file");
    await loadScreensFromJson(text);
  } catch (err) {
    showToast("Failed to read file: " + err.message, "error");
  }
}

jsonInput.addEventListener("input", async () => {
  figmaJson = jsonInput.value;
  if (figmaJson.trim().length > 10) {
    await loadScreensFromJson(figmaJson);
  }
});

async function loadScreensFromJson(json) {
  try {
    const res = await fetch("/api/screens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    populateScreenSelector(data.screens);
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ─── Generate ───────────────────────────────────────
generateBtn.addEventListener("click", async () => {
  const screen = screenSelect.value;
  if (!screen) return;

  setLoading(true);

  try {
    let result;

    if (activeSource === "figma-url") {
      setStepState(stepGenerate, "active");

      const res = await fetch("/api/generate-from-figma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          figmaUrl: figmaUrlInput.value.trim(),
          figmaToken: figmaTokenInput.value.trim(),
          nodeId: selectedNodeId,
          screenName: screen,
          useAI: aiToggle.checked,
        }),
      });

      result = await res.json();
      if (!res.ok) throw new Error(result.error);

      setStepState(stepGenerate, "done");
    } else {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          json: figmaJson,
          screenName: screen,
          useAI: aiToggle.checked,
        }),
      });

      result = await res.json();
      if (!res.ok) throw new Error(result.error);
    }

    generatedFiles = result.files;
    componentNameEl.textContent = result.componentName;
    showCode();
    showToast("Component generated successfully!", "success");
  } catch (err) {
    if (activeSource === "figma-url") setStepState(stepGenerate, "error");
    showToast(err.message, "error");
  } finally {
    setLoading(false);
  }
});

// ─── Code Tabs ──────────────────────────────────────
document.querySelectorAll("#codeTabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    activeTab = tab.dataset.tab;
    document
      .querySelectorAll("#codeTabs .tab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    renderActiveTab();
  });
});

// ─── Copy ───────────────────────────────────────────
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(generatedFiles[activeTab] || "");
    copyBtn.classList.add("copied");
    copyBtn.querySelector("span").textContent = "Copied!";
    setTimeout(() => {
      copyBtn.classList.remove("copied");
      copyBtn.querySelector("span").textContent = "Copy";
    }, 2000);
  } catch {
    showToast("Copy failed", "error");
  }
});

// ─── Helpers ────────────────────────────────────────
function populateScreenSelector(names) {
  screenSelect.innerHTML = '<option value="">— Select a screen —</option>';
  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    screenSelect.appendChild(opt);
  }
  screenGroup.style.display = "";
}

function resetScreenSelector() {
  screenSelect.innerHTML = '<option value="">— Select a screen —</option>';
  screenGroup.style.display = "none";
  pipelineScreens = [];
  selectedNodeId = "";
  pipelineStatus.hidden = true;
  screenshotPreview.hidden = true;
  generateBtn.disabled = true;
  designSystemBtn.disabled = true;
}

function updateGenerateBtn() {
  generateBtn.disabled = !screenSelect.value;
}

function setLoading(on) {
  generateBtn.disabled = on;
  generateBtn.classList.toggle("loading", on);
  generateBtn.querySelector(".btn-spinner").hidden = !on;
}

function showCode() {
  emptyState.style.display = "none";
  codePanel.style.display = "";
  codeTabs.style.display = "";
  renderActiveTab();
}

function renderActiveTab() {
  codeContent.textContent = generatedFiles[activeTab] || "";
}

function resetPipelineSteps() {
  [stepFetch, stepSelect, stepScreenshot, stepGenerate].forEach((step) => {
    step.classList.remove("active", "done", "error");
  });
}

function setStepState(stepEl, state) {
  stepEl.classList.remove("active", "done", "error");
  stepEl.classList.add(state);
}

// ─── Toast ──────────────────────────────────────────
const toast = $("toast");
function showToast(message, type = "info") {
  toast.querySelector(".toast-message").textContent = message;
  toast.querySelector(".toast-icon").textContent = type === "error" ? "✕" : "✓";
  toast.className = `toast show ${type}`;
  toast.hidden = false;
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => (toast.hidden = true), 300);
  }, 4000);
}

// ─── Design System ──────────────────────────────────
designSystemBtn.addEventListener("click", async () => {
  const url = figmaUrlInput.value.trim();
  const token = figmaTokenInput.value.trim();

  if (!url || !token) {
    showToast("Please enter both a Figma URL and access token.", "error");
    return;
  }

  designSystemBtn.classList.add("loading");
  designSystemBtn.disabled = true;
  designSystemBtn.querySelector(".btn-spinner").hidden = false;

  try {
    const res = await fetch("/api/design-system", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        figmaUrl: url,
        figmaToken: token,
        format: dsFormat,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    dsCssContent = data.cssContent;
    showDesignSystemResults(data);
    showToast(
      `Design system extracted! (${data.stats.source} source)`,
      "success",
    );
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    designSystemBtn.classList.remove("loading");
    designSystemBtn.disabled = false;
    designSystemBtn.querySelector(".btn-spinner").hidden = true;
  }
});

function showDesignSystemResults(data) {
  // Show results panel, hide empty state and code
  emptyState.style.display = "none";
  codePanel.style.display = "none";
  codeTabs.style.display = "none";
  designSystemResults.style.display = "";
  formatToggle.hidden = false;

  // Source badge
  dsSourceBadge.textContent = data.stats.source;
  dsSourceBadge.className = `ds-source-badge ${data.stats.source}`;

  // Stats badges
  const statItems = [
    { label: "Colors", count: data.stats.colors, category: "colors" },
    {
      label: "Typography",
      count: data.stats.typography,
      category: "typography",
    },
    { label: "Spacing", count: data.stats.spacing, category: "spacing" },
    { label: "Radii", count: data.stats.radii, category: "radii" },
    { label: "Shadows", count: data.stats.shadows, category: "shadows" },
  ].filter((s) => s.count > 0);

  dsStats.innerHTML = statItems
    .map(
      (s) =>
        `<div class="ds-stat-badge">
      <span class="stat-dot ${s.category}"></span>
      <span class="stat-count">${s.count}</span>
      <span>${s.label}</span>
    </div>`,
    )
    .join("");

  // CSS content
  dsCodeContent.textContent = data.cssContent;
}

// Format toggle
document.querySelectorAll(".format-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const format = btn.dataset.format;
    if (format === dsFormat) return;

    dsFormat = format;
    document
      .querySelectorAll(".format-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    // Re-fetch with new format
    const url = figmaUrlInput.value.trim();
    const token = figmaTokenInput.value.trim();
    if (!url || !token) return;

    try {
      const res = await fetch("/api/design-system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ figmaUrl: url, figmaToken: token, format }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      dsCssContent = data.cssContent;
      dsCodeContent.textContent = data.cssContent;
    } catch (err) {
      showToast(err.message, "error");
    }
  });
});

// Copy design system CSS
dsCopyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(dsCssContent);
    dsCopyBtn.querySelector("span").textContent = "Copied!";
    setTimeout(() => {
      dsCopyBtn.querySelector("span").textContent = "Copy";
    }, 2000);
  } catch {
    showToast("Copy failed", "error");
  }
});

// Download design system CSS
dsDownloadBtn.addEventListener("click", () => {
  const ext = dsFormat === "scss" ? "scss" : "css";
  const blob = new Blob([dsCssContent], { type: "text/css" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `_design-system.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Downloaded _design-system.${ext}`, "success");
});
