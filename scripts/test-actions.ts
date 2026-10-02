import { config } from 'dotenv';
import { resolve } from 'path';

// 加载 .env.local —— 必须在任何 import 数据库相关模块之前执行
config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  // 动态 import：此时 .env.local 已加载
  const {
    createTrip,
    joinTrip,
    claimMember,
    getTrip,
    addExpense,
    deleteExpense,
    addTransfer,
    deleteTransfer,
    getBalances,
    getSettlement,
  } = await import('../src/lib/actions');

  console.log('=== Test: createTrip ===');
  const createResult = await createTrip({
    name: 'Test Trip ' + Date.now(),
    baseCurrency: 'MYR',
    defaultExpenseCurrency: 'CNY',
    defaultExchangeRate: '0.62',
    creatorDisplayName: 'Alice',
  });

  if (!createResult.ok) {
    console.error('❌ createTrip failed:', createResult.error);
    process.exit(1);
  }

  const { tripId, inviteCode, memberId: aliceId } = createResult.data;
  console.log('✅ Trip created:', { tripId, inviteCode, aliceId });

  // ============ Test: joinTrip ============
  console.log('\n=== Test: joinTrip ===');
  const joinResult = await joinTrip({ inviteCode, displayName: 'Bob' });
  if (!joinResult.ok) {
    console.error('❌ joinTrip failed:', joinResult.error);
    process.exit(1);
  }
  const bobId = joinResult.data.memberId;
  console.log('✅ Bob joined:', bobId);

  // ============ Test: claimMember ============
  console.log('\n=== Test: claimMember ===');
  const claimResult = await claimMember({ inviteCode, memberId: bobId });
  if (!claimResult.ok) {
    console.error('❌ claimMember failed:', claimResult.error);
    process.exit(1);
  }
  console.log('✅ Claimed:', claimResult.data.displayName);

  // ============ Test: getTrip ============
  console.log('\n=== Test: getTrip ===');
  const getResult = await getTrip({ inviteCode });
  if (!getResult.ok) {
    console.error('❌ getTrip failed:', getResult.error);
    process.exit(1);
  }
  console.log('✅ Trip has', getResult.data.members.length, 'members');

  // ============ Test: addExpense ============
  console.log('\n=== Test: addExpense ===');
  const idempotencyKey = crypto.randomUUID();
  const addResult = await addExpense({
    inviteCode,
    description: '晚餐',
    originalAmountMinor: 10000, // CNY 100
    originalCurrency: 'CNY',
    exchangeRateUsed: 0.62,
    payerMemberId: aliceId,
    participantMemberIds: [aliceId, bobId],
    idempotencyKey,
  });
  if (!addResult.ok) {
    console.error('❌ addExpense failed:', addResult.error);
    process.exit(1);
  }
  const expenseId = addResult.data.expenseId;
  console.log('✅ Expense created:', expenseId);

  // ============ Test: idempotency ============
  console.log('\n=== Test: idempotency ===');
  const addAgain = await addExpense({
    inviteCode,
    description: '晚餐',
    originalAmountMinor: 10000,
    originalCurrency: 'CNY',
    exchangeRateUsed: 0.62,
    payerMemberId: aliceId,
    participantMemberIds: [aliceId, bobId],
    idempotencyKey,
  });
  if (!addAgain.ok) {
    console.error('❌ idempotency test failed:', addAgain.error);
    process.exit(1);
  }
  if (addAgain.data.expenseId !== expenseId) {
    console.error('❌ idempotency returned different id:', addAgain.data.expenseId);
    process.exit(1);
  }
  console.log('✅ Same id returned, no duplicate');

  // ============ Test: getBalances ============
  console.log('\n=== Test: getBalances ===');
  const balancesResult = await getBalances({ inviteCode });
  if (!balancesResult.ok) {
    console.error('❌ getBalances failed:', balancesResult.error);
    process.exit(1);
  }
  console.log('✅ Balances:', balancesResult.data);

  // ============ Test: getSettlement ============
  console.log('\n=== Test: getSettlement ===');
  const settlementResult = await getSettlement({ inviteCode });
  if (!settlementResult.ok) {
    console.error('❌ getSettlement failed:', settlementResult.error);
    process.exit(1);
  }
  console.log('✅ Settlement:', settlementResult.data);

  // ============ Test: addTransfer ============
  console.log('\n=== Test: addTransfer ===');
  const transferKey = crypto.randomUUID();
  const transferResult = await addTransfer({
    inviteCode,
    fromMemberId: bobId,
    toMemberId: aliceId,
    amount: 3100, // MYR 31
    idempotencyKey: transferKey,
  });
  if (!transferResult.ok) {
    console.error('❌ addTransfer failed:', transferResult.error);
    process.exit(1);
  }
  console.log('✅ Transfer created:', transferResult.data.transferId);

  // ============ Test: balances after transfer ============
  console.log('\n=== Test: balances after transfer ===');
  const finalBalances = await getBalances({ inviteCode });
  if (!finalBalances.ok) {
    console.error('❌ getBalances failed:', finalBalances.error);
    process.exit(1);
  }
  console.log('✅ Final balances:', finalBalances.data);

  // ============ Test: deleteExpense ============
  console.log('\n=== Test: deleteExpense ===');
  const deleteResult = await deleteExpense({ inviteCode, expenseId });
  if (!deleteResult.ok) {
    console.error('❌ deleteExpense failed:', deleteResult.error);
    process.exit(1);
  }
  console.log('✅ Expense deleted');

  // ============ Cleanup ============
  console.log('\n=== Cleanup ===');
  console.log('ℹ️  Trip ID:', tripId);
  console.log('ℹ️  Invite code:', inviteCode);
  console.log('ℹ️  To clean up, run in Supabase SQL Editor:');
  console.log(`    delete from trips where id = '${tripId}';`);

  console.log('\n✅ All tests passed');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});