'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getTrip,
  getBalances,
  getExpenses,
  claimMember,
  joinTrip,
  type TripWithMembers,
} from '@/lib/actions';
import { getMemberId, saveMemberId } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

interface ExpenseItem {
  id: string;
  description: string;
  originalAmount: number;
  originalCurrency: string;
  baseAmount: number;
  payerMemberId: string;
  createdAt: string;
}

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

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${mo}/${day} ${hh}:${mm}`;
}

export default function TripPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trip, setTrip] = useState<TripWithMembers | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');

    const tripResult = await getTrip({ inviteCode: code });
    if (!tripResult.ok) {
      setError(tripResult.error);
      setLoading(false);
      return;
    }
    setTrip(tripResult.data);

    const memberId = getMemberId(code);
    setMyMemberId(memberId);

    if (memberId) {
      const [bResult, eResult] = await Promise.all([
        getBalances({ inviteCode: code }),
        getExpenses({ inviteCode: code }),
      ]);
      if (bResult.ok) {
        setBalances(new Map(bResult.data.map((b) => [b.memberId, b.balance])));
      }
      if (eResult.ok) {
        setExpenses(eResult.data);
      }
    }

    setLoading(false);
  }, [code]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleClaim(memberId: string) {
    setClaiming(true);
    setError('');
    const result = await claimMember({ inviteCode: code, memberId });
    if (!result.ok) {
      setError(result.error);
      setClaiming(false);
      return;
    }
    saveMemberId(code, memberId);
    setClaiming(false);
    await loadAll();
  }

  async function handleCreateMember() {
    if (!newMemberName.trim()) return;
    setClaiming(true);
    setError('');
    const result = await joinTrip({
      inviteCode: code,
      displayName: newMemberName.trim(),
    });
    if (!result.ok) {
      setError(result.error);
      setClaiming(false);
      return;
    }
    saveMemberId(code, result.data.memberId);
    setClaiming(false);
    await loadAll();
  }

  if (loading) {
    return <div className="p-8 text-center text-neutral-500">加载中...</div>;
  }

  if (error && !trip) {
    return <div className="p-8 text-red-600">错误：{error}</div>;
  }

  if (!trip) {
    return <div className="p-8">找不到这个旅行</div>;
  }

  // ========== 认领身份 ==========
  if (!myMemberId) {
    return (
      <main className="min-h-screen p-4 bg-neutral-50">
        <div className="max-w-md mx-auto pt-8">
          <h1 className="text-2xl font-bold mb-2">{trip.name}</h1>
          <p className="text-sm text-neutral-500 mb-6">你是哪位？</p>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded mb-4">
              {error}
            </div>
          )}

          <div className="space-y-2 mb-6">
            {trip.members.map((m) => (
              <Button
                key={m.id}
                variant="outline"
                className="w-full justify-start h-14"
                onClick={() => handleClaim(m.id)}
                disabled={claiming}
              >
                <span className="text-xl mr-3">👤</span>
                <span className="text-base">{m.displayName}</span>
              </Button>
            ))}
          </div>

          <div className="text-center text-sm text-neutral-400 mb-4">
            —— 或者 ——
          </div>

          <div className="space-y-2">
            <Label htmlFor="newName">我是新成员</Label>
            <Input
              id="newName"
              placeholder="输入你的名字"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              maxLength={50}
            />
            <Button
              className="w-full"
              onClick={handleCreateMember}
              disabled={claiming || !newMemberName.trim()}
            >
              加入
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // ========== Trip Home ==========
  const myBalance = balances.get(myMemberId) ?? 0;
  const myMember = trip.members.find((m) => m.id === myMemberId);
  const recentExpenses = expenses.slice(0, 5);

  return (
    <main className="min-h-screen bg-neutral-50 pb-32">
      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="pt-2">
          <h1 className="text-2xl font-bold">{trip.name}</h1>
          <div className="flex flex-wrap gap-2 mt-3">
            {trip.members.map((m) => (
              <span
                key={m.id}
                className={`text-sm px-2.5 py-1 rounded ${
                  m.id === myMemberId
                    ? 'bg-neutral-800 text-white'
                    : 'bg-neutral-200 text-neutral-700'
                }`}
              >
                {m.displayName}
              </span>
            ))}
          </div>
        </div>

        {/* Balance Card */}
        <Card>
          <CardContent className="pt-6 pb-6">
            <p className="text-sm text-neutral-500 mb-1">
              {myMember?.displayName ?? '你'}目前
            </p>
            <p
              className={`text-3xl font-bold ${
                myBalance > 0
                  ? 'text-green-600'
                  : myBalance < 0
                  ? 'text-red-600'
                  : 'text-neutral-400'
              }`}
            >
              {myBalance === 0
                ? '已结清'
                : formatMajor(myBalance, currencySymbol(trip.baseCurrency))}
            </p>
            {myBalance !== 0 && (
              <p className="text-sm text-neutral-500 mt-1">
                {myBalance > 0 ? '应收' : '应付'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent expenses */}
        <div>
          <h2 className="text-sm font-medium text-neutral-500 mb-2 px-1">
            最近账目
          </h2>
          {recentExpenses.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-neutral-400 text-sm">
                还没有账目，点下方按钮记一笔
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentExpenses.map((e) => {
                const payer = trip.members.find(
                  (m) => m.id === e.payerMemberId
                );
                return (
                  <Card key={e.id}>
                    <CardContent className="py-3 flex justify-between items-center">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{e.description}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {payer?.displayName ?? '未知'} 支付 ·{' '}
                          {formatRelative(e.createdAt)}
                        </p>
                      </div>
                      <div className="text-right ml-3">
                        <p className="font-medium">
                          {formatMajor(
                            e.originalAmount,
                            currencySymbol(e.originalCurrency)
                          )}
                        </p>
                        {e.originalCurrency !== trip.baseCurrency && (
                          <p className="text-xs text-neutral-500 mt-0.5">
                            ≈{' '}
                            {formatMajor(
                              e.baseAmount,
                              currencySymbol(trip.baseCurrency)
                            )}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Settlement button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => router.push(`/trip/${code}/settlement`)}
        >
          查看最终清账
        </Button>
      </div>

      {/* Floating add button */}
      <div className="fixed bottom-24 left-0 right-0 flex justify-center pointer-events-none">
        <Button
          size="lg"
          className="rounded-full px-8 py-6 text-lg shadow-lg pointer-events-auto"
          onClick={() => router.push(`/trip/${code}/add`)}
        >
          ＋ 记一笔
        </Button>
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t">
        <div className="max-w-md mx-auto grid grid-cols-3">
          <button className="py-3 text-sm font-medium text-neutral-900">
            🏠 总览
          </button>
          <button
            className="py-3 text-sm text-neutral-500"
            onClick={() => router.push(`/trip/${code}/expenses`)}
          >
            📋 账目
          </button>
          <button
            className="py-3 text-sm text-neutral-500"
            onClick={() => router.push(`/trip/${code}/members`)}
          >
            👥 成员
          </button>
        </div>
      </nav>
    </main>
  );
}