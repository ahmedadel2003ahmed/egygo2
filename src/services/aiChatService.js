import { GoogleGenerativeAI } from "@google/generative-ai";
import Place from "../models/Place.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const SYSTEM_PROMPT = `أنت نفرتيتي، مرشدة سياحية مصرية ذكية.

قواعد صارمة:
1. اجب بالعربية فقط.
2. استخدم فقط المعلومات من السياق المقدم.
3. لا تخترع أو تتخيل أي معلومات.
4. إذا لم يكن هناك سياق، قل: "لا توجد معلومات متاحة حالياً عن هذا السؤال."
5. ركز على مصر فقط - 27 محافظة.
6. الفئات: أماكن أثرية، ترفيهية، فنادق، فعاليات.
7. اعرض من 3 إلى 5 نتائج فقط.
8. استخدم الصيغة: الاسم، المحافظة، النوع، الوصف.

تصرف كمرشدة سياحية محترفة ودودة.`;

const NO_DATA_MESSAGE = "لا توجد معلومات متاحة حالياً عن هذا السؤال.";
const AI_ERROR_MESSAGE = "حدث خطأ في الاتصال بخدمة الدردشة.";
const MAX_RESPONSE_LENGTH = 500;

const GREETING_RESPONSE =
  "أهلاً بك، أنا نفرتيتي مرشدتك السياحية الذكية. اسألني عن أي محافظة أو نوع مكان تحب تزوره في مصر 🇪🇬";

const PROVINCES_MAP = {
  المنيا: ["minya", "minia", "المنيا"],
  القاهرة: ["cairo", "قاهرة", "القاهرة"],
  الجيزة: ["giza", "جيزة", "الجيزة"],
  الأقصر: ["luxor", "أقصر", "الأقصر"],
  أسوان: ["aswan", "اسوان", "أسوان"],
  الإسكندرية: ["alexandria", "اسكندرية", "الإسكندرية"],
  "البحر الأحمر": ["red sea", "بحر احمر", "البحر الأحمر"],
  مطروح: ["matrouh", "marsa matrouh", "مطروح", "مرسى مطروح"],
};

/**
 * Extract province and category from user message
 * @param {string} message - User's query
 * @returns {Object} - { province: string|null, category: string|null }
 */
function extractIntent(message) {
  const lowerMessage = message.toLowerCase();

  // Detect province
  let detectedProvince = null;
  for (const [province, aliases] of Object.entries(PROVINCES_MAP)) {
    if (aliases.some((alias) => lowerMessage.includes(alias))) {
      detectedProvince = province;
      break;
    }
  }

  // Detect category
  const categoryKeywords = {
    hotels: [
      "فندق",
      "فنادق",
      "hotel",
      "hotels",
      "مبيت",
      "accommodation",
      "إقامة",
    ],
    archaeological: [
      "أثر",
      "آثار",
      "archaeological",
      "monument",
      "معبد",
      "temple",
      "تاريخي",
      "فرعوني",
    ],
    entertainment: ["ترفيه", "entertainment", "متعة", "fun", "لعب", "تسلية"],
    events: ["فعالية", "فعاليات", "event", "events", "حدث", "احتفال", "مهرجان"],
  };

  let detectedCategory = null;
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some((keyword) => lowerMessage.includes(keyword))) {
      detectedCategory = category;
      break;
    }
  }

  return { province: detectedProvince, category: detectedCategory };
}

/**
 * Search MongoDB for relevant tourism data
 * @param {string} userMessage - User's query
 * @param {Object} intent - Extracted intent { province, category }
 * @returns {Promise<Array>} - Matching places/hotels/events
 */
async function searchDatabase(userMessage, intent) {
  try {
    const { province, category } = intent;
    const sanitizedMessage = userMessage.trim().substring(0, 200);

    // Build search query
    const searchQuery = {
      isActive: true,
    };

    // Add category filter if detected
    if (category) {
      searchQuery.type = category;
    }

    // Search places
    let places = await Place.find(searchQuery)
      .populate("province", "name governorate slug")
      .select("name type description tags location province")
      .limit(10)
      .lean();

    console.log(
      `[aiChatService] Total places found before province filter: ${places.length}`
    );

    // Filter by province name if detected
    if (province && places.length > 0) {
      const filteredPlaces = places.filter((p) => {
        if (!p.province || !p.province.name) return false;
        const provinceName = p.province.name.toLowerCase();
        const aliases = PROVINCES_MAP[province] || [];
        return aliases.some((alias) => provinceName.includes(alias));
      });

      console.log(
        `[aiChatService] Places after province filter (${province}): ${filteredPlaces.length}`
      );

      // If province filter returned no results, use all results
      if (filteredPlaces.length === 0) {
        console.log(
          `[aiChatService] No results for province ${province}, showing all available`
        );
      } else {
        places = filteredPlaces;
      }
    }

    // Limit to 5 results
    return places.slice(0, 5);
  } catch (error) {
    console.error("[aiChatService] Database search error:", error);
    return [];
  }
}

/**
 * Format database results for AI context
 * @param {Array} results - Database results
 * @returns {string} - Formatted context string
 */
function formatDatabaseContext(results) {
  if (!results || results.length === 0) {
    return "";
  }

  const categoryMap = {
    archaeological: "موقع أثري",
    hotels: "فندق",
    events: "فعالية",
    entertainment: "مكان ترفيهي",
  };

  const contextParts = results.map((item, index) => {
    const typeName = categoryMap[item.type] || item.type;
    const provinceName = item.province?.name || "غير محدد";

    return `${index + 1}. الاسم: ${item.name}
   المحافظة: ${provinceName}
   النوع: ${typeName}
   الوصف: ${item.description.substring(0, 150)}...`;
  });

  return contextParts.join("\n\n");
}

/**
 * Generate response from database context (fallback when OpenAI unavailable)
 * @param {string} context - Database context
 * @returns {string} - Formatted response
 */
function generateFallbackResponse(context) {
  if (!context || context.trim().length === 0) {
    return NO_DATA_MESSAGE;
  }

  const intro = "مرحباً! وجدت المعلومات التالية:\n\n";
  let response = intro + context;

  if (response.length > MAX_RESPONSE_LENGTH) {
    response = response.substring(0, MAX_RESPONSE_LENGTH) + "...";
  }

  return response;
}

/**
 * Call Gemini API with context
 * @param {string} userMessage - User's message
 * @param {string} context - Database context
 * @returns {Promise<string>} - AI response
 */
async function callGemini(userMessage, context) {
  try {
    const prompt = `${SYSTEM_PROMPT}

البيانات المتاحة من قاعدة البيانات:
${context}

سؤال المستخدم: ${userMessage}

الرجاء الإجابة بالعربية فقط وباستخدام المعلومات المتاحة أعلاه فقط.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let reply = response.text() || NO_DATA_MESSAGE;

    // Limit response length
    if (reply.length > MAX_RESPONSE_LENGTH) {
      reply = reply.substring(0, MAX_RESPONSE_LENGTH) + "...";
    }

    return reply;
  } catch (error) {
    console.error("[aiChatService] Gemini API error:", error);

    // If quota exceeded, API unavailable, or model not found, use fallback response
    if (
      error.message?.includes("quota") ||
      error.message?.includes("429") ||
      error.status === 404 ||
      error.message?.includes("not found")
    ) {
      console.log(
        "[aiChatService] Using fallback response due to Gemini unavailability"
      );
      return generateFallbackResponse(context);
    }

    throw new Error(AI_ERROR_MESSAGE);
  }
}

/**
 * Main chat function
 * @param {string} userMessage - User's input message
 * @returns {Promise<Object>} - { type: 'text'|'places', content: string|Array }
 */
export async function processAIChat(userMessage) {
  try {
    // Validate input
    if (!userMessage || typeof userMessage !== "string") {
      return { type: "text", content: NO_DATA_MESSAGE };
    }

    // Sanitize input
    const sanitizedMessage = userMessage.trim();
    if (sanitizedMessage.length === 0) {
      return { type: "text", content: NO_DATA_MESSAGE };
    }

    // Handle greetings
    const greetings = [
      "مرحبا",
      "أهلا",
      "السلام",
      "ازيك",
      "ازي",
      "hello",
      "hi",
      "hey",
      "صباح",
      "مساء",
    ];
    const lowerMessage = sanitizedMessage.toLowerCase();
    if (
      greetings.some((g) => lowerMessage.includes(g)) &&
      sanitizedMessage.length < 20
    ) {
      return { type: "text", content: GREETING_RESPONSE };
    }

    // Extract intent (province & category)
    const intent = extractIntent(sanitizedMessage);
    console.log("[aiChatService] Extracted intent:", intent);

    // Search database with intent
    const dbResults = await searchDatabase(sanitizedMessage, intent);
    console.log("[aiChatService] Found results:", dbResults.length);

    // If no data found, return fallback message
    if (dbResults.length === 0) {
      return { type: "text", content: NO_DATA_MESSAGE };
    }

    // Return places as structured data
    const places = dbResults.map((place) => ({
      id: place._id.toString(),
      name: place.name,
      province: place.province?.name || "غير محدد",
      category: place.type,
      description: place.description.substring(0, 150) + "...",
    }));

    return { type: "places", content: places };
  } catch (error) {
    console.error("[aiChatService] processAIChat error:", error);
    return { type: "text", content: error.message || AI_ERROR_MESSAGE };
  }
}

export default {
  processAIChat,
};
