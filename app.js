const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const messagesEl = document.querySelector("#messages");
const welcome = document.querySelector("#welcome");
const chatArea = document.querySelector("#chatArea");
const newsView = document.querySelector("#newsView");
const chatButton = document.querySelector("#chatButton");
const newsButton = document.querySelector("#newsButton");
const composerWrap = document.querySelector(".composer-wrap");
const activeRepoSelect = document.querySelector("#activeRepoSelect");
const REPO_STORAGE_KEY = "codemind-selected-repo-v1";
let activeGithubRepo = localStorage.getItem(REPO_STORAGE_KEY) || "";
const sendButton = document.querySelector("#sendButton");
const imageButton = document.querySelector("#imageButton");
const toast = document.querySelector("#toast");
const STORAGE_KEY = "codemind-chat-v1";
const API_BASE_URL = "https://codemind-ai-l8ix.onrender.com";
let messages = loadMessages();
// Restore the repository from the conversation if an older chat predates repo persistence.
if (!activeGithubRepo) {
  const previousRepoMessage = [...messages].reverse().find(item =>
    item?.role === "user" && extractGithubRepo(item.content)
  );
  if (previousRepoMessage) {
    activeGithubRepo = extractGithubRepo(previousRepoMessage.content);
    localStorage.setItem(REPO_STORAGE_KEY, activeGithubRepo);
  }
}
let busy = false;
let activeGithubFile = null;

function loadMessages() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.slice(-40) : [];
  } catch { return []; }
}
function saveMessages() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40))); }
  catch { showToast("Couldn't save chat history in this browser."); }
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}
function escapeHTML(value) {
  return value.replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
}
// Small safe formatter: escapes all text before adding basic code formatting.
function formatText(value) {
  let safe = escapeHTML(value);
  safe = safe.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) =>
    '<pre><code>' + code.trim() + '</code></pre>');
  safe = safe.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  return safe;
}
function linkifyMessageText(container) {
  if (!container) return;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest("a, code, pre, script, style")) return NodeFilter.FILTER_REJECT;
      return /https?:\/\//i.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  const urlPattern = /https?:\/\/[^\s<>"']+/g;
  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    while ((match = urlPattern.exec(text)) !== null) {
      const rawUrl = match[0];
      const url = rawUrl.replace(/[),.!?;:]+$/, "");
      if (!url) continue;
      const start = match.index;
      fragment.append(document.createTextNode(text.slice(lastIndex, start)));
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Unsupported URL protocol");
        const link = document.createElement("a");
        link.href = parsed.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = url;
        fragment.append(link);
        lastIndex = start + url.length;
      } catch {
        fragment.append(document.createTextNode(rawUrl));
        lastIndex = start + rawUrl.length;
      }
    }
    if (lastIndex === 0) continue;
    fragment.append(document.createTextNode(text.slice(lastIndex)));
    textNode.replaceWith(fragment);
  }
}
function render() {
  welcome.hidden = messages.length > 0;
  messagesEl.innerHTML = messages.map(message => `
    <article class="message ${message.role === "user" ? "user" : "assistant"}">
      <div class="message-avatar">${message.role === "user" ? "Y" : "G"}</div>
      <div class="message-content">
        <div class="message-role">${message.role === "user" ? "YOU" : "CODEMIND AI"}</div>
        <div class="message-text">${formatText(message.content || "")}</div>
        ${message.imageUrl ? '<a class="message-image-link" href="' + escapeHTML(message.imageUrl) + '" target="_blank" rel="noopener noreferrer"><img class="message-image" src="' + escapeHTML(message.imageUrl) + '" alt="AI-generated image" loading="lazy"></a>' : ""}
      </div>
    </article>`).join("");
  linkifyMessageText(messagesEl);
  messagesEl.scrollIntoView({ block: "end", behavior: "smooth" });
}
function setBusy(value) {
  busy = value;
  sendButton.disabled = value;
  sendButton.innerHTML = value ? '<span class="typing">···</span>' : '<span>↑</span>';
}
function renderChatEditProposals(edits, repo) {
  if (!Array.isArray(edits) || !edits.length) return;
  const panel = document.createElement("section");
  panel.className = "chat-edit-proposals";
  const heading = document.createElement("strong");
  heading.textContent = "CodeMind AI prepared " + edits.length + " file change(s)";
  const note = document.createElement("p");
  note.textContent = "Review the code below. GitHub is unchanged until you approve.";
  panel.append(heading, note);
  const entries = [];
  edits.forEach(edit => {
    const item = document.createElement("div");
    item.className = "chat-edit-item";
    const path = document.createElement("div");
    path.className = "chat-edit-path";
    path.textContent = edit.path;
    const summary = document.createElement("p");
    summary.textContent = edit.summary;
    const editor = document.createElement("textarea");
    editor.className = "chat-edit-code";
    editor.spellcheck = false;
    editor.value = edit.content;
    item.append(path, summary, editor);
    panel.appendChild(item);
    entries.push({ edit, editor });
  });
  const approve = document.createElement("button");
  approve.type = "button";
  approve.className = "chat-edit-approve";
  approve.textContent = "Review & approve commits";
  const status = document.createElement("div");
  status.className = "chat-edit-status";
  approve.addEventListener("click", async () => {
    if (!window.confirm("Commit these reviewed changes to " + repo + "?")) return;
    approve.disabled = true;
    approve.textContent = "Committing…";
    let completed = 0;
    try {
      for (const entry of entries) {
        await githubPost("/api/github/commit-file", {
          repo, path: entry.edit.path, sha: entry.edit.sha,
          content: entry.editor.value,
          message: "Update " + entry.edit.path + " via CodeMind AI"
        });
        completed++;
      }
      status.textContent = "Committed " + completed + " file change(s) to GitHub.";
      approve.textContent = "Committed ✓";
      showToast("CodeMind AI changes committed.");
    } catch (error) {
      const permissionHint = /resource not accessible by integration|not permitted to .*contents|write access/i.test(error.message)
        ? "GitHub blocked the write. Open GitHub App settings → Permissions & events → Repository permissions → Contents, set Read and write, save, then accept the permission update on the repository installation."
        : "";
      status.textContent = (completed
        ? completed + " file(s) committed. Remaining changes were not committed. "
        : "No files were committed. ") + error.message + (permissionHint ? "\n\n" + permissionHint : "");
      approve.disabled = false;
      approve.textContent = completed ? "Retry remaining changes" : "Try approval again";
      entries.splice(0, completed);
    }
  });
  panel.append(approve, status);
  messagesEl.appendChild(panel);
  panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function extractGithubRepo(text) {
  const match = String(text || "").match(/https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i);
  if (!match) return "";
  return match[1] + "/" + match[2].replace(/\.git$/i, "");
}
function isProjectRelatedRequest(text) {
  return /\b(my|this|the)\s+(project|repo|repository|website|web app|app|game|codebase|code|script|file|site)\b|\b(github repo|source code|bug in|error in|console error|stack trace|commit|deploy|deployment)\b|\b(index\.html|app\.js|server\.js|styles\.css|package\.json)\b|\b(debug|fix|edit|change|update|add|remove|implement|refactor|repair|patch)\b.{0,60}\b(code|script|function|file|app|website|game|repo)\b/i.test(text);
}
function isWebSearchRequest(text) {
  return /\\b(search the web|search online|look (it|this|that) up|look up|google|find online|latest|current|live|right now|as of today|today|tonight|this week|this month|recent|breaking|news|weather|forecast|temperature|score|scores|standings|schedule|fixtures|results|release date|version|update|price|prices|stock|shares|exchange rate|currency|availability|open now|traffic|election|polls|who won|when does .* release|is .* still|has .* happened|source(s)? for)\\b/i.test(text);
}

function extractImagePrompt(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const hasNanoBanana = /\bnano[ -]?banana(?:\s*2)?(?:\s+lite)?\b/i.test(raw);
  const hasImageAction = /\b(?:make|create|draw|illustrate|generate|render)\b/i.test(raw);
  const explicitImageRequest = /\b(?:draw|illustrate)\b/i.test(raw) ||
    /\b(?:make|create|generate|render)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|illustration|artwork)\b/i.test(raw);
  // Also recognize a standalone visual description when the user pastes an image
  // prompt and presses Send instead of the Imagine button.
  const standaloneVisualPrompt = /^(?:a|an|the)\b/i.test(raw) &&
    raw.length >= 25 &&
    /\b(?:3d|cartoon|illustration|illustrated|photorealistic|cinematic|lighting|wearing|standing|sitting|landscape|city|background|neon|sunglasses|portrait|character|logo|poster|render|watercolor|pixel art|anime)\b/i.test(raw) &&
    /[,;]|\b(?:with|wearing|standing|sitting|in|under|beside)\b/i.test(raw);
  if (!(explicitImageRequest || standaloneVisualPrompt || (hasNanoBanana && hasImageAction))) return "";

  return raw
    .replace(/^\s*(?:please\s+)?(?:can you\s+)?(?:make|create|draw|illustrate|generate|render)\s+(?:me\s+)?/i, "")
    .replace(/\b(?:with|using)\s+nano[ -]?banana(?:\s*2)?(?:\s+lite)?\b/gi, "")
    .replace(/^\s*nano[ -]?banana(?:\s*2)?(?:\s+lite)?\s*[:,-]?\s*/i, "")
    .replace(/^\s*(?:an?|the)\s+(?:image|picture|photo|illustration|artwork)\s+of\s+/i, "")
    .replace(/\s+/g, " ")
    .trim() || raw;
}

async function sendMessage(text) {
  const content = text.trim();
  if (!content || busy) return;
  const imagePrompt = extractImagePrompt(content);
  if (imagePrompt) {
    input.value = "";
    resizeInput();
    await generateImage(imagePrompt);
    return;
  }
  const linkedRepo = extractGithubRepo(content);
  if (linkedRepo) {
    try {
      const repositories = await loadRepositories();
      const match = repositories.find(repo => repo.full_name.toLowerCase() === linkedRepo.toLowerCase());
      if (!match) { showToast("That repository isn't installed for CodeMind AI. Install the GitHub App on it first."); return; }
      activeGithubRepo = match.full_name;
      localStorage.setItem(REPO_STORAGE_KEY, activeGithubRepo);
      activeRepoSelect.value = activeGithubRepo;
    } catch (error) {
      if (error.status === 401) {
        localStorage.setItem("codemind-pending-github-message-v1", content);
        window.location.href = API_BASE_URL + "/auth/github";
        return;
      }
      showToast(error.message || "Couldn't connect to that repository.");
      return;
    }
  }
  messages.push({ role: "user", content });
  saveMessages(); render(); input.value = ""; resizeInput(); setBusy(true);
  const pending = document.createElement("article");
  pending.className = "message";
  pending.innerHTML = '<div class="message-avatar">G</div><div class="message-content"><div class="message-role">CODEMIND AI</div><div class="message-text typing">Thinking···</div></div>';
  messagesEl.appendChild(pending);
  let chatEditResult = null;
  try {
      const projectRelated = isProjectRelatedRequest(content);
    const asksForEdit = projectRelated && /\b(fix|change|edit|update|add|remove|implement|build|create|make|write|improve|enhance|upgrade|rewrite|refactor|modify|repair|patch|optimize)\b/i.test(content);
    const useEditWorkflow = Boolean(activeGithubRepo && asksForEdit);
    const useRepositoryContext = Boolean(activeGithubRepo && projectRelated);
    let webResults = [];
    // Only run web search for requests that actually ask for current or online information.
    // Ordinary chat should go straight to the AI instead of waiting on Google.
    if (isWebSearchRequest(content)) {
      try {
        pending.querySelector(".typing").textContent = "Searching the web···";
        const searchResponse = await fetch(API_BASE_URL + "/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: content })
        });
        const searchData = await searchResponse.json().catch(() => ({}));
        if (searchResponse.ok && Array.isArray(searchData.results)) {
          webResults = searchData.results;
        } else {
          console.warn("CodeMind AI web search unavailable:", searchData.error || searchResponse.status);
        }
      } catch (searchError) {
        // Keep normal chat available if the search provider is temporarily down.
        console.warn("CodeMind AI web search failed:", searchError.message);
      }
    }
    pending.querySelector(".typing").textContent = "Thinking···";
    const endpoint = useEditWorkflow ? "/api/github/chat-edit" : "/api/chat";
    const preferenceMessages = messages.slice(useEditWorkflow ? -12 : -20).map(item => ({ ...item }));
    const latestUser = [...preferenceMessages].reverse().find(item => item.role === "user");
    if (latestUser) latestUser.content += "\\n\\n" + getPreferenceInstruction();
    const payload = useEditWorkflow
      ? { repo: activeGithubRepo, messages: preferenceMessages }
      : { messages: preferenceMessages, ...(useRepositoryContext ? { githubRepo: activeGithubRepo } : {}), ...(webResults.length ? { webResults } : {}) };
    let response = await fetch(API_BASE_URL + endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload)
    });
    // Older Render deployments may not yet expose the structured edit route.
    // Fall back to repository-aware chat so the user can still get code help.
    let data = await response.json().catch(() => ({}));
    let editRouteFallback = false;
    if (useEditWorkflow && response.status === 404) {
      response = await fetch(API_BASE_URL + "/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ messages: messages.slice(-20), ...(useRepositoryContext ? { githubRepo: activeGithubRepo } : {}), ...(webResults.length ? { webResults } : {}) })
      });
      data = await response.json().catch(() => ({}));
      editRouteFallback = response.ok;
    }
    if (!response.ok) throw new Error(data.error || `Backend request failed (HTTP ${response.status}) at ${endpoint}. Check the Render service and its logs.`);
    if (editRouteFallback) data.reply = "The structured GitHub edit service is not deployed yet, so I used repository-aware chat as a fallback. I can still inspect the repository and draft the changes, but the approve-and-commit panel is unavailable until the backend is redeployed.\n\n" + data.reply;
    if (typeof data.reply !== "string" || !data.reply.trim()) throw new Error("The model returned an empty response.");
    messages.push({ role: "assistant", content: data.reply.trim() }); saveMessages();
    chatEditResult = useEditWorkflow && data.edits?.length ? data.edits : null;
  } catch (error) {
    messages.push({ role: "assistant", content: "I couldn't connect: " + error.message + "\n\nCheck that the CodeMind AI backend is deployed and GitHub is connected." }); saveMessages();
  } finally {
    setBusy(false); render();
    if (chatEditResult) renderChatEditProposals(chatEditResult, activeGithubRepo);
    input.focus();
  }
}
async function generateImage(prompt) {
  const content = String(prompt || "").trim();
  if (!content || busy) {
    if (!content) showToast("Describe the image you want first.");
    return;
  }
  setBusy(true);
  imageButton.disabled = true;
  imageButton.textContent = "Generating…";
  messages.push({ role: "user", content: "Generate an image: " + content });
  saveMessages();
  render();
  const pending = document.createElement("article");
  pending.className = "message";
  pending.innerHTML = '<div class="message-avatar">G</div><div class="message-content"><div class="message-role">CODEMIND AI</div><div class="message-text typing">Creating your image···</div></div>';
  messagesEl.appendChild(pending);
  try {
    const response = await fetch(API_BASE_URL + "/api/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: content })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Image generation failed (HTTP " + response.status + ").");
    if (typeof data.imageUrl !== "string" || !/^https:\/\//i.test(data.imageUrl)) {
      throw new Error("The image provider returned no usable image URL.");
    }
    const remaining = Number.isInteger(data.remainingToday) ? data.remainingToday : null;
    const imageMessage = remaining === null
      ? "Here's your generated image."
      : "Here's your generated image. " + remaining + " free " + (remaining === 1 ? "image" : "images") + " remaining today.";
    messages.push({ role: "assistant", content: imageMessage, imageUrl: data.imageUrl });
    saveMessages();
  } catch (error) {
    messages.push({ role: "assistant", content: "Image generation failed: " + error.message });
    saveMessages();
  } finally {
    imageButton.disabled = false;
    imageButton.textContent = "✧ Imagine";
    setBusy(false);
    render();
    input.focus();
  }
}
imageButton.addEventListener("click", () => {
  const prompt = input.value.trim();
  if (!prompt) {
    input.placeholder = "Describe the image you want, then click Imagine…";
    input.focus();
    showToast("Add an image prompt in the message box.");
    return;
  }
  input.value = "";
  resizeInput();
  generateImage(prompt);
});
function resizeInput() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
}
form.addEventListener("submit", event => {
  event.preventDefault();
  sendMessage(input.value);
});
input.addEventListener("input", resizeInput);
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
document.querySelectorAll(".suggestion").forEach(button => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt || ""));
});
document.querySelector("#newChat").addEventListener("click", () => {
  messages = [];
  activeGithubFile = null;
  saveMessages();
  render();
  input.focus();
});
document.querySelector("#clearChat").addEventListener("click", () => {
  if (!messages.length) return showToast("This conversation is already empty.");
  messages = [];
  saveMessages();
  render();
  showToast("Conversation cleared from this browser.");
});
document.querySelector("#memoryButton").addEventListener("click", () => showToast("Chat history is saved locally in this browser for now."));
async function githubFetch(path) {
  const response = await fetch(API_BASE_URL + path, { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || "GitHub request failed."); error.status = response.status; throw error; }
  return data;
}
async function githubPost(path, body) {
  const response = await fetch(API_BASE_URL + path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "GitHub request failed.");
  return data;
}
async function loadRepositories() {
  const data = await githubFetch("/api/github/repos");
  const options = data.repositories.map(repo => '<option value="' + escapeHTML(repo.full_name) + '">' + escapeHTML(repo.full_name) + (repo.private ? " · private" : "") + '</option>').join("");
  activeRepoSelect.innerHTML = '<option value="">No repository selected</option>' + options;
  if (data.repositories.some(repo => repo.full_name === activeGithubRepo)) activeRepoSelect.value = activeGithubRepo;
  else { activeGithubRepo = ""; localStorage.removeItem(REPO_STORAGE_KEY); activeRepoSelect.value = ""; }
  return data.repositories;
}
activeRepoSelect.addEventListener("change", () => {
  activeGithubRepo = activeRepoSelect.value;
  if (activeGithubRepo) localStorage.setItem(REPO_STORAGE_KEY, activeGithubRepo); else localStorage.removeItem(REPO_STORAGE_KEY);
  showToast(activeGithubRepo ? "Chat connected to " + activeGithubRepo : "Repository context turned off.");
});
function showWorkspaceTab(tab) {
  const showNews = tab === "news";
  const showPreferences = tab === "preferences";
  newsView.hidden = !showNews;
  document.querySelector("#preferencesView").hidden = !showPreferences;
  chatArea.hidden = showNews || showPreferences;
  composerWrap.hidden = showNews || showPreferences;
  chatButton.classList.toggle("active", tab === "chat");
  newsButton.classList.toggle("active", showNews);
  document.querySelector("#preferencesButton").classList.toggle("active", showPreferences);
  document.querySelector(".breadcrumb strong").textContent = showNews ? "News" : showPreferences ? "Preferences" : "New conversation";
}
chatButton.addEventListener("click", () => showWorkspaceTab("chat"));
newsButton.addEventListener("click", () => showWorkspaceTab("news"));
document.querySelector("#preferencesButton").addEventListener("click", () => showWorkspaceTab("preferences"));
document.querySelector("#projectsButton").addEventListener("click", () => showToast("Project workspace is coming in a later version."));
document.querySelector("#mobileMenu").addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));
document.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    messages = [];
    saveMessages();
    render();
    input.focus();
  }
});
const startupParams = new URLSearchParams(location.search);
if (startupParams.get("github") === "connected") {
  history.replaceState({}, "", location.pathname);
  loadRepositories().then(() => {
    const pendingMessage = localStorage.getItem("codemind-pending-github-message-v1");
    if (pendingMessage) { localStorage.removeItem("codemind-pending-github-message-v1"); sendMessage(pendingMessage); }
  }).catch(error => showToast(error.message));
} else {
  loadRepositories().catch(error => {
    // A saved repository URL means the user expects this conversation to stay connected.
    if (error.status === 401 && activeGithubRepo) {
      window.location.href = API_BASE_URL + "/auth/github";
      return;
    }
    showToast("GitHub connection unavailable: " + (error.message || "Check the backend deployment."));
  });
}
render();


/* Simple browser-only account: username label, no password or account features. */
(function initLocalAccount() {
  const KEY = "codemind-account-username-v1";
  const profile = document.querySelector(".profile");
  if (!profile) return;

  const getUsername = () => {
    try { return localStorage.getItem(KEY) || "Guest"; }
    catch { return "Guest"; }
  };

  function paintProfile() {
    const username = getUsername();
    const avatar = profile.querySelector(".avatar");
    const details = profile.querySelector("div:nth-child(2)");
    if (avatar) avatar.textContent = username === "Guest" ? "G" : username.trim().charAt(0).toUpperCase();
    if (details) {
      details.querySelector("strong").textContent = username;
      details.querySelector("span").textContent = username === "Guest" ? "Local account · set username" : "Local account";
    }
    profile.setAttribute("role", "button");
    profile.setAttribute("tabindex", "0");
    profile.setAttribute("aria-label", "Account settings");
    profile.title = "Set your account username";
  }

  function openAccount() {
    if (document.querySelector("#accountOverlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "accountOverlay";
    overlay.className = "account-overlay";
    overlay.innerHTML = `
      <section class="account-dialog" role="dialog" aria-modal="true" aria-labelledby="accountTitle">
        <button class="account-close" type="button" aria-label="Close">×</button>
        <div class="account-mark">G</div>
        <div class="account-eyebrow">YOUR PROFILE</div>
        <h2 id="accountTitle">Your account</h2>
        <p>This is a simple local profile. Choose the username shown in your workspace.</p>
        <label for="accountUsername">Username</label>
        <input id="accountUsername" maxlength="24" minlength="2" autocomplete="nickname" placeholder="Enter a username">
        <div class="account-error" aria-live="polite"></div>
        <button class="account-save" type="button">Save username</button>
        <small>Saved only in this browser. No password or online account is created.</small>
      </section>`;
    document.body.appendChild(overlay);
    const field = overlay.querySelector("#accountUsername");
    const error = overlay.querySelector(".account-error");
    field.value = getUsername() === "Guest" ? "" : getUsername();
    const close = () => overlay.remove();
    overlay.querySelector(".account-close").addEventListener("click", close);
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    overlay.querySelector(".account-save").addEventListener("click", () => {
      const username = field.value.trim().replace(/\s+/g, " ");
      if (username.length < 2) {
        error.textContent = "Use at least 2 characters.";
        field.focus();
        return;
      }
      if (/[<>]/.test(username)) {
        error.textContent = "Please choose a different username.";
        field.focus();
        return;
      }
      try { localStorage.setItem(KEY, username); }
      catch { error.textContent = "This browser couldn't save the username."; return; }
      paintProfile();
      close();
      if (typeof showToast === "function") showToast("Username saved.");
    });
    field.addEventListener("keydown", event => {
      if (event.key === "Enter") overlay.querySelector(".account-save").click();
      if (event.key === "Escape") close();
    });
    field.focus();
  }

  profile.addEventListener("click", openAccount);
  profile.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAccount();
    }
  });
  paintProfile();
})();


/* Shared public live room. All participants see all messages in this room. */
(function initSharedLiveChat() {
  const button = document.querySelector("#guestInboxButton");
  if (!button) return;
  const API = API_BASE_URL + "/api/live-chat";
  const USER_KEY = "codemind-account-username-v1";
  const ID_KEY = "codemind-live-chat-guest-id-v1";
  let guestId = localStorage.getItem(ID_KEY);
  if (!guestId) {
    guestId = (crypto.randomUUID ? crypto.randomUUID() : "guest_" + Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-zA-Z0-9_-]/g, "");
    localStorage.setItem(ID_KEY, guestId);
  }
  let poller = null;
  let lastRendered = "";
  let sending = false;

  function username() {
    return (localStorage.getItem(USER_KEY) || "Guest").trim().slice(0, 24) || "Guest";
  }
  function closeRoom() {
    if (poller) clearInterval(poller);
    poller = null;
    document.querySelector("#liveRoomOverlay")?.remove();
    lastRendered = "";
  }
  function renderMessages(messages) {
    const list = document.querySelector("#liveRoomMessages");
    const count = document.querySelector("#liveRoomCount");
    if (!list) return;
    const participants = new Set(messages.map(item => item.guestId));
    if (count) count.textContent = participants.size + (participants.size === 1 ? " person here" : " people here");
    const signature = messages.map(item => item.id).join(",");
    if (signature === lastRendered) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 90;
    lastRendered = signature;
    list.replaceChildren();
    if (!messages.length) {
      const empty = document.createElement("div");
      empty.className = "live-room-empty";
      empty.textContent = "No messages yet. Start the conversation!";
      list.append(empty);
    }
    messages.forEach(item => {
      const card = document.createElement("article");
      card.className = "live-room-message" + (item.guestId === guestId ? " mine" : "");
      const head = document.createElement("div");
      head.className = "live-room-message-head";
      const name = document.createElement("strong");
      name.textContent = item.username || "Guest";
      const time = document.createElement("time");
      time.textContent = new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const body = document.createElement("p");
      body.textContent = item.message;
      head.append(name, time);
      card.append(head, body);
      list.append(card);
    });
    if (nearBottom) list.scrollTop = list.scrollHeight;
  }
  async function refresh() {
    try {
      const response = await fetch(API, { cache: "no-store" });
      if (!response.ok) throw new Error("Live chat is unavailable.");
      const data = await response.json();
      renderMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (error) {
      const count = document.querySelector("#liveRoomCount");
      if (count) count.textContent = "Reconnecting…";
    }
  }
  async function send() {
    const field = document.querySelector("#liveRoomInput");
    const submit = document.querySelector("#liveRoomSend");
    const message = field?.value.trim();
    if (!message || sending) return;
    sending = true;
    if (submit) submit.disabled = true;
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId, username: username(), message })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Couldn't send message.");
      field.value = "";
      await refresh();
      field.focus();
    } catch (error) {
      if (typeof showToast === "function") showToast(error.message);
    } finally {
      sending = false;
      if (submit) submit.disabled = false;
    }
  }
  function openRoom() {
    if (document.querySelector("#liveRoomOverlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "liveRoomOverlay";
    overlay.className = "live-room-overlay";
    overlay.innerHTML = `
      <section class="live-room-panel" role="dialog" aria-modal="true" aria-labelledby="liveRoomTitle">
        <header class="live-room-header">
          <div><div class="live-room-kicker">OPEN COMMUNITY</div><h2 id="liveRoomTitle">Live conversations</h2><span id="liveRoomCount">Connecting…</span></div>
          <button type="button" class="live-room-close" aria-label="Close live chat">×</button>
        </header>
        <p class="live-room-notice">Public room: everyone who joins, including <strong>myfoodishere</strong>, can read and reply to every message. Don't share private information.</p>
        <div class="live-room-messages" id="liveRoomMessages" aria-live="polite"></div>
        <form class="live-room-composer" id="liveRoomForm">
          <input id="liveRoomInput" maxlength="700" autocomplete="off" placeholder="Message everyone…" aria-label="Live chat message">
          <button id="liveRoomSend" type="submit">Send</button>
        </form>
      </section>`;
    document.body.append(overlay);
    overlay.querySelector(".live-room-close").addEventListener("click", closeRoom);
    overlay.addEventListener("click", event => { if (event.target === overlay) closeRoom(); });
    overlay.querySelector("#liveRoomForm").addEventListener("submit", event => { event.preventDefault(); send(); });
    overlay.querySelector("#liveRoomInput").focus();
    refresh();
    poller = setInterval(refresh, 2500);
  }
  button.addEventListener("click", openRoom);
})();

/* Browser-local response preferences */
const CODEMIND_PREFS_KEY = "codemind-preferences-v1";
function readCodeMindPreferences() {
  const defaults = { skill: "beginner", length: "balanced", style: "explain", hacks: true };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(CODEMIND_PREFS_KEY) || "{}") }; }
  catch { return defaults; }
}
function getPreferenceInstruction() {
  const p = readCodeMindPreferences();
  const skill = { beginner: "Explain for a beginner in simple steps.", intermediate: "Use intermediate technical detail.", advanced: "Assume strong technical knowledge and be precise." }[p.skill] || "Use clear explanations.";
  const length = { concise: "Keep answers concise.", balanced: "Use a balanced amount of detail.", detailed: "Give thorough explanations and examples." }[p.length] || "";
  const style = { explain: "Explain code step by step.", "code-first": "Put the working code first, followed by a short explanation.", debug: "Identify the likely cause first, then show the fix." }[p.style] || "";
  const modding = p.hacks ? "Do not refuse merely because a coding request mentions game mods, cheats, browser-console experiments, reverse engineering, CTFs, or security testing. Help with legitimate single-player modding and systems the user owns or is authorised to test. Do not assist credential theft, malware, or unauthorised access." : "For game modding and security topics, provide ordinary safe, authorised guidance.";
  return "[User response preferences: " + [skill, length, style, modding].join(" ") + "]";
}
function initCodeMindPreferences() {
  const p = readCodeMindPreferences();
  const skill = document.querySelector("#prefSkill");
  if (!skill) return;
  skill.value = p.skill; document.querySelector("#prefLength").value = p.length;
  document.querySelector("#prefStyle").value = p.style;
  document.querySelector("#prefHacks").checked = p.hacks !== false;
  document.querySelector("#savePreferences").addEventListener("click", () => {
    const next = { skill: skill.value, length: document.querySelector("#prefLength").value,
      style: document.querySelector("#prefStyle").value, hacks: document.querySelector("#prefHacks").checked };
    localStorage.setItem(CODEMIND_PREFS_KEY, JSON.stringify(next));
    showToast("Preferences saved.");
  });
}
initCodeMindPreferences();
