const isDev = process.env.NODE_ENV !== "production";

const SPECIAL_CHAR_PATTERN = /[\u200B-\u200D\uFEFF\uE000-\uF8FF]+/g;
const TURN_PATTERN_WITH_SPECIALS = /turn\d+file\d+[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi;
const TURN_PATTERN = /turn\d+file\d+/gi;
const FILECITE_PATTERNS = [
  /\[?filecite\]?[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi,
  /\(?filecite\)?[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi,
  /filecite[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi,
  /filecite/gi,
];
const MULTISPACE_PATTERN = /\s{2,}/g;
const DETECTION_PATTERN = /(filecite|turn\d+file\d+)/i;

type StripOptions = {
  preserveWhitespace?: boolean;
};

function stripCitationMarkers(
  value: string,
  options?: StripOptions
): string {
  if (!value) {
    return "";
  }

  const preserveWhitespace = Boolean(options?.preserveWhitespace);

  let cleaned = value;
  for (const pattern of FILECITE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  cleaned = cleaned.replace(TURN_PATTERN, "");
  cleaned = cleaned.replace(TURN_PATTERN_WITH_SPECIALS, "");
  cleaned = cleaned.replace(SPECIAL_CHAR_PATTERN, "");

  if (preserveWhitespace) {
    return cleaned;
  }

  cleaned = cleaned.replace(MULTISPACE_PATTERN, " ");
  return cleaned.trim();
}

/**
 * Removes raw file citation markers (e.g. "fileciteturn0file5turn0file12")
 * that can leak into ChatKit responses when citation rendering is disabled or fails.
 */
export function sanitizeCitationsDeep(root: ShadowRoot | null | undefined) {
  if (
    !root ||
    typeof document === "undefined" ||
    typeof NodeFilter === "undefined" ||
    typeof document.createTreeWalker !== "function"
  ) {
    return;
  }

  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      const original = textNode.textContent ?? "";
      if (!original) continue;

      const needsCleanup =
        DETECTION_PATTERN.test(original) ||
        SPECIAL_CHAR_PATTERN.test(original);

      if (!needsCleanup) {
        continue;
      }

      const cleaned = stripCitationMarkers(original);
      if (cleaned !== original) {
        textNode.textContent = cleaned;
      }
    }

    const allElements = root.querySelectorAll("*");
    allElements.forEach((el) => {
      if (
        el.textContent &&
        (/filecite/i.test(el.textContent) || /turn\d+file\d+/i.test(el.textContent))
      ) {
        const originalHTML = el.innerHTML;
        if (!originalHTML) return;

        let cleanedHTML = originalHTML;
        for (const pattern of FILECITE_PATTERNS) {
          cleanedHTML = cleanedHTML.replace(pattern, "");
        }
        cleanedHTML = cleanedHTML.replace(TURN_PATTERN_WITH_SPECIALS, "");
        cleanedHTML = cleanedHTML.replace(SPECIAL_CHAR_PATTERN, "");

        if (cleanedHTML !== originalHTML) {
          el.innerHTML = cleanedHTML;
        }
      }
    });
  } catch (error) {
    if (isDev) {
      console.debug("[ChatKit] sanitizeCitationsDeep error", error);
    }
  }
}

export function sanitizeCitationText(
  input: string | null | undefined,
  options?: StripOptions
): string {
  if (typeof input !== "string" || input.length === 0) {
    return "";
  }
  return stripCitationMarkers(input, options);
}

