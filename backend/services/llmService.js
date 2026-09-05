// ============================================
// LLM Service — Google Gemini API Integration
// ============================================
// This service handles all communication with the Gemini API.
// It sends transcribed text + conversation context to Gemini,
// and receives structured JSON with intent, entities, and missing fields.
//
// Uses Gemini's responseSchema feature to GUARANTEE valid JSON output.
// Model: gemini-3.1-flash-lite (free tier)
//
// IMPROVEMENTS:
// - Pre-processes transcript (cleans speech artifacts)
// - Post-processes response (normalizes phone numbers, amounts)
// - Retries once on UNKNOWN intent with cleaned transcript

const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const { SYSTEM_PROMPT } = require("../prompts/systemPrompt");

// Initialize the Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ═══════════════════════════════════════════════
// PRE-PROCESSING: Clean transcript before LLM call
// ═══════════════════════════════════════════════

/**
 * Minimal transcript cleanup.
 * Only removes filler words and normalizes whitespace.
 * Speech misrecognitions (e.g., "adventure" → "add vendor") are handled
 * by the LLM via system prompt instructions — NOT by brittle regex.
 */
function cleanTranscript(text) {
  return text
    .replace(/\b(umm|uh|uhh|hmm|ah|oh)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ═══════════════════════════════════════════════
// POST-PROCESSING: Normalize extracted data
// ═══════════════════════════════════════════════

/**
 * Normalize an Indian phone number.
 * Removes spaces, dashes, country code — returns clean 10 digits.
 */
function normalizePhone(phone) {
  if (!phone || typeof phone !== "string") return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "";
  // Take last 10 digits (strips +91 or 0 prefix)
  return digits.slice(-10);
}

/**
 * Normalize a pincode to 6 digits.
 */
function normalizePincode(pincode) {
  if (!pincode || typeof pincode !== "string") return "";
  const digits = pincode.replace(/\D/g, "");
  return digits.length === 6 ? digits : pincode;
}

/**
 * Convert word numbers to digits.
 * "five thousand five hundred" → "5500"
 */
function wordsToNumber(text) {
  if (!text || typeof text !== "string") return text;

  const wordMap = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    hundred: 100, thousand: 1000, lakh: 100000, lac: 100000, crore: 10000000,
  };

  // If it's already a number string, return as-is
  if (/^\d+(\.\d+)?$/.test(text.trim())) return text;

  const words = text.toLowerCase().split(/[\s-]+/);
  let total = 0;
  let current = 0;

  for (const word of words) {
    if (wordMap[word] !== undefined) {
      const val = wordMap[word];
      if (val === 100) {
        current = current === 0 ? 100 : current * 100;
      } else if (val >= 1000) {
        current = current === 0 ? val : current * val;
        total += current;
        current = 0;
      } else {
        current += val;
      }
    }
  }
  total += current;

  return total > 0 ? String(total) : text;
}

/**
 * Post-process the LLM response to normalize all data fields.
 */
function postProcessResponse(parsed) {
  if (!parsed.data) return parsed;

  const data = parsed.data;

  // Normalize phone numbers
  if (data.mobile) data.mobile = normalizePhone(data.mobile);
  if (data.phone) data.phone = normalizePhone(data.phone);

  // Normalize pincode
  if (data.pincode) data.pincode = normalizePincode(data.pincode);

  // Convert numeric fields
  const numericFields = [
    "sale_price", "purchase_price", "gst_rate", "amount", "payment_terms",
  ];
  for (const field of numericFields) {
    if (data[field] && data[field] !== "") {
      // Try word-to-number first
      data[field] = wordsToNumber(String(data[field]));
      const num = parseFloat(data[field]);
      if (!isNaN(num)) {
        data[field] = num;
      }
    }
  }

  // Process line items
  if (data.items && Array.isArray(data.items)) {
    data.items = data.items.map((item) => {
      const itemNumericFields = ["quantity", "unit_price", "gst_rate", "discount_percent"];
      for (const field of itemNumericFields) {
        if (item[field] && item[field] !== "") {
          item[field] = wordsToNumber(String(item[field]));
          const num = parseFloat(item[field]);
          if (!isNaN(num)) {
            item[field] = num;
          }
        }
      }
      return item;
    });
  }

  // Auto-detect state from city (common Indian cities)
  if (data.city && !data.state) {
    const cityStateMap = {
      "ahmedabad": "Gujarat", "surat": "Gujarat", "vadodara": "Gujarat", "rajkot": "Gujarat",
      "mumbai": "Maharashtra", "pune": "Maharashtra", "nagpur": "Maharashtra", "nashik": "Maharashtra",
      "delhi": "Delhi", "new delhi": "Delhi",
      "bangalore": "Karnataka", "bengaluru": "Karnataka", "mysore": "Karnataka",
      "chennai": "Tamil Nadu", "coimbatore": "Tamil Nadu", "madurai": "Tamil Nadu",
      "hyderabad": "Telangana", "secunderabad": "Telangana",
      "kolkata": "West Bengal",
      "jaipur": "Rajasthan", "jodhpur": "Rajasthan", "udaipur": "Rajasthan",
      "lucknow": "Uttar Pradesh", "noida": "Uttar Pradesh", "agra": "Uttar Pradesh",
      "bhopal": "Madhya Pradesh", "indore": "Madhya Pradesh",
      "chandigarh": "Chandigarh", "kochi": "Kerala", "trivandrum": "Kerala",
      "guwahati": "Assam", "patna": "Bihar", "ranchi": "Jharkhand",
    };
    const state = cityStateMap[data.city.toLowerCase()];
    if (state) data.state = state;
  }

  parsed.data = data;
  return parsed;
}

// ═══════════════════════════════════════════════
// RESPONSE SCHEMA — Guarantees valid JSON from Gemini
// ═══════════════════════════════════════════════

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    intent: {
      type: SchemaType.STRING,
      description: "The classified intent of the user's speech",
      enum: [
        "CREATE_CONTACT",
        "CREATE_PRODUCT",
        "CREATE_PURCHASE_ORDER",
        "CREATE_SALES_ORDER",
        "RECORD_PAYMENT",
        "GENERATE_INVOICE",
        "UNKNOWN",
      ],
    },
    confidence: {
      type: SchemaType.NUMBER,
      description: "Confidence score from 0.0 to 1.0",
    },
    data: {
      type: SchemaType.OBJECT,
      description: "Extracted entity data. MUST include ALL mentioned fields.",
      properties: {
        // Contact fields
        name: { type: SchemaType.STRING, description: "Person or company name" },
        type: { type: SchemaType.STRING, description: "Customer, Vendor, or Both" },
        email: { type: SchemaType.STRING, description: "Email address" },
        mobile: { type: SchemaType.STRING, description: "Mobile phone number (10 digits)" },
        phone: { type: SchemaType.STRING, description: "Landline phone number" },
        gstin: { type: SchemaType.STRING, description: "GST Identification Number (15 chars)" },
        pan: { type: SchemaType.STRING, description: "PAN card number (10 chars)" },
        address: { type: SchemaType.STRING, description: "Street address" },
        city: { type: SchemaType.STRING, description: "City name" },
        state: { type: SchemaType.STRING, description: "State name" },
        pincode: { type: SchemaType.STRING, description: "PIN code (6 digits)" },
        payment_terms: { type: SchemaType.STRING, description: "Payment terms in days" },
        // Product fields
        sku: { type: SchemaType.STRING, description: "Product SKU code" },
        hsn_code: { type: SchemaType.STRING, description: "HSN or SAC code" },
        unit: { type: SchemaType.STRING, description: "Unit of measure (Pcs, Kg, etc.)" },
        sale_price: { type: SchemaType.STRING, description: "Selling price in INR" },
        purchase_price: { type: SchemaType.STRING, description: "Purchase price in INR" },
        gst_rate: { type: SchemaType.STRING, description: "GST rate percentage (0, 5, 12, 18, 28)" },
        description: { type: SchemaType.STRING, description: "Product description" },
        category: { type: SchemaType.STRING, description: "Product category" },
        // Order fields
        vendor_name: { type: SchemaType.STRING, description: "Vendor name for PO" },
        customer_name: { type: SchemaType.STRING, description: "Customer name for SO/invoice" },
        order_date: { type: SchemaType.STRING, description: "Order date (YYYY-MM-DD)" },
        expected_delivery_date: { type: SchemaType.STRING, description: "Expected delivery date" },
        notes: { type: SchemaType.STRING, description: "Additional notes" },
        // Payment fields
        party_name: { type: SchemaType.STRING, description: "Name of the paying/receiving party" },
        party_type: { type: SchemaType.STRING, description: "Customer or Vendor" },
        amount: { type: SchemaType.STRING, description: "Payment amount in INR" },
        payment_date: { type: SchemaType.STRING, description: "Payment date (YYYY-MM-DD)" },
        payment_method: { type: SchemaType.STRING, description: "Cash, Bank Transfer, UPI, Cheque, or Card" },
        reference_number: { type: SchemaType.STRING, description: "Cheque no., UTR, or reference" },
        against_invoice: { type: SchemaType.STRING, description: "Invoice number if applicable" },
        // Invoice fields
        invoice_date: { type: SchemaType.STRING, description: "Invoice date" },
        due_date: { type: SchemaType.STRING, description: "Payment due date" },
        // Line items (for orders/invoices)
        items: {
          type: SchemaType.ARRAY,
          description: "Line items with product, quantity, price",
          items: {
            type: SchemaType.OBJECT,
            properties: {
              product_name: { type: SchemaType.STRING, description: "Product name" },
              quantity: { type: SchemaType.STRING, description: "Quantity ordered" },
              unit_price: { type: SchemaType.STRING, description: "Price per unit in INR" },
              gst_rate: { type: SchemaType.STRING, description: "GST rate for this item" },
              discount_percent: { type: SchemaType.STRING, description: "Discount percentage" },
            },
          },
        },
      },
    },
    missing_fields: {
      type: SchemaType.ARRAY,
      description: "List of required fields that were not provided",
      items: { type: SchemaType.STRING },
    },
    follow_up_question: {
      type: SchemaType.STRING,
      description:
        "Natural language question to ask the user for missing fields. Empty string if no fields are missing.",
    },
  },
  required: ["intent", "confidence", "data", "missing_fields", "follow_up_question"],
};

// List of models to try in sequence if one fails (e.g., due to overload)
const FALLBACK_MODELS = [
  "gemini-3.8-flash",      // Latest 2026 stable model
  "gemini-3.6-flash",      // Highly capable fallback
  "gemini-3.1-flash-lite", // Fast, lightweight fallback
];

// Helper to get a configured model instance
function getModel(modelName) {
  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 8192,
      temperature: 0.1, // Low temperature for consistent, deterministic extraction
    },
  });
}

// ═══════════════════════════════════════════════
// MAIN EXTRACTION FUNCTION
// ═══════════════════════════════════════════════

/**
 * Extract intent and entities from transcribed text.
 *
 * @param {string} transcript - The transcribed speech text
 * @param {object|null} context - Previous conversation context for multi-turn support
 * @returns {object} Structured extraction result with intent, data, missing_fields, etc.
 *
 * DATA FLOW:
 * 1. Clean the transcript (remove filler words, fix common misrecognitions)
 * 2. If context exists (multi-turn), prepend prior conversation for continuity
 * 3. Send to Gemini with responseSchema → guaranteed valid JSON
 * 4. Post-process the response (normalize phones, amounts, auto-detect state)
 * 5. If UNKNOWN, retry once with the original (uncleaned) transcript
 * 6. Return the structured result
 */
async function extractIntent(transcript, context = null) {
  // Step 1: Clean the transcript
  const cleanedTranscript = cleanTranscript(transcript);
  console.log(`[LLM Service] Original:  "${transcript}"`);
  console.log(`[LLM Service] Cleaned:   "${cleanedTranscript}"`);

  // Step 2: Try extraction with cleaned transcript
  let result = await _callGemini(cleanedTranscript, context);

  // Step 3: If UNKNOWN and we actually cleaned something, retry with original
  if (
    result.intent === "UNKNOWN" &&
    cleanedTranscript !== transcript &&
    !context
  ) {
    console.log("[LLM Service] UNKNOWN result, retrying with original transcript...");
    result = await _callGemini(transcript, context);
  }

  // Step 4: Post-process the result
  result = postProcessResponse(result);

  console.log("[LLM Service] Final result:", JSON.stringify(result, null, 2));
  return result;
}

/**
 * Internal: Call Gemini API with the given transcript.
 */
async function _callGemini(transcript, context) {
  try {
    let userMessage = "";

    if (context && context.currentIntent) {
      // Multi-turn: user is answering a follow-up question
      userMessage = `PREVIOUS CONTEXT:
Intent: ${context.currentIntent}
Previously collected data: ${JSON.stringify(context.collectedData)}
Missing fields that were asked about: ${JSON.stringify(context.missingFields)}
Previous follow-up question: "${context.lastFollowUp}"

USER'S NEW RESPONSE (answering the follow-up): "${transcript}"

Please merge this new information with the previous data and return the updated result. Keep the same intent (${context.currentIntent}) and update the data fields with the new information.`;
    } else {
      userMessage = `USER SPEECH: "${transcript}"

Remember: Extract ALL mentioned information — names, phone numbers, cities, states, prices, quantities. Do NOT skip any mentioned data.`;
    }

    let lastError = null;

    // Try models in sequence for fallback support
    for (const modelName of FALLBACK_MODELS) {
      try {
        console.log(`[LLM Service] Attempting generation with model: ${modelName}`);
        const model = getModel(modelName);
        const result = await model.generateContent(userMessage);
        const responseText = result.response.text();
        return JSON.parse(responseText);
      } catch (err) {
        console.warn(`[LLM Service] Model ${modelName} failed:`, err.message);
        lastError = err;
        // Continue to the next model in the fallback list
      }
    }

    // If we exhaust all models, throw the last error
    throw lastError || new Error("All fallback models failed");
  } catch (error) {
    console.error("[LLM Service] Exhausted all models. Final Error:", error.message);

    return {
      intent: "UNKNOWN",
      confidence: 0.0,
      data: {},
      missing_fields: [],
      follow_up_question:
        "I'm having trouble processing your request right now. Please try again or type your request instead.",
    };
  }
}

module.exports = { extractIntent };
