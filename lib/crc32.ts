/**
 * Compute CRC32 checksum for a file/blob
 * Returns base64-encoded checksum suitable for AWS S3 x-amz-checksum-crc32 header
 */
export async function computeCRC32(file: File | Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const view = new Uint8Array(arrayBuffer);
  
  // CRC32 polynomial: 0xEDB88320 (reversed form of 0x04C11DB7)
  const crc32Table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
    }
    crc32Table[i] = crc;
  }
  
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < view.length; i++) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ view[i]) & 0xFF];
  }
  crc = (crc ^ 0xFFFFFFFF) >>> 0; // Convert to unsigned 32-bit integer
  
  // Convert to base64
  const bytes = new Uint8Array(4);
  bytes[0] = (crc >>> 24) & 0xFF;
  bytes[1] = (crc >>> 16) & 0xFF;
  bytes[2] = (crc >>> 8) & 0xFF;
  bytes[3] = crc & 0xFF;
  
  // Convert to base64
  const binaryString = String.fromCharCode(...bytes);
  return btoa(binaryString);
}

