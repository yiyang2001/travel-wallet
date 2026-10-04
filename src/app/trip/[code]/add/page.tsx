'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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

interface ParsedItem {
  id: string;                    // 唯一标识
  name: string;
  qty: number;
  unit_price: number;
  amount: number;                // 总额（major units，例如 29.97）
  type: 'product' | 'discount' | 'tax';
  assignments: Array<{ memberId: string; qty: number }>;
	targetItemId?: string;   // discount/tax 关联到哪个商品
}

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
  const searchParams = useSearchParams();
  const code = params.code as string;
  const editExpenseId = searchParams.get('edit');
  const isEditMode = !!editExpenseId;

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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [editingField, setEditingField] = useState<{
    itemId: string;
    field: 'name' | 'amount';
  } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
	const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [showReceiptFull, setShowReceiptFull] = useState(false);
	const [amountDraft, setAmountDraft] = useState<string>('');
	const [receiptOriginalTotalMinor, setReceiptOriginalTotalMinor] = useState<
    number | null
  >(null);

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

      if (!isEditMode) {
        // 新建模式：默认值
        if (memberId) setPayerMemberId(memberId);
        setSelectedParticipants(
          new Set(tripResult.data.members.map((m) => m.id))
        );
        setExchangeRateInput(tripResult.data.defaultExchangeRate);
      } else {
        // 编辑模式：加载现有 expense
        const { getExpenseForEdit } = await import('@/lib/actions');
        const exResult = await getExpenseForEdit({
          inviteCode: code,
          expenseId: editExpenseId!,
        });
        if (!exResult.ok) {
          setError(exResult.error);
          setLoading(false);
          return;
        }
        const ex = exResult.data;
        setDescription(ex.description);
        setAmount((ex.originalAmountMinor / 100).toFixed(2));
        setCurrency(ex.originalCurrency);
        setExchangeRateInput(String(ex.exchangeRateUsed));
        setPayerMemberId(ex.payerMemberId);
        setSelectedParticipants(
          new Set(ex.participants.map((p) => p.memberId))
        );

        // 判断原账是"平均"还是"自定义"
        const n = ex.participants.length;
        const avgBase = Math.floor(ex.baseAmountMinor / n);
        const avgRem = ex.baseAmountMinor - avgBase * n;

        // 检查每个参与者的份额是否和平均分配一致
        const isEqual = ex.participants.every((p, i) => {
          const expected = i < avgRem ? avgBase + 1 : avgBase;
          return Math.abs(p.shareAmount - expected) <= 1;
        });

        if (isEqual) {
          setSplitMode('equal');
          setCustomShares({});
        } else {
          setSplitMode('custom');
          // 关键：从 base（MYR）minor 换回原币 minor
          const shares: Record<string, string> = {};
          for (const p of ex.participants) {
            const originalMinor = Math.round(
              p.shareAmount / ex.exchangeRateUsed
            );
            shares[p.memberId] = (originalMinor / 100).toFixed(2);
          }
          setCustomShares(shares);
        }
      }

      setLoading(false);
    }
    load();
  }, [code, isEditMode, editExpenseId]);

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
			setReceiptImage(`data:${mimeType};base64,${base64}`);

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
      const rawItems = data.items as Array<{
        name: string;
        qty: number;
        unit_price: number;
        amount: number;
      }>;

      const items: ParsedItem[] = rawItems.map((it) => {
        const type = classifyItem(it.name);
        const qty = Math.max(1, Math.round(it.qty || 1));
        const isProduct = type === 'product';
        return {
          id: makeId(),
          name: it.name,
          qty,
          unit_price: it.unit_price,
          amount: it.amount,
          type,
          assignments:
            isProduct && myMemberId
              ? [{ memberId: myMemberId, qty }]
              : [],
        };
      });

      setParsedItems(items);

      const totalMinor = items.reduce(
        (acc, it) => acc + Math.round(Number(it.amount) * 100),
        0
      );
      setReceiptOriginalTotalMinor(totalMinor);

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

	  function makeId(): string {
    return Math.random().toString(36).slice(2, 11);
  }

  function classifyItem(name: string): 'product' | 'discount' | 'tax' {
    const lower = name.toLowerCase();
    if (
      lower.includes('discount') ||
      lower.includes('折扣') ||
      lower.includes('优惠') ||
      lower.includes('saving')
    ) {
      return 'discount';
    }
    if (
      lower.includes('tax') ||
      lower.includes('税') ||
      lower.includes('vat') ||
      lower.includes('gst')
    ) {
      return 'tax';
    }
    return 'product';
  }

  function toggleMemberForItem(itemId: string, memberId: string) {
    setParsedItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const existing = item.assignments.find((a) => a.memberId === memberId);
        if (existing) {
          // 移除
          const next = item.assignments.filter((a) => a.memberId !== memberId);
          // 重新归一 qty（总分配数量要等于 item.qty）
          return { ...item, assignments: rebalanceAssignments(item, next) };
        } else {
          // 添加：默认 qty 1
          const next = [...item.assignments, { memberId, qty: 1 }];
          return { ...item, assignments: rebalanceAssignments(item, next) };
        }
      })
    );
  }

  function rebalanceAssignments(
    item: ParsedItem,
    assignments: Array<{ memberId: string; qty: number }>
  ): Array<{ memberId: string; qty: number }> {
    if (assignments.length === 0) return [];

    // 单人：全部给这人
    if (assignments.length === 1) {
      return [{ ...assignments[0], qty: item.qty }];
    }

    // qty=1 多人：每人 qty=1（计算时平分）
    if (item.qty === 1) {
      return assignments.map((a) => ({ ...a, qty: 1 }));
    }

    // qty>1 多人：总和必须 = item.qty
    const currentSum = assignments.reduce((a, x) => a + x.qty, 0);
    if (currentSum === item.qty) return assignments;

    if (currentSum < item.qty) {
      const diff = item.qty - currentSum;
      return [
        { ...assignments[0], qty: assignments[0].qty + diff },
        ...assignments.slice(1),
      ];
    }

    // 超出：从后往前减
    const result = assignments.map((a) => ({ ...a }));
    let excess = currentSum - item.qty;
    for (let i = result.length - 1; i >= 0 && excess > 0; i--) {
      const canReduce = result[i].qty - 1;
      const reduce = Math.min(canReduce, excess);
      result[i].qty -= reduce;
      excess -= reduce;
    }
    return result.filter((a) => a.qty > 0);
  }

  function setMemberQtyForItem(itemId: string, memberId: string, qty: number) {
    setParsedItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        if (qty < 1) return item;
        const next = item.assignments.map((a) =>
          a.memberId === memberId ? { ...a, qty } : a
        );
        return { ...item, assignments: rebalanceAssignments(item, next) };
      })
    );
  }

  function deleteParsedItem(itemId: string) {
    setParsedItems((prev) => prev.filter((it) => it.id !== itemId));
  }

  function addManualItem(type: 'product' | 'discount' | 'tax' = 'product') {
    const defaultName =
      type === 'discount' ? 'Discount' : type === 'tax' ? 'Tax' : 'Product';
    const newItem: ParsedItem = {
      id: makeId(),
      name: defaultName,
      qty: 1,
      unit_price: 0,
      amount: 0,
      type,
      assignments:
        type === 'product' && myMemberId
          ? [{ memberId: myMemberId, qty: 1 }]
          : [],
    };
    setParsedItems((prev) => [...prev, newItem]);
  }

  function updateParsedItemName(itemId: string, name: string) {
    setParsedItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, name } : it))
    );
  }

  function updateParsedItemAmount(itemId: string, amount: number) {
    setParsedItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? { ...it, amount, unit_price: it.qty > 0 ? amount / it.qty : 0 }
          : it
      )
    );
  }

	function setItemTarget(itemId: string, targetItemId: string) {
    setParsedItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? { ...it, targetItemId: targetItemId || undefined }
          : it
      )
    );
  }

  function clearParsedItems() {
    setParsedItems([]);
    setParseError('');
		setReceiptImage(null);
		setAmount('');
		setReceiptOriginalTotalMinor(null);
  }

  /**
   * 计算每个人的应付金额
   * - 商品：按 assignments 的 qty 比例分
   * - 折扣/税：如果关联到某商品，按那个商品的分配方式分给相应的人
   *             否则按商品小计比例分摊
   */
  function computePersonalShares(): Map<string, number> {
    const shares = new Map<string, number>();
    if (!trip) return shares;

    trip.members.forEach((m) => shares.set(m.id, 0));

    const productSubtotal = new Map<string, number>();
    trip.members.forEach((m) => productSubtotal.set(m.id, 0));

    let totalProductMinor = 0;
    let adjustMinor = 0;

    // 内部工具：把 minor 按 qty + assignments 分配给成员，累加到 productSubtotal
    // 返回本次实际分配的总额
    function distribute(
      minor: number,
      qty: number,
      assignments: Array<{ memberId: string; qty: number }>
    ): number {
      if (assignments.length === 0 || qty === 0) return 0;

      // qty=1 且多人：平分
      if (qty === 1 && assignments.length > 1) {
        const n = assignments.length;
        const base = Math.floor(minor / n);
        const r = minor - base * n;
        let sum = 0;
        assignments.forEach((a, idx) => {
          const amt = base + (idx < r ? 1 : 0);
          productSubtotal.set(
            a.memberId,
            (productSubtotal.get(a.memberId) ?? 0) + amt
          );
          sum += amt;
        });
        return sum;
      }

      // 其他：逐份分配
      const totalQty = assignments.reduce((a, x) => a + x.qty, 0);
      if (totalQty === 0) return 0;

      const basePerUnit = Math.floor(minor / qty);
      const r = minor - basePerUnit * qty;

      let unitIdx = 0;
      let sum = 0;
      for (const a of assignments) {
        let memberTotal = 0;
        for (let i = 0; i < a.qty; i++) {
          memberTotal += basePerUnit + (unitIdx < r ? 1 : 0);
          unitIdx++;
        }
        productSubtotal.set(
          a.memberId,
          (productSubtotal.get(a.memberId) ?? 0) + memberTotal
        );
        sum += memberTotal;
      }
      return sum;
    }

    // ========== 第一遍：处理所有 products ==========
    for (const item of parsedItems) {
      if (item.type !== 'product') continue;
      const minor = Math.round(item.amount * 100);
      const sum = distribute(minor, item.qty, item.assignments);
      totalProductMinor += sum;
    }

    // ========== 第二遍：处理 discounts / taxes ==========
    for (const item of parsedItems) {
      if (item.type === 'product') continue;
      const minor = Math.round(item.amount * 100);

      // 有 targetItemId 且有效：直接分配到目标商品的成员
      if (item.targetItemId) {
        const target = parsedItems.find((x) => x.id === item.targetItemId);
        if (
          target &&
          target.type === 'product' &&
          target.assignments.length > 0
        ) {
          const sum = distribute(minor, target.qty, target.assignments);
          totalProductMinor += sum;
          continue;
        }
      }

      // 否则进池，按比例分摊
      adjustMinor += minor;
    }

    // ========== 第三遍：按比例分摊 adjustMinor ==========
    trip.members.forEach((m) => {
      const subtotal = productSubtotal.get(m.id) ?? 0;
      if (subtotal === 0) {
        shares.set(m.id, 0);
        return;
      }
      const proportion =
        totalProductMinor > 0 ? subtotal / totalProductMinor : 0;
      const adjust = Math.round(adjustMinor * proportion);
      shares.set(m.id, subtotal + adjust);
    });

    // 修正总和的舍入误差
    const sumShares = Array.from(shares.values()).reduce((a, b) => a + b, 0);
    const expectedTotal = totalProductMinor + adjustMinor;
    const diff = expectedTotal - sumShares;
    if (diff !== 0) {
      let maxId: string | null = null;
      let maxVal = -Infinity;
      for (const [id, v] of shares) {
        if (v > maxVal) {
          maxVal = v;
          maxId = id;
        }
      }
      if (maxId) shares.set(maxId, shares.get(maxId)! + diff);
    }

    return shares;
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

		if (!description.trim()) {
			setError('请输入描述');
			return;
		}

		if (!payerMemberId) {
			setError('请选择付款人');
			return;
		}

		// ===== 分支 A：使用拍照识别结果 =====
		let finalAmountMinor: number;
		let finalParticipantIds: string[];
		let finalCustomShares: Array<{ memberId: string; shareAmount: number }>;

		if (parsedItems.length > 0) {
			const personalShares = computePersonalShares();
			const sharesArray = Array.from(personalShares.entries())
				.filter(([, v]) => v > 0)
				.map(([memberId, shareAmount]) => ({ memberId, shareAmount }));

			if (sharesArray.length === 0) {
				setError('没有分配任何商品');
				return;
			}

			finalAmountMinor = sharesArray.reduce((a, s) => a + s.shareAmount, 0);
			finalParticipantIds = sharesArray.map((s) => s.memberId);
			finalCustomShares = sharesArray;
		} else {
			// ===== 分支 B：手动输入 =====
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

			if (selectedParticipants.size < 1) {
				setError('至少选择一位参与者');
				return;
			}

			finalAmountMinor = amountMinor;
			finalParticipantIds = Array.from(selectedParticipants);
			finalCustomShares = [];

			if (splitMode === 'custom') {
				for (const id of selectedParticipants) {
					const v = customShares[id] ?? '';
					if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(v)) {
						setError('自定义金额格式不对（例如 120 或 120.50）');
						return;
					}
					const p = v.split('.');
					const minorPart2 = (p[1] ?? '').padEnd(2, '0');
					const minor = Number(p[0] + minorPart2);
					if (minor <= 0) {
						setError('每个人的金额必须大于 0');
						return;
					}
					finalCustomShares.push({ memberId: id, shareAmount: minor });
				}

				const sum = finalCustomShares.reduce((a, b) => a + b.shareAmount, 0);
				if (sum !== amountMinor) {
					setError('自定义金额加起来必须等于总额');
					return;
				}
			} else {
				// 平均分摊：不传 customShares
				finalCustomShares = [];
			}
		}

		// ===== 汇率 =====
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
			if (isEditMode && editExpenseId) {
        const { updateExpense } = await import('@/lib/actions');
        const result = await updateExpense({
          inviteCode: code,
          expenseId: editExpenseId,
          description: description.trim(),
          originalAmountMinor: finalAmountMinor,
          originalCurrency: currency,
          exchangeRateUsed: effectiveRate,
          payerMemberId,
          participantMemberIds: finalParticipantIds,
          customShares:
            finalCustomShares.length > 0 ? finalCustomShares : undefined,
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else {
        const result = await addExpense({
          inviteCode: code,
          description: description.trim(),
          originalAmountMinor: finalAmountMinor,
          originalCurrency: currency,
          exchangeRateUsed: effectiveRate,
          payerMemberId,
          participantMemberIds: finalParticipantIds,
          customShares:
            finalCustomShares.length > 0 ? finalCustomShares : undefined,
          idempotencyKey: generateUUID(),
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }
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
          <h1 className="text-lg font-bold">
            {isEditMode ? "编辑" : "记一笔"}
          </h1>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
            {error}
          </div>
        )}

        {/* 收据卡片 */}
        {!isEditMode && (
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label>📷 收据</Label>
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

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={parsing}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  📷 拍照
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={parsing}
                  onClick={() => galleryInputRef.current?.click()}
                >
                  🖼 相册
                </Button>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageUpload}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />

              {parsing && <p className="text-sm text-neutral-500">识别中...</p>}
              {parseError && (
                <p className="text-xs text-red-600">{parseError}</p>
              )}
              {receiptImage && (
                <button
                  type="button"
                  onClick={() => setShowReceiptFull(true)}
                  className="mt-2 w-full text-left"
                >
                  <img
                    src={receiptImage}
                    alt="收据"
                    className="w-full max-h-48 object-contain rounded border bg-neutral-50"
                  />
                  <p className="text-xs text-neutral-400 mt-1 text-center">
                    点击查看大图
                  </p>
                </button>
              )}
            </CardContent>
          </Card>
        )}

        {/* 谁买了什么 */}
        {parsedItems.length > 0 && (
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label>谁买了什么？</Label>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    className="text-neutral-500 underline"
                    onClick={() => addManualItem("product")}
                  >
                    + Product
                  </button>
                  <button
                    type="button"
                    className="text-neutral-500 underline"
                    onClick={() => addManualItem("discount")}
                  >
                    + Discount
                  </button>
                  <button
                    type="button"
                    className="text-neutral-500 underline"
                    onClick={() => addManualItem("tax")}
                  >
                    + Tax
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {parsedItems.map((item) => {
                  const isProduct = item.type === "product";
                  const isEditingName =
                    editingField?.itemId === item.id &&
                    editingField.field === "name";
                  const isEditingAmount =
                    editingField?.itemId === item.id &&
                    editingField.field === "amount";

                  return (
                    <div
                      key={item.id}
                      className="pb-3 border-b last:border-b-0"
                    >
                      {/* 名称 + 金额行 */}
                      <div className="flex items-start gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          {isEditingName ? (
                            <Input
                              autoFocus
                              value={item.name}
                              onChange={(e) =>
                                updateParsedItemName(item.id, e.target.value)
                              }
                              onBlur={() => setEditingField(null)}
                              className="h-8 text-sm"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingField({
                                  itemId: item.id,
                                  field: "name",
                                })
                              }
                              className="text-left text-sm break-words w-full"
                            >
                              {item.name || (
                                <span className="text-neutral-400">未命名</span>
                              )}
                              {item.qty > 1 && (
                                <span className="text-neutral-400">
                                  {" "}
                                  × {item.qty}
                                </span>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-1">
                          {isEditingAmount ? (
                            <Input
                              autoFocus
                              type="text"
                              inputMode="decimal"
                              value={amountDraft}
                              onChange={(e) => setAmountDraft(e.target.value)}
                              onBlur={() => {
                                const n = Number(amountDraft);
                                if (
                                  amountDraft === "" ||
                                  amountDraft === "-" ||
                                  !Number.isFinite(n)
                                ) {
                                  updateParsedItemAmount(item.id, 0);
                                } else {
                                  updateParsedItemAmount(item.id, n);
                                }
                                setEditingField(null);
                              }}
                              className="h-8 w-20 text-sm text-right"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setAmountDraft(item.amount.toString());
                                setEditingField({
                                  itemId: item.id,
                                  field: "amount",
                                });
                              }}
                              className={`text-sm tabular-nums ${
                                item.amount < 0
                                  ? "text-red-500"
                                  : "text-neutral-700"
                              }`}
                            >
                              {currencySymbol(currency)}
                              {item.amount.toFixed(2)}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteParsedItem(item.id)}
                            className="text-neutral-400 hover:text-red-500 px-1 text-lg leading-none"
                            aria-label="删除"
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      {/* 归属选择 */}
                      {isProduct ? (
                        <>
                          <div className="flex flex-wrap gap-1">
                            {trip.members.map((m) => {
                              const selected = item.assignments.some(
                                (a) => a.memberId === m.id,
                              );
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() =>
                                    toggleMemberForItem(item.id, m.id)
                                  }
                                  className={`text-xs px-2.5 py-1 rounded-full border transition ${
                                    selected
                                      ? "bg-neutral-900 text-white border-neutral-900"
                                      : "bg-white text-neutral-500 border-neutral-300"
                                  }`}
                                >
                                  {m.displayName}
                                  {m.id === myMemberId && (
                                    <span className="opacity-60"> · 你</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {/* qty > 1 且多人：显示数量输入 */}
                          {item.qty > 1 && item.assignments.length > 1 && (
                            <div className="mt-2 space-y-1 text-xs bg-neutral-50 rounded p-2">
                              <p className="text-neutral-500 mb-1">数量分配</p>
                              {item.assignments.map((a) => {
                                const member = trip.members.find(
                                  (m) => m.id === a.memberId,
                                );
                                return (
                                  <div
                                    key={a.memberId}
                                    className="flex items-center justify-between gap-2"
                                  >
                                    <span className="truncate">
                                      {member?.displayName ?? "?"}
                                    </span>
                                    <Input
                                      type="number"
                                      min={1}
                                      max={item.qty}
                                      value={a.qty}
                                      onChange={(e) =>
                                        setMemberQtyForItem(
                                          item.id,
                                          a.memberId,
                                          Number(e.target.value) || 1,
                                        )
                                      }
                                      className="w-16 h-7 text-xs text-right"
                                    />
                                  </div>
                                );
                              })}
                              <div className="flex justify-between text-neutral-400 pt-1">
                                <span>已分配</span>
                                <span>
                                  {item.assignments.reduce(
                                    (a, x) => a + x.qty,
                                    0,
                                  )}{" "}
                                  / {item.qty}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* qty=1 且多人：提示平分 */}
                          {item.qty === 1 && item.assignments.length > 1 && (
                            <p className="mt-1 text-xs text-neutral-500">
                              ↳ 平分
                            </p>
                          )}

                          {/* 未分配提示 */}
                          {item.assignments.length === 0 && (
                            <p className="mt-1 text-xs text-amber-600">
                              ↳ 未分配，不会计入分账
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
                          {(() => {
                            const productItems = parsedItems.filter(
                              (p) => p.type === "product",
                            );
                            return (
                              <select
                                value={item.targetItemId ?? ""}
                                onChange={(e) =>
                                  setItemTarget(item.id, e.target.value)
                                }
                                className="w-full text-xs rounded border border-neutral-300 px-2 py-1.5 bg-white"
                              >
                                <option value="">
                                  ↳ 按商品比例分摊（默认）
                                </option>
                                {productItems.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    ↳ 全部算给：{p.name || "未命名"}
                                  </option>
                                ))}
                              </select>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 分账结果 */}
              <div className="pt-3 border-t">
                <p className="text-xs text-neutral-500 mb-2">分账结果</p>
                {(() => {
                  const personalShares = computePersonalShares();
                  let total = 0;
                  trip.members.forEach((m) => {
                    total += personalShares.get(m.id) ?? 0;
                  });
                  const originalTotal = receiptOriginalTotalMinor;
                  const matches =
                    originalTotal === null || total === originalTotal;

                  return (
                    <>
                      {trip.members.map((m) => {
                        const v = personalShares.get(m.id) ?? 0;
                        if (v === 0) return null;
                        return (
                          <div
                            key={m.id}
                            className="flex justify-between text-sm"
                          >
                            <span>
                              {m.displayName}
                              {m.id === myMemberId && (
                                <span className="text-neutral-400"> · 你</span>
                              )}
                            </span>
                            <span className="font-medium tabular-nums">
                              {currencySymbol(currency)}
                              {(v / 100).toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                      <div className="flex justify-between text-sm pt-2 mt-2 border-t text-neutral-500">
                        <span>合计</span>
                        <span className="tabular-nums">
                          {currencySymbol(currency)}
                          {(total / 100).toFixed(2)}
                        </span>
                      </div>
                      <p
                        className={`text-xs pt-1 ${
                          matches ? "text-green-600" : "text-amber-600"
                        }`}
                      >
                        {matches
                          ? "✓ 与收据金额一致"
                          : `⚠ 与收据金额不一致（原始识别 ${currencySymbol(
                              currency,
                            )}${
                              originalTotal !== null
                                ? (originalTotal / 100).toFixed(2)
                                : "?"
                            }）`}
                      </p>
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 金额 */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <Label>金额</Label>
            {parsedItems.length > 0 ? (
              <div className="flex items-center justify-between bg-neutral-50 rounded p-3">
                <div>
                  <p className="text-2xl font-bold tabular-nums">
                    {symbol}
                    {(
                      parsedItems.reduce(
                        (a, it) => a + Math.round(it.amount * 100),
                        0,
                      ) / 100
                    ).toFixed(2)}
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">来自收据</p>
                </div>
              </div>
            ) : (
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
            )}

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
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "bg-white text-neutral-700 border-neutral-300"
                  }`}
                >
                  {m.displayName}
                  {m.id === myMemberId && " (你)"}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 谁参与 */}
        {parsedItems.length === 0 && (
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label>谁参与？</Label>
                <button
                  type="button"
                  className="text-xs text-neutral-500 underline"
                  onClick={() =>
                    setSelectedParticipants(
                      new Set(trip.members.map((m) => m.id)),
                    )
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
                          ? "bg-neutral-900 text-white border-neutral-900"
                          : "bg-white text-neutral-400 border-neutral-300"
                      }`}
                    >
                      {selected ? "☑ " : "☐ "}
                      {m.displayName}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 分摊方式 */}
        {selectedParticipants.size > 0 && parsedItems.length === 0 && (
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

              {splitMode === "equal" && perPerson > 0 && (
                <p className="text-sm text-neutral-500">
                  每人约 {currencySymbol(trip.baseCurrency)}{" "}
                  {(perPerson / 100).toFixed(2)}
                </p>
              )}

              {splitMode === "custom" && (
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
                          value={customShares[m.id] ?? ""}
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
                        const v = customShares[id] ?? "";
                        if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(v)) return acc;
                        const parts = v.split(".");
                        const major = parts[0];
                        const minorPart = (parts[1] ?? "").padEnd(2, "0");
                        return acc + Number(major + minorPart);
                      },
                      0,
                    );
                    const ok = sum === amountMinor && amountMinor > 0;
                    return (
                      <div className="flex justify-between text-sm pt-2 border-t mt-2">
                        <span className="text-neutral-500">已分配</span>
                        <span
                          className={
                            ok
                              ? "text-green-600 font-medium"
                              : "text-red-600 font-medium"
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

      {/* 收据全屏查看 */}
      {showReceiptFull && receiptImage && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setShowReceiptFull(false)}
        >
          <img
            src={receiptImage}
            alt="收据"
            className="max-w-full max-h-full object-contain"
          />
          <button
            type="button"
            className="absolute top-4 right-4 text-white text-2xl leading-none"
            onClick={() => setShowReceiptFull(false)}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      )}

      {/* 保存按钮 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <div className="max-w-md mx-auto">
          <Button
            className="w-full h-12 text-base"
            onClick={handleSave}
            disabled={
              saving ||
              !description.trim() ||
              (parsedItems.length === 0 && !amount)
            }
          >
            {saving ? "保存中..." : isEditMode ? "保存修改" : "保存"}
          </Button>
        </div>
      </div>
    </main>
  );
}