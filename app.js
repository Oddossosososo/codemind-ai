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
      <div class="message-avatar">${message.role === "user" ? "Y" : "C"}</div>
      <div class="message-content">
        <div class="message-role">${message.role === "user" ? "YOU" : "CODEMIND"}</div>
        <div class="message-text">${formatText(message.content)}</div>
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
  heading.textContent = "CodeMind prepared " + edits.length + " file change(s)";
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
          message: "Update " + entry.edit.path + " via CodeMind"
        });
        completed++;
      }
      status.textContent = "Committed " + completed + " file change(s) to GitHub.";
      approve.textContent = "Committed ✓";
      showToast("CodeMind changes committed.");
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
  return /\b(search the web|search online|look (it|this|that) up|look up|google|find online|latest|current price|news about|today'?s|recent updates|what happened (today|recently)|source(s)? for)\b/i.test(text);
}

async function sendMessage(text) {
  const content = text.trim();
  if (!content || busy) return;
  const linkedRepo = extractGithubRepo(content);
  if (linkedRepo) {
    try {
      const repositories = await loadRepositories();
      const match = repositories.find(repo => repo.full_name.toLowerCase() === linkedRepo.toLowerCase());
      if (!match) { showToast("That repository isn't installed for CodeMind. Install the GitHub App on it first."); return; }
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
  pending.innerHTML = '<div class="message-avatar">C</div><div class="message-content"><div class="message-role">CODEMIND</div><div class="message-text typing">Thinking···</div></div>';
  messagesEl.appendChild(pending);
  let chatEditResult = null;
  try {
      const projectRelated = isProjectRelatedRequest(content);
    const asksForEdit = projectRelated && /\b(fix|change|edit|update|add|remove|implement|build|create|make|write|improve|enhance|upgrade|rewrite|refactor|modify|repair|patch|optimize)\b/i.test(content);
    const useEditWorkflow = Boolean(activeGithubRepo && asksForEdit);
    const useRepositoryContext = Boolean(activeGithubRepo && projectRelated);
    let webResults = [];
    // Search every user message, not only prompts containing "search" or "latest".
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
        console.warn("CodeMind web search unavailable:", searchData.error || searchResponse.status);
      }
    } catch (searchError) {
      // Keep normal chat available if the search provider is temporarily down.
      console.warn("CodeMind web search failed:", searchError.message);
    }
    pending.querySelector(".typing").textContent = "Thinking···";
    const endpoint = useEditWorkflow ? "/api/github/chat-edit" : "/api/chat";
    const payload = useEditWorkflow
      ? { repo: activeGithubRepo, messages: messages.slice(-12) }
      : { messages: messages.slice(-20), ...(useRepositoryContext ? { githubRepo: activeGithubRepo } : {}), ...(webResults.length ? { webResults } : {}) };
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
    messages.push({ role: "assistant", content: "I couldn't connect: " + error.message + "\n\nCheck that the CodeMind backend is deployed and GitHub is connected." }); saveMessages();
  } finally {
    setBusy(false); render();
    if (chatEditResult) renderChatEditProposals(chatEditResult, activeGithubRepo);
    input.focus();
  }
}
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
  newsView.hidden = !showNews;
  chatArea.hidden = showNews;
  composerWrap.hidden = showNews;
  chatButton.classList.toggle("active", !showNews);
  newsButton.classList.toggle("active", showNews);
  document.querySelector(".breadcrumb strong").textContent = showNews ? "News" : "New conversation";
}
chatButton.addEventListener("click", () => showWorkspaceTab("chat"));
newsButton.addEventListener("click", () => showWorkspaceTab("news"));
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
