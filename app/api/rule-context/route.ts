import { guard, getRuleContext } from '@/lib/server';

export const dynamic = 'force-dynamic';
/** Read-only: the saved values that 2027 rule checks need, across the member's systems. */
export async function GET(request: Request) {
  return guard(request, async () => getRuleContext());
}
