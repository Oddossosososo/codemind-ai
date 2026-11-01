const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const messagesEl = document.querySelector("#messages");
const welcome = document.querySelector("#welcome");
const githubPanel = document.querySelector("#githubPanel");
const chatArea = document.querySelector("#chatArea");
const githubStatus = document.querySelector("#githubStatus");
const repoSelect = document.querySelector("#repoSelect");
const activeRepoSelect = document.querySelector("#activeRepoSelect");
const REPO_STORAGE_KEY = "codemind-selected-repo-v1";
let activeGithubRepo = localStorage.getItem(REPO_STORAGE_KEY) || "";
const fileViewer = document.querySelector("#fileViewer");
const sendButton = document.querySelector("#sendButton");
const toast = document.querySelector("#toast");
const STORAGE_KEY = "codemind-chat-v1";
const API_BASE_URL = "https://codemind-ai-l8ix.onrender.com";
let messages = loadMessages();
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
      status.textContent = completed
        ? completed + " file(s) committed before an error: " + error.message
        : error.message;
      approve.disabled = false;
      approve.textContent = "Retry remaining changes";
      entries.splice(0, completed);
    }
  });
  panel.append(approve, status);
  messagesEl.appendChild(panel);
  panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
async function sendMessage(text) {
  const content = text.trim();
  if (!content || busy) return;
  messages.push({ role: "user", content });
  saveMessages();
  render();
  input.value = "";
  resizeInput();
  setBusy(true);
  const pending = document.createElement("article");
  pending.className = "message";
  pending.innerHTML = '<div class="message-avatar">C</div><div class="message-content"><div class="message-role">CODEMIND</div><div class="message-text typing">Thinking···</div></div>';
  messagesEl.appendChild(pending);
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        messages: messages.slice(-20),
        githubFile: activeGithubFile,
        githubRepo: activeGithubRepo
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The server couldn't answer. Check your setup.");
    if (typeof data.reply !== "string" || !data.reply.trim()) throw new Error("The model returned an empty response.");
    messages.push({ role: "assistant", content: data.reply.trim() });
    saveMessages();
  } catch (error) {
    messages.push({ role: "assistant", content: "I couldn't connect: " + error.message + "\n\nCheck that the CodeMind backend is deployed and GROQ_API_KEY is configured." });
    saveMessages();
  } finally {
    setBusy(false);
    render();
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
const githubButton = document.querySelector("#githubButton");
function showGithubPanel() {
  githubPanel.hidden = false;
  chatArea.hidden = true;
  document.querySelector(".composer-wrap").hidden = true;
  githubButton.classList.add("active");
  document.querySelector(".side-link.active:not(#githubButton)")?.classList.remove("active");
  loadGithubStatus();
}
function showChatPanel() {
  githubPanel.hidden = true;
  chatArea.hidden = false;
  document.querySelector(".composer-wrap").hidden = false;
  githubButton.classList.remove("active");
  document.querySelector(".side-link:not(#githubButton)")?.classList.add("active");
}
async function githubFetch(path) {
  const response = await fetch(API_BASE_URL + path, { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "GitHub request failed.");
  return data;
}
async function githubPost(path, body) {
  const response = await fetch(API_BASE_URL + path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "GitHub request failed.");
  return data;
}
async function loadGithubStatus() {
  githubStatus.textContent = "Checking GitHub connection…";
  try {
    const status = await githubFetch("/api/github/status");
    githubStatus.textContent = "Connected as " + status.owner + " · " + status.repositoryCount + " repositories available.";
    await loadRepositories();
  } catch (error) {
    githubStatus.textContent = error.message;
    repoSelect.innerHTML = '<option value="">Connect your GitHub account first</option>';
  }
}
async function loadRepositories() {
  const data = await githubFetch("/api/github/repos");
  const options = data.repositories.map(repo => '<option value="' + escapeHTML(repo.full_name) + '">' +
    escapeHTML(repo.full_name) + (repo.private ? " · private" : "") + '</option>').join("");
  repoSelect.innerHTML = '<option value="">Choose a repository…</option>' + options;
  activeRepoSelect.innerHTML = '<option value="">No repository selected</option>' + options;
  if (data.repositories.some(repo => repo.full_name === activeGithubRepo)) {
    activeRepoSelect.value = activeGithubRepo;
  } else {
    activeGithubRepo = "";
    localStorage.removeItem(REPO_STORAGE_KEY);
    activeRepoSelect.value = "";
  }
}
activeRepoSelect.addEventListener("change", () => {
  activeGithubRepo = activeRepoSelect.value;
  if (activeGithubRepo) localStorage.setItem(REPO_STORAGE_KEY, activeGithubRepo);
  else localStorage.removeItem(REPO_STORAGE_KEY);
  showToast(activeGithubRepo ? "Chat is now connected to " + activeGithubRepo : "Repository context turned off.");
});
githubButton.addEventListener("click", showGithubPanel);
document.querySelector("#connectGithub").addEventListener("click", () => {
  window.location.href = API_BASE_URL + "/auth/github";
});
document.querySelector("#refreshRepos").addEventListener("click", async () => {
  try { await loadRepositories(); showToast("Repositories refreshed."); }
  catch (error) { showToast(error.message); }
});
document.querySelector("#fileForm").addEventListener("submit", async event => {
  event.preventDefault();
  const repo = repoSelect.value;
  const filePath = document.querySelector("#filePath").value.trim();
  if (!repo || !filePath) return showToast("Choose a repository and enter a file path.");
  fileViewer.textContent = "Loading file…";
  try {
    const data = await githubFetch("/api/github/file?repo=" + encodeURIComponent(repo) + "&path=" + encodeURIComponent(filePath));
    const title = document.createElement("div");
    title.className = "file-title";
    title.textContent = data.path;
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = data.content;
    pre.appendChild(code);
    const attachButton = document.createElement("button");
    attachButton.type = "button";
    attachButton.className = "attach-file-button";
    attachButton.textContent = "＋ Use this file in chat";
    attachButton.addEventListener("click", () => {
      activeGithubFile = { repo, path: data.path };
      showChatPanel();
      showToast("Attached " + data.path + " to your next messages.");
      input.focus();
    });
    const editBox = document.createElement("section");
    editBox.className = "github-edit-box";
    const editHeading = document.createElement("strong");
    editHeading.textContent = "Ask CodeMind to edit this file";
    const instruction = document.createElement("textarea");
    instruction.className = "github-edit-instruction";
    instruction.rows = 2;
    instruction.placeholder = "Example: Add a dark mode toggle without changing existing features.";
    const proposeButton = document.createElement("button");
    proposeButton.type = "button";
    proposeButton.className = "github-propose-button";
    proposeButton.textContent = "✦ Generate edit";
    const proposalStatus = document.createElement("div");
    proposalStatus.className = "github-proposal-status";
    const proposalEditor = document.createElement("textarea");
    proposalEditor.className = "github-proposal-editor";
    proposalEditor.spellcheck = false;
    proposalEditor.hidden = true;
    const commitRow = document.createElement("div");
    commitRow.className = "github-commit-row";
    const commitMessage = document.createElement("input");
    commitMessage.className = "github-commit-message";
    commitMessage.placeholder = "Commit message";
    commitMessage.value = "Update " + data.path;
    const commitButton = document.createElement("button");
    commitButton.type = "button";
    commitButton.className = "github-commit-button";
    commitButton.textContent = "Approve & commit";
    commitButton.hidden = true;
    commitRow.append(commitMessage, commitButton);
    proposalEditor.addEventListener("input", () => {
      if (pendingProposal) commitButton.disabled = proposalEditor.value === pendingProposal.original;
    });
    editBox.append(editHeading, instruction, proposeButton, proposalStatus, proposalEditor, commitRow);

    let pendingProposal = null;
    proposeButton.addEventListener("click", async () => {
      const request = instruction.value.trim();
      if (!request) return showToast("Describe the change you want CodeMind to make.");
      proposeButton.disabled = true;
      proposeButton.textContent = "Generating…";
      proposalStatus.textContent = "CodeMind is reading the current file and preparing a proposed replacement.";
      proposalEditor.hidden = true;
      commitButton.hidden = true;
      try {
        pendingProposal = await githubPost("/api/github/propose-edit", {
          repo,
          path: data.path,
          instruction: request
        });
        proposalEditor.value = pendingProposal.content;
        proposalEditor.hidden = false;
        commitButton.hidden = false;
        proposalStatus.textContent = pendingProposal.summary + " Review and edit the proposed code below before approving.";
        commitButton.disabled = pendingProposal.content === pendingProposal.original;
      } catch (error) {
        proposalStatus.textContent = error.message;
      } finally {
        proposeButton.disabled = false;
        proposeButton.textContent = "✦ Generate edit";
      }
    });

    commitButton.addEventListener("click", async () => {
      if (!pendingProposal) return;
      if (!window.confirm("Commit this reviewed file to " + repo + " on its default branch?")) return;
      commitButton.disabled = true;
      commitButton.textContent = "Committing…";
      try {
        const result = await githubPost("/api/github/commit-file", {
          repo,
          path: data.path,
          sha: pendingProposal.sha,
          content: proposalEditor.value,
          message: commitMessage.value.trim() || ("Update " + data.path)
        });
        proposalStatus.textContent = "Committed successfully: " + result.path;
        commitButton.textContent = "Committed ✓";
        showToast("Changes committed to GitHub.");
        const refreshed = await githubFetch("/api/github/file?repo=" + encodeURIComponent(repo) + "&path=" + encodeURIComponent(data.path));
        code.textContent = refreshed.content;
        pendingProposal = null;
        commitButton.hidden = true;
      } catch (error) {
        proposalStatus.textContent = error.message;
        commitButton.disabled = false;
        commitButton.textContent = "Approve & commit";
      }
    });

    fileViewer.replaceChildren(title, pre, attachButton, editBox);
  } catch (error) {
    fileViewer.textContent = error.message;
  }
});
if (new URLSearchParams(location.search).get("github") === "connected") {
  history.replaceState({}, "", location.pathname);
  showGithubPanel();
}
document.querySelector(".side-link.active")?.addEventListener("click", showChatPanel);
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
render();
if (new URLSearchParams(location.search).get("github") !== "connected") {
  githubFetch("/api/github/status").then(() => loadRepositories()).catch(() => {});
}