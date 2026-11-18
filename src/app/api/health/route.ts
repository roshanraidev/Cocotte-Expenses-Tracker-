// Public liveness only: no configuration, credentials, account or database metadata.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
