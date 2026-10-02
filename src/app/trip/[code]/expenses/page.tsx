'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getTrip,
  getExpenses,
  getTransfers,
  deleteExpense,
  deleteTransfer,
  updateExpenseDescription,
  type TripWithMembers,
} from '@/lib/actions';
import { getMemberId } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

function currencySymbol(code: string): string {
  switch (code) {
    case 'MYR':
      return 'RM ';
    case 'CNY':
      return '¥';
    case 'SGD':
      return 'S$';
    case 'USD':
      return '$';
    default:
      return code + ' ';
  }
}

function formatMajor(minor: number, symbol: string): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${symbol}${(abs / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${mo}/${day} ${hh}:${mm}`;
}

interface ExpenseItem {
  id: string;
  description: string;
  originalAmount: number;
  originalCurrency: string;
  baseAmount: number;
  payerMemberId: string;
  createdAt: string;
}

interface TransferItem {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  createdAt: string;
}

export default function ExpensesPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState<TripWithMembers | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [tab, setTab] = useState<'expenses' | 'transfers'>('expenses');
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'expense' | 'transfer';
    id: string;
    label: string;
  } | null>(null);
  const [editingExpense, setEditingExpense] = useState<{
    id: string;
    description: string;
  } | null>(null);
  const [editInput, setEditInput] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);

    // 3 个请求全部并行
    const [tripResult, eResult, tResult] = await Promise.all([
      getTrip({ inviteCode: code }),
      getExpenses({ inviteCode: code }),
      getTransfers({ inviteCode: code }),
    ]);

    if (!tripResult.ok) {
      setLoading(false);
      return;
    }

    setTrip(tripResult.data);
    if (eResult.ok) setExpenses(eResult.data);
    if (tResult.ok) setTransfers(tResult.data);
    setMyMemberId(getMemberId(code));
    setLoading(false);
  }, [code]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleDelete() {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'expense') {
      await deleteExpense({ inviteCode: code, expenseId: confirmDelete.id });
    } else {
      await deleteTransfer({ inviteCode: code, transferId: confirmDelete.id });
    }
    setConfirmDelete(null);
    await loadAll();
  }

  function openEdit(e: ExpenseItem) {
    setEditingExpense({ id: e.id, description: e.description });
    setEditInput(e.description);
  }

  async function handleSaveEdit() {
    if (!editingExpense) return;
    if (!editInput.trim()) return;
    setSavingEdit(true);
    const result = await updateExpenseDescription({
      inviteCode: code,
      expenseId: editingExpense.id,
      newDescription: editInput.trim(),
    });
    if (!result.ok) {
      alert(result.error);
      setSavingEdit(false);
      return;
    }
    setEditingExpense(null);
    setSavingEdit(false);
    await loadAll();
  }

  if (loading) {
    return (
        <main className="min-h-screen bg-neutral-50 pb-24">
        <div className="max-w-md mx-auto p-4 space-y-4">
            <div className="flex items-center gap-3 pt-2">
            <div className="h-8 w-16 bg-neutral-200 rounded animate-pulse" />
            <div className="h-6 w-16 bg-neutral-200 rounded animate-pulse" />
            </div>
            <div className="h-10 bg-neutral-200 rounded animate-pulse" />
            <div className="space-y-2">
            {[1, 2, 3].map((i) => (
                <Card key={i}>
                <CardContent className="py-3 space-y-2">
                    <div className="h-4 w-24 bg-neutral-200 rounded animate-pulse" />
                    <div className="h-3 w-32 bg-neutral-200 rounded animate-pulse" />
                </CardContent>
                </Card>
            ))}
            </div>
        </div>
        </main>
    );
  }
  if (!trip || !myMemberId) {
    return <div className="p-8">需要先认领身份</div>;
  }

  const getMemberName = (id: string) =>
    trip.members.find((m) => m.id === id)?.displayName ?? '未知';

  return (
    <main className="min-h-screen bg-neutral-50 pb-24">
      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/trip/${code}`)}
            className="-ml-2"
          >
            ← 返回
          </Button>
          <h1 className="text-lg font-bold">账目</h1>
        </div>

        {/* Tabs */}
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "expenses" | "transfers")}
        >
          <TabsList className="w-full">
            <TabsTrigger value="expenses" className="flex-1">
              消费 ({expenses.length})
            </TabsTrigger>
            <TabsTrigger value="transfers" className="flex-1">
              转账 ({transfers.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Expenses list */}
        {tab === "expenses" && (
          <div className="space-y-2">
            {expenses.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-neutral-400 text-sm">
                  还没有消费记录
                </CardContent>
              </Card>
            ) : (
              expenses.map((e) => (
                <Card key={e.id}>
                  <CardContent className="py-3">
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{e.description}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {getMemberName(e.payerMemberId)} 支付 ·{" "}
                          {formatDate(e.createdAt)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-medium">
                          {formatMajor(
                            e.originalAmount,
                            currencySymbol(e.originalCurrency),
                          )}
                        </p>
                        {e.originalCurrency !== trip.baseCurrency && (
                          <p className="text-xs text-neutral-500 mt-0.5">
                            ≈{" "}
                            {formatMajor(
                              e.baseAmount,
                              currencySymbol(trip.baseCurrency),
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end gap-3">
                      <button
                        className="text-xs text-neutral-500 hover:text-neutral-700"
                        onClick={() => openEdit(e)}
                      >
                        编辑
                      </button>
                      <button
                        className="text-xs text-red-500 hover:text-red-700"
                        onClick={() =>
                          setConfirmDelete({
                            type: "expense",
                            id: e.id,
                            label: e.description,
                          })
                        }
                      >
                        删除
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Transfers list */}
        {tab === "transfers" && (
          <div className="space-y-2">
            {transfers.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-neutral-400 text-sm">
                  还没有转账记录
                </CardContent>
              </Card>
            ) : (
              transfers.map((t) => (
                <Card key={t.id}>
                  <CardContent className="py-3">
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {getMemberName(t.fromMemberId)} →{" "}
                          {getMemberName(t.toMemberId)}
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {formatDate(t.createdAt)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-medium">
                          {formatMajor(
                            t.amount,
                            currencySymbol(trip.baseCurrency),
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button
                        className="text-xs text-red-500 hover:text-red-700"
                        onClick={() =>
                          setConfirmDelete({
                            type: "transfer",
                            id: t.id,
                            label: `${getMemberName(t.fromMemberId)} → ${getMemberName(t.toMemberId)}`,
                          })
                        }
                      >
                        删除
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      {/* Edit description modal */}
      {editingExpense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm">
            <CardContent className="pt-6 space-y-4">
              <p className="text-center font-medium">编辑描述</p>
              <Input
                value={editInput}
                onChange={(e) => setEditInput(e.target.value)}
                maxLength={200}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEditingExpense(null)}
                  disabled={savingEdit}
                >
                  取消
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSaveEdit}
                  disabled={savingEdit || !editInput.trim()}
                >
                  {savingEdit ? '保存中...' : '保存'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm">
            <CardContent className="pt-6 space-y-4">
              <p className="text-center">确认删除「{confirmDelete.label}」？</p>
              <p className="text-xs text-center text-neutral-500">
                删除后无法恢复
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmDelete(null)}
                >
                  取消
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDelete}
                >
                  删除
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="fixed bottom-24 left-0 right-0 flex justify-center pointer-events-none">
        <Link
          href={`/trip/${code}/add`}
          className="rounded-full px-8 py-3 text-lg font-medium shadow-lg bg-neutral-900 text-white hover:bg-neutral-800 pointer-events-auto inline-flex items-center"
        >
          ＋ 记一笔
        </Link>
      </div>
    </main>
  );
}