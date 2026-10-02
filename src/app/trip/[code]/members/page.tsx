'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getTrip, type TripWithMembers } from '@/lib/actions';
import { getMemberId } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function MembersPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState<TripWithMembers | null>(null);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getTrip({ inviteCode: code });
      if (result.ok) {
        setTrip(result.data);
      }
      setMyMemberId(getMemberId(code));
      setLoading(false);
    }
    load();
  }, [code]);

  async function handleCopy() {
    const url = `${window.location.origin}/trip/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('复制失败，请手动复制：' + url);
    }
  }

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
                {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-neutral-200 animate-pulse" />
                    <div className="h-4 w-20 bg-neutral-200 rounded animate-pulse" />
                </div>
                ))}
            </CardContent>
            </Card>
        </div>
        </main>
    );
    }
  if (!trip) {
    return <div className="p-8">找不到旅行</div>;
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
          <h1 className="text-lg font-bold">成员</h1>
        </div>

        {/* Members */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-medium text-neutral-500 mb-3">
              {trip.members.length} 位成员
            </p>
            <div className="space-y-2">
              {trip.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-neutral-200 flex items-center justify-center text-lg">
                    👤
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">
                      {m.displayName}
                      {m.id === myMemberId && (
                        <span className="ml-2 text-xs text-neutral-400">(你)</span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Invite link */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-sm font-medium text-neutral-500">邀请朋友</p>
            <p className="text-xs text-neutral-500">
              把这个链接发给朋友，他们打开后选个名字就能加入：
            </p>
            <div className="bg-neutral-100 rounded p-2 text-xs break-all font-mono">
              {typeof window !== 'undefined'
                ? `${window.location.origin}/trip/${code}`
                : `/trip/${code}`}
            </div>
            <Button className="w-full" onClick={handleCopy}>
              {copied ? '✓ 已复制' : '复制链接'}
            </Button>
            <div className="text-xs text-neutral-400 pt-1">
              邀请码（备用）：
              <br />
              <span className="font-mono break-all">{code}</span>
            </div>
          </CardContent>
        </Card>

        {/* Warning */}
        <p className="text-xs text-neutral-400 text-center px-4">
          ⚠️ 这个链接等于访问凭证，不要发到公开群组。
        </p>
      </div>
    </main>
  );
}