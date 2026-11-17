import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(x => x.trim());
const hash = async (token: string) => Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
)).map(x => x.toString(16).padStart(2, '0')).join('');
const checked = <T>(result: { data: T; error: unknown }): T => {
  if (result.error) throw result.error;
  return result.data;
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
  };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ error: 'Niedozwolona metoda.' }, 405);
  if (!allowedOrigins.includes(origin)) return reply({ error: 'Niedozwolona domena.' }, 403);
  try {
    const raw = await req.text();
    if (raw.length > 8192) return reply({ error: 'Zbyt duże żądanie.' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: 'Niepoprawne dane.' }, 400); }
    if (!body || typeof body !== 'object') return reply({ error: 'Niepoprawne dane.' }, 400);
    const { action } = body;
    if (action === 'login') {
      if (typeof body.pin !== 'string' || !/^[0-9]{6}$/.test(body.pin))
        return reply({ error: 'Podaj 6-cyfrowy PIN.' }, 400);
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(x => x.toString(16).padStart(2, '0')).join('');
      const result = checked(await db.rpc('workspace_login', { p_pin: body.pin, p_token_hash: await hash(token) }));
      if (result.status === 'unconfigured') return reply({ error: 'Administrator musi najpierw ustawić PIN.' }, 409);
      if (result.status === 'blocked') return reply({ error: 'Za dużo prób. Spróbuj za minutę.' }, 429);
      if (result.status !== 'ok') return reply({ error: 'Nieprawidłowy PIN.' }, 401);
      return reply({ token, expiresAt: result.expires_at });
    }
    const bearer = req.headers.get('authorization')?.replace(/^Bearer /i, '') ?? '';
    if (action === 'settings' || action === 'change-pin') {
      const { data, error } = await db.auth.getUser(bearer);
      if (error || !data.user) return reply({ error: 'Zaloguj się jako administrator.' }, 401);
      const admin = checked(await db.from('workspace_admins').select('user_id').eq('user_id', data.user.id).maybeSingle());
      if (!admin) return reply({ error: 'To konto nie ma uprawnień administratora.' }, 403);
      if (action === 'settings') {
        const settings = checked(await db.from('workspace_access').select('changed_at').single());
        if (!settings) throw new Error('Missing workspace configuration');
        return reply({ changedAt: settings.changed_at });
      }
      if (typeof body.pin !== 'string' || !/^[0-9]{6}$/.test(body.pin))
        return reply({ error: 'PIN musi mieć dokładnie 6 cyfr.' }, 400);
      checked(await db.rpc('workspace_change_pin', { p_pin: body.pin }));
      return reply({ ok: true });
    }
    if (!/^[a-f0-9]{64}$/.test(bearer)) return reply({ error: 'Wpisz PIN, aby otworzyć przestrzeń.' }, 401);
    const tokenHash = await hash(bearer);
    const session = checked(await db.from('workspace_sessions').select('expires_at')
      .eq('token_hash', tokenHash).gt('expires_at', new Date().toISOString()).maybeSingle());
    if (!session) return reply({ error: 'Sesja wygasła. Wpisz PIN ponownie.' }, 401);
    if (action === 'session') return reply({ ok: true });
    if (action === 'logout') {
      checked(await db.from('workspace_sessions').delete().eq('token_hash', tokenHash));
      return reply({ ok: true });
    }
    if (action === 'list') return reply({ projects: checked(await db.from('workspace_projects')
      .select('*').order('created_at', { ascending: false }).limit(100)) });
    if (action === 'save') {
      const d = body.dimensions;
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120 ||
          !d || !['cm', 'mm'].includes(d.unit) || !['count', 'gap'].includes(d.mode) ||
          !Number.isFinite(d.width) || d.width <= 0 || !Number.isFinite(d.slat) || d.slat <= 0 || d.slat > d.width ||
          (d.mode === 'count' && (!Number.isSafeInteger(d.count) || d.count < 1 || d.count > 1000 || d.count * d.slat > d.width)) ||
          (d.mode === 'gap' && (!Number.isFinite(d.target) || d.target <= 0)))
        return reply({ error: 'Sprawdź nazwę i wymiary projektu.' }, 400);
      const count = d.mode === 'count' ? d.count : Math.max(1, Math.ceil((d.width - d.target) / (d.slat + d.target) - 1e-12));
      const remaining = d.width - count * d.slat;
      if (count > 1000 || remaining < -Math.max(d.width, 1) * 1e-12 ||
          (d.mode === 'gap' && Math.max(0, remaining) / (count + 1) > d.target + Math.max(d.width, 1) * 1e-12))
        return reply({ error: 'Nie można uzyskać takiego rozstawu.' }, 400);
      const dimensions = { unit: d.unit, mode: d.mode, width: d.width, slat: d.slat,
        count: d.mode === 'count' ? d.count : null, target: d.mode === 'gap' ? d.target : null };
      const project = checked(await db.from('workspace_projects').insert({ name: body.name.trim(), dimensions }).select().single());
      return reply({ project });
    }
    return reply({ error: 'Nieznana operacja.' }, 400);
  } catch {
    return reply({ error: 'Nie udało się wykonać operacji. Spróbuj ponownie.' }, 500);
  }
});
