export function renderSummaryHtml(input: string | null | undefined): string {
  if (!input) {
    return "";
  }

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const escaped = escapeHtml(input);
  const withLinks = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  const paragraphs = withLinks
    .split(/\n\s*\n/)
    .map((paragraph) => {
      const content = paragraph.replace(/\n/g, "<br />").trim();
      return content ? `<p>${content}</p>` : "";
    })
    .filter(Boolean)
    .join("");

  return paragraphs || `<p>${withLinks.replace(/\n/g, "<br />")}</p>`;
}

