'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getTrip,
  addExpense,
  type TripWithMembers,
} from '@/lib/actions';
import { getMemberId, generateUUID } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

function currencySymbol(code: string): string {
  switch (code) {
    case 'MYR':
      return 'RM';
    case 'CNY':
      return '¥';
    case 'SGD':
      return 'S$';
    case 'USD':
      return '$';
    default:
      return code;
  }
}

export default function AddExpensePage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [trip, setTrip] = useState<TripWithMembers | null>(null);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);

  // 表单状态
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [payerMemberId, setPayerMemberId] = useState<string>('');
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      const tripResult = await getTrip({ inviteCode: code });
      if (!tripResult.ok) {
        setError(tripResult.error);
        setLoading(false);
        return;
      }
      setTrip(tripResult.data);

      const memberId = getMemberId(code);
      setMyMemberId(memberId);

      // 默认付款人 = 自己
      if (memberId) {
        setPayerMemberId(memberId);
      }

      // 默认参与者 = 全部成员
      setSelectedParticipants(new Set(tripResult.data.members.map((m) => m.id)));

      // 默认币种 = Trip 默认消费币种
      setCurrency(tripResult.data.defaultExpenseCurrency);

      setLoading(false);
    }
    load();
  }, [code]);

  function toggleParticipant(memberId: string) {
    const next = new Set(selectedParticipants);
    if (next.has(memberId)) {
      next.delete(memberId);
    } else {
      next.add(memberId);
    }
    setSelectedParticipants(next);
  }

  async function handleSave() {
    if (!trip || !myMemberId) return;
    setError('');

    // 解析金额：用户输入 "100.50" -> 10050
    const trimmed = amount.trim();
    if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(trimmed)) {
      setError('金额格式不对（例如 100 或 100.50）');
      return;
    }
    const parts = trimmed.split('.');
    const major = parts[0];
    const minorPart = (parts[1] ?? '').padEnd(2, '0');
    const amountMinor = Number(major + minorPart);

    if (amountMinor < 1 || amountMinor > 10000000) {
      setError('金额超出范围（0.01 到 100,000）');
      return;
    }

    if (!description.trim()) {
      setError('请输入描述');
      return;
    }

    if (!payerMemberId) {
      setError('请选择付款人');
      return;
    }

    if (selectedParticipants.size < 1) {
      setError('至少选择一位参与者');
      return;
    }

    // 汇率
    const exchangeRate = parseFloat(trip.defaultExchangeRate);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      setError('Trip 汇率无效');
      return;
    }

    // 如果币种是 base currency，汇率用 1
    const effectiveRate = currency === trip.baseCurrency ? 1 : exchangeRate;

    setSaving(true);
    try {
      const result = await addExpense({
        inviteCode: code,
        description: description.trim(),
        originalAmountMinor: amountMinor,
        originalCurrency: currency,
        exchangeRateUsed: effectiveRate,
        payerMemberId,
        participantMemberIds: Array.from(selectedParticipants),
        idempotencyKey: generateUUID(),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push(`/trip/${code}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-neutral-500">加载中...</div>;
  }
  if (error && !trip) {
    return <div className="p-8 text-red-600">错误：{error}</div>;
  }
  if (!trip || !myMemberId) {
    return <div className="p-8">需要先认领身份</div>;
  }

  const symbol = currencySymbol(currency);
  const exchangeRate = parseFloat(trip.defaultExchangeRate);
  const showConversion = currency !== trip.baseCurrency;

  // 预览分摊
  const parts = amount.trim().split('.');
  const major = parts[0] ?? '0';
  const minorPart = (parts[1] ?? '').padEnd(2, '0');
  const amountMinor =
    /^[0-9]+$/.test(major) && /^[0-9]{2}$/.test(minorPart)
      ? Number(major + minorPart)
      : 0;
  const participantCount = selectedParticipants.size;
  const perPerson =
    participantCount > 0
      ? Math.ceil((amountMinor * (showConversion ? exchangeRate : 1)) / participantCount)
      : 0;

  return (
    <main className="min-h-screen bg-neutral-50 pb-24">
      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="-ml-2"
          >
            ← 返回
          </Button>
          <h1 className="text-lg font-bold">记一笔</h1>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
            {error}
          </div>
        )}

        {/* 金额 */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <Label>金额</Label>
            <div className="flex gap-2">
              <div className="flex items-center justify-center min-w-[3rem] h-12 px-3 bg-neutral-100 rounded text-lg font-medium">
                {symbol}
              </div>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 text-2xl font-bold"
                autoFocus
              />
            </div>

            {/* 币种切换 */}
            <Tabs value={currency} onValueChange={setCurrency}>
              <TabsList className="w-full">
                <TabsTrigger value="CNY" className="flex-1">
                  ¥ CNY
                </TabsTrigger>
                <TabsTrigger value="MYR" className="flex-1">
                  RM MYR
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {showConversion && exchangeRate > 0 && amountMinor > 0 && (
              <p className="text-xs text-neutral-500">
                ≈ RM {((amountMinor * exchangeRate) / 100).toFixed(2)}
                （1 {currency} = {exchangeRate} MYR）
              </p>
            )}
          </CardContent>
        </Card>

        {/* 描述 */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <Label htmlFor="description">描述</Label>
            <Input
              id="description"
              placeholder="例如：晚餐、打车、门票"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
            />
          </CardContent>
        </Card>

        {/* 谁付的 */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <Label>谁付的？</Label>
            <div className="flex flex-wrap gap-2">
              {trip.members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPayerMemberId(m.id)}
                  className={`px-4 py-2 rounded-full text-sm border transition ${
                    payerMemberId === m.id
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-white text-neutral-700 border-neutral-300'
                  }`}
                >
                  {m.displayName}
                  {m.id === myMemberId && ' (你)'}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 谁参与 */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label>谁参与？</Label>
              <button
                type="button"
                className="text-xs text-neutral-500 underline"
                onClick={() =>
                  setSelectedParticipants(new Set(trip.members.map((m) => m.id)))
                }
              >
                全选
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {trip.members.map((m) => {
                const selected = selectedParticipants.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleParticipant(m.id)}
                    className={`px-4 py-2 rounded-full text-sm border transition ${
                      selected
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-white text-neutral-400 border-neutral-300'
                    }`}
                  >
                    {selected ? '☑ ' : '☐ '}
                    {m.displayName}
                  </button>
                );
              })}
            </div>

            {perPerson > 0 && (
              <p className="text-xs text-neutral-500 pt-1">
                平分 · 每人约 {currencySymbol(trip.baseCurrency)}{' '}
                {(perPerson / 100).toFixed(2)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 保存按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <div className="max-w-md mx-auto">
          <Button
            className="w-full h-12 text-base"
            onClick={handleSave}
            disabled={saving || !amount || !description.trim()}
          >
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </main>
  );
}