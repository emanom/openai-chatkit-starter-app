// In-memory store for thread ID mappings
// Note: In a production environment with multiple server instances,
// you should use a persistent store like Redis or a database

const threadIdStore = new Map<string, string>();

export function storeThreadId(sessionId: string, threadId: string): void {
  threadIdStore.set(sessionId, threadId);
  console.log(`[thread-id-store] Stored: ${sessionId} -> ${threadId}`);
}

export function getThreadId(sessionId: string): string | undefined {
  return threadIdStore.get(sessionId);
}

export function deleteThreadId(sessionId: string): void {
  threadIdStore.delete(sessionId);
}

// Cleanup old entries periodically (older than 24 hours)
// This is a simple implementation - in production, use a proper TTL mechanism
setInterval(() => {
  // For now, we'll keep all entries since we don't have timestamps
  // In production, add timestamps and clean up old entries
  console.log(`[thread-id-store] Current entries: ${threadIdStore.size}`);
}, 60 * 60 * 1000); // Log every hour

