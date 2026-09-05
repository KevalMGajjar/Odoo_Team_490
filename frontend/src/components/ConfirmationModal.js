// ============================================
// Confirmation Modal Component
// ============================================
// Shows the LLM-extracted data in an editable form for user review.
// This is the CRITICAL accounting accuracy step — the user MUST
// review and confirm before any data is saved.
//
// Features:
// - Dynamic form generation based on intent type
// - Editable fields pre-filled with extracted data
// - Intent badge and confidence indicator
// - Line items table for orders/invoices
// - Confirm & Save / Cancel buttons

// Field definitions per intent type
const INTENT_FIELDS = {
  CREATE_CONTACT: {
    title: "Create New Contact",
    icon: "📇",
    fields: [
      { key: "name", label: "Full Name", type: "text", required: true },
      {
        key: "type",
        label: "Contact Type",
        type: "select",
        required: true,
        options: ["Customer", "Vendor", "Both"],
      },
      { key: "email", label: "Email", type: "email" },
      { key: "mobile", label: "Mobile", type: "tel" },
      { key: "phone", label: "Phone", type: "tel" },
      { key: "gstin", label: "GSTIN", type: "text" },
      { key: "pan", label: "PAN", type: "text" },
      { key: "address", label: "Address", type: "text", full: true },
      { key: "city", label: "City", type: "text" },
      { key: "state", label: "State", type: "text" },
      { key: "pincode", label: "Pincode", type: "text" },
      { key: "payment_terms", label: "Payment Terms (days)", type: "number" },
    ],
  },

  CREATE_PRODUCT: {
    title: "Create New Product",
    icon: "📦",
    fields: [
      { key: "name", label: "Product Name", type: "text", required: true },
      {
        key: "type",
        label: "Product Type",
        type: "select",
        required: true,
        options: ["Goods", "Service"],
      },
      { key: "sku", label: "SKU", type: "text" },
      { key: "hsn_code", label: "HSN/SAC Code", type: "text" },
      {
        key: "unit",
        label: "Unit of Measure",
        type: "select",
        options: ["Pcs", "Kg", "Nos", "Mtr", "Ltr", "Box", "Set"],
      },
      { key: "sale_price", label: "Sale Price (₹)", type: "number" },
      { key: "purchase_price", label: "Purchase Price (₹)", type: "number" },
      {
        key: "gst_rate",
        label: "GST Rate (%)",
        type: "select",
        options: ["0", "5", "12", "18", "28"],
      },
      { key: "category", label: "Category", type: "text" },
      { key: "description", label: "Description", type: "text", full: true },
    ],
  },

  CREATE_PURCHASE_ORDER: {
    title: "Create Purchase Order",
    icon: "📋",
    fields: [
      { key: "vendor_name", label: "Vendor Name", type: "text", required: true },
      { key: "order_date", label: "Order Date", type: "date" },
      {
        key: "expected_delivery_date",
        label: "Expected Delivery",
        type: "date",
      },
      { key: "notes", label: "Notes", type: "text", full: true },
    ],
    hasItems: true,
    itemFields: ["product_name", "quantity", "unit_price", "gst_rate"],
  },

  CREATE_SALES_ORDER: {
    title: "Create Sales Order",
    icon: "🛒",
    fields: [
      {
        key: "customer_name",
        label: "Customer Name",
        type: "text",
        required: true,
      },
      { key: "order_date", label: "Order Date", type: "date" },
      { key: "notes", label: "Notes", type: "text", full: true },
    ],
    hasItems: true,
    itemFields: [
      "product_name",
      "quantity",
      "unit_price",
      "discount_percent",
      "gst_rate",
    ],
  },

  RECORD_PAYMENT: {
    title: "Record Payment",
    icon: "💰",
    fields: [
      { key: "party_name", label: "Party Name", type: "text", required: true },
      {
        key: "party_type",
        label: "Party Type",
        type: "select",
        required: true,
        options: ["Customer", "Vendor"],
      },
      { key: "amount", label: "Amount (₹)", type: "number", required: true },
      { key: "payment_date", label: "Payment Date", type: "date" },
      {
        key: "payment_method",
        label: "Payment Method",
        type: "select",
        options: ["Cash", "Bank Transfer", "UPI", "Cheque", "Card"],
      },
      { key: "reference_number", label: "Reference / UTR No.", type: "text" },
      { key: "against_invoice", label: "Against Invoice #", type: "text" },
      { key: "notes", label: "Notes", type: "text", full: true },
    ],
  },

  GENERATE_INVOICE: {
    title: "Generate Invoice",
    icon: "🧾",
    fields: [
      {
        key: "customer_name",
        label: "Customer Name",
        type: "text",
        required: true,
      },
      { key: "invoice_date", label: "Invoice Date", type: "date" },
      { key: "due_date", label: "Due Date", type: "date" },
      { key: "notes", label: "Notes", type: "text", full: true },
    ],
    hasItems: true,
    itemFields: ["product_name", "quantity", "unit_price", "gst_rate"],
  },
};

const ITEM_FIELD_LABELS = {
  product_name: "Product",
  quantity: "Qty",
  unit_price: "Unit Price (₹)",
  gst_rate: "GST %",
  discount_percent: "Discount %",
};

export class ConfirmationModal {
  /**
   * @param {object} options
   * @param {function} options.onConfirm - Called with final data when user confirms
   * @param {function} options.onCancel - Called when user cancels
   */
  constructor(options = {}) {
    this.onConfirm = options.onConfirm || (() => {});
    this.onCancel = options.onCancel || (() => {});
    this._overlay = null;
  }

  /**
   * Show the confirmation modal with pre-filled data
   *
   * @param {string} intent - The classified intent (e.g., "CREATE_CONTACT")
   * @param {object} data - The extracted entity data
   * @param {number} confidence - Confidence score (0-1)
   */
  show(intent, data, confidence) {
    this.intent = intent;
    this.data = { ...data };
    this.confidence = confidence;

    const config = INTENT_FIELDS[intent];
    if (!config) {
      console.error("[ConfirmationModal] Unknown intent:", intent);
      return;
    }

    this._createOverlay(config);
    document.body.appendChild(this._overlay);

    // Focus the first input
    requestAnimationFrame(() => {
      const firstInput = this._overlay.querySelector(
        ".form-field__input, .form-field__select"
      );
      if (firstInput) firstInput.focus();
    });
  }

  /**
   * Create the modal overlay and content
   */
  _createOverlay(config) {
    // Overlay
    this._overlay = document.createElement("div");
    this._overlay.className = "modal-overlay";
    this._overlay.id = "confirmation-modal-overlay";
    this._overlay.addEventListener("click", (e) => {
      if (e.target === this._overlay) this.hide();
    });

    // Modal
    const modal = document.createElement("div");
    modal.className = "modal";

    // Header
    const header = document.createElement("div");
    header.className = "modal__header";

    const titleContainer = document.createElement("div");
    const title = document.createElement("h2");
    title.className = "modal__title";
    title.textContent = `${config.icon} ${config.title}`;
    titleContainer.appendChild(title);

    // Confidence bar under title
    const confBar = this._createConfidenceBar(this.confidence);
    titleContainer.appendChild(confBar);

    const closeBtn = document.createElement("button");
    closeBtn.className = "modal__close";
    closeBtn.innerHTML = "✕";
    closeBtn.addEventListener("click", () => this.hide());

    header.appendChild(titleContainer);
    header.appendChild(closeBtn);

    // Body — Form Fields
    const body = document.createElement("div");
    body.className = "modal__body";

    const formGrid = document.createElement("div");
    formGrid.className = "form-grid";

    // Create form fields
    config.fields.forEach((field) => {
      const fieldEl = this._createFormField(field);
      formGrid.appendChild(fieldEl);
    });

    body.appendChild(formGrid);

    // Line items table (for orders/invoices)
    if (config.hasItems && this.data.items && this.data.items.length > 0) {
      const itemsSection = this._createItemsTable(
        config.itemFields,
        this.data.items
      );
      body.appendChild(itemsSection);
    }

    // Footer — Buttons
    const footer = document.createElement("div");
    footer.className = "modal__footer";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn--secondary";
    cancelBtn.id = "modal-cancel-button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => this.hide());

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "btn btn--primary";
    confirmBtn.id = "modal-confirm-button";
    confirmBtn.innerHTML = "✓ Confirm & Save";
    confirmBtn.addEventListener("click", () => this._handleConfirm());

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);

    // Assemble
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    this._overlay.appendChild(modal);
  }

  /**
   * Create a single form field element
   */
  _createFormField(field) {
    const wrapper = document.createElement("div");
    wrapper.className = `form-field${field.full ? " form-field--full" : ""}`;

    const label = document.createElement("label");
    label.className = `form-field__label${field.required ? " form-field__label--required" : ""}`;
    label.textContent = field.label;
    label.setAttribute("for", `field-${field.key}`);

    let input;

    if (field.type === "select" && field.options) {
      input = document.createElement("select");
      input.className = "form-field__select";

      // Add empty option
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = `Select ${field.label}`;
      input.appendChild(emptyOpt);

      field.options.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt;
        option.textContent = opt;
        if (String(this.data[field.key]) === String(opt)) {
          option.selected = true;
        }
        input.appendChild(option);
      });
    } else {
      input = document.createElement("input");
      input.className = "form-field__input";
      input.type = field.type || "text";
      input.value = this.data[field.key] || "";
      input.placeholder = field.label;
    }

    input.id = `field-${field.key}`;
    input.dataset.fieldKey = field.key;

    // Highlight missing/required empty fields
    if (field.required && !this.data[field.key]) {
      input.classList.add("form-field__input--error");
      input.addEventListener("input", () => {
        input.classList.remove("form-field__input--error");
      });
    }

    wrapper.appendChild(label);
    wrapper.appendChild(input);

    return wrapper;
  }

  /**
   * Create the line items table
   */
  _createItemsTable(itemFieldKeys, items) {
    const section = document.createElement("div");
    section.className = "line-items";

    const title = document.createElement("div");
    title.className = "line-items__title";
    title.textContent = "Line Items";
    section.appendChild(title);

    const table = document.createElement("table");
    table.className = "line-items__table";

    // Header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    itemFieldKeys.forEach((key) => {
      const th = document.createElement("th");
      th.textContent = ITEM_FIELD_LABELS[key] || key;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");
    items.forEach((item, rowIndex) => {
      const row = document.createElement("tr");
      itemFieldKeys.forEach((key) => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type =
          key === "product_name" ? "text" : "number";
        input.value = item[key] || "";
        input.placeholder = ITEM_FIELD_LABELS[key] || key;
        input.dataset.itemIndex = rowIndex;
        input.dataset.itemKey = key;
        td.appendChild(input);
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    section.appendChild(table);
    return section;
  }

  /**
   * Create the confidence bar UI
   */
  _createConfidenceBar(confidence) {
    const bar = document.createElement("div");
    bar.className = "confidence-bar";

    const track = document.createElement("div");
    track.className = "confidence-bar__track";

    const fill = document.createElement("div");
    fill.className = "confidence-bar__fill";

    // Determine color based on confidence level
    if (confidence >= 0.8) {
      fill.classList.add("confidence-bar__fill--high");
    } else if (confidence >= 0.5) {
      fill.classList.add("confidence-bar__fill--medium");
    } else {
      fill.classList.add("confidence-bar__fill--low");
    }

    fill.style.width = `${Math.round(confidence * 100)}%`;

    const label = document.createElement("span");
    label.className = "confidence-bar__label";
    label.textContent = `${Math.round(confidence * 100)}%`;

    track.appendChild(fill);
    bar.appendChild(track);
    bar.appendChild(label);

    return bar;
  }

  /**
   * Collect all form values and call onConfirm
   */
  _handleConfirm() {
    const formData = {};
    let hasErrors = false;

    // Collect regular fields
    this._overlay
      .querySelectorAll("[data-field-key]")
      .forEach((input) => {
        const key = input.dataset.fieldKey;
        formData[key] = input.value;
      });

    // Collect line items
    const itemInputs = this._overlay.querySelectorAll("[data-item-index]");
    if (itemInputs.length > 0) {
      const items = {};
      itemInputs.forEach((input) => {
        const idx = input.dataset.itemIndex;
        const key = input.dataset.itemKey;
        if (!items[idx]) items[idx] = {};
        items[idx][key] = input.type === "number" && input.value
          ? parseFloat(input.value)
          : input.value;
      });
      formData.items = Object.values(items);
    }

    // ── Client-side validation ──
    const errors = this._validateFormData(formData, this.intent);
    if (errors.length > 0) {
      // Clear previous generic errors that might still exist on valid fields
      this._overlay.querySelectorAll(".form-field__error").forEach(el => el.remove());
      this._overlay.querySelectorAll(".form-field__input--error").forEach(el => el.classList.remove("form-field__input--error"));

      // Highlight error fields and show messages
      errors.forEach(({ field, message }) => {
        const input = this._overlay.querySelector(`[data-field-key="${field}"]`);
        if (input) {
          input.classList.add("form-field__input--error");
          // Add or update error message below the field
          let errEl = input.parentElement.querySelector(".form-field__error");
          if (!errEl) {
            errEl = document.createElement("div");
            errEl.className = "form-field__error";
            input.parentElement.appendChild(errEl);
          }
          errEl.textContent = message;
          
          const clearError = () => {
            input.classList.remove("form-field__input--error");
            if (errEl && errEl.parentNode) errEl.remove();
          };
          input.addEventListener("input", clearError, { once: true });
          input.addEventListener("change", clearError, { once: true });
        }
      });
      return; // Don't save — let user fix errors
    }

    this.hide();
    this.onConfirm(this.intent, formData);
  }

  /**
   * Validate form data with Indian accounting field rules.
   * Returns array of { field, message } for each error.
   */
  _validateFormData(data, intent) {
    const errors = [];
    const config = INTENT_FIELDS[intent];
    const today = new Date().toISOString().split("T")[0];

    // 1. Check Required Fields
    if (config) {
      config.fields.forEach((field) => {
        if (field.required && (!data[field.key] || String(data[field.key]).trim() === "")) {
          errors.push({ field: field.key, message: `${field.label} is required` });
        }
      });
    }

    // Mobile: must be 10 digits if provided
    if (data.mobile && data.mobile.trim()) {
      const digits = data.mobile.replace(/\D/g, "");
      if (digits.length !== 10) {
        errors.push({ field: "mobile", message: "Mobile must be 10 digits" });
      }
    }

    // Email: basic format check if provided
    if (data.email && data.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        errors.push({ field: "email", message: "Invalid email format" });
      }
    }

    // GSTIN: 15-character alphanumeric if provided
    if (data.gstin && data.gstin.trim()) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;
      if (!gstinRegex.test(data.gstin.trim())) {
        errors.push({ field: "gstin", message: "Invalid GSTIN format (e.g., 24AABCU9603R1ZM)" });
      }
    }

    // PAN: 10-character format ABCDE1234F if provided
    if (data.pan && data.pan.trim()) {
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;
      if (!panRegex.test(data.pan.trim())) {
        errors.push({ field: "pan", message: "Invalid PAN format (e.g., ABCDE1234F)" });
      }
    }

    // Pincode: 6 digits if provided
    if (data.pincode && data.pincode.trim()) {
      const digits = data.pincode.replace(/\D/g, "");
      if (digits.length !== 6) {
        errors.push({ field: "pincode", message: "Pincode must be 6 digits" });
      }
    }

    // ── Numeric Bounds Validation ──
    const positiveFields = ["amount", "purchase_price", "sale_price"];
    positiveFields.forEach(field => {
      if (data[field] !== undefined && data[field] !== "") {
        const val = parseFloat(data[field]);
        if (isNaN(val) || val <= 0) {
          errors.push({ field: field, message: "Must be greater than 0" });
        }
      }
    });

    // Item-level Numeric Validation
    if (data.items && data.items.length > 0) {
      data.items.forEach((item, idx) => {
        if (item.quantity !== undefined && item.quantity !== "") {
          const qty = parseFloat(item.quantity);
          if (isNaN(qty) || qty <= 0) {
            // Cannot easily target row cells via data-field-key, 
            // but we can at least show a generic alert or attach to notes
            // In a real app we'd target the specific row cell
            if (!errors.find(e => e.field === "notes" && e.message.includes("Item quantity"))) {
              errors.push({ field: "notes", message: `Item row ${idx + 1}: Quantity must be > 0` });
            }
          }
        }
      });
    }

    // ── Temporal (Date) Validation ──
    const pastFields = ["expected_delivery_date", "due_date"];
    pastFields.forEach(field => {
      if (data[field] && data[field].trim() !== "") {
        if (data[field] < today) {
          errors.push({ field: field, message: "Date cannot be in the past" });
        }
      }
    });

    const futureFields = ["payment_date", "order_date", "invoice_date"];
    futureFields.forEach(field => {
      if (data[field] && data[field].trim() !== "") {
        if (data[field] > today) {
          errors.push({ field: field, message: "Date cannot be in the future" });
        }
      }
    });

    return errors;
  }

  /**
   * Hide and remove the modal
   */
  hide() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
      this.onCancel();
    }
  }
}
