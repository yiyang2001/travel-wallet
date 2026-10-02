import {
  validateMoneyInput,
  validateExchangeRate,
  convertToBase,
  splitEqually,
} from '../src/lib/money';
import {
  calculateBalances,
  calculateSettlement,
  assertZeroSum,
} from '../src/lib/balances';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${name}`);
    console.log(`   ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: expected ${e}, got ${a}`);
  }
}

// ============ validateMoneyInput ============

console.log('\n=== validateMoneyInput ===');

test('"1" → ok 1', () => {
  assertEqual(validateMoneyInput('1'), { ok: true, minor: 1 }, '1');
});

test('"10000000" → ok 10000000', () => {
  assertEqual(validateMoneyInput('10000000'), { ok: true, minor: 10000000 }, 'max');
});

test('"0" → fail', () => {
  const r = validateMoneyInput('0');
  if (r.ok) throw new Error('should fail');
});

test('"10000001" → fail (over max)', () => {
  const r = validateMoneyInput('10000001');
  if (r.ok) throw new Error('should fail');
});

test('"" → fail', () => {
  const r = validateMoneyInput('');
  if (r.ok) throw new Error('should fail');
});

test('"-1" → fail', () => {
  const r = validateMoneyInput('-1');
  if (r.ok) throw new Error('should fail');
});

test('"1.5" → fail', () => {
  const r = validateMoneyInput('1.5');
  if (r.ok) throw new Error('should fail');
});

test('"abc" → fail', () => {
  const r = validateMoneyInput('abc');
  if (r.ok) throw new Error('should fail');
});

// ============ validateExchangeRate ============

console.log('\n=== validateExchangeRate ===');

test('"0.62" → ok 0.62', () => {
  assertEqual(validateExchangeRate('0.62'), { ok: true, rate: 0.62 }, '0.62');
});

test('"0.613456" → ok', () => {
  const r = validateExchangeRate('0.613456');
  if (!r.ok || r.rate !== 0.613456) throw new Error('should be ok');
});

test('"0" → fail', () => {
  const r = validateExchangeRate('0');
  if (r.ok) throw new Error('should fail');
});

test('"0.1234567" → fail (7 decimals)', () => {
  const r = validateExchangeRate('0.1234567');
  if (r.ok) throw new Error('should fail');
});

test('"abc" → fail', () => {
  const r = validateExchangeRate('abc');
  if (r.ok) throw new Error('should fail');
});

test('"200" → fail (> 100)', () => {
  const r = validateExchangeRate('200');
  if (r.ok) throw new Error('should fail');
});

test('"0.001" → fail (< 0.01)', () => {
  const r = validateExchangeRate('0.001');
  if (r.ok) throw new Error('should fail');
});

// ============ convertToBase ============

console.log('\n=== convertToBase ===');

test('10000 × 0.62 → 6200', () => {
  assertEqual(
    convertToBase({ originalAmountMinor: 10000, exchangeRate: 0.62 }),
    6200,
    'CNY 100 → MYR 62'
  );
});

test('9900 × 0.62 → 6138', () => {
  assertEqual(
    convertToBase({ originalAmountMinor: 9900, exchangeRate: 0.62 }),
    6138,
    'CNY 99 → MYR 61.38'
  );
});

test('10000 × 0.613456 → 6135 (round half up)', () => {
  assertEqual(
    convertToBase({ originalAmountMinor: 10000, exchangeRate: 0.613456 }),
    6135,
    'round half up'
  );
});

test('1 × 0.5 → 1 (round half up)', () => {
  assertEqual(
    convertToBase({ originalAmountMinor: 1, exchangeRate: 0.5 }),
    1,
    '0.5 rounds up'
  );
});

// ============ splitEqually ============

console.log('\n=== splitEqually ===');

test('10000 / 3 → [3334, 3333, 3333]', () => {
  const result = splitEqually({
    totalMinor: 10000,
    members: [
      { id: 'A', createdAt: new Date('2024-01-01') },
      { id: 'B', createdAt: new Date('2024-01-02') },
      { id: 'C', createdAt: new Date('2024-01-03') },
    ],
  });
  assertEqual(
    result.map((r) => r.shareAmount),
    [3334, 3333, 3333],
    '100/3'
  );
  assertEqual(
    result.map((r) => r.memberId),
    ['A', 'B', 'C'],
    'order'
  );
});

test('10000 / 7 → 前 4 个多 1', () => {
  const result = splitEqually({
    totalMinor: 10000,
    members: [
      { id: 'A', createdAt: new Date('2024-01-01') },
      { id: 'B', createdAt: new Date('2024-01-02') },
      { id: 'C', createdAt: new Date('2024-01-03') },
      { id: 'D', createdAt: new Date('2024-01-04') },
      { id: 'E', createdAt: new Date('2024-01-05') },
      { id: 'F', createdAt: new Date('2024-01-06') },
      { id: 'G', createdAt: new Date('2024-01-07') },
    ],
  });
  const sum = result.reduce((a, r) => a + r.shareAmount, 0);
  assertEqual(sum, 10000, 'sum');
  assertEqual(result[0].shareAmount, 1429, 'first');
  assertEqual(result[6].shareAmount, 1428, 'last');
});

test('createdAt 相同 → 按 id 排序', () => {
  const result = splitEqually({
    totalMinor: 10000,
    members: [
      { id: 'C', createdAt: new Date('2024-01-01') },
      { id: 'A', createdAt: new Date('2024-01-01') },
      { id: 'B', createdAt: new Date('2024-01-01') },
    ],
  });
  assertEqual(
    result.map((r) => r.memberId),
    ['A', 'B', 'C'],
    'sorted by id'
  );
});

test('空成员 → 抛错', () => {
  try {
    splitEqually({ totalMinor: 100, members: [] });
    throw new Error('should throw');
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes('at least 1')) {
      throw err;
    }
  }
});

// ============ calculateBalances ============

console.log('\n=== calculateBalances ===');

test('基本分摊：A 付 100，三人平分', () => {
  const balances = calculateBalances({
    expenses: [{ id: 'e1', payer: 'A', baseAmount: 10000 }],
    participants: [
      { expenseId: 'e1', memberId: 'A', shareAmount: 3334 },
      { expenseId: 'e1', memberId: 'B', shareAmount: 3333 },
      { expenseId: 'e1', memberId: 'C', shareAmount: 3333 },
    ],
    transfers: [],
  });
  assertEqual(balances.get('A'), 6666, 'A');
  assertEqual(balances.get('B'), -3333, 'B');
  assertEqual(balances.get('C'), -3333, 'C');
  assertZeroSum({ balances });
});

test('带 Transfer：B 还 A 1000', () => {
  const balances = calculateBalances({
    expenses: [{ id: 'e1', payer: 'A', baseAmount: 10000 }],
    participants: [
      { expenseId: 'e1', memberId: 'A', shareAmount: 5000 },
      { expenseId: 'e1', memberId: 'B', shareAmount: 5000 },
    ],
    transfers: [
      { id: 't1', fromMember: 'B', toMember: 'A', amount: 1000 },
    ],
  });
  assertEqual(balances.get('A'), 4000, 'A');
  assertEqual(balances.get('B'), -4000, 'B');
  assertZeroSum({ balances });
});

test('零余额成员不出现在 Map', () => {
  const balances = calculateBalances({
    expenses: [{ id: 'e1', payer: 'A', baseAmount: 100 }],
    participants: [
      { expenseId: 'e1', memberId: 'A', shareAmount: 100 },
    ],
    transfers: [],
  });
  assertEqual(balances.size, 0, 'empty');
});

// ============ calculateSettlement ============

console.log('\n=== calculateSettlement ===');

test('A=6666, B=-3333, C=-3333', () => {
  const balances = new Map([
    ['A', 6666],
    ['B', -3333],
    ['C', -3333],
  ]);
  const result = calculateSettlement({ balances });
  assertEqual(result.length, 2, '2 instructions');
  assertEqual(result[0].from, 'B', 'first from');
  assertEqual(result[0].to, 'A', 'first to');
  assertEqual(result[0].amount, 3333, 'first amount');
  assertEqual(result[1].from, 'C', 'second from');
  assertEqual(result[1].amount, 3333, 'second amount');
});

test('已结清 → 空数组', () => {
  const result = calculateSettlement({ balances: new Map() });
  assertEqual(result.length, 0, 'empty');
});

// ============ 结果 ============

console.log('\n' + '='.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}