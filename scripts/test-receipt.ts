import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { lookup } from 'mime-types';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('Usage: npm run test-receipt <path-to-image>');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    console.error('Missing SUPABASE_URL in .env.local');
    process.exit(1);
  }
  if (!anonKey) {
    console.error('Missing SUPABASE_ANON_KEY in .env.local');
    process.exit(1);
  }

  // 读取图片
  const fullPath = resolve(process.cwd(), imagePath);
  console.log('Reading:', fullPath);

  const buffer = readFileSync(fullPath);
  const base64 = buffer.toString('base64');
  const mimeType = lookup(fullPath) || 'image/jpeg';

  console.log('Size:', (buffer.length / 1024).toFixed(1), 'KB');
  console.log('Type:', mimeType);
  console.log('');

  // 调用 Edge Function
  const url = `${supabaseUrl}/functions/v1/parse-receipt`;
  console.log('Calling Edge Function...');
  console.log('URL:', url);
  console.log('');

  const startTime = Date.now();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({
      imageBase64: base64,
      mimeType,
    }),
  });

  const elapsed = Date.now() - startTime;
  console.log(`Response: ${res.status} (${elapsed}ms)`);
  console.log('');

  if (!res.ok) {
    const errText = await res.text();
    console.error('ERROR:');
    console.error(errText);
    process.exit(1);
  }

  const data = await res.json();

  console.log('=== Result ===');
  console.log('Currency:', data.currency);
  console.log('Total:', data.total);
  console.log('');
  console.log('Items:');
  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      console.log(
        `  ${item.name}  ×${item.qty}  @${item.unit_price}  =  ${item.amount}`
      );
    }

    const sum = data.items.reduce(
      (acc: number, it: any) => acc + (Number(it.amount) || 0),
      0
    );
    console.log('');
    console.log('Sum of items:', sum.toFixed(2));
    console.log('Receipt total:', Number(data.total).toFixed(2));
    console.log(
      'Match:',
      Math.abs(sum - Number(data.total)) < 0.01 ? '✅' : '⚠️ mismatch'
    );
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});