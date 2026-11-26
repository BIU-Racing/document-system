import { guard, readJson, reviewTranslation } from '@/lib/server';

export const dynamic = 'force-dynamic';
/** Approve, correct or revoke the English text of one answer. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return guard(request, async () => reviewTranslation((await params).id, await readJson(request, 262144)));
}
