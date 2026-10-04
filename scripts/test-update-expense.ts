import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const {
    createTrip,
    joinTrip,
    addExpense,
    getExpenseForEdit,
    updateExpense,
    getBalances,
  } = await import('../src/lib/actions');

  console.log('=== createTrip ===');
  const t = await createTrip({
    name: 'UpdateExpense Test ' + Date.now(),
    baseCurrency: 'MYR',
    defaultExpenseCurrency: 'CNY',
    defaultExchangeRate: '0.62',
    creatorDisplayName: 'Alice',
  });
  if (!t.ok) {
    console.error(t.error);
    process.exit(1);
  }
  const { inviteCode, memberId: aliceId } = t.data;

  const j = await joinTrip({ inviteCode, displayName: 'Bob' });
  if (!j.ok) {
    console.error(j.error);
    process.exit(1);
  }
  const bobId = j.data.memberId;

  console.log('=== addExpense ===');
  const a = await addExpense({
    inviteCode,
    description: 'Dinner',
    originalAmountMinor: 10000,
    originalCurrency: 'CNY',
    exchangeRateUsed: 0.62,
    payerMemberId: aliceId,
    participantMemberIds: [aliceId, bobId],
    idempotencyKey: crypto.randomUUID(),
  });
  if (!a.ok) {
    console.error(a.error);
    process.exit(1);
  }
  const expenseId = a.data.expenseId;
  console.log('created:', expenseId);

  console.log('=== getExpenseForEdit ===');
  const g = await getExpenseForEdit({ inviteCode, expenseId });
  if (!g.ok) {
    console.error(g.error);
    process.exit(1);
  }
  console.log(g.data);

  console.log('=== updateExpense (change amount to 200 CNY, only Alice) ===');
  const u = await updateExpense({
    inviteCode,
    expenseId,
    description: 'Dinner (updated)',
    originalAmountMinor: 20000,
    originalCurrency: 'CNY',
    exchangeRateUsed: 0.62,
    payerMemberId: aliceId,
    participantMemberIds: [aliceId],
  });
  if (!u.ok) {
    console.error(u.error);
    process.exit(1);
  }
  console.log('updated OK');

  console.log('=== getExpenseForEdit (verify) ===');
  const g2 = await getExpenseForEdit({ inviteCode, expenseId });
  if (!g2.ok) {
    console.error(g2.error);
    process.exit(1);
  }
  console.log(g2.data);

  console.log('=== getBalances ===');
  const b = await getBalances({ inviteCode });
  console.log(b);

  console.log('\n✅ All OK');
  console.log('Cleanup SQL: delete from trips where id = \'' + t.data.tripId + '\';');
}

main().catch(console.error);