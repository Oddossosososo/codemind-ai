const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const messagesEl = document.querySelector("#messages");
const welcome = document.querySelector("#welcome");
const githubPanel = document.querySelector("#githubPanel");
const chatArea = document.querySelector("#chatArea");
const githubStatus = document.querySelector("#githubStatus");
const repoSelect = document.querySelector("#repoSelect");
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
        githubFile: activeGithubFile
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
  repoSelect.innerHTML = '<option value="">Choose a repository…</option>' +
    data.repositories.map(repo => '<option value="' + escapeHTML(repo.full_name) + '">' +
      escapeHTML(repo.full_name) + (repo.private ? " · private" : "") + '</option>').join("");
}
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
    fileViewer.replaceChildren(title, pre, attachButton);
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