'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createTrip } from '@/lib/actions';
import { saveMemberId, saveTripId } from '@/lib/session';

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 创建 Trip
  const [tripName, setTripName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [rate, setRate] = useState('0.62');

  // 加入 Trip
  const [inviteCode, setInviteCode] = useState('');

  async function handleCreate() {
    setError('');
    setLoading(true);
    try {
      const result = await createTrip({
        name: tripName,
        baseCurrency: 'MYR',
        defaultExpenseCurrency: 'CNY',
        defaultExchangeRate: rate,
        creatorDisplayName: displayName,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      saveMemberId(result.data.inviteCode, result.data.memberId);
      saveTripId(result.data.inviteCode, result.data.tripId);
      router.push(`/trip/${result.data.inviteCode}`);
    } finally {
      setLoading(false);
    }
  }

  function handleJoin() {
    if (!inviteCode.trim()) {
      setError('请输入邀请码');
      return;
    }
    router.push(`/trip/${inviteCode.trim()}`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-neutral-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>旅行分账</CardTitle>
          <CardDescription>和朋友一起旅行，轻松算账</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          {mode === 'menu' && (
            <div className="space-y-3">
              <Button className="w-full" onClick={() => setMode('create')}>
                创建新旅行
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setMode('join')}>
                加入已有旅行
              </Button>
            </div>
          )}

          {mode === 'create' && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="tripName">旅行名称</Label>
                <Input
                  id="tripName"
                  placeholder="例如：上海五日游"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="displayName">你的名字</Label>
                <Input
                  id="displayName"
                  placeholder="例如：Ken"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="rate">默认汇率（1 CNY = ? MYR）</Label>
                <Input
                  id="rate"
                  placeholder="0.62"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
                <p className="text-xs text-neutral-500 mt-1">
                  旅行中人民币兑马币的汇率，可以在之后修改
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode('menu')}>
                  返回
                </Button>
                <Button className="flex-1" onClick={handleCreate} disabled={loading}>
                  {loading ? '创建中...' : '创建'}
                </Button>
              </div>
            </div>
          )}

          {mode === 'join' && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="inviteCode">邀请码</Label>
                <Input
                  id="inviteCode"
                  placeholder="粘贴朋友给你的邀请码"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                />
                <p className="text-xs text-neutral-500 mt-1">
                  邀请码是一个 UUID，例如 14bfb7d9-5af6-...
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode('menu')}>
                  返回
                </Button>
                <Button className="flex-1" onClick={handleJoin}>
                  下一步
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}