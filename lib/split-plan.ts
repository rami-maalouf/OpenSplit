import type { SplitRange } from '@/modules/video-splitter';

/**
 * split a video into equal chunks, each no longer than maxChunkSeconds.
 * equalizing avoids a stub last chunk: a 8:41 video at 60s max becomes
 * 9 chunks of ~58s instead of 8x60s plus one 41s leftover.
 */
export function planEqualChunks(totalSeconds: number, maxChunkSeconds: number): SplitRange[] {
  if (totalSeconds <= 0) {
    return [];
  }
  const count = Math.max(1, Math.ceil(totalSeconds / maxChunkSeconds));
  const chunk = totalSeconds / count;
  return Array.from({ length: count }, (_, i) => ({
    start: i * chunk,
    // let the last chunk absorb float drift so coverage is exact
    duration: i === count - 1 ? totalSeconds - i * chunk : chunk,
  }));
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  }
  if (bytes >= 1_000_000) {
    return `${Math.round(bytes / 1_000_000)} MB`;
  }
  return `${Math.round(bytes / 1_000)} KB`;
}
