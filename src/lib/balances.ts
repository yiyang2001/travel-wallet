import type { MoneyMinor, MemberId } from './money';

// ========== 类型定义 ==========

export type ExpenseId = string;
export type TransferId = string;

export interface Expense {
  id: ExpenseId;
  payer: MemberId;
  baseAmount: MoneyMinor;
}

export interface ExpenseParticipant {
  expenseId: ExpenseId;
  memberId: MemberId;
  shareAmount: MoneyMinor;
}

export interface Transfer {
  id: TransferId;
  fromMember: MemberId;
  toMember: MemberId;
  amount: MoneyMinor;
}

export interface SettlementInstruction {
  from: MemberId;
  to: MemberId;
  amount: MoneyMinor;
}

// ========== 函数 5：calculateBalances ==========

/**
 * 纯函数：不查数据库，只接收数据，返回余额 Map
 * 对每笔 expense: payer += baseAmount，每个 participant -= shareAmount
 * 对每笔 transfer: from -= amount，to += amount
 */
export function calculateBalances(input: {
  expenses: Expense[];
  participants: ExpenseParticipant[];
  transfers: Transfer[];
}): Map<MemberId, MoneyMinor> {
  const { expenses, participants, transfers } = input;
  const balances = new Map<MemberId, MoneyMinor>();

  const add = (id: MemberId, delta: MoneyMinor) => {
    balances.set(id, (balances.get(id) ?? 0) + delta);
  };

  // 按 expense 分组，方便查找
  const participantsByExpense = new Map<ExpenseId, ExpenseParticipant[]>();
  for (const p of participants) {
    const list = participantsByExpense.get(p.expenseId) ?? [];
    list.push(p);
    participantsByExpense.set(p.expenseId, list);
  }

  // 处理 expenses
  for (const expense of expenses) {
    add(expense.payer, expense.baseAmount);
    const ps = participantsByExpense.get(expense.id) ?? [];
    for (const p of ps) {
      add(p.memberId, -p.shareAmount);
    }
  }

  // 处理 transfers
  for (const t of transfers) {
    add(t.fromMember, t.amount);
    add(t.toMember, -t.amount);
  }

  // 移除 0 余额
  for (const [id, balance] of balances) {
    if (balance === 0) {
      balances.delete(id);
    }
  }

  return balances;
}

// ========== 函数 6：calculateSettlement ==========

/**
 * 纯函数：贪心算法
 * 每次匹配最大债务人和最大债权人
 * 只返回建议，不产生数据库记录
 */
export function calculateSettlement(input: {
  balances: Map<MemberId, MoneyMinor>;
}): SettlementInstruction[] {
  const working = new Map(input.balances);
  const instructions: SettlementInstruction[] = [];

  // 防止无限循环：最多循环 N 次
  const maxIterations = working.size * 2 + 10;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    let maxCreditor: { id: MemberId; amount: number } | null = null;
    let maxDebtor: { id: MemberId; amount: number } | null = null;

    for (const [id, balance] of working) {
      if (balance > 0 && (!maxCreditor || balance > maxCreditor.amount)) {
        maxCreditor = { id, amount: balance };
      }
      if (balance < 0 && (!maxDebtor || balance < maxDebtor.amount)) {
        maxDebtor = { id, amount: balance };
      }
    }

    if (!maxCreditor || !maxDebtor) break;

    const amount = Math.min(maxCreditor.amount, -maxDebtor.amount);

    instructions.push({
      from: maxDebtor.id,
      to: maxCreditor.id,
      amount,
    });

    working.set(maxCreditor.id, maxCreditor.amount - amount);
    working.set(maxDebtor.id, maxDebtor.amount + amount);
  }

  return instructions;
}

// ========== 函数 7：assertZeroSum ==========

/**
 * 断言 sum === 0
 * 非零时抛错并打出完整 balances
 * 不自动平账，只用于开发和测试
 */
export function assertZeroSum(input: {
  balances: Map<MemberId, MoneyMinor>;
}): void {
  let sum = 0;
  for (const v of input.balances.values()) {
    sum += v;
  }
  if (sum !== 0) {
    const detail = Array.from(input.balances.entries())
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    throw new Error(`assertZeroSum: sum=${sum}, expected 0. Balances: ${detail}`);
  }
}