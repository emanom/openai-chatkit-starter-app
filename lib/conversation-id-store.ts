// Shared in-memory store for conversation ID mappings
// NOTE: In production with multiple server instances, use Redis or a database instead

const conversationIdStore = new Map<string, string>();

// Clean up old mappings (older than 24 hours)
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    // For now, we'll keep all mappings (conversation IDs don't expire)
    // In production, you might want to add timestamp tracking and cleanup
  }, CLEANUP_INTERVAL);
}

export function storeConversationId(sessionId: string, conversationId: string): void {
  conversationIdStore.set(sessionId, conversationId);
  console.log(`[conversation-id-store] Stored mapping: ${sessionId} -> ${conversationId}, store size: ${conversationIdStore.size}`);
}

export function getConversationId(sessionId: string): string | undefined {
  const convId = conversationIdStore.get(sessionId);
  console.log(`[conversation-id-store] Retrieved conversation ID for ${sessionId}, found: ${!!convId}`);
  return convId;
}

export function getAllSessionIds(): string[] {
  return Array.from(conversationIdStore.keys());
}

