import { Decimal } from 'decimal.js';

// ========== 类型定义 ==========

export type MoneyMinor = number;
export type MemberId = string;

export type MoneyInputResult =
  | { ok: true; minor: MoneyMinor }
  | { ok: false; reason: string };

export type ExchangeRateInputResult =
  | { ok: true; rate: number }
  | { ok: false; reason: string };

export interface MemberCreatedAt {
  id: MemberId;
  createdAt: Date;
}

export interface EqualShare {
  memberId: MemberId;
  shareAmount: MoneyMinor;
}

// ========== 常量 ==========

const MONEY_MIN = 1;                    // 0.01
const MONEY_MAX = 10_000_000;           // RM 100,000
const RATE_MIN = 0.01;
const RATE_MAX = 100;

// ========== 函数 1：validateMoneyInput ==========

/**
 * 金额字符串 -> minor units
 * 只接受整数数字字符串
 */
export function validateMoneyInput(input: string): MoneyInputResult {
  if (typeof input !== 'string') {
    return { ok: false, reason: 'Amount must be a string' };
  }
  if (!/^[0-9]+$/.test(input)) {
    return { ok: false, reason: 'Amount must be a positive integer string' };
  }
  const minor = Number(input);
  if (!Number.isSafeInteger(minor)) {
    return { ok: false, reason: 'Amount is not a safe integer' };
  }
  if (minor < MONEY_MIN) {
    return { ok: false, reason: 'Amount must be at least 0.01' };
  }
  if (minor > MONEY_MAX) {
    return { ok: false, reason: 'Amount exceeds maximum (RM 100,000)' };
  }
  return { ok: true, minor };
}

// ========== 函数 2：validateExchangeRate ==========

/**
 * 汇率字符串 -> decimal number
 * 只接受最多 6 位小数的十进制字符串
 */
export function validateExchangeRate(input: string): ExchangeRateInputResult {
  if (typeof input !== 'string') {
    return { ok: false, reason: 'Rate must be a string' };
  }
  if (!/^[0-9]+(\.[0-9]{1,6})?$/.test(input)) {
    return { ok: false, reason: 'Rate must be a decimal with up to 6 places' };
  }
  const rate = Number(input);
  if (!Number.isFinite(rate)) {
    return { ok: false, reason: 'Rate is not finite' };
  }
  if (rate < RATE_MIN) {
    return { ok: false, reason: 'Rate must be at least 0.01' };
  }
  if (rate > RATE_MAX) {
    return { ok: false, reason: 'Rate must not exceed 100' };
  }
  return { ok: true, rate };
}

// ========== 函数 3：convertToBase ==========

/**
 * 使用 decimal-safe 乘法
 * 公式：baseAmountMinor = round_half_up(originalAmountMinor × exchangeRate)
 * exchangeRate 表示 1 单位 original_currency (major) = X MYR (major)
 */
export function convertToBase(input: {
  originalAmountMinor: MoneyMinor;
  exchangeRate: number;
}): MoneyMinor {
  const { originalAmountMinor, exchangeRate } = input;

  if (!Number.isSafeInteger(originalAmountMinor) || originalAmountMinor <= 0) {
    throw new Error(`convertToBase: invalid originalAmountMinor ${originalAmountMinor}`);
  }
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error(`convertToBase: invalid exchangeRate ${exchangeRate}`);
  }

  const base = new Decimal(originalAmountMinor).times(exchangeRate);
  const rounded = base.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const result = rounded.toNumber();

  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new Error(`convertToBase: result ${result} is not a positive safe integer`);
  }
  return result;
}

// ========== 函数 4：splitEqually ==========

/**
 * 平均分摊，余数按 createdAt ASC 分配
 * createdAt 相同则按 id ASC
 * 断言 sum(shares) === totalMinor
 */
export function splitEqually(input: {
  totalMinor: MoneyMinor;
  members: MemberCreatedAt[];
}): EqualShare[] {
  const { totalMinor, members } = input;

  if (!Array.isArray(members) || members.length < 1) {
    throw new Error('splitEqually: at least 1 member is required');
  }
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
    throw new Error(`splitEqually: invalid totalMinor ${totalMinor}`);
  }

  // 按 createdAt ASC 排序，相同则按 id ASC
  const sorted = [...members].sort((a, b) => {
    const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const baseShare = Math.floor(totalMinor / sorted.length);
  const remainder = totalMinor - baseShare * sorted.length;

  const result = sorted.map((member, index) => ({
    memberId: member.id,
    shareAmount: index < remainder ? baseShare + 1 : baseShare,
  }));

  // 断言
  const sum = result.reduce((acc, r) => acc + r.shareAmount, 0);
  if (sum !== totalMinor) {
    throw new Error(`splitEqually: sum ${sum} !== total ${totalMinor}`);
  }
  for (const r of result) {
    if (r.shareAmount <= 0) {
      throw new Error(`splitEqually: shareAmount must be > 0, got ${r.shareAmount}`);
    }
  }

  return result;
}