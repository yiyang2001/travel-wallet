'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getTrip,
  updateTripExchangeRate,
  updateTripName,
  type TripWithMembers,
} from '@/lib/actions';
import { getMemberId } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState<TripWithMembers | null>(null);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);

  // 汇率编辑
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [savingRate, setSavingRate] = useState(false);

  // 名称编辑
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  async function loadAll() {
    setLoading(true);
    const result = await getTrip({ inviteCode: code });
    if (result.ok) {
      setTrip(result.data);
    }
    setMyMemberId(getMemberId(code));
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function handleSaveRate() {
    setSavingRate(true);
    const result = await updateTripExchangeRate({
      inviteCode: code,
      newRate: rateInput,
    });
    if (!result.ok) {
      alert(result.error);
      setSavingRate(false);
      return;
    }
    setEditingRate(false);
    setSavingRate(false);
    await loadAll();
  }

  async function handleSaveName() {
    if (!nameInput.trim()) return;
    setSavingName(true);
    const result = await updateTripName({
      inviteCode: code,
      newName: nameInput.trim(),
    });
    if (!result.ok) {
      alert(result.error);
      setSavingName(false);
      return;
    }
    setEditingName(false);
    setSavingName(false);
    await loadAll();
  }

  // 骨架屏
  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50 pb-8">
        <div className="max-w-md mx-auto p-4 space-y-4">
          <div className="flex items-center gap-3 pt-2">
            <div className="h-8 w-16 bg-neutral-200 rounded animate-pulse" />
            <div className="h-6 w-16 bg-neutral-200 rounded animate-pulse" />
          </div>
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="h-4 w-20 bg-neutral-200 rounded animate-pulse" />
              <div className="h-10 bg-neutral-200 rounded animate-pulse" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="h-4 w-20 bg-neutral-200 rounded animate-pulse" />
              <div className="h-10 bg-neutral-200 rounded animate-pulse" />
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!trip || !myMemberId) {
    return <div className="p-8">需要先认领身份</div>;
  }

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
          <h1 className="text-lg font-bold">设置</h1>
        </div>

        {/* Trip Name */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <Label className="text-xs text-neutral-500">Trip 名称</Label>
            {!editingName ? (
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium truncate">{trip.name}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNameInput(trip.name);
                    setEditingName(true);
                  }}
                  className="shrink-0"
                >
                  修改
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={100}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setEditingName(false)}
                    disabled={savingName}
                  >
                    取消
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSaveName}
                    disabled={savingName || !nameInput.trim()}
                  >
                    {savingName ? '保存中...' : '保存'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Exchange Rate */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <Label className="text-xs text-neutral-500">默认汇率</Label>
            {!editingRate ? (
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium truncate">
                  1 {trip.defaultExpenseCurrency} = {trip.defaultExchangeRate}{' '}
                  {trip.baseCurrency}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRateInput(trip.defaultExchangeRate);
                    setEditingRate(true);
                  }}
                  className="shrink-0"
                >
                  修改
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  placeholder="0.62"
                />
                <p className="text-xs text-neutral-500">
                  修改后只影响之后新记的账。已记的账不变。
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setEditingRate(false)}
                    disabled={savingRate}
                  >
                    取消
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSaveRate}
                    disabled={savingRate}
                  >
                    {savingRate ? '保存中...' : '保存'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}