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
  const data: TranscriptData = {
    transcript: typeof transcript === "string" ? transcript : JSON.stringify(transcript),
    timestamp: Date.now(),
  };
  transcriptStore.set(sessionId, data);
  console.log(`[transcript-store] Stored transcript for ${sessionId}, size: ${data.transcript.length}, store size: ${transcriptStore.size}`);
}

export function getTranscript(sessionId: string): TranscriptData | undefined {
  const data = transcriptStore.get(sessionId);
  console.log(`[transcript-store] Retrieved transcript for ${sessionId}, found: ${!!data}, store size: ${transcriptStore.size}`);
  if (data) {
    console.log(`[transcript-store] Transcript length: ${data.transcript.length}, age: ${Date.now() - data.timestamp}ms`);
  }
  return data;
}

export function getAllSessionIds(): string[] {
  return Array.from(transcriptStore.keys());
}

export function deleteTranscript(sessionId: string): boolean {
  return transcriptStore.delete(sessionId);
}

