'use client';

import { useEffect, useState, useRef } from 'react';
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
  const [exchangeRateInput, setExchangeRateInput] = useState('');
  const [payerMemberId, setPayerMemberId] = useState<string>('');
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(
    new Set()
  );
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [customShares, setCustomShares] = useState<Record<string, string>>({});

	// 拍照识别
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [parsedItems, setParsedItems] = useState<
    Array<{ name: string; qty: number; unit_price: number; amount: number }>
  >([]);

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
      setExchangeRateInput(tripResult.data.defaultExchangeRate);

      setLoading(false);
    }
    load();
  }, [code]);

	  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setParseError('图片太大（最大 5MB）');
      e.target.value = '';
      return;
    }

    setParsing(true);
    setParseError('');

    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'image/jpeg';

      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/parse-receipt`;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Parse failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const items = data.items as Array<{
        name: string;
        qty: number;
        unit_price: number;
        amount: number;
      }>;

      setParsedItems(items);

      // 自动填金额
      const totalMinor = items.reduce(
        (acc, it) => acc + Math.round(Number(it.amount) * 100),
        0
      );
      if (totalMinor > 0) {
        setAmount((totalMinor / 100).toFixed(2));
      }

      // 自动切币种（如果是非 base currency）
      if (data.currency && trip && data.currency !== trip.baseCurrency) {
        setCurrency(data.currency);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
      e.target.value = '';
    }
  }

  function clearParsedItems() {
    setParsedItems([]);
    setParseError('');
  }

  function toggleParticipant(memberId: string) {
    const next = new Set(selectedParticipants);
    if (next.has(memberId)) {
      next.delete(memberId);
    } else {
      next.add(memberId);
    }
    setSelectedParticipants(next);
  }

	function handleSplitModeChange(newMode: string) {
    const mode = newMode as 'equal' | 'custom';
    setSplitMode(mode);

    if (mode === 'custom') {
      // 用当前金额平分预填
      if (amountMinor > 0 && selectedParticipants.size > 0) {
        const n = selectedParticipants.size;
        const base = Math.floor(amountMinor / n);
        const rem = amountMinor - base * n;
        const next: Record<string, string> = {};
        let i = 0;
        for (const id of selectedParticipants) {
          const amt = i < rem ? base + 1 : base;
          next[id] = (amt / 100).toFixed(2);
          i++;
        }
        setCustomShares(next);
      }
    } else {
      setCustomShares({});
    }
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
		
		// 自定义分摊校验
    let customSharesForServer:
      | Array<{ memberId: string; shareAmount: number }>
      | undefined;

    if (splitMode === 'custom') {
      customSharesForServer = [];
      for (const id of selectedParticipants) {
        const v = customShares[id] ?? '';
        if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(v)) {
          setError('自定义金额格式不对（例如 120 或 120.50）');
          return;
        }
        const parts = v.split('.');
        const major = parts[0];
        const minorPart = (parts[1] ?? '').padEnd(2, '0');
        const minor = Number(major + minorPart);
        if (minor <= 0) {
          setError('每个人的金额必须大于 0');
          return;
        }
        customSharesForServer.push({ memberId: id, shareAmount: minor });
      }

      const sum = customSharesForServer.reduce(
        (a, b) => a + b.shareAmount,
        0
      );
      if (sum !== amountMinor) {
        setError('自定义金额加起来必须等于总额');
        return;
      }
    }

    let effectiveRate: number;
    if (currency === trip.baseCurrency) {
      effectiveRate = 1;
    } else {
      const parsed = parseFloat(exchangeRateInput);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
        setError('汇率无效（应在 0.01 到 100 之间）');
        return;
      }
      effectiveRate = parsed;
    }

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
        customShares: customSharesForServer,
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
  const showConversion = currency !== trip.baseCurrency;
  const previewRate = showConversion ? parseFloat(exchangeRateInput) || 0 : 1;

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
      ? Math.ceil((amountMinor * previewRate) / participantCount)
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

				        {/* 拍照识别 */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label>📷 拍照识别</Label>
              {parsedItems.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-neutral-500 underline"
                  onClick={clearParsedItems}
                >
                  清除
                </button>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={parsing}
              onClick={() => fileInputRef.current?.click()}
            >
              {parsing ? '识别中...' : '选择或拍照'}
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageUpload}
            />

            {parseError && (
              <p className="text-xs text-red-600">{parseError}</p>
            )}

            {parsedItems.length > 0 && (
              <div className="pt-2 space-y-1 border-t">
                {parsedItems.map((it, i) => (
                  <div key={i} className="flex justify-between text-sm gap-2">
                    <span className="truncate">
                      {it.name}
                      {it.qty > 1 && ` × ${it.qty}`}
                    </span>
                    <span className="text-neutral-600 shrink-0">
                      {it.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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

            {/* 汇率输入（仅在非 base currency 时显示） */}
            {showConversion && (
              <div className="pt-1 space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-neutral-500">
                    汇率（1 {currency} = ? {trip.baseCurrency}）
                  </Label>
                  {exchangeRateInput !== trip.defaultExchangeRate && (
                    <button
                      type="button"
                      className="text-xs text-neutral-500 underline hover:text-neutral-700"
                      onClick={() =>
                        setExchangeRateInput(trip.defaultExchangeRate)
                      }
                    >
                      用默认 {trip.defaultExchangeRate}
                    </button>
                  )}
                </div>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder={trip.defaultExchangeRate}
                  value={exchangeRateInput}
                  onChange={(e) => setExchangeRateInput(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            )}

            {showConversion && previewRate > 0 && amountMinor > 0 && (
              <p className="text-xs text-neutral-500">
                ≈ RM {((amountMinor * previewRate) / 100).toFixed(2)}
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
          </CardContent>
        </Card>

        {/* 分摊方式 */}
        {selectedParticipants.size > 0 && (
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <Label>分摊方式</Label>
              <Tabs value={splitMode} onValueChange={handleSplitModeChange}>
                <TabsList className="w-full">
                  <TabsTrigger value="equal" className="flex-1">
                    平均
                  </TabsTrigger>
                  <TabsTrigger value="custom" className="flex-1">
                    自定义
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {splitMode === 'equal' && perPerson > 0 && (
                <p className="text-sm text-neutral-500">
                  每人约 {currencySymbol(trip.baseCurrency)}{' '}
                  {(perPerson / 100).toFixed(2)}
                </p>
              )}

              {splitMode === 'custom' && (
                <div className="space-y-2">
                  {trip.members
                    .filter((m) => selectedParticipants.has(m.id))
                    .map((m) => (
                      <div key={m.id} className="flex items-center gap-2">
                        <span className="flex-1 text-sm truncate">
                          {m.displayName}
                        </span>
                        <span className="text-sm text-neutral-400">
                          {symbol}
                        </span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="w-24 text-right"
                          value={customShares[m.id] ?? ''}
                          onChange={(e) =>
                            setCustomShares((prev) => ({
                              ...prev,
                              [m.id]: e.target.value,
                            }))
                          }
                          placeholder="0.00"
                        />
                      </div>
                    ))}

                  {(() => {
                    const sum = Array.from(selectedParticipants).reduce(
                      (acc, id) => {
                        const v = customShares[id] ?? '';
                        if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(v)) return acc;
                        const parts = v.split('.');
                        const major = parts[0];
                        const minorPart = (parts[1] ?? '').padEnd(2, '0');
                        return acc + Number(major + minorPart);
                      },
                      0
                    );
                    const ok = sum === amountMinor && amountMinor > 0;
                    return (
                      <div className="flex justify-between text-sm pt-2 border-t mt-2">
                        <span className="text-neutral-500">已分配</span>
                        <span
                          className={
                            ok
                              ? 'text-green-600 font-medium'
                              : 'text-red-600 font-medium'
                          }
                        >
                          {symbol}
                          {(sum / 100).toFixed(2)} / {symbol}
                          {(amountMinor / 100).toFixed(2)}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        )}
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