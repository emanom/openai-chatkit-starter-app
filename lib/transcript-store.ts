// Shared in-memory transcript store
// NOTE: In production with multiple server instances, use Redis or a database instead

type TranscriptData = {
  transcript: string;
  timestamp: number;
};

const transcriptStore = new Map<string, TranscriptData>();

// Clean up old transcripts (older than 1 hour)
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, data] of transcriptStore.entries()) {
      if (now - data.timestamp > CLEANUP_INTERVAL) {
        transcriptStore.delete(sessionId);
      }
    }
  }, CLEANUP_INTERVAL);
}

export function storeTranscript(sessionId: string, transcript: string): void {
  transcriptStore.set(sessionId, {
    transcript: typeof transcript === "string" ? transcript : JSON.stringify(transcript),
    timestamp: Date.now(),
  });
}

export function getTranscript(sessionId: string): TranscriptData | undefined {
  return transcriptStore.get(sessionId);
}

export function deleteTranscript(sessionId: string): boolean {
  return transcriptStore.delete(sessionId);
}

