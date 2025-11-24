const isDev = process.env.NODE_ENV !== "production";

const SPECIAL_CHAR_PATTERN = /[\u200B-\u200D\uFEFF\uE000-\uF8FF]+/g;
const TURN_PATTERN_WITH_SPECIALS = /turn\d+file\d+[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi;
const TURN_PATTERN = /turn\d+file\d+/gi;
// More aggressive patterns to catch filecite with special chars before/after
const FILECITE_PATTERNS = [
  /[\uE000-\uF8FF]*\[?filecite\]?[\uE000-\uF8FF]*[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi,
  /[\uE000-\uF8FF]*\(?filecite\)?[\uE000-\uF8FF]*[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi,
  /[\uE000-\uF8FF]*filecite[\uE000-\uF8FF]*[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi,
  /filecite[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*/gi,
  /filecite/gi,
];
// Pattern to catch filecite followed by turn patterns (common format)
const FILECITE_WITH_TURNS = /[\uE000-\uF8FF]*filecite[\uE000-\uF8FF]*[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*(?:turn\d+file\d+[\s\u200B-\u200D\uFEFF\uE000-\uF8FF]*)+[\uE000-\uF8FF]*/gi;
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
  // First remove the combined filecite + turn patterns (most common case)
  cleaned = cleaned.replace(FILECITE_WITH_TURNS, "");
  // Then remove individual patterns
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
type SanitizableRoot = Document | ShadowRoot | Element | DocumentFragment;

function isQueryableRoot(node: Node | SanitizableRoot | null | undefined): node is SanitizableRoot {
  return Boolean(
    node &&
    typeof (node as Partial<SanitizableRoot>).querySelectorAll === "function"
  );
}

export function sanitizeCitationsDeep(root?: Node | null) {
  if (typeof document === "undefined" || typeof NodeFilter === "undefined") {
    return;
  }
  const context: Node | null =
    root ?? (typeof document !== "undefined" ? document.body : null);
  if (
    !context ||
    typeof document.createTreeWalker !== "function"
  ) {
    return;
  }

  try {
    const walker = document.createTreeWalker(
      context,
      NodeFilter.SHOW_TEXT
    );

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

    if (isQueryableRoot(context)) {
      const allElements = context.querySelectorAll("*");
      allElements.forEach((el) => {
        if (
          el.textContent &&
          (/filecite/i.test(el.textContent) || /turn\d+file\d+/i.test(el.textContent))
        ) {
          const originalHTML = el.innerHTML;
          if (!originalHTML) return;

          let cleanedHTML = originalHTML;
          // First remove combined patterns
          cleanedHTML = cleanedHTML.replace(FILECITE_WITH_TURNS, "");
          // Then remove individual patterns
          for (const pattern of FILECITE_PATTERNS) {
            cleanedHTML = cleanedHTML.replace(pattern, "");
          }
          cleanedHTML = cleanedHTML.replace(TURN_PATTERN_WITH_SPECIALS, "");
          cleanedHTML = cleanedHTML.replace(TURN_PATTERN, "");
          cleanedHTML = cleanedHTML.replace(SPECIAL_CHAR_PATTERN, "");

          if (cleanedHTML !== originalHTML) {
            el.innerHTML = cleanedHTML;
          }
        }
      });
    }
  } catch (error) {
    if (isDev) {
      console.debug("[ChatKit] sanitizeCitationsDeep error", error);
    }
  }
}

let globalObserverStarted = false;

export function ensureGlobalCitationObserver() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  if (globalObserverStarted) {
    return;
  }
  globalObserverStarted = true;

  const runSanitizer = () => {
    try {
      sanitizeCitationsDeep(document.body);
    } catch (error) {
      if (isDev) {
        console.debug("[ChatKit] global citation sanitizer error", error);
      }
    }
  };

  let debounceId: number | null = null;
  const debouncedRun = () => {
    runSanitizer();
    if (debounceId !== null) {
      window.clearTimeout(debounceId);
    }
    debounceId = window.setTimeout(() => {
      debounceId = null;
      runSanitizer();
    }, 50);
  };

  const attachObserver = () => {
    try {
      const target =
        document.body || document.documentElement || (document as Node);
      if (!target) {
        window.requestAnimationFrame(attachObserver);
        return;
      }
      const observer = new MutationObserver(() => {
        debouncedRun();
      });
      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      runSanitizer();
      window.setInterval(runSanitizer, 200);
    } catch (error) {
      if (isDev) {
        console.debug("[ChatKit] failed to start global citation observer", error);
      }
    }
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    attachObserver();
  } else {
    window.addEventListener("DOMContentLoaded", attachObserver, { once: true });
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

