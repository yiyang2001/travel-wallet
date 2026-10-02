'use client';

const MEMBER_KEY_PREFIX = 'travel-wallet:member:';
const TRIP_KEY_PREFIX = 'travel-wallet:trip:';

export function saveMemberId(inviteCode: string, memberId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MEMBER_KEY_PREFIX + inviteCode, memberId);
}

export function getMemberId(inviteCode: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(MEMBER_KEY_PREFIX + inviteCode);
}

export function saveTripId(inviteCode: string, tripId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TRIP_KEY_PREFIX + inviteCode, tripId);
}

export function getTripId(inviteCode: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TRIP_KEY_PREFIX + inviteCode);
}

export function clearSession(inviteCode: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(MEMBER_KEY_PREFIX + inviteCode);
  localStorage.removeItem(TRIP_KEY_PREFIX + inviteCode);
}

/**
 * 跨环境 UUID v4 生成器
 * 优先用 crypto.randomUUID（HTTPS / localhost）
 * fallback 到 crypto.getRandomValues（HTTP 非 localhost）
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback: 用 crypto.getRandomValues 手动生成 UUID v4
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // 极端 fallback（几乎不会用到）
  throw new Error('crypto is not available in this environment');
}