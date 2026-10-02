'use server';

import { supabaseAdmin } from './supabase';
import {
  validateMoneyInput,
  validateExchangeRate,
  convertToBase,
  splitEqually,
  type MemberCreatedAt,
} from './money';
import {
  calculateBalances,
  calculateSettlement,
  type Expense,
  type ExpenseParticipant,
  type Transfer,
  type SettlementInstruction,
} from './balances';

// ============ 类型定义 ============

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface Trip {
  id: string;
  name: string;
  baseCurrency: string;
  defaultExpenseCurrency: string;
  defaultExchangeRate: string;
  inviteCode: string;
  createdAt: string;
}

export interface TripMember {
  id: string;
  tripId: string;
  displayName: string;
  createdAt: string;
}

export interface TripWithMembers extends Trip {
  members: TripMember[];
}

// ============ Action 1: createTrip ============

export async function createTrip(input: {
  name: string;
  baseCurrency: string;
  defaultExpenseCurrency: string;
  defaultExchangeRate: string;
  creatorDisplayName: string;
  additionalMemberNames?: string[];
}): Promise<ActionResult<{ tripId: string; inviteCode: string; memberId: string }>> {
  // 1. 校验汇率
  const rateResult = validateExchangeRate(input.defaultExchangeRate);
  if (!rateResult.ok) {
    return { ok: false, error: `INVALID_EXCHANGE_RATE: ${rateResult.reason}` };
  }

  // 2. 校验名称
  if (!input.name || input.name.trim().length === 0 || input.name.length > 100) {
    return { ok: false, error: 'INVALID_NAME' };
  }
  if (!input.creatorDisplayName || input.creatorDisplayName.trim().length === 0) {
    return { ok: false, error: 'INVALID_DISPLAY_NAME' };
  }

  // 3. 校验 additionalMemberNames
  const additionalNames = (input.additionalMemberNames ?? [])
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  for (const name of additionalNames) {
    if (name.length > 50) {
      return { ok: false, error: 'INVALID_MEMBER_NAME' };
    }
  }

  // 4. 插入 trip
  const { data: trip, error: tripError } = await supabaseAdmin
    .from('trips')
    .insert({
      name: input.name.trim(),
      base_currency: input.baseCurrency,
      default_expense_currency: input.defaultExpenseCurrency,
      default_exchange_rate: rateResult.rate,
    })
    .select('id, invite_code')
    .single();

  if (tripError || !trip) {
    return { ok: false, error: `DB_ERROR: ${tripError?.message ?? 'unknown'}` };
  }

  // 5. 插入创建者
  const { data: member, error: memberError } = await supabaseAdmin
    .from('trip_members')
    .insert({
      trip_id: trip.id,
      display_name: input.creatorDisplayName.trim(),
    })
    .select('id')
    .single();

  if (memberError || !member) {
    await supabaseAdmin.from('trips').delete().eq('id', trip.id);
    return { ok: false, error: `DB_ERROR: ${memberError?.message ?? 'unknown'}` };
  }

  // 6. 批量插入其他成员
  if (additionalNames.length > 0) {
    const { error: bulkError } = await supabaseAdmin
      .from('trip_members')
      .insert(
        additionalNames.map((name) => ({
          trip_id: trip.id,
          display_name: name,
        }))
      );

    if (bulkError) {
      await supabaseAdmin.from('trips').delete().eq('id', trip.id);
      return { ok: false, error: `DB_ERROR: ${bulkError.message}` };
    }
  }

  return {
    ok: true,
    data: {
      tripId: trip.id,
      inviteCode: trip.invite_code,
      memberId: member.id,
    },
  };
}

// ============ 辅助函数：验证 inviteCode ============

async function findTripByInviteCode(inviteCode: string) {
  const { data, error } = await supabaseAdmin
    .from('trips')
    .select('id, name, base_currency, default_expense_currency, default_exchange_rate, invite_code, created_at')
    .eq('invite_code', inviteCode)
    .single();

  if (error || !data) return null;
  return data;
}

// ============ Action 2: joinTrip ============

export async function joinTrip(input: {
  inviteCode: string;
  displayName: string;
}): Promise<ActionResult<{ memberId: string; tripId: string }>> {
  const trip = await findTripByInviteCode(input.inviteCode);
  if (!trip) return { ok: false, error: 'NOT_FOUND' };

  if (!input.displayName || input.displayName.trim().length === 0 || input.displayName.length > 50) {
    return { ok: false, error: 'INVALID_DISPLAY_NAME' };
  }

  const { data: member, error } = await supabaseAdmin
    .from('trip_members')
    .insert({
      trip_id: trip.id,
      display_name: input.displayName.trim(),
    })
    .select('id')
    .single();

  if (error || !member) {
    return { ok: false, error: `DB_ERROR: ${error?.message ?? 'unknown'}` };
  }

  return { ok: true, data: { memberId: member.id, tripId: trip.id } };
}

// ============ Action 3: claimMember ============

export async function claimMember(input: {
  inviteCode: string;
  memberId: string;
}): Promise<ActionResult<{ tripId: string; memberId: string; displayName: string }>> {
  const trip = await findTripByInviteCode(input.inviteCode);
  if (!trip) return { ok: false, error: 'NOT_FOUND' };

  const { data: member, error } = await supabaseAdmin
    .from('trip_members')
    .select('id, display_name')
    .eq('id', input.memberId)
    .eq('trip_id', trip.id)
    .single();

  if (error || !member) return { ok: false, error: 'NOT_FOUND' };

  return {
    ok: true,
    data: {
      tripId: trip.id,
      memberId: member.id,
      displayName: member.display_name,
    },
  };
}

// ============ Action 4: getTrip ============

export async function getTrip(input: {
  inviteCode: string;
}): Promise<ActionResult<TripWithMembers>> {
  const trip = await findTripByInviteCode(input.inviteCode);
  if (!trip) return { ok: false, error: 'NOT_FOUND' };

  const { data: members, error } = await supabaseAdmin
    .from('trip_members')
    .select('id, trip_id, display_name, created_at')
    .eq('trip_id', trip.id)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: `DB_ERROR: ${error.message}` };

  return {
    ok: true,
    data: {
      id: trip.id,
      name: trip.name,
      baseCurrency: trip.base_currency,
      defaultExpenseCurrency: trip.default_expense_currency,
      defaultExchangeRate: String(trip.default_exchange_rate),
      inviteCode: trip.invite_code,
      createdAt: trip.created_at,
      members: (members ?? []).map((m) => ({
        id: m.id,
        tripId: m.trip_id,
        displayName: m.display_name,
        createdAt: m.created_at,
      })),
    },
  };
}

// ============ Action 5: addExpense ============

export async function addExpense(input: {
  inviteCode: string;
  description: string;
  originalAmountMinor: number;
  originalCurrency: string;
  exchangeRateUsed: number;
  payerMemberId: string;
  participantMemberIds: string[];
  idempotencyKey: string;
}): Promise<ActionResult<{ expenseId: string }>> {
  const trip = await findTripByInviteCode(input.inviteCode);
  if (!trip) return { ok: false, error: 'NOT_FOUND' };

  // 验证 description
  if (!input.description || input.description.trim().length === 0 || input.description.length > 200) {
    return { ok: false, error: 'INVALID_DESCRIPTION' };
  }

  // 验证 amount
  if (!Number.isSafeInteger(input.originalAmountMinor) || input.originalAmountMinor <= 0) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }

  // 验证参与者
  const uniqueParticipants = Array.from(new Set(input.participantMemberIds));
  if (uniqueParticipants.length < 1) {
    return { ok: false, error: 'INVALID_PARTICIPANTS' };
  }

  // 验证所有 member 属于该 trip
  const allMemberIds = [input.payerMemberId, ...uniqueParticipants];
  const { data: members, error: memberError } = await supabaseAdmin
    .from('trip_members')
    .select('id, created_at')
    .eq('trip_id', trip.id)
    .in('id', allMemberIds);

  if (memberError) return { ok: false, error: `DB_ERROR: ${memberError.message}` };

  const foundIds = new Set((members ?? []).map((m) => m.id));
  for (const id of allMemberIds) {
    if (!foundIds.has(id)) return { ok: false, error: 'NOT_FOUND' };
  }

  // 计算 base amount
  const baseAmountMinor = convertToBase({
    originalAmountMinor: input.originalAmountMinor,
    exchangeRate: input.exchangeRateUsed,
  });

  // 计算 shares
  const participantMembers: MemberCreatedAt[] = uniqueParticipants.map((id) => {
    const m = members!.find((x) => x.id === id)!;
    return { id, createdAt: new Date(m.created_at) };
  });

  const shares = splitEqually({
    totalMinor: baseAmountMinor,
    members: participantMembers,
  });

  // 调用 RPC
  const { data: expenseId, error: rpcError } = await supabaseAdmin.rpc('add_expense_atomic', {
    p_trip_id: trip.id,
    p_description: input.description.trim(),
    p_original_amount: input.originalAmountMinor,
    p_original_currency: input.originalCurrency,
    p_exchange_rate_used: input.exchangeRateUsed,
    p_base_amount: baseAmountMinor,
    p_payer_member_id: input.payerMemberId,
    p_participant_ids: shares.map((s) => s.memberId),
    p_share_amounts: shares.map((s) => s.shareAmount),
    p_idempotency_key: input.idempotencyKey,
  });

  if (rpcError) return { ok: false, error: `DB_ERROR: ${rpcError.message}` };
  if (!expenseId) return { ok: false, error: 'DB_ERROR: no expense id returned' };

  return { ok: true, data: { expenseId } };
}

// ============ Action 6: deleteExpense ============

export async function deleteExpense(input: {
  inviteCode: string;
  expenseId: string;
}): Promise<ActionResult<{ ok: true }>> {
  const trip = await findTripByInviteCode(input.inviteCode);
  if (!trip) return { ok: false, error: 'NOT_FOUND' };

  const { data: expense, error: findError } = await supabaseAdmin
    .from('expenses')
    .select('id')
    .eq('id', input.expenseId)
    .eq('trip_id', trip.id)
    .single();

  if (findError || !expense) return { ok: false, error: 'NOT_FOUND' };

  const { error } = await supabaseAdmin.from('expenses').delete().eq('id', input.expenseId);
  if (error) return { ok: false, error: `DB_ERROR: ${error.message}` };

  return { ok: true, data: { ok: true } };
}

// ============ Action 7: addTransfer ============

export async function addTransfer(input: {
  inviteCode: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  idempotencyKey: string;
}): Promise<ActionResult<{ transferId: string }>> {
  const trip = await findTripByInviteCode(input.inviteCode);
  if (!trip) return { ok: false, error: 'NOT_FOUND' };

  if (input.fromMemberId === input.toMemberId) {
    return { ok: false, error: 'INVALID_SAME_MEMBER' };
  }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 10_000_000) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }

  // 验证两个 member 属于该 trip
  const { data: members, error: memberError } = await supabaseAdmin
    .from('trip_members')
    .select('id')
    .eq('trip_id', trip.id)
    .in('id', [input.fromMemberId, input.toMemberId]);

  if (memberError) return { ok: false, error: `DB_ERROR: ${memberError.message}` };
  if ((members ?? []).length !== 2) return { ok: false, error: 'NOT_FOUND' };

  // 调用 RPC
  const { data: transferId, error: rpcError } = await supabaseAdmin.rpc('add_transfer_atomic', {
    p_trip_id: trip.id,
    p_from_member_id: input.fromMemberId,
    p_to_member_id: input.toMemberId,
    p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey,
  });

  if (rpcError) return { ok: false, error: `DB_ERROR: ${rpcError.message}` };
  if (!transferId) return { ok: false, error: 'DB_ERROR: no transfer id returned' };

  return { ok: true, data: { transferId } };
}

// ============ Action 8: deleteTransfer ============

export async function deleteTransfer(input: {
  inviteCode: string;
  transferId: string;
}): Promise<ActionResult<{ ok: true }>> {
  const trip = await findTripByInviteCode(input.inviteCode);
  if (!trip) return { ok: false, error: 'NOT_FOUND' };

  const { data: transfer, error: findError } = await supabaseAdmin
    .from('transfers')
    .select('id')
    .eq('id', input.transferId)
    .eq('trip_id', trip.id)
    .single();

  if (findError || !transfer) return { ok: false, error: 'NOT_FOUND' };

  const { error } = await supabaseAdmin.from('transfers').delete().eq('id', input.transferId);
  if (error) return { ok: false, error: `DB_ERROR: ${error.message}` };

  return { ok: true, data: { ok: true } };
}

// ============ Action 9: getBalances ============

export async function getBalances(input: {
  inviteCode: string;
}): Promise<ActionResult<Array<{ memberId: string; balance: number }>>> {
  const trip = await findTripByInviteCode(input.inviteCode);
  if (!trip) return { ok: false, error: 'NOT_FOUND' };

  // 查询 expenses
  const { data: expensesRaw, error: e1 } = await supabaseAdmin
    .from('expenses')
    .select('id, payer_member_id, base_amount')
    .eq('trip_id', trip.id);

  if (e1) return { ok: false, error: `DB_ERROR: ${e1.message}` };

  const expenseIds = (expensesRaw ?? []).map((e) => e.id);

  // 查询 participants
  let participantsRaw: Array<{ expense_id: string; member_id: string; share_amount: number }> = [];
  if (expenseIds.length > 0) {
    const { data, error: e2 } = await supabaseAdmin
      .from('expense_participants')
      .select('expense_id, member_id, share_amount')
      .in('expense_id', expenseIds);
    if (e2) return { ok: false, error: `DB_ERROR: ${e2.message}` };
    participantsRaw = data ?? [];
  }

  // 查询 transfers
  const { data: transfersRaw, error: e3 } = await supabaseAdmin
    .from('transfers')
    .select('id, from_member_id, to_member_id, amount')
    .eq('trip_id', trip.id);

  if (e3) return { ok: false, error: `DB_ERROR: ${e3.message}` };

  // 转换为纯函数输入
  const expenses: Expense[] = (expensesRaw ?? []).map((e) => ({
    id: e.id,
    payer: e.payer_member_id,
    baseAmount: e.base_amount,
  }));
  const participants: ExpenseParticipant[] = participantsRaw.map((p) => ({
    expenseId: p.expense_id,
    memberId: p.member_id,
    shareAmount: p.share_amount,
  }));
  const transfers: Transfer[] = (transfersRaw ?? []).map((t) => ({
    id: t.id,
    fromMember: t.from_member_id,
    toMember: t.to_member_id,
    amount: t.amount,
  }));

  const balances = calculateBalances({ expenses, participants, transfers });

  return {
    ok: true,
    data: Array.from(balances.entries()).map(([memberId, balance]) => ({
      memberId,
      balance,
    })),
  };
}

// ============ Action 10: getSettlement ============

export async function getSettlement(input: {
  inviteCode: string;
}): Promise<ActionResult<SettlementInstruction[]>> {
  const balancesResult = await getBalances(input);
  if (!balancesResult.ok) return balancesResult;

  const balancesMap = new Map(balancesResult.data.map((b) => [b.memberId, b.balance]));
  const instructions = calculateSettlement({ balances: balancesMap });

  return { ok: true, data: instructions };
}

// ============ Action 11: getExpenses ============

export async function getExpenses(input: {
  inviteCode: string;
}): Promise<
  ActionResult<
    Array<{
      id: string;
      description: string;
      originalAmount: number;
      originalCurrency: string;
      baseAmount: number;
      payerMemberId: string;
      createdAt: string;
    }>
  >
> {
  const trip = await findTripByInviteCode(input.inviteCode);
  if (!trip) return { ok: false, error: 'NOT_FOUND' };

  const { data, error } = await supabaseAdmin
    .from('expenses')
    .select(
      'id, description, original_amount, original_currency, base_amount, payer_member_id, created_at'
    )
    .eq('trip_id', trip.id)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: `DB_ERROR: ${error.message}` };

  return {
    ok: true,
    data: (data ?? []).map((e) => ({
      id: e.id,
      description: e.description,
      originalAmount: e.original_amount,
      originalCurrency: e.original_currency,
      baseAmount: e.base_amount,
      payerMemberId: e.payer_member_id,
      createdAt: e.created_at,
    })),
  };
}

// ============ Action 12: getTransfers ============

export async function getTransfers(input: {
  inviteCode: string;
}): Promise<
  ActionResult<
    Array<{
      id: string;
      fromMemberId: string;
      toMemberId: string;
      amount: number;
      createdAt: string;
    }>
  >
> {
  const trip = await findTripByInviteCode(input.inviteCode);
  if (!trip) return { ok: false, error: 'NOT_FOUND' };

  const { data, error } = await supabaseAdmin
    .from('transfers')
    .select('id, from_member_id, to_member_id, amount, created_at')
    .eq('trip_id', trip.id)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: `DB_ERROR: ${error.message}` };

  return {
    ok: true,
    data: (data ?? []).map((t) => ({
      id: t.id,
      fromMemberId: t.from_member_id,
      toMemberId: t.to_member_id,
      amount: t.amount,
      createdAt: t.created_at,
    })),
  };
}

// ============ Action 14: updateTripExchangeRate ============

export async function updateTripExchangeRate(input: {
  inviteCode: string;
  newRate: string;
}): Promise<ActionResult<{ ok: true }>> {
  const trip = await findTripByInviteCode(input.inviteCode);
  if (!trip) return { ok: false, error: 'NOT_FOUND' };

  const rateResult = validateExchangeRate(input.newRate);
  if (!rateResult.ok) {
    return { ok: false, error: `INVALID_RATE: ${rateResult.reason}` };
  }

  const { error } = await supabaseAdmin
    .from('trips')
    .update({ default_exchange_rate: rateResult.rate })
    .eq('id', trip.id);

  if (error) return { ok: false, error: `DB_ERROR: ${error.message}` };

  return { ok: true, data: { ok: true } };
}

// ============ Action 15: updateTripName ============

export async function updateTripName(input: {
  inviteCode: string;
  newName: string;
}): Promise<ActionResult<{ ok: true }>> {
  const trip = await findTripByInviteCode(input.inviteCode);
  if (!trip) return { ok: false, error: 'NOT_FOUND' };

  const trimmed = input.newName.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    return { ok: false, error: 'INVALID_NAME' };
  }

  const { error } = await supabaseAdmin
    .from('trips')
    .update({ name: trimmed })
    .eq('id', trip.id);

  if (error) return { ok: false, error: `DB_ERROR: ${error.message}` };

  return { ok: true, data: { ok: true } };
}