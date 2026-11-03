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
const CHATS_KEY = "codemind-chats-v1";
const CURRENT_CHAT_KEY = "codemind-current-chat-v1";
const API_BASE_URL = "https://codemind-ai-l8ix.onrender.com";
let currentChatId = localStorage.getItem(CURRENT_CHAT_KEY) || "chat-" + Date.now().toString(36);
let chats = loadChats();
let messages = loadMessages();
if (!chats.some(chat => chat.id === currentChatId)) {
  chats.unshift({ id: currentChatId, title: "New conversation", messages });
  saveChats();
}
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
const AGENT_MODE_KEY = "codemind-agent-mode-v1";
let agentModeEnabled = localStorage.getItem(AGENT_MODE_KEY) === "true";
const agentModeButton = document.querySelector("#agentModeButton");
function paintAgentMode() {
  if (!agentModeButton) return;
  agentModeButton.classList.toggle("is-active", agentModeEnabled);
  agentModeButton.setAttribute("aria-pressed", String(agentModeEnabled));
  agentModeButton.textContent = agentModeEnabled ? "✦ Agent mode ON" : "✦ Agent mode";
  agentModeButton.title = agentModeEnabled
    ? "Agent Mode is on: coordinator, specialists and reviewer"
    : "Enable the multi-agent coding, research and review workflow";
}
if (agentModeButton) {
  paintAgentMode();
  agentModeButton.addEventListener("click", () => {
    agentModeEnabled = !agentModeEnabled;
    localStorage.setItem(AGENT_MODE_KEY, String(agentModeEnabled));
    paintAgentMode();
    showToast(agentModeEnabled ? "Agent Mode enabled." : "Agent Mode disabled.");
  });
}

function loadChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHATS_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(chat => chat && typeof chat.id === "string").slice(-50) : [];
  } catch { return []; }
}
function loadMessages() {
  const active = chats.find(chat => chat.id === currentChatId);
  if (active && Array.isArray(active.messages)) return active.messages.slice(-100);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.slice(-100) : [];
  } catch { return []; }
}
function saveChats() {
  try { localStorage.setItem(CHATS_KEY, JSON.stringify(chats.slice(-50))); }
  catch { showToast("Couldn't save chat memory in this browser."); }
}
function saveMessages() {
  try {
    messages = messages.slice(-100);
    const active = chats.find(chat => chat.id === currentChatId);
    const firstUser = messages.find(item => item.role === "user");
    const title = active?.title && active.title !== "New conversation"
      ? active.title
      : (firstUser ? String(firstUser.content).replace(/\s+/g, " ").slice(0, 48) : "New conversation");
    const chat = { id: currentChatId, title, updatedAt: Date.now(), messages };
    chats = [chat, ...chats.filter(item => item.id !== currentChatId)].slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    localStorage.setItem(CURRENT_CHAT_KEY, currentChatId);
    saveChats();
  } catch { showToast("Couldn't save chat history in this browser."); }
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

function showChatLimitDialog(retryText) {
  const existing = document.querySelector(".chat-limit-overlay");
  if (existing) return;
  const overlay = document.createElement("div");
  overlay.className = "chat-limit-overlay";
  overlay.setAttribute("role", "presentation");
  const dialog = document.createElement("section");
  dialog.className = "chat-limit-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "chatLimitTitle");
  const eyebrow = document.createElement("div");
  eyebrow.className = "chat-limit-eyebrow";
  eyebrow.textContent = "HOURLY MESSAGE LIMIT";
  const title = document.createElement("h2");
  title.id = "chatLimitTitle";
  title.textContent = "100 messages used";
  const description = document.createElement("p");
  description.textContent = "You've reached the hourly message limit. Enter your access code on the keypad to unlock chat for 24 hours.";
  const status = document.createElement("p");
  status.className = "chat-limit-status";
  status.setAttribute("role", "status");
  const display = document.createElement("div");
  display.className = "chat-limit-display";
  display.setAttribute("aria-label", "Access code entry");
  display.textContent = "— — — —";
  let digits = "";
  const paint = () => { display.textContent = digits.padEnd(4, "—").split("").join(" "); };
  const keypad = document.createElement("div");
  keypad.className = "chat-limit-keypad";
  const addKey = (label, action, extraClass = "") => {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "chat-limit-key " + extraClass;
    key.textContent = label;
    key.addEventListener("click", action);
    keypad.appendChild(key);
  };
  for (const digit of ["1","2","3","4","5","6","7","8","9"]) {
    addKey(digit, () => { if (digits.length < 4) digits += digit; paint(); status.textContent = ""; });
  }
  addKey("Clear", () => { digits = ""; paint(); status.textContent = ""; }, "wide");
  addKey("0", () => { if (digits.length < 4) digits += "0"; paint(); status.textContent = ""; });
  addKey("⌫", () => { digits = digits.slice(0, -1); paint(); status.textContent = ""; }, "utility");
  const unlock = document.createElement("button");
  unlock.type = "button";
  unlock.className = "chat-limit-unlock";
  unlock.textContent = "Unlock chat";
  unlock.disabled = true;
  unlock.addEventListener("click", async () => {
    if (digits.length !== 4) return;
    unlock.disabled = true;
    status.textContent = "Checking access code…";
    try {
      const response = await fetch(API_BASE_URL + "/api/chat/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: digits })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Access code rejected.");
      overlay.remove();
      input.value = retryText;
      resizeInput();
      input.focus();
      showToast("Chat unlocked for 24 hours. Press send to retry your message.");
    } catch (error) {
      digits = "";
      paint();
      status.textContent = error.message;
      unlock.disabled = false;
    }
  });
  const updateUnlock = () => { unlock.disabled = digits.length !== 4; };
  keypad.addEventListener("click", updateUnlock);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "chat-limit-close";
  close.textContent = "Close";
  close.addEventListener("click", () => overlay.remove());
  dialog.append(eyebrow, title, description, display, keypad, status, unlock, close);
  overlay.appendChild(dialog);
  overlay.addEventListener("click", event => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  paint();
}

function renderAgentRunDetails(data) {
  if (!data || (!data.plan && !Array.isArray(data.agents))) return;
  const panel = document.createElement("section");
  panel.className = "agent-run-details";
  const heading = document.createElement("strong");
  heading.textContent = "✦ AGENT TEAM · " + (Array.isArray(data.agents) ? data.agents.length : 0) + " SPECIALISTS";
  panel.appendChild(heading);
  if (data.repository) {
    const repo = document.createElement("p");
    repo.className = "agent-run-repo";
    repo.textContent = "Repository inspected: " + data.repository;
    panel.appendChild(repo);
  }
  if (data.plan && Array.isArray(data.plan.steps)) {
    const planTitle = document.createElement("div");
    planTitle.className = "agent-run-subtitle";
    planTitle.textContent = data.plan.goal || "Execution plan";
    panel.appendChild(planTitle);
    const list = document.createElement("ol");
    data.plan.steps.forEach(step => {
      const item = document.createElement("li");
      item.textContent = step;
      list.appendChild(item);
    });
    panel.appendChild(list);
  }
  (data.agents || []).forEach(agent => {
    const details = document.createElement("details");
    details.className = "agent-run-agent";
    const summary = document.createElement("summary");
    summary.textContent = agent.role || "Specialist";
    const body = document.createElement("p");
    body.textContent = agent.result || "";
    details.append(summary, body);
    panel.appendChild(details);
  });
  const note = document.createElement("p");
  note.className = "agent-run-footnote";
  note.textContent = "Agents analysed the task using Groq. No code was executed and no GitHub changes were committed automatically.";
  panel.appendChild(note);
  messagesEl.appendChild(panel);
  panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
  return /\b(my|this|the)\s+(project|repo|repository|website|web app|app|game|codebase|code|script|file|site|github)\b|\b(github repo|source code|bug in|error in|console error|stack trace|commit|deploy|deployment)\b|\b(index\.html|app\.js|server\.js|styles?\.css|stylesheet|package\.json)\b|\b(css|stylesheet|style sheet|styling)\b|\b(debug|fix|edit|change|update|add|remove|implement|refactor|repair|patch|improve|enhance|upgrade|modernize)\b.{0,70}\b(code|script|function|file|app|website|game|repo|css|style|design|ui)\b/i.test(text);
}
function isWebSearchRequest(text) {
  return /\b(search the web|search online|look (it|this|that) up|look up|google|find online|latest|current|live|right now|as of today|today|tonight|this week|this month|recent|breaking|news|weather|forecast|temperature|score|scores|standings|schedule|fixtures|results|release date|version|update|price|prices|stock|shares|exchange rate|currency|availability|open now|traffic|election|polls|who won|when does .* release|is .* still|has .* happened|source(s)? for|links? to)\b/i.test(text);
}

// Choose sources from the subject instead of sending every research question to a generic search.
function buildResearchSearchPlan(text, context = "") {
  const value = String(text || "");
  const contextText = String(context || "");
  const combined = value + " " + contextText;
  const sciencePattern = /\b(science|scientific|biology|biolog(y|ical)|cell|cells|mitochondri\w*|organell?e?s?|physics|chemistry|chemical|astronomy|space|planet|climate|ecosystem|evolution|genetics|DNA|RNA|anatomy|physiology|geology|microbiology|photosynthesis|cellular respiration|ATP|disease|medical research)\b/i;
  const science = sciencePattern.test(value) || sciencePattern.test(contextText);
  const asksForVideo = /\b(youtube|youtube video|yt video|video(s)?|watch|tutorial video)\b/i.test(value);
  const asksForLinks = /\b(link(s)?|source(s)?|website(s)?|reference(s)?)\b/i.test(value);
  const topicTerms = [...new Set((combined.match(/\b(?:mitochondri\w*|organell?e?s?|biology|physics|chemistry|astronomy|climate|ecosystem|evolution|genetics|DNA|RNA|anatomy|physiology|geology|microbiology|photosynthesis|cellular respiration|ATP|cells?)\b/gi) || []).map(term => term.toLowerCase()))].slice(0, 8);
  const queryBase = value.length > 150 ? value.slice(0, 150) : [value, ...topicTerms].filter(Boolean).join(" ");

  if (asksForVideo) {
    return { type: "video", query: queryBase + " site:youtube.com/watch OR site:youtu.be" };
  }
  if (science) {
    return {
      type: "science",
      query: queryBase + " (site:khanacademy.org OR site:nih.gov OR site:ncbi.nlm.nih.gov OR site:nature.com OR site:science.org OR site:nasa.gov OR site:noaa.gov OR site:usgs.gov)"
    };
  }
  if (asksForLinks) return { type: "links", query: queryBase };
  if (/\b(research|investigate|compare|evaluate|find evidence)\b/i.test(value)) return { type: "research", query: queryBase };
  return null;
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
  const linkOnlyMessage = Boolean(linkedRepo && !content.replace(/https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/ig, "").trim());
  const priorEditIntent = [...messages].reverse().find(item =>
    item?.role === "user" &&
    !extractGithubRepo(item.content) &&
    isProjectRelatedRequest(item.content) &&
    /\b(fix|change|edit|update|add|remove|implement|build|create|make|write|improve|enhance|upgrade|rewrite|refactor|modify|repair|patch|optimize|style|restyle|redesign)\b/i.test(item.content)
  );
  const editInstruction = linkOnlyMessage && priorEditIntent ? priorEditIntent.content : content;
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
      const projectRelated = isProjectRelatedRequest(content) || Boolean(linkOnlyMessage && priorEditIntent);
    const asksForEdit = /\b(fix|change|edit|update|add|remove|implement|build|create|make|write|improve|enhance|upgrade|rewrite|refactor|modify|repair|patch|optimize|style|restyle|redesign|modernize)\b/i.test(editInstruction) &&
      (isProjectRelatedRequest(editInstruction) || Boolean(activeGithubRepo));
    const useAgentMode = agentModeEnabled;
    if (useAgentMode) window.lastAgentRun = null;
    const useEditWorkflow = Boolean(!useAgentMode && activeGithubRepo && asksForEdit);
    const useRepositoryContext = Boolean(activeGithubRepo && projectRelated);
    let webResults = [];
    const recentUserContext = messages.slice(-8).filter(item => item.role === "user").map(item => item.content).join(" ");
    const researchPlan = buildResearchSearchPlan(content, recentUserContext);
    // Automatically research science questions and link/video requests; keep casual chat fast.
    if (isWebSearchRequest(content) || researchPlan) {
      try {
        pending.querySelector(".typing").textContent = researchPlan?.type === "science"
          ? "Checking trusted science sources···"
          : researchPlan?.type === "video" ? "Finding relevant YouTube videos···"
          : researchPlan?.type === "research" ? "Gathering research sources···" : "Searching the web···";
        const searchResponse = await fetch(API_BASE_URL + "/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: researchPlan?.query || content })
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
    const endpoint = useAgentMode ? "/api/agent/run" : (useEditWorkflow ? "/api/github/chat-edit" : "/api/chat");
    const preferenceMessages = messages.slice(useEditWorkflow ? -12 : -20).map(item => ({ ...item }));
    const preferenceContext = getPreferenceInstruction();
    const projectMemoryContext = getProjectMemoryContext();
    const payload = useAgentMode
      ? { messages: preferenceMessages, preferences: preferenceContext, projectMemory: projectMemoryContext, ...(activeGithubRepo ? { githubRepo: activeGithubRepo } : {}), ...(webResults.length ? { webResults } : {}) }
      : (useEditWorkflow
        ? { repo: activeGithubRepo, messages: preferenceMessages, editInstruction, preferences: preferenceContext, projectMemory: projectMemoryContext }
        : { messages: preferenceMessages, preferences: preferenceContext, projectMemory: projectMemoryContext, ...(useRepositoryContext ? { githubRepo: activeGithubRepo } : {}), ...(webResults.length ? { webResults } : {}) });
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
        body: JSON.stringify({ messages: messages.slice(-20), preferences: preferenceContext, projectMemory: projectMemoryContext, ...(useRepositoryContext ? { githubRepo: activeGithubRepo } : {}), ...(webResults.length ? { webResults } : {}) })
      });
      data = await response.json().catch(() => ({}));
      editRouteFallback = response.ok;
    }
    if (!response.ok) {
      const requestError = new Error(data.error || "Backend request failed (HTTP " + response.status + ").");
      requestError.code = data.code || "";
      throw requestError;
    }
    if (editRouteFallback) data.reply = "The structured GitHub edit service is not deployed yet, so I used repository-aware chat as a fallback. I can still inspect the repository and draft the changes, but the approve-and-commit panel is unavailable until the backend is redeployed.\n\n" + data.reply;
    if (useAgentMode && activeGithubRepo && asksForEdit) {
      pending.querySelector(".typing").textContent = "Preparing reviewable GitHub changes···";
      try {
        const editResponse = await fetch(API_BASE_URL + "/api/github/chat-edit", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ repo: activeGithubRepo, messages: preferenceMessages, editInstruction, preferences: preferenceContext, projectMemory: projectMemoryContext, agentFollowup: true })
        });
        const editData = await editResponse.json().catch(() => ({}));
        if (editResponse.ok && Array.isArray(editData.edits)) {
          chatEditResult = editData.edits.length ? editData.edits : null;
          if (!editData.edits.length) data.reply += "\n\nThe coding agent did not produce a reviewable file change for this request.";
        } else {
          data.reply += "\n\nI couldn't prepare the GitHub change proposal: " + (editData.error || "The edit service is unavailable.") + ". The analysis above is still available.";
        }
      } catch (editError) {
        data.reply += "\n\nI couldn't prepare the GitHub change proposal: " + editError.message + ". The analysis above is still available.";
      }
    }
    if (data.aiScore && Number.isFinite(data.aiScore.score)) {
      const label = data.aiScore.revised ? " · improved after review" : " · self-checked";
      data.reply += "\n\n> **CodeMind draft score:** " + Math.round(data.aiScore.score) + "/100" + label;
    }
    if (typeof data.reply !== "string" || !data.reply.trim()) throw new Error("The model returned an empty response.");
    messages.push({ role: "assistant", content: data.reply.trim() }); saveMessages();
    if (useEditWorkflow && data.edits?.length) chatEditResult = data.edits;
    if (useAgentMode) window.lastAgentRun = data;
  } catch (error) {
    if (error.code === "CHAT_HOURLY_LIMIT") {
      input.value = content;
      resizeInput();
      showChatLimitDialog(content);
    } else {
      messages.push({ role: "assistant", content: "I couldn't connect: " + error.message + "\n\nCheck that the CodeMind AI backend is deployed and GitHub is connected." }); saveMessages();
    }
  } finally {
    setBusy(false); render();
    if (window.lastAgentRun) { renderAgentRunDetails(window.lastAgentRun); window.lastAgentRun = null; }
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
  currentChatId = "chat-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  localStorage.setItem(CURRENT_CHAT_KEY, currentChatId);
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

/* Code editor: local drafts plus explicit, reviewed GitHub writes. */
const EDITOR_DRAFT_KEY = "codemind-editor-draft-v1";
let editorFile = null;
const editorCode = document.querySelector("#editorCode");
const editorPath = document.querySelector("#editorPath");
const editorLanguage = document.querySelector("#editorLanguage");
const editorStatus = document.querySelector("#editorStatus");
function saveEditorDraft(showNotice = true) {
  localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify({ code: editorCode.value, language: editorLanguage.value, path: editorPath.value }));
  if (showNotice) showToast("Editor draft saved in this browser.");
}
try {
  const draft = JSON.parse(localStorage.getItem(EDITOR_DRAFT_KEY) || "null");
  if (draft) {
    editorCode.value = typeof draft.code === "string" ? draft.code : "";
    editorLanguage.value = draft.language || "javascript";
    editorPath.value = draft.path || "";
  }
} catch {}
editorCode.addEventListener("input", () => {
  editorStatus.textContent = editorFile ? "Editing " + editorFile.path + " · unsaved changes" : "Local draft · unsaved changes";
});
document.querySelector("#saveEditorLocal").addEventListener("click", () => saveEditorDraft());
async function openEditorFile() {
  const repo = activeGithubRepo;
  const path = editorPath.value.trim().replace(/^\/+/, "");
  if (!repo) return showToast("Select a connected GitHub repository first.");
  if (!path || path.split("/").includes("..")) return showToast("Enter a valid relative file path.");
  const button = document.querySelector("#openEditorFile");
  button.disabled = true;
  button.textContent = "Opening…";
  try {
    const data = await githubFetch("/api/github/file?repo=" + encodeURIComponent(repo) + "&path=" + encodeURIComponent(path));
    editorCode.value = data.content || "";
    editorPath.value = data.path || path;
    editorFile = { repo, path: data.path || path, sha: data.sha || "" };
    editorStatus.textContent = repo + " / " + editorFile.path + (editorFile.sha ? " · loaded from GitHub" : " · backend update required to save");
    saveEditorDraft(false);
    showToast("Opened " + editorFile.path);
  } catch (error) {
    showToast(error.message || "Couldn't open that GitHub file.");
  } finally {
    button.disabled = false;
    button.textContent = "Open file";
  }
}
document.querySelector("#openEditorFile").addEventListener("click", openEditorFile);
document.querySelector("#saveEditorGithub").addEventListener("click", async () => {
  if (!editorFile || !editorFile.sha) return showToast("Open a GitHub file first.");
  if (editorFile.repo !== activeGithubRepo) return showToast("The selected repository changed. Reopen the file before saving.");
  if (!window.confirm("Save the reviewed editor contents to " + editorFile.repo + "/" + editorFile.path + "?")) return;
  const button = document.querySelector("#saveEditorGithub");
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    await githubPost("/api/github/commit-file", {
      repo: editorFile.repo, path: editorFile.path, sha: editorFile.sha,
      content: editorCode.value, message: "Update " + editorFile.path + " via CodeMind AI editor"
    });
    const fresh = await githubFetch("/api/github/file?repo=" + encodeURIComponent(editorFile.repo) + "&path=" + encodeURIComponent(editorFile.path));
    editorFile.sha = fresh.sha || "";
    editorStatus.textContent = editorFile.repo + " / " + editorFile.path + " · saved to GitHub";
    saveEditorDraft(false);
    showToast("GitHub file saved.");
  } catch (error) {
    showToast(error.message || "GitHub save failed. Reopen the file and retry.");
  } finally {
    button.disabled = false;
    button.textContent = "Review & save to GitHub";
  }
});
document.querySelector("#sendEditorChat").addEventListener("click", () => {
  const code = editorCode.value.trim();
  if (!code) return showToast("Add some code to the editor first.");
  showWorkspaceTab("chat");
  sendMessage("Please review this " + editorLanguage.value + " code and help me improve it:\n\n\x60\x60\x60" + editorLanguage.value + "\n" + code.slice(0, 12000) + "\n\x60\x60\x60");
});

/* GitHub intelligence uses the existing authenticated repository API. */
async function refreshGithubWorkspace() {
  const title = document.querySelector("#githubConnectionTitle");
  const text = document.querySelector("#githubConnectionText");
  const diagnostics = document.querySelector("#githubDiagnostics");
  title.textContent = "Checking GitHub…";
  text.textContent = "Loading repository access and installation status.";
  try {
    const results = await Promise.all([githubFetch("/api/github/status"), loadRepositories()]);
    const status = results[0];
    const repositories = results[1];
    title.textContent = "GitHub connected";
    text.textContent = "Authenticated owner workspace · " + (status.owner || "connected");
    document.querySelector("#githubRepoCount").textContent = String(status.repositoryCount ?? repositories.length);
    document.querySelector("#githubSelectedRepo").textContent = activeGithubRepo || "None selected";
    diagnostics.textContent = "Connection ready. Run diagnostics to inspect installation permissions.";
  } catch (error) {
    title.textContent = error.status === 401 ? "GitHub not connected" : "Connection unavailable";
    text.textContent = error.message || "Reconnect GitHub or check the backend.";
    document.querySelector("#githubRepoCount").textContent = "—";
    document.querySelector("#githubSelectedRepo").textContent = activeGithubRepo || "None selected";
    diagnostics.textContent = error.message || "GitHub status could not be loaded.";
  }
}
document.querySelector("#connectGithub").addEventListener("click", () => {
  window.location.href = API_BASE_URL + "/auth/github";
});
document.querySelector("#refreshGithub").addEventListener("click", refreshGithubWorkspace);
document.querySelector("#runGithubDiagnostics").addEventListener("click", async () => {
  const output = document.querySelector("#githubDiagnostics");
  output.textContent = "Running GitHub diagnostics…";
  try {
    const suffix = activeGithubRepo ? "?repo=" + encodeURIComponent(activeGithubRepo) : "";
    const data = await githubFetch("/api/github/diagnostics" + suffix);
    const permissions = data.tokenPermissions || data.installationPermissions || {};
    document.querySelector("#githubContentsPermission").textContent = permissions.contents || "Not reported";
    output.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    document.querySelector("#githubContentsPermission").textContent = "Unavailable";
    output.textContent = error.message || "Diagnostics failed.";
  }
});
document.querySelector("#githubOpenFile").addEventListener("click", () => {
  const path = document.querySelector("#githubFilePath").value.trim();
  if (!path) return showToast("Enter a file path first.");
  editorPath.value = path;
  showWorkspaceTab("editor");
  openEditorFile();
});


/* Smart Search reuses CodeMind's multi-source backend search. */
document.querySelector("#smartSearchForm").addEventListener("submit", async event => {
  event.preventDefault();
  const query = document.querySelector("#smartSearchInput").value.trim();
  if (!query) return;
  const status = document.querySelector("#smartSearchStatus");
  const resultsEl = document.querySelector("#smartSearchResults");
  const submit = document.querySelector("#smartSearchSubmit");
  submit.disabled = true;
  submit.textContent = "Searching…";
  status.textContent = "Searching available sources…";
  resultsEl.replaceChildren();
  try {
    const response = await fetch(API_BASE_URL + "/api/search", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Search failed.");
    status.textContent = (data.provider || "Web search") + (data.cached ? " · cached results" : "") + " · " + data.results.length + " results";
    (data.results || []).forEach(result => {
      const card = document.createElement("article");
      card.className = "search-result";
      const link = document.createElement("a");
      link.href = result.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = result.title || result.url;
      const url = document.createElement("div");
      url.className = "search-result-url";
      url.textContent = result.url;
      const snippet = document.createElement("p");
      snippet.textContent = result.snippet || "No description was provided.";
      card.append(link, url, snippet);
      resultsEl.append(card);
    });
    if (!data.results || !data.results.length) status.textContent = "No results were returned.";
  } catch (error) {
    status.textContent = error.message || "Search is temporarily unavailable.";
  } finally {
    submit.disabled = false;
    submit.textContent = "Search";
  }
});

/* Project memory is private to this browser profile. */
const PROJECT_MEMORY_KEY = "codemind-project-memory-v1";
function readProjectMemory() {
  try {
    const items = JSON.parse(localStorage.getItem(PROJECT_MEMORY_KEY) || "[]");
    return Array.isArray(items) ? items.filter(item => item && typeof item.title === "string" && typeof item.body === "string").slice(0, 150) : [];
  } catch { return []; }
}
function getProjectMemoryContext() {
  const notes = readProjectMemory().filter(item => {
    const scope = item.repo || "General workspace";
    return scope === "General workspace" || (Boolean(activeGithubRepo) && scope === activeGithubRepo);
  }).slice(0, 8);
  return notes.map(item => "[" + (item.repo || "General workspace") + "] " + item.title + "\n" + item.body).join("\n\n").slice(0, 8000);
}
function renderProjectMemory() {
  const list = document.querySelector("#memoryList");
  const filter = (document.querySelector("#memoryFilter").value || "").trim().toLowerCase();
  const items = readProjectMemory().filter(item => (item.title + " " + item.body + " " + (item.repo || "")).toLowerCase().includes(filter));
  list.replaceChildren();
  document.querySelector("#memoryProjectLabel").textContent = activeGithubRepo || "General workspace";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "memory-empty";
    empty.textContent = filter ? "No notes match that filter." : "No project notes yet. Save a decision or useful snippet above.";
    list.append(empty);
    return;
  }
  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "memory-note";
    const head = document.createElement("div");
    head.className = "memory-note-head";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const date = document.createElement("time");
    date.textContent = new Date(item.updatedAt).toLocaleString();
    head.append(title, date);
    const body = document.createElement("p");
    body.textContent = item.body;
    const meta = document.createElement("div");
    meta.className = "memory-note-meta";
    meta.textContent = item.repo || "General workspace";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => {
      localStorage.setItem(PROJECT_MEMORY_KEY, JSON.stringify(readProjectMemory().filter(entry => entry.id !== item.id)));
      renderProjectMemory();
      showToast("Project note deleted.");
    });
    card.append(head, body, meta, remove);
    list.append(card);
  });
}
document.querySelector("#memoryNoteForm").addEventListener("submit", event => {
  event.preventDefault();
  const title = document.querySelector("#memoryNoteTitle").value.trim();
  const body = document.querySelector("#memoryNoteBody").value.trim();
  if (!title || !body) return;
  const items = readProjectMemory();
  items.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), title, body, repo: activeGithubRepo || "General workspace", updatedAt: new Date().toISOString() });
  localStorage.setItem(PROJECT_MEMORY_KEY, JSON.stringify(items.slice(0, 150)));
  event.target.reset();
  renderProjectMemory();
  showToast("Project note saved locally.");
});
document.querySelector("#memoryFilter").addEventListener("input", renderProjectMemory);

/* Test Lab executes JavaScript in a disposable worker with a hard timeout. */
document.querySelector("#runTestLab").addEventListener("click", () => {
  const code = document.querySelector("#testLabCode").value;
  const output = document.querySelector("#testLabOutput");
  const status = document.querySelector("#testLabStatus");
  const runButton = document.querySelector("#runTestLab");
  output.textContent = "";
  status.textContent = "Running…";
  runButton.disabled = true;
  const workerSource = [
    'const safeText = value => { try { return typeof value === "string" ? value : JSON.stringify(value); } catch { return String(value); } };',
    'for (const method of ["log","info","warn","error","debug"]) console[method] = (...values) => postMessage({ type: "log", level: method, values: values.map(safeText) });',
    'self.fetch = () => Promise.reject(new Error("Network access is disabled in Test Lab"));',
    'self.XMLHttpRequest = class { constructor() { throw new Error("Network access is disabled in Test Lab"); } };',
    'self.WebSocket = class { constructor() { throw new Error("Network access is disabled in Test Lab"); } };',
    'self.EventSource = class { constructor() { throw new Error("Network access is disabled in Test Lab"); } };',
    'self.Worker = class { constructor() { throw new Error("Nested workers are disabled in Test Lab"); } };',
    'self.importScripts = () => { throw new Error("External scripts are disabled in Test Lab"); };',
    'try { const result = new Function(' + JSON.stringify(code) + ')(); if (result && typeof result.then === "function") result.then(() => postMessage({ type: "done" })).catch(error => postMessage({ type: "error", message: error.stack || error.message })); else postMessage({ type: "done" }); } catch (error) { postMessage({ type: "error", message: error.stack || error.message }); }'
  ].join("\n");
  let worker;
  let finished = false;
  let workerUrl = "";
  const appendOutput = (message, level) => {
    const line = document.createElement("div");
    line.className = "testlab-line " + level;
    line.textContent = message;
    output.append(line);
  };
  const finish = (message, failed = false) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    if (worker) worker.terminate();
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    runButton.disabled = false;
    status.textContent = failed ? "Stopped with an error" : "Finished";
    if (message) appendOutput(message, failed ? "error" : "system");
  };
  const timeout = setTimeout(() => finish("Execution stopped after 3.5 seconds.", true), 3500);
  try {
    workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    worker = new Worker(workerUrl);
    worker.onmessage = event => {
      const data = event.data || {};
      if (data.type === "log") appendOutput((data.values || []).join(" "), data.level || "log");
      else if (data.type === "error") finish(data.message || "Unknown error", true);
      else if (data.type === "done") finish("Execution complete.");
    };
    worker.onerror = event => finish(event.message || "Worker error.", true);
  } catch (error) {
    finish(error.message || "Could not start the isolated worker.", true);
  }
});
document.querySelector("#clearTestLab").addEventListener("click", () => {
  document.querySelector("#testLabOutput").textContent = "Output cleared.";
  document.querySelector("#testLabStatus").textContent = "Ready";
});

function showWorkspaceTab(tab) {
  const views = { editor: "#editorView", github: "#githubView", search: "#searchView", memory: "#memoryView", testlab: "#testLabView", scorer: "#scorerView", news: "#newsView", preferences: "#preferencesView" };
  Object.entries(views).forEach(([key, selector]) => {
    const view = document.querySelector(selector);
    if (view) view.hidden = key !== tab;
  });
  const isChat = tab === "chat";
  chatArea.hidden = !isChat;
  composerWrap.hidden = !isChat;
  document.querySelectorAll("[data-workspace-tab]").forEach(button => button.classList.toggle("active", button.dataset.workspaceTab === tab));
  const labels = { chat: "New conversation", editor: "Code editor", github: "GitHub", search: "Smart search", memory: "Project memory", testlab: "Test lab", scorer: "Work scorer", news: "News", preferences: "Preferences" };
  document.querySelector(".breadcrumb strong").textContent = labels[tab] || "Workspace";
  document.querySelector("#sidebar").classList.remove("open");
  if (tab === "memory") renderProjectMemory();
  if (tab === "github") refreshGithubWorkspace();
}
chatButton.addEventListener("click", () => showWorkspaceTab("chat"));
newsButton.addEventListener("click", () => showWorkspaceTab("news"));
document.querySelector("#preferencesButton").addEventListener("click", () => showWorkspaceTab("preferences"));
document.querySelector("#editorButton").addEventListener("click", () => showWorkspaceTab("editor"));
document.querySelector("#githubButton").addEventListener("click", () => showWorkspaceTab("github"));
document.querySelector("#searchButton").addEventListener("click", () => showWorkspaceTab("search"));
document.querySelector("#memoryButton").addEventListener("click", () => showWorkspaceTab("memory"));
document.querySelector("#testLabButton").addEventListener("click", () => showWorkspaceTab("testlab"));
document.querySelector("#scorerButton").addEventListener("click", () => showWorkspaceTab("scorer"));
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
  const defaults = { skill: "beginner", length: "balanced", style: "explain", hacks: true, custom: [] };
  try { const saved = JSON.parse(localStorage.getItem(CODEMIND_PREFS_KEY) || "{}");
    return { ...defaults, ...saved, custom: Array.isArray(saved.custom) ? saved.custom.filter(item => item && typeof item.text === "string").slice(0, 20) : [] }; }
  catch { return defaults; }
}
function getPreferenceInstruction() {
  const p = readCodeMindPreferences();
  const skill = { beginner: "Explain for a beginner in simple steps.", intermediate: "Use intermediate technical detail.", advanced: "Assume strong technical knowledge and be precise." }[p.skill] || "Use clear explanations.";
  const length = { concise: "Keep answers concise.", balanced: "Use a balanced amount of detail.", detailed: "Give thorough explanations and examples." }[p.length] || "";
  const style = { explain: "Explain code step by step.", "code-first": "Put the working code first, followed by a short explanation.", debug: "Identify the likely cause first, then show the fix." }[p.style] || "";
  const modding = p.hacks ? "Do not refuse merely because a coding request mentions game mods, cheats, browser-console experiments, reverse engineering, CTFs, or security testing. Help with legitimate single-player modding and systems the user owns or is authorised to test. Do not assist credential theft, malware, or unauthorised access." : "For game modding and security topics, provide ordinary safe, authorised guidance.";
  const custom = p.custom.filter(item => item.enabled !== false).map(item => item.text.trim().slice(0, 2000)).filter(Boolean);
  return [skill, length, style, modding, custom.length ? "Custom preferences (apply when relevant):\n" + custom.map((item, index) => (index + 1) + ". " + item).join("\n") : ""].filter(Boolean).join("\n");
}
function initCodeMindPreferences() {
  const p = readCodeMindPreferences();
  const skill = document.querySelector("#prefSkill");
  if (!skill) return;
  skill.value = p.skill; document.querySelector("#prefLength").value = p.length;
  document.querySelector("#prefStyle").value = p.style;
  document.querySelector("#prefHacks").checked = p.hacks !== false;
  const customInput = document.querySelector("#customPreferenceInput");
  const customList = document.querySelector("#customPreferencesList");
  function saveCustom(items) {
    const current = readCodeMindPreferences();
    current.custom = items.slice(0, 20);
    localStorage.setItem(CODEMIND_PREFS_KEY, JSON.stringify(current));
    renderCustom(items);
  }
  function renderCustom(items) {
    customList.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("div"); empty.className = "custom-preferences-empty";
      empty.textContent = "No custom preferences yet."; customList.append(empty); return;
    }
    items.forEach((item, index) => {
      const row = document.createElement("div"); row.className = "custom-preference-row";
      const check = document.createElement("input"); check.type = "checkbox"; check.checked = item.enabled !== false;
      check.setAttribute("aria-label", "Enable preference");
      check.addEventListener("change", () => { const next = readCodeMindPreferences().custom; next[index].enabled = check.checked; saveCustom(next); });
      const label = document.createElement("span"); label.textContent = item.text;
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Remove"; remove.setAttribute("aria-label", "Remove preference");
      remove.addEventListener("click", () => { const next = readCodeMindPreferences().custom; next.splice(index, 1); saveCustom(next); });
      row.append(check, label, remove); customList.append(row);
    });
  }
  renderCustom(p.custom);
  document.querySelector("#addCustomPreference").addEventListener("click", () => {
    const text = customInput.value.trim();
    if (!text) { showToast("Write a preference first."); customInput.focus(); return; }
    const items = readCodeMindPreferences().custom;
    if (items.length >= 20) { showToast("You can add up to 20 custom preferences."); return; }
    if (items.some(item => item.text.toLowerCase() === text.toLowerCase())) { showToast("That preference already exists."); return; }
    items.push({ text, enabled: true }); saveCustom(items); customInput.value = ""; showToast("Custom preference added.");
  });
  customInput.addEventListener("keydown", event => { if (event.key === "Enter") document.querySelector("#addCustomPreference").click(); });
  document.querySelector("#savePreferences").addEventListener("click", () => {
    const next = { skill: skill.value, length: document.querySelector("#prefLength").value,
      style: document.querySelector("#prefStyle").value, hacks: document.querySelector("#prefHacks").checked, custom: readCodeMindPreferences().custom };
    localStorage.setItem(CODEMIND_PREFS_KEY, JSON.stringify(next));
    showToast("Preferences saved.");
  });
}
initCodeMindPreferences();
renderProjectMemory();


/* CodeMind voice input */
(() => {
  const voiceButton = document.querySelector("#voiceButton");
  const voiceLabel = document.querySelector("#voiceButtonLabel");
  const voiceStatus = document.querySelector("#voiceStatus");
  if (!voiceButton || !voiceLabel || !voiceStatus) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceButton.disabled = true;
    voiceButton.title = "Voice typing is not supported by this browser.";
    voiceLabel.textContent = "Unavailable";
    voiceStatus.textContent = "BROWSER UNSUPPORTED";
    voiceStatus.classList.add("is-error");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-AU";
  recognition.continuous = true;
  recognition.interimResults = true;
  let listening = false;
  let finalTranscript = "";
  let baseText = "";
  let silenceTimer = null;
  let autoSubmitRequested = false;

  function clearSilenceTimer() {
    if (silenceTimer) window.clearTimeout(silenceTimer);
    silenceTimer = null;
  }

  function setListening(active) {
    listening = active;
    voiceButton.classList.toggle("is-listening", active);
    voiceButton.setAttribute("aria-pressed", String(active));
    voiceLabel.textContent = active ? "Stop" : "Voice";
    voiceButton.title = active ? "Stop voice typing" : "Start voice typing";
    voiceStatus.classList.toggle("is-listening", active);
    if (!active) voiceStatus.textContent = "VOICE READY";
  }

  voiceButton.addEventListener("click", () => {
    if (listening) {
      clearSilenceTimer();
      autoSubmitRequested = false;
      recognition.stop();
      return;
    }
    if (!window.isSecureContext) {
      voiceStatus.textContent = "HTTPS REQUIRED";
      voiceStatus.classList.add("is-error");
      showToast("Voice typing needs a secure HTTPS page.");
      return;
    }
    finalTranscript = "";
    baseText = input.value.trim();
    voiceStatus.classList.remove("is-error");
    voiceStatus.textContent = "REQUESTING MIC…";
    try { recognition.start(); }
    catch (error) {
      voiceStatus.textContent = "TRY AGAIN";
      voiceStatus.classList.add("is-error");
      showToast("Microphone could not start. Try again.");
    }
  });

  recognition.onstart = () => {
    setListening(true);
    voiceStatus.textContent = "LISTENING";
  };

  recognition.onresult = event => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const phrase = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += phrase;
      else interim += phrase;
    }
    const spoken = [finalTranscript.trim(), interim.trim()].filter(Boolean).join(" ");
    input.value = [baseText, spoken].filter(Boolean).join(baseText && spoken ? " " : "");
    if (interim) voiceStatus.textContent = "HEARING: " + interim.trim().slice(0, 28);
    else voiceStatus.textContent = "VOICE CAPTURED";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    // Automatically send after 900ms without another speech result.
    clearSilenceTimer();
    if (spoken.trim()) {
      silenceTimer = window.setTimeout(() => {
        if (!listening || !input.value.trim() || busy) return;
        autoSubmitRequested = true;
        voiceStatus.textContent = "SENDING…";
        recognition.stop();
      }, 900);
    }
  };

  recognition.onerror = event => {
    const messages = {
      "not-allowed": "Microphone permission was blocked.",
      "service-not-allowed": "Speech recognition is blocked by the browser.",
      "no-speech": "No speech detected. Tap Voice to try again.",
      "audio-capture": "No microphone was found."
    };
    voiceStatus.textContent = "VOICE ERROR";
    voiceStatus.classList.add("is-error");
    showToast(messages[event.error] || "Voice recognition stopped: " + event.error);
  };

  recognition.onend = () => {
    clearSilenceTimer();
    setListening(false);
    if (autoSubmitRequested) {
      autoSubmitRequested = false;
      const transcript = input.value.trim();
      if (transcript) sendMessage(transcript);
      return;
    }
    if (finalTranscript.trim()) voiceStatus.textContent = "VOICE CAPTURED";
    else if (!voiceStatus.classList.contains("is-error")) voiceStatus.textContent = "VOICE READY";
  };

  form.addEventListener("submit", () => {
    if (listening) recognition.stop();
  });
  window.addEventListener("pagehide", () => {
    if (listening) recognition.abort();
  });
})();


// CodeMind Scorer — structured JSON evaluation for code, Geometry Dash, and general work.
(() => {
  const scorerForm = document.querySelector("#scorerForm");
  if (!scorerForm) return;
  const status = document.querySelector("#scorerStatus");
  const result = document.querySelector("#scorerResult");
  const submit = document.querySelector("#scorerSubmit");
  scorerForm.addEventListener("submit", async event => {
    event.preventDefault();
    const submission = document.querySelector("#scorerSubmission").value.trim();
    if (!submission) return;
    submit.disabled = true;
    submit.textContent = "Scoring…";
    status.textContent = "Evaluating against the selected rubric…";
    result.hidden = true;
    result.textContent = "";
    try {
      const response = await fetch(API_BASE_URL + "/api/essay-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: document.querySelector("#scorerCategory").value,
          submission,
          reference: document.querySelector("#scorerReference").value,
          rubric: document.querySelector("#scorerRubric").value
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Scoring request failed.");
      const evaluation = data.evaluation;
      if (!evaluation || !evaluation.scores) throw new Error("The scorer returned an incomplete result.");
      result.textContent = JSON.stringify(evaluation, null, 2);
      result.hidden = false;
      status.textContent = "Evaluation complete · " + evaluation.scores.total + "/100" +
        (evaluation.is_provisional ? " · provisional" : "");
    } catch (error) {
      status.textContent = error.message || "Could not score this submission.";
    } finally {
      submit.disabled = false;
      submit.textContent = "◎ Score submission";
    }
  });
})();
