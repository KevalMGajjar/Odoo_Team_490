// ============================================
// Conversation Panel Component
// ============================================
// Chat-style UI showing the conversation history between
// the user and the AI assistant. Messages include:
// - User transcripts (right-aligned, purple)
// - Assistant responses (left-aligned, glass card)
// - Interim/live transcripts (dashed, faded)
// - Hint chips for suggested commands

export class ConversationPanel {
  /**
   * @param {HTMLElement} container - DOM element to render into
   * @param {object} options
   * @param {function} options.onHintClick - Called when a hint chip is clicked
   */
  constructor(container, options = {}) {
    this.container = container;
    this.onHintClick = options.onHintClick || (() => {});
    this.messages = [];
    this._interimMessage = null;

    this.render();
  }

  render() {
    this.container.innerHTML = "";

    this._panel = document.createElement("div");
    this._panel.className = "conversation-panel";
    this._panel.id = "conversation-panel";

    this.container.appendChild(this._panel);
    this._showEmptyState();
  }

  /**
   * Show the empty state with hint chips
   */
  _showEmptyState() {
    this._panel.innerHTML = "";

    const empty = document.createElement("div");
    empty.className = "conversation-empty";

    empty.innerHTML = `
      <div class="conversation-empty__icon">💬</div>
      <div class="conversation-empty__text">
        Start by speaking or typing a command. Try something like:
      </div>
      <div class="conversation-empty__hints">
        <button class="hint-chip" data-hint="Add a new vendor named Rahul Sharma">📇 Add a vendor</button>
        <button class="hint-chip" data-hint="Create product Wooden Chair sale price 8500">📦 Add a product</button>
        <button class="hint-chip" data-hint="Create purchase order for vendor Rahul Sharma, 50 chairs at 5500">📋 Purchase Order</button>
        <button class="hint-chip" data-hint="Record payment of 50000 from customer Neha via UPI">💰 Record Payment</button>
      </div>
    `;

    // Attach click listeners to hint chips
    empty.querySelectorAll(".hint-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const hint = chip.getAttribute("data-hint");
        if (hint) this.onHintClick(hint);
      });
    });

    this._emptyState = empty;
    this._panel.appendChild(empty);
  }

  /**
   * Hide the empty state (called when first message is added)
   */
  _hideEmptyState() {
    if (this._emptyState) {
      this._emptyState.remove();
      this._emptyState = null;
    }
  }

  /**
   * Add a message to the conversation
   *
   * @param {'user'|'assistant'} role
   * @param {string} text
   * @param {object} extras - Optional { intent, confidence }
   */
  addMessage(role, text, extras = {}) {
    this._hideEmptyState();
    this._clearInterim();

    const msg = document.createElement("div");
    msg.className = `message message--${role}`;

    const avatar = document.createElement("div");
    avatar.className = "message__avatar";
    avatar.textContent = role === "user" ? "🧑" : "🤖";

    const contentWrapper = document.createElement("div");

    const content = document.createElement("div");
    content.className = "message__content";

    // If it's an assistant message with an intent badge, show it
    let messageHTML = this._escapeHtml(text);
    if (role === "assistant" && extras.intent && extras.intent !== "UNKNOWN") {
      const badgeClass = this._getIntentBadgeClass(extras.intent);
      const intentLabel = extras.intent.replace(/_/g, " ");
      messageHTML = `<span class="intent-badge ${badgeClass}">${intentLabel}</span><br>${messageHTML}`;
    }
    content.innerHTML = messageHTML;

    const time = document.createElement("div");
    time.className = "message__time";
    time.textContent = this._formatTime(new Date());

    contentWrapper.appendChild(content);
    contentWrapper.appendChild(time);

    msg.appendChild(avatar);
    msg.appendChild(contentWrapper);

    this._panel.appendChild(msg);
    this._scrollToBottom();

    this.messages.push({ role, text, timestamp: new Date() });
  }

  /**
   * Show an interim (live/in-progress) transcript
   * This gets replaced when the final result comes in
   */
  showInterim(text) {
    this._hideEmptyState();

    if (!this._interimMessage) {
      this._interimMessage = document.createElement("div");
      this._interimMessage.className = "message message--user message--interim";

      const avatar = document.createElement("div");
      avatar.className = "message__avatar";
      avatar.textContent = "🧑";

      const contentWrapper = document.createElement("div");
      const content = document.createElement("div");
      content.className = "message__content";
      this._interimContent = content;

      contentWrapper.appendChild(content);
      this._interimMessage.appendChild(avatar);
      this._interimMessage.appendChild(contentWrapper);
      this._panel.appendChild(this._interimMessage);
    }

    this._interimContent.textContent = text + "...";
    this._scrollToBottom();
  }

  /**
   * Clear the interim message
   */
  _clearInterim() {
    if (this._interimMessage) {
      this._interimMessage.remove();
      this._interimMessage = null;
      this._interimContent = null;
    }
  }

  /**
   * Clear all messages and show empty state
   */
  clear() {
    this.messages = [];
    this._interimMessage = null;
    this.render();
  }

  /**
   * Scroll the panel to the bottom
   */
  _scrollToBottom() {
    requestAnimationFrame(() => {
      this._panel.scrollTop = this._panel.scrollHeight;
    });
  }

  /**
   * Format a timestamp for display
   */
  _formatTime(date) {
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /**
   * Escape HTML to prevent XSS
   */
  _escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get the CSS class for an intent badge
   */
  _getIntentBadgeClass(intent) {
    const map = {
      CREATE_CONTACT: "intent-badge--contact",
      CREATE_PRODUCT: "intent-badge--product",
      CREATE_PURCHASE_ORDER: "intent-badge--purchase",
      CREATE_SALES_ORDER: "intent-badge--sales",
      RECORD_PAYMENT: "intent-badge--payment",
      GENERATE_INVOICE: "intent-badge--invoice",
    };
    return map[intent] || "";
  }
}
