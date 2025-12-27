/**
 * Hotfix middleware:
 * If any string is in broken format YYYY-MM-DDHH:mm:ssZ,
 * fix it by inserting 'T' => YYYY-MM-DDTHH:mm:ssZ.
 *
 * Constraints (per request):
 * - Simple string manipulation only
 * - No libraries
 * - No Date objects
 * - Apply only right before sending response
 */

const BROKEN_ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}\d{2}:\d{2}:\d{2}Z$/;

const MAX_TRAVERSE_DEPTH = 60;

function maybeToJson(value) {
  if (!value || typeof value !== "object") return value;
  const toJSON = value.toJSON;
  if (typeof toJSON !== "function") return value;
  try {
    const jsonValue = toJSON.call(value);
    return jsonValue === value ? value : jsonValue;
  } catch {
    return value;
  }
}

function fixBrokenIsoDateStrings(value, seen = null, depth = 0) {
  if (depth > MAX_TRAVERSE_DEPTH) return value;

  if (typeof value === "string") {
    if (BROKEN_ISO_UTC_RE.test(value)) {
      // Insert 'T' between date (10 chars) and time.
      return value.slice(0, 10) + "T" + value.slice(10);
    }
    return value;
  }

  value = maybeToJson(value);

  if (Array.isArray(value)) {
    if (!seen) seen = new WeakSet();
    if (seen.has(value)) return value;
    seen.add(value);

    let changed = false;
    const out = value.map((item) => {
      const fixed = fixBrokenIsoDateStrings(item, seen, depth + 1);
      if (fixed !== item) changed = true;
      return fixed;
    });
    return changed ? out : value;
  }

  if (value && typeof value === "object") {
    // Only traverse plain JSON-like objects (or objects that became plain via toJSON).
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;

    if (!seen) seen = new WeakSet();
    if (seen.has(value)) return value;
    seen.add(value);

    let changed = false;
    const out = {};
    for (const key of Object.keys(value)) {
      const original = value[key];
      const fixed = fixBrokenIsoDateStrings(original, seen, depth + 1);
      out[key] = fixed;
      if (fixed !== original) changed = true;
    }
    return changed ? out : value;
  }

  return value;
}

export const fixBrokenIsoDateStringsMiddleware = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    const fixedBody = fixBrokenIsoDateStrings(body);
    return originalJson(fixedBody);
  };

  next();
};
