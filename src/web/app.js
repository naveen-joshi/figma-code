// ── State ──────────────────────────────────────────────
let activeSource = "figma-url";
let selectedFramework = "angular";
let generatedFiles = {}; // latest generated code per file type
let currentTab = "html";
let dsOutputFormat = "css";
let cachedDesignSystemCSS = "";
let cachedDesignSystemSCSS = "";
let editor = null; // CodeMirror instance
let editorDebounce = null;

// ── DOM References ─────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// Input elements
const figmaUrlInput = $("#figmaUrlInput");
const figmaTokenInput = $("#figmaTokenInput");
const fetchFileBtn = $("#fetchFileBtn");
const jsonInput = $("#jsonInput");
const screenSelect = $("#screenSelect");
const screenGroup = $("#screenGroup");
const aiToggle = $("#aiToggle");
const generateBtn = $("#generateBtn");
const designSystemBtn = $("#designSystemBtn");

// Output elements
const codeTabs = $("#codeTabs");
const codePanel = $("#codePanel");
const emptyState = $("#emptyState");
const componentName = $("#componentName");
const copyBtn = $("#copyBtn");
const previewPanel = $("#previewPanel");
const previewFrame = $("#previewFrame");
const iteratePanel = $("#iteratePanel");
const iterateInput = $("#iterateInput");
const iterateBtn = $("#iterateBtn");

// Console elements
const consolePanel = $("#consolePanel");
const consoleOutput = $("#consoleOutput");
const consoleClearBtn = $("#consoleClearBtn");

// Pipeline UI
const pipelineStatus = $("#pipelineStatus");
const screenshotPreview = $("#screenshotPreview");
const screenshotImg = $("#screenshotImg");

// ── Token Persistence ──────────────────────────────────
const TOKEN_KEY = "figma_pat";
const saved = sessionStorage.getItem(TOKEN_KEY);
if (saved) figmaTokenInput.value = saved;
figmaTokenInput.addEventListener("input", () => {
  sessionStorage.setItem(TOKEN_KEY, figmaTokenInput.value.trim());
});

// ── Framework Selector ─────────────────────────────────
$$(".fw-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    $$(".fw-pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    selectedFramework = pill.dataset.framework;
    updateTabsForFramework();
    // Reset output when switching framework
    if (Object.keys(generatedFiles).length > 0) {
      switchToFirstTab();
    }
  });
});

function updateTabsForFramework() {
  const tabs = codeTabs.querySelectorAll(".tab:not(.tab-preview)");
  tabs.forEach((t) => t.remove());

  const previewTab = codeTabs.querySelector(".tab-preview");

  if (selectedFramework === "react") {
    const tsxTab = createTab("tsx", "TSX");
    const cssTab = createTab("css", "CSS");
    codeTabs.insertBefore(tsxTab, previewTab);
    codeTabs.insertBefore(cssTab, previewTab);
  } else {
    const htmlTab = createTab("html", "HTML");
    const scssTab = createTab("scss", "SCSS");
    const tsTab = createTab("ts", "TypeScript");
    codeTabs.insertBefore(htmlTab, previewTab);
    codeTabs.insertBefore(scssTab, previewTab);
    codeTabs.insertBefore(tsTab, previewTab);
  }
}

function createTab(key, label) {
  const btn = document.createElement("button");
  btn.className = "tab";
  btn.dataset.tab = key;
  btn.textContent = label;
  btn.addEventListener("click", () => switchTab(key));
  return btn;
}

function switchToFirstTab() {
  const firstTab = selectedFramework === "react" ? "tsx" : "html";
  switchTab(firstTab);
}

// ── Source Tabs ─────────────────────────────────────────
$$(".source-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".source-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    activeSource = tab.dataset.source;

    $$("#figmaUrlPanel").forEach(
      (p) => (p.style.display = activeSource === "figma-url" ? "" : "none"),
    );
    $$("#jsonPastePanel").forEach(
      (p) => (p.style.display = activeSource === "json-paste" ? "" : "none"),
    );

    $$(".source-panel").forEach((p) => p.classList.remove("active"));
    if (activeSource === "figma-url") {
      $("#figmaUrlPanel").classList.add("active");
    } else {
      $("#jsonPastePanel").classList.add("active");
    }

    updateGenerateButton();
  });
});

// ── Enable/disable generate button ─────────────────────
function updateGenerateButton() {
  if (activeSource === "figma-url") {
    generateBtn.disabled = !screenSelect.value;
    designSystemBtn.disabled = !(
      figmaUrlInput.value.trim() && figmaTokenInput.value.trim()
    );
  } else {
    generateBtn.disabled = !(jsonInput.value.trim() && screenSelect.value);
    designSystemBtn.disabled = true;
  }
}

figmaUrlInput.addEventListener("input", updateGenerateButton);
figmaTokenInput.addEventListener("input", updateGenerateButton);
jsonInput.addEventListener("input", () => {
  tryParseScreens(jsonInput.value);
  updateGenerateButton();
});
screenSelect.addEventListener("change", updateGenerateButton);

// ── File Upload / Drop ─────────────────────────────────
const uploadZone = $("#uploadZone");
const fileInput = $("#fileInput");
const browseBtn = $("#browseBtn");

browseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) readFile(fileInput.files[0]);
});

uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("drag-over");
});
uploadZone.addEventListener("dragleave", () =>
  uploadZone.classList.remove("drag-over"),
);
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
});

function readFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    jsonInput.value = reader.result;
    tryParseScreens(reader.result);
    updateGenerateButton();
    showToast("success", `Loaded ${file.name}`);
  };
  reader.readAsText(file);
}

// ── Parse screens from JSON ────────────────────────────
let parseTimer;
function tryParseScreens(raw) {
  clearTimeout(parseTimer);
  if (!raw.trim()) return;

  parseTimer = setTimeout(() => {
    try {
      const data = JSON.parse(raw);
      const root = data.document || data;
      const names = collectFrameNames(root);

      if (names.length === 0) {
        showToast("error", "Valid JSON, but no frames/components found.");
      } else {
        showToast("success", `Found ${names.length} screens from JSON.`);
      }

      populateScreenSelect(names);
    } catch {
      // ignore parse errors while typing
    }
  }, 500);
}

function collectFrameNames(node, list = []) {
  if (["FRAME", "COMPONENT", "COMPONENT_SET", "SECTION"].includes(node.type)) {
    list.push(node.name);
  }
  if (node.children) {
    for (const child of node.children) collectFrameNames(child, list);
  }
  return list;
}

function populateScreenSelect(names) {
  screenSelect.innerHTML = '<option value="">— Select a screen —</option>';
  const uniqueNames = [...new Set(names)]; // deduplicate

  for (const name of uniqueNames) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    screenSelect.appendChild(opt);
  }

  if (uniqueNames.length > 0) {
    screenGroup.style.display = "";
    screenSelect.value = uniqueNames[0];
  } else {
    screenGroup.style.display = "none";
  }
  updateGenerateButton();
}

// ── Fetch Figma file ───────────────────────────────────
fetchFileBtn.addEventListener("click", async () => {
  const url = figmaUrlInput.value.trim();
  const token = figmaTokenInput.value.trim();
  if (!url || !token)
    return showToast("error", "Please enter a Figma URL and token.");

  setButtonLoading(fetchFileBtn, true);
  showPipelineStep("fetch");

  try {
    const res = await fetch("/api/list-screens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ figmaUrl: url, figmaToken: token }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    completePipelineStep("fetch");
    showPipelineStep("select");

    populateScreenSelect(data.screens);
    showToast("success", `Found ${data.screens.length} screens`);
  } catch (err) {
    failPipelineStep("fetch");
    showToast("error", err.message);
  } finally {
    setButtonLoading(fetchFileBtn, false);
  }
});

// ── Generate ───────────────────────────────────────────
generateBtn.addEventListener("click", async () => {
  const screenName = screenSelect.value;
  if (!screenName) return showToast("error", "Please select a screen.");

  setButtonLoading(generateBtn, true);
  showPipelineStep("generate");

  try {
    let res;
    if (activeSource === "figma-url") {
      res = await fetch("/api/generate-from-figma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          figmaUrl: figmaUrlInput.value.trim(),
          figmaToken: figmaTokenInput.value.trim(),
          screenName,
          useAI: aiToggle.checked,
          framework: selectedFramework,
        }),
      });
    } else {
      res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          json: jsonInput.value,
          screenName,
          useAI: aiToggle.checked,
          framework: selectedFramework,
        }),
      });
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    completePipelineStep("generate");
    displayGeneratedCode(data);
    showToast(
      "success",
      `Generated ${data.componentName} (${selectedFramework})`,
    );
  } catch (err) {
    failPipelineStep("generate");
    showToast("error", err.message);
  } finally {
    setButtonLoading(generateBtn, false);
  }
});

// ── Display Generated Code ─────────────────────────────
function displayGeneratedCode(data) {
  generatedFiles = data.files;
  componentName.textContent = data.componentName;

  // Update tabs for framework
  updateTabsForFramework();

  // Show the code panels
  emptyState.style.display = "none";
  codePanel.style.display = "";
  codeTabs.style.display = "";
  iteratePanel.style.display = "";

  // Switch to first tab
  switchToFirstTab();
}

// ── CodeMirror Editor ──────────────────────────────────
function initEditor() {
  if (editor) return; // Already initialized

  const container = document.getElementById("editorContainer");
  editor = CodeMirror(container, {
    lineNumbers: true,
    theme: "dracula",
    mode: "htmlmixed",
    readOnly: false,
    tabSize: 2,
  });

  // Editor change handler (debounced)
  editor.on("change", () => {
    if (currentTab === "preview") return;

    // Update generatedFiles with edit
    generatedFiles[currentTab] = editor.getValue();

    // Trigger re-render if needed
    // Note: Live re-render for preview tab handled when switching back
  });
}

// ── Tab Switching ──────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  codeTabs
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.remove("active"));
  const activeTabBtn = codeTabs.querySelector(`[data-tab="${tab}"]`);
  if (activeTabBtn) activeTabBtn.classList.add("active");

  if (tab === "preview") {
    codePanel.style.display = "none";
    previewPanel.style.display = "";
    initConsole(); // Clear/ready console
    renderPreview();
  } else {
    codePanel.style.display = "";
    previewPanel.style.display = "none";

    // Ensure editor is initialized (lazy init)
    initEditor();

    // Set mode and content based on tab
    let mode = "htmlmixed";
    if (tab === "ts" || tab === "tsx") mode = "jsx";
    if (tab === "css" || tab === "scss") mode = "css";

    editor.setOption("mode", mode);
    editor.setValue(generatedFiles[tab] || "// No content");

    // Allow UI update
    setTimeout(() => editor.refresh(), 0);
  }
}

// Attach click events for dynamically-created tabs
codeTabs.addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (tab && tab.dataset.tab) {
    switchTab(tab.dataset.tab);
  }
});

// ── Live Preview Rendering ─────────────────────────────
function renderPreview() {
  let html = "";
  let css = "";

  if (selectedFramework === "react") {
    // Extract JSX body from TSX for static preview
    const tsx = generatedFiles.tsx || "";
    css = generatedFiles.css || "";
    html = extractJsxBody(tsx);
  } else {
    html = generatedFiles.html || "";
    css = (generatedFiles.scss || "").replace(/\$[\w-]+:\s*[^;]+;/g, ""); // strip SCSS variables
  }

  // Inject console capture script
  const consoleScript = `
    <script>
      (function() {
        const _log = console.log;
        const _warn = console.warn;
        const _error = console.error;
        const _info = console.info;

        function notify(type, args) {
          try {
            const msg = Array.from(args).map(a => 
              typeof a === 'object' ? JSON.stringify(a) : String(a)
            ).join(' ');
            window.parent.postMessage({ type: 'console', level: type, message: msg }, '*');
          } catch(e) {}
        }

        console.log = function(...args) { notify('log', args); _log.apply(console, args); };
        console.warn = function(...args) { notify('warn', args); _warn.apply(console, args); };
        console.error = function(...args) { notify('error', args); _error.apply(console, args); };
        console.info = function(...args) { notify('info', args); _info.apply(console, args); };

        window.onerror = function(msg, source, line, col, error) {
          notify('error', [\`Error: \${msg} (\${line}:\${col})\`]);
        };
      })();
    </script>
  `;

  const doc = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px; background: #fff; }
    ${css}
  </style>
  ${consoleScript}
</head>
<body>${html}</body>
</html>`;

  previewFrame.srcdoc = doc;
}

function extractJsxBody(tsx) {
  // Try to find the return statement's JSX
  const returnMatch = tsx.match(/return\s*\(\s*([\s\S]*?)\s*\)\s*;?\s*}/);
  if (returnMatch) {
    let jsx = returnMatch[1];
    // Convert className to class for HTML preview
    jsx = jsx.replace(/className=\{styles\.(\w+)\}/g, 'class="$1"');
    jsx = jsx.replace(/className="([^"]+)"/g, 'class="$1"');
    // Remove self-closing React-specific patterns
    jsx = jsx.replace(/\{\/\*.*?\*\/\}/g, "");
    return jsx;
  }
  return "<p>Preview not available for this component.</p>";
}

// ── Preview Viewport Buttons ──────────────────────────
$$(".viewport-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".viewport-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const wrapper = $(".preview-frame-wrapper");
    wrapper.style.maxWidth = btn.dataset.width;
  });
});

// ── Console Logic ──────────────────────────────────────
function initConsole() {
  consoleOutput.innerHTML = ""; // Clear on fresh render
}

window.addEventListener("message", (e) => {
  if (e.data && e.data.type === "console") {
    addConsoleMessage(e.data.level, e.data.message);
  }
});

function addConsoleMessage(level, text) {
  const line = document.createElement("div");
  line.className = `console-msg ${level}`;

  const time = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });

  line.innerHTML = `
    <span class="console-timestamp">[${time}]</span>
    <span class="console-text">${escapeHtml(text)}</span>
  `;
  consoleOutput.appendChild(line);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

consoleClearBtn.addEventListener("click", () => {
  consoleOutput.innerHTML = "";
});

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Iterate Feature ────────────────────────────────────
iterateBtn.addEventListener("click", async () => {
  const prompt = iterateInput.value.trim();
  if (!prompt) return showToast("error", "Enter a refinement instruction.");
  if (!Object.keys(generatedFiles).length)
    return showToast("error", "Generate code first.");

  setButtonLoading(iterateBtn, true);

  try {
    const res = await fetch("/api/iterate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: generatedFiles,
        framework: selectedFramework,
        prompt,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    generatedFiles = data.files;

    // Update editor content if current tab matches
    if (editor && currentTab !== "preview" && generatedFiles[currentTab]) {
      editor.setValue(generatedFiles[currentTab]);
    }

    switchTab(currentTab === "preview" ? "preview" : currentTab);
    iterateInput.value = "";
    showToast("success", "Code refined successfully!");
  } catch (err) {
    showToast("error", err.message);
  } finally {
    setButtonLoading(iterateBtn, false);
  }
});

// Allow Enter key to submit iterate prompt
iterateInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    iterateBtn.click();
  }
});

// ── Copy Button ────────────────────────────────────────
copyBtn.addEventListener("click", async () => {
  const text = editor ? editor.getValue() : "";
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.querySelector("span").textContent = "Copied!";
    setTimeout(() => {
      copyBtn.querySelector("span").textContent = "Copy";
    }, 2000);
  } catch {
    showToast("error", "Copy failed");
  }
});

// ── Design System ──────────────────────────────────────
designSystemBtn.addEventListener("click", async () => {
  const url = figmaUrlInput.value.trim();
  const token = figmaTokenInput.value.trim();
  if (!url || !token)
    return showToast("error", "Please enter a Figma URL and token.");

  setButtonLoading(designSystemBtn, true);

  try {
    const res = await fetch("/api/design-system", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ figmaUrl: url, figmaToken: token }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    displayDesignSystem(data);
    showToast("success", "Design system extracted!");
  } catch (err) {
    showToast("error", err.message);
  } finally {
    setButtonLoading(designSystemBtn, false);
  }
});

function displayDesignSystem(data) {
  cachedDesignSystemCSS = data.css || "";
  cachedDesignSystemSCSS = data.scss || "";

  const dsResults = $("#designSystemResults");
  const dsStats = $("#dsStats");
  const dsCode = $("#dsCodeContent");
  const dsSourceBadge = $("#dsSourceBadge");
  const formatToggle = $("#formatToggle");

  emptyState.style.display = "none";
  codePanel.style.display = "none";
  codeTabs.style.display = "none";
  dsResults.style.display = "";
  formatToggle.hidden = false;

  dsSourceBadge.textContent = data.source || "styles";

  const stats = data.stats || {};
  dsStats.innerHTML = Object.entries(stats)
    .map(
      ([k, v]) =>
        `<div class="ds-stat"><span class="ds-stat-value">${v}</span><span class="ds-stat-label">${k}</span></div>`,
    )
    .join("");

  dsCode.textContent =
    dsOutputFormat === "scss" ? cachedDesignSystemSCSS : cachedDesignSystemCSS;
}

// Format toggle
$$(".format-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".format-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    dsOutputFormat = btn.dataset.format;
    const dsCode = $("#dsCodeContent");
    dsCode.textContent =
      dsOutputFormat === "scss"
        ? cachedDesignSystemSCSS
        : cachedDesignSystemCSS;
  });
});

// DS copy/download
const dsCopyBtn = $("#dsCopyBtn");
const dsDownloadBtn = $("#dsDownloadBtn");
if (dsCopyBtn) {
  dsCopyBtn.addEventListener("click", async () => {
    const text =
      dsOutputFormat === "scss"
        ? cachedDesignSystemSCSS
        : cachedDesignSystemCSS;
    try {
      await navigator.clipboard.writeText(text);
      dsCopyBtn.querySelector("span").textContent = "Copied!";
      setTimeout(() => {
        dsCopyBtn.querySelector("span").textContent = "Copy";
      }, 2000);
    } catch {
      showToast("error", "Copy failed");
    }
  });
}
if (dsDownloadBtn) {
  dsDownloadBtn.addEventListener("click", () => {
    const text =
      dsOutputFormat === "scss"
        ? cachedDesignSystemSCSS
        : cachedDesignSystemCSS;
    const ext = dsOutputFormat === "scss" ? "scss" : "css";
    const blob = new Blob([text], { type: "text/css" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `design-tokens.${ext}`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

// ── Pipeline Status UI ─────────────────────────────────
function showPipelineStep(step) {
  pipelineStatus.hidden = false;
  const el = $(`[data-step="${step}"]`);
  if (el) el.classList.add("active");
}
function completePipelineStep(step) {
  const el = $(`[data-step="${step}"]`);
  if (el) {
    el.classList.remove("active");
    el.classList.add("done");
  }
}
function failPipelineStep(step) {
  const el = $(`[data-step="${step}"]`);
  if (el) {
    el.classList.remove("active");
    el.classList.add("error");
  }
}

// ── Button Loading State ───────────────────────────────
function setButtonLoading(btn, loading) {
  const text = btn.querySelector(".btn-text");
  const spinner = btn.querySelector(".btn-spinner");
  if (text) text.hidden = loading;
  if (spinner) spinner.hidden = !loading;
  btn.disabled = loading;
}

// ── Toast Notifications ────────────────────────────────
function showToast(type, message) {
  const toast = $("#toast");
  const icon = toast.querySelector(".toast-icon");
  const msg = toast.querySelector(".toast-message");

  toast.className = `toast toast-${type}`;
  msg.textContent = message;

  if (type === "success") {
    icon.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
  } else {
    icon.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  }

  toast.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.hidden = true;
  }, 5000);
}

// ── Initial State ──────────────────────────────────────
updateTabsForFramework();
updateGenerateButton();
