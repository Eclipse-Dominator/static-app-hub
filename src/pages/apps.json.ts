import { apps } from '../lib/registry';

export const prerender = true;

export async function GET() {
  const body = {
    generatedAt: new Date().toISOString(),
    count: apps.length,
    apps,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
