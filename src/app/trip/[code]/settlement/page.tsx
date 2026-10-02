'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getTrip,
  getBalances,
  getSettlement,
  addTransfer,
  type TripWithMembers,
} from '@/lib/actions';
import { getMemberId, generateUUID } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

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

interface SettlementItem {
  from: string;
  to: string;
  amount: number;
}

export default function SettlementPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState<TripWithMembers | null>(null);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [settlement, setSettlement] = useState<SettlementItem[]>([]);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);

  // 标记已还状态：key = `${from}|${to}`
  const [marking, setMarking] = useState<string | null>(null);
  const [amountOverride, setAmountOverride] = useState<string>('');

  const loadAll = useCallback(async () => {
    setLoading(true);

    const [tripResult, bResult, sResult] = await Promise.all([
      getTrip({ inviteCode: code }),
      getBalances({ inviteCode: code }),
      getSettlement({ inviteCode: code }),
    ]);

    if (!tripResult.ok) {
      setLoading(false);
      return;
    }

    setTrip(tripResult.data);
    if (bResult.ok) {
      setBalances(new Map(bResult.data.map((b) => [b.memberId, b.balance])));
    }
    if (sResult.ok) {
      setSettlement(sResult.data);
    }
    setMyMemberId(getMemberId(code));
    setLoading(false);
  }, [code]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function openMarking(item: SettlementItem) {
    setMarking(`${item.from}|${item.to}`);
    setAmountOverride((item.amount / 100).toFixed(2));
  }

  async function handleMarkPaid(item: SettlementItem) {
    const trimmed = amountOverride.trim();
    if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(trimmed)) {
      alert('金额格式不对');
      return;
    }
    const parts = trimmed.split('.');
    const major = parts[0];
    const minorPart = (parts[1] ?? '').padEnd(2, '0');
    const amountMinor = Number(major + minorPart);

    const result = await addTransfer({
      inviteCode: code,
      fromMemberId: item.from,
      toMemberId: item.to,
      amount: amountMinor,
      idempotencyKey: generateUUID(),
    });

    if (!result.ok) {
      alert(result.error);
      return;
    }

    setMarking(null);
    await loadAll();
  }

  if (loading) {
    return <div className="p-8 text-center text-neutral-500">加载中...</div>;
  }
  if (!trip || !myMemberId) {
    return <div className="p-8">需要先认领身份</div>;
  }

  const getMemberName = (id: string) =>
    trip.members.find((m) => m.id === id)?.displayName ?? '未知';

  const allSettled = settlement.length === 0 && balances.size === 0;

  return (
    <main className="min-h-screen bg-neutral-50 pb-8">
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
          <h1 className="text-lg font-bold">最终清账</h1>
        </div>

        {/* Balances */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-medium text-neutral-500 mb-3">目前</p>
            <div className="space-y-2">
              {trip.members.map((m) => {
                const bal = balances.get(m.id) ?? 0;
                return (
                  <div
                    key={m.id}
                    className="flex justify-between items-center text-sm"
                  >
                    <span className="text-neutral-700">
                      {m.displayName}
                      {m.id === myMemberId && (
                        <span className="text-neutral-400"> (你)</span>
                      )}
                    </span>
                    <span
                      className={
                        bal > 0
                          ? 'text-green-600 font-medium'
                          : bal < 0
                          ? 'text-red-600 font-medium'
                          : 'text-neutral-400'
                      }
                    >
                      {bal === 0
                        ? '已结清'
                        : formatMajor(bal, currencySymbol(trip.baseCurrency))}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Settlement suggestions */}
        {allSettled ? (
          <Card>
            <CardContent className="py-8 text-center text-neutral-500">
              🎉 全部已结清
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-sm font-medium text-neutral-500 px-1">
              建议这样还
            </p>
            <div className="space-y-2">
              {settlement.map((item) => {
                const key = `${item.from}|${item.to}`;
                const isMarking = marking === key;
                return (
                  <Card key={key}>
                    <CardContent className="py-3">
                      <div className="flex justify-between items-center gap-3">
                        <div className="text-sm">
                          <span className="font-medium">
                            {getMemberName(item.from)}
                          </span>
                          <span className="text-neutral-400"> → </span>
                          <span className="font-medium">
                            {getMemberName(item.to)}
                          </span>
                        </div>
                        <span className="font-medium">
                          {formatMajor(item.amount, currencySymbol(trip.baseCurrency))}
                        </span>
                      </div>

                      {isMarking ? (
                        <div className="mt-3 space-y-2">
                          <Label className="text-xs text-neutral-500">
                            实际还了多少？
                          </Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={amountOverride}
                            onChange={(e) => setAmountOverride(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => setMarking(null)}
                            >
                              取消
                            </Button>
                            <Button
                              className="flex-1"
                              onClick={() => handleMarkPaid(item)}
                            >
                              确认
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openMarking(item)}
                          >
                            标记已还
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <p className="text-xs text-neutral-400 text-center px-2 pt-2">
              点击"标记已还"后，系统会创建一笔转账记录。
              <br />
              转账记录可以在「账目」里删除。
            </p>
          </>
        )}
      </div>
    </main>
  );
}