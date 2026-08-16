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

  const BRAND_NAME = "OriFlows Assistant";
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
    bubble.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2a1 1 0 0 1 1 1v1.07A7.002 7.002 0 0 1 19 11v1h.5a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5H19v.5A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5V18h-.5A1.5 1.5 0 0 1 3 16.5v-3A1.5 1.5 0 0 1 4.5 12H5v-1a7.002 7.002 0 0 1 6-6.93V3a1 1 0 0 1 1-1zm-3.5 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-8 6.5v.5c0 .55.45 1 1 1h9c.55 0 1-.45 1-1v-.5H7.5z"/></svg>`;

    const win = document.createElement("div");
    win.id = "of-chat-window";
    win.innerHTML = `
      <div id="of-chat-header">
        <div class="of-header-left">
          <span class="of-status-dot"></span>
          <span>${BRAND_NAME}</span>
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
      }
      #of-chat-bubble:hover { transform: scale(1.08); }
      #of-chat-bubble svg { width: 28px; height: 28px; fill: white; }

      #of-chat-window {
        position: fixed; bottom: 92px; right: 20px; width: 360px; max-width: 92vw;
        height: min(560px, 75dvh); background: #fff; border-radius: 14px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.2); display: none; flex-direction: column;
        overflow: hidden; z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #of-chat-window.of-open { display: flex; }

      #of-chat-header {
        background: ${ACCENT_COLOR}; color: white; padding: 14px 16px;
        font-weight: 600; font-size: 15px; display: flex; justify-content: space-between; align-items: center;
      }
      .of-header-left { display: flex; align-items: center; gap: 8px; }
      .of-status-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; display: inline-block; }
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
