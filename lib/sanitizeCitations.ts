"use client";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Removes raw file citation markers (e.g. "fileciteturn0file5turn0file12")
 * that can leak into ChatKit responses when citation rendering is disabled or fails.
 */
export function sanitizeCitationsDeep(root: ShadowRoot) {
  if (!root) {
    return;
  }

  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const turnPattern = /turn\d+file\d+/gi;
    const fileciteVariations = [
      /\[?filecite\]?[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi,
      /\(?filecite\)?[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi,
      /filecite[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi,
      /filecite/gi,
    ];

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      const original = textNode.textContent ?? "";
      if (!original) continue;

      const hasFilecite = /filecite/i.test(original);
      const hasTurnPattern = turnPattern.test(original);
      if (!hasFilecite && !hasTurnPattern) continue;

      turnPattern.lastIndex = 0;
      let cleaned = original;

      for (const pattern of fileciteVariations) {
        pattern.lastIndex = 0;
        cleaned = cleaned.replace(pattern, "");
      }

      turnPattern.lastIndex = 0;
      cleaned = cleaned.replace(turnPattern, "");
      cleaned = cleaned.replace(
        /turn\d+file\d+[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi,
        ""
      );
      cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF\uE000-\uF8FF]+/g, "");
      cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

      if (cleaned !== original.trim()) {
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
        cleanedHTML = cleanedHTML.replace(
          /filecite[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi,
          ""
        );
        cleanedHTML = cleanedHTML.replace(
          /turn\d+file\d+[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi,
          ""
        );
        cleanedHTML = cleanedHTML.replace(/[\u200B-\u200D\uFEFF\uE000-\uF8FF]+/g, "");

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

