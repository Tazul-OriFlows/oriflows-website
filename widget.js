/**
 * OriFlows Chat Widget — Frontend (PRODUCTION v2)
 * -------------------------------------------------
 * Add before </body> on every page:
 *   <script src="widget-v2.js" defer></script>
 *
 * Adds over v1: lead capture form, human handoff button, animated typing
 * indicator, sessionStorage persistence, honeypot spam field, mobile-safe
 * layout, client-side rate-limit awareness, message length limit.
 */

(function () {
  // ⚠️ CHANGE THIS to your deployed Cloudflare Worker URL
  const WORKER_URL = "https://oriflows-chatbot.oriflows.workers.dev";

  const BRAND_NAME = "AI Receptionist";
  const BRAND_STATUS = "Online 24/7";
  const WELCOME_MESSAGE = "Hi! 👋 I'm here to help with any questions about OriFlows. What would you like to know?";
  const ACCENT_COLOR = "#2563eb";
  const MAX_MESSAGE_LENGTH = 500;
  const MAX_STORED_MESSAGES = 12;
  const LEAD_PROMPT_AFTER_USER_MESSAGES = 3; // show inline lead form after this many user turns
  const STORAGE_KEY = "of_chat_state_v2";

  let state = loadState();

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { conversation: [], userTurns: 0, leadCaptured: false, leadDismissed: false };
  }

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  function init() {
    injectStyles();
    const { bubble, win, messagesEl, inputEl, sendBtn, closeBtn, handoffBtn, charCount } = buildUI();

    let isOpen = false;

    function toggleChat() {
      isOpen = !isOpen;
      win.classList.toggle("of-open", isOpen);
      if (isOpen) {
        if (messagesEl.children.length === 0) {
          if (state.conversation.length === 0) {
            addMessage(messagesEl, "bot", WELCOME_MESSAGE);
          } else {
            // Restore prior conversation from this session
            state.conversation.forEach((m) => addMessage(messagesEl, m.role === "user" ? "user" : "bot", m.content));
          }
        }
        inputEl.focus();
      }
    }

    async function sendMessage() {
      const text = inputEl.value.trim();
      if (!text) return;
      if (text.length > MAX_MESSAGE_LENGTH) {
        addMessage(messagesEl, "bot", `Please keep messages under ${MAX_MESSAGE_LENGTH} characters.`);
        return;
      }

      addMessage(messagesEl, "user", text);
      state.conversation.push({ role: "user", content: text });
      state.conversation = state.conversation.slice(-MAX_STORED_MESSAGES);
      state.userTurns += 1;
      saveState();

      inputEl.value = "";
      updateCharCount(charCount, inputEl);
      sendBtn.disabled = true;

      const typingEl = addTypingIndicator(messagesEl);

      try {
        const res = await fetch(WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: state.conversation, hp: honeypotValue() }),
        });

        typingEl.remove();

        if (res.status === 429) {
          addMessage(messagesEl, "bot", "You're sending messages a bit fast — please wait a moment.");
          return;
        }
        if (!res.ok) {
          addMessage(messagesEl, "bot", "Sorry, something went wrong. Please try again in a moment.");
          return;
        }

        const data = await res.json();
        const reply = data.reply || "Sorry, I didn't catch that.";
        addMessage(messagesEl, "bot", reply);
        state.conversation.push({ role: "assistant", content: reply });
        state.conversation = state.conversation.slice(-MAX_STORED_MESSAGES);
        saveState();

        if (data.showLeadForm && !state.leadCaptured && !state.leadDismissed) {
          showLeadForm(messagesEl);
        } else if (
          !state.leadCaptured &&
          !state.leadDismissed &&
          state.userTurns >= LEAD_PROMPT_AFTER_USER_MESSAGES
        ) {
          showLeadForm(messagesEl);
        }
      } catch {
        typingEl.remove();
        addMessage(messagesEl, "bot", "Connection error. Please try again in a moment.");
      } finally {
        sendBtn.disabled = false;
        inputEl.focus();
      }
    }

    function showLeadForm(messagesEl) {
      const card = document.createElement("div");
      card.className = "of-lead-card";
      card.innerHTML = `
        <div class="of-lead-title">Want us to follow up?</div>
        <input type="text" class="of-lead-input" placeholder="Your name (optional)" id="of-lead-name" />
        <input type="email" class="of-lead-input" placeholder="Email" id="of-lead-email" />
        <input type="tel" class="of-lead-input" placeholder="Phone (optional)" id="of-lead-phone" />
        <div class="of-lead-actions">
          <button class="of-lead-submit">Send</button>
          <button class="of-lead-skip">No thanks</button>
        </div>
      `;
      messagesEl.appendChild(card);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      card.querySelector(".of-lead-submit").addEventListener("click", async () => {
        const name = card.querySelector("#of-lead-name").value.trim();
        const email = card.querySelector("#of-lead-email").value.trim();
        const phone = card.querySelector("#of-lead-phone").value.trim();
        if (!email && !phone) {
          card.querySelector(".of-lead-title").textContent = "Please add at least an email or phone.";
          return;
        }
        try {
          await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lead: { name, email, phone, source: "widget_form" }, hp: honeypotValue() }),
          });
        } catch {}
        state.leadCaptured = true;
        saveState();
        card.remove();
        addMessage(messagesEl, "bot", "Thanks! Someone from OriFlows will reach out shortly. 🙌");
      });

      card.querySelector(".of-lead-skip").addEventListener("click", () => {
        state.leadDismissed = true;
        saveState();
        card.remove();
      });
    }

    async function requestHandoff() {
      addMessage(messagesEl, "user", "I'd like to talk to a human.");
      state.conversation.push({ role: "user", content: "I'd like to talk to a human." });
      state.conversation = state.conversation.slice(-MAX_STORED_MESSAGES);
      saveState();
      const typingEl = addTypingIndicator(messagesEl);
      try {
        const res = await fetch(WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: state.conversation, hp: honeypotValue() }),
        });
        typingEl.remove();
        const data = await res.json();
        addMessage(messagesEl, "bot", data.reply || "Connecting you with the team — someone will follow up shortly.");
        state.conversation.push({ role: "assistant", content: data.reply || "" });
        state.conversation = state.conversation.slice(-MAX_STORED_MESSAGES);
        saveState();
        if (!state.leadCaptured && !state.leadDismissed) showLeadForm(messagesEl);
      } catch {
        typingEl.remove();
        addMessage(messagesEl, "bot", "Please email us directly and we'll get right back to you.");
      }
    }

    bubble.addEventListener("click", toggleChat);
    closeBtn.addEventListener("click", toggleChat);
    sendBtn.addEventListener("click", sendMessage);
    handoffBtn.addEventListener("click", requestHandoff);
    inputEl.addEventListener("keypress", (e) => {
      if (e.key === "Enter") sendMessage();
    });
    inputEl.addEventListener("input", () => updateCharCount(charCount, inputEl));
  }

  function honeypotValue() {
    const hp = document.getElementById("of-hp-field");
    return hp ? hp.value : "";
  }

  function addMessage(messagesEl, role, text) {
    const div = document.createElement("div");
    div.className = `of-msg of-${role}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function addTypingIndicator(messagesEl) {
    const div = document.createElement("div");
    div.className = "of-msg of-bot of-typing-dots";
    div.innerHTML = `<span></span><span></span><span></span>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function updateCharCount(charCount, inputEl) {
    const remaining = MAX_MESSAGE_LENGTH - inputEl.value.length;
    charCount.textContent = remaining < 100 ? `${remaining}` : "";
  }

  function buildUI() {
    const bubble = document.createElement("div");
    bubble.id = "of-chat-bubble";
const BUBBLE_IMAGE = "data:image/jpeg;base64,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";
    bubble.innerHTML = `<img src="${BUBBLE_IMAGE}" alt="OriFlows" />`;

    const win = document.createElement("div");
    win.id = "of-chat-window";
    win.setAttribute("aria-label", "AI Receptionist chat");
    win.innerHTML = `
      <div id="of-chat-header">
        <div class="of-header-left">
          <img class="of-header-avatar" src="${BUBBLE_IMAGE}" alt="AI Receptionist" />
          <div class="of-header-info">
            <div class="of-header-name">${BRAND_NAME}</div>
            <div class="of-header-status"><span class="of-status-dot"></span>${BRAND_STATUS}</div>
          </div>
        </div>
        <span id="of-chat-close">&times;</span>
      </div>
      <div id="of-chat-messages"></div>
      <div id="of-handoff-row">
        <button id="of-handoff-btn">Talk to a human</button>
      </div>
      <div id="of-chat-input-row">
        <div class="of-input-wrap">
          <input id="of-chat-input" type="text" placeholder="Type a message..." maxlength="${MAX_MESSAGE_LENGTH}" />
          <span id="of-char-count"></span>
        </div>
        <button id="of-chat-send">Send</button>
      </div>
      <input type="text" id="of-hp-field" name="website" autocomplete="off" tabindex="-1" />
    `;

    document.body.appendChild(bubble);
    document.body.appendChild(win);

    init.__ui = true;

    return {
      bubble,
      win,
      messagesEl: win.querySelector("#of-chat-messages"),
      inputEl: win.querySelector("#of-chat-input"),
      sendBtn: win.querySelector("#of-chat-send"),
      closeBtn: win.querySelector("#of-chat-close"),
      handoffBtn: win.querySelector("#of-handoff-btn"),
      charCount: win.querySelector("#of-char-count"),
    };
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #of-chat-bubble {
        position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px;
        border-radius: 50%; background: ${ACCENT_COLOR}; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 14px rgba(0,0,0,0.25); z-index: 999998; transition: transform 0.2s;
        overflow: hidden;
      }
      #of-chat-bubble:hover { transform: scale(1.08); }
      #of-chat-bubble svg { width: 28px; height: 28px; fill: white; }
      #of-chat-bubble img { width: 100%; height: 100%; object-fit: cover; object-position: center top; }

      #of-chat-window {
        position: fixed; bottom: 92px; right: 20px; width: 360px; max-width: 92vw;
        height: min(560px, 75dvh); background: #fff; border-radius: 14px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.2); display: none; flex-direction: column;
        overflow: hidden; z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #of-chat-window.of-open { display: flex; }

      #of-chat-header {
        background: ${ACCENT_COLOR}; color: white; padding: 12px 16px;
        font-size: 15px; display: flex; justify-content: space-between; align-items: center;
      }
      .of-header-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .of-header-avatar {
        width: 38px; height: 38px; border-radius: 50%; object-fit: cover;
        object-position: center top; background: #fff; flex: 0 0 auto;
        border: 2px solid rgba(255,255,255,0.85);
      }
      .of-header-info { min-width: 0; }
      .of-header-name { font-weight: 700; font-size: 14px; line-height: 1.2; }
      .of-header-status {
        margin-top: 3px; font-size: 11px; font-weight: 500;
        opacity: 0.95; display: flex; align-items: center; gap: 5px;
      }
      .of-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; display: inline-block; flex: 0 0 auto; }
      #of-chat-close { cursor: pointer; font-size: 20px; line-height: 1; opacity: 0.9; }

      #of-chat-messages {
        flex: 1; overflow-y: auto; padding: 14px; background: #f7f8fa;
        display: flex; flex-direction: column; gap: 10px;
      }
      .of-msg { max-width: 82%; padding: 9px 13px; border-radius: 14px; font-size: 14px; line-height: 1.4; word-wrap: break-word; }
      .of-msg.of-bot { background: #fff; color: #1f2937; border: 1px solid #e5e7eb; align-self: flex-start; border-bottom-left-radius: 4px; }
      .of-msg.of-user { background: ${ACCENT_COLOR}; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }

      .of-typing-dots { display: flex; gap: 4px; padding: 12px 14px; align-items: center; }
      .of-typing-dots span {
        width: 6px; height: 6px; border-radius: 50%; background: #bbb;
        animation: of-bounce 1.2s infinite ease-in-out;
      }
      .of-typing-dots span:nth-child(2) { animation-delay: 0.15s; }
      .of-typing-dots span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes of-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.5; } 30% { transform: translateY(-4px); opacity: 1; } }

      .of-lead-card {
        background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
        padding: 12px; display: flex; flex-direction: column; gap: 8px; align-self: stretch;
      }
      .of-lead-title { font-size: 13px; font-weight: 600; color: #1f2937; }
      .of-lead-input {
        border: 1px solid #ddd; border-radius: 8px; padding: 8px 10px; font-size: 13px; outline: none;
        color: #1f2937; background: #fff;
      }
      .of-lead-input:focus { border-color: ${ACCENT_COLOR}; }
      .of-lead-actions { display: flex; gap: 8px; margin-top: 4px; }
      .of-lead-submit {
        flex: 1; background: ${ACCENT_COLOR}; color: white; border: none; border-radius: 8px;
        padding: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
      }
      .of-lead-skip {
        background: #f1f1f1; color: #555; border: none; border-radius: 8px;
        padding: 8px 12px; font-size: 13px; cursor: pointer;
      }

      #of-handoff-row { padding: 6px 14px; border-top: 1px solid #eee; text-align: center; }
      #of-handoff-btn {
        background: none; border: none; color: ${ACCENT_COLOR}; font-size: 12px;
        cursor: pointer; text-decoration: underline; padding: 4px;
      }

      #of-chat-input-row { display: flex; border-top: 1px solid #eee; padding: 10px; gap: 8px; align-items: center; }
      .of-input-wrap { flex: 1; position: relative; }
      #of-chat-input {
        width: 100%; box-sizing: border-box; border: 1px solid #ddd; border-radius: 20px;
        padding: 9px 40px 9px 14px; font-size: 14px; outline: none;
        color: #1f2937; background: #fff;
      }
      #of-chat-input:focus { border-color: ${ACCENT_COLOR}; }
      #of-char-count { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 11px; color: #999; }
      #of-chat-send {
        background: ${ACCENT_COLOR}; color: white; border: none; border-radius: 20px;
        padding: 0 16px; height: 36px; font-size: 14px; cursor: pointer; font-weight: 600; flex-shrink: 0;
      }
      #of-chat-send:disabled { opacity: 0.5; cursor: default; }

      /* Honeypot — hidden from real users, visible to naive bots */
      #of-hp-field {
        position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0;
      }

      @media (max-width: 420px) {
        #of-chat-window { right: 10px; left: 10px; width: auto; bottom: 84px; }
        #of-chat-bubble { right: 16px; bottom: 16px; }
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
