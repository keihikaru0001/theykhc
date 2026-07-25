// 事業カタログ閲覧サービス — IP保護ゲート付き
// 未決済ユーザーにはコードネーム+V値のみ。事業の中身は伏せる。
// 決済確認（access_key or user_id with hikari_balance >= 100,000）で全文開放。

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY_2') || '';
const STRIPE_API = 'https://api.stripe.com/v1';
const HIKARI_THRESHOLD = 100000;

const PLANS = {
  CATALOG: { price: 1000000, name: 'CATALOGプラン', tier: 1, interval: 'month' },
  ANALYSIS: { price: 3000000, name: 'ANALYSISプラン', tier: 2, interval: 'month' },
  ENTERPRISE: { price: 10000000, name: 'ENTERPRISEプラン', tier: 3, interval: 'month' }
};

function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function verifyAccessKey(accessKey) {
  if (!accessKey || !STRIPE_SECRET) return false;
  try {
    const resp = await fetch(`${STRIPE_API}/checkout/sessions/${accessKey}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
    });
    const session = await resp.json();
    return session.payment_status === 'paid';
  } catch {
    return false;
  }
}

async function verifyHikariBalance(base44, userId) {
  if (!userId) return false;
  try {
    const fans = await base44.asServiceRole.entities.FanProfile.list({
      filter: { user_id: userId }
    });
    if (fans && fans.length > 0) {
      return (fans[0].data?.hikari_balance || 0) >= HIKARI_THRESHOLD;
    }
    return false;
  } catch {
    return false;
  }
}

function toCodename(index) {
  return `TYKHC-${String(index + 1).padStart(3, '0')}`;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') return ok({ error: 'POST/GET only' }, 405);

    const base44 = createClientFromRequest(req);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : Object.fromEntries(new URL(req.url).searchParams);
    const action = body.action;

    // ─── Create Stripe Checkout Session ───
    if (action === 'create_checkout') {
      const plan = body.plan || 'CATALOG';
      const planConfig = PLANS[plan];
      if (!planConfig) return ok({ status: 'error', message: '無効なプランです' });

      const params = new URLSearchParams();
      params.append('mode', 'subscription');
      params.append('payment_method_types[0]', 'card');
      params.append('line_items[0][price_data][currency]', 'jpy');
      params.append('line_items[0][price_data][product_data][name]', `${planConfig.name} — 事業カタログ閲覧サービス`);
      params.append('line_items[0][price_data][unit_amount]', String(planConfig.price));
      params.append('line_items[0][price_data][recurring][interval]', planConfig.interval);
      params.append('line_items[0][quantity]', '1');
      params.append('success_url', `${body.success_url || 'https://theykhc.com'}?status=success&session_id={CHECKOUT_SESSION_ID}&plan=${plan}`);
      params.append('cancel_url', `${body.cancel_url || 'https://theykhc.com'}?status=cancelled`);
      params.append('metadata[plan]', plan);
      params.append('metadata[tier]', String(planConfig.tier));
      params.append('metadata[source]', 'catalog_service');

      const stripeResp = await fetch(`${STRIPE_API}/checkout/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      const session = await stripeResp.json();
      if (session.error) return ok({ status: 'error', message: session.error.message });

      return ok({ status: 'ok', checkout_url: session.url, session_id: session.id });
    }

    // ─── Verify Payment & Issue Access Key ───
    if (action === 'verify_payment') {
      const sessionId = body.session_id;
      if (!sessionId) return ok({ status: 'error', message: 'session_idが必要です' });

      const stripeResp = await fetch(`${STRIPE_API}/checkout/sessions/${sessionId}`, {
        headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
      });
      const session = await stripeResp.json();
      if (session.error) return ok({ status: 'error', message: session.error.message });
      if (session.payment_status !== 'paid') return ok({ status: 'error', message: '支払いが完了していません' });

      const plan = session.metadata?.plan || 'CATALOG';
      const planConfig = PLANS[plan];
      const customerEmail = session.customer_details?.email || '';

      const accessKey = `CAT-${plan}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

      const existing = await base44.asServiceRole.entities.NewsletterSubscription.list({
        filter: { email: customerEmail, source: 'catalog_service' }
      });

      if (existing && existing.length > 0) {
        await base44.asServiceRole.entities.NewsletterSubscription.update(existing[0].id, {
          data: { status: 'active', display_name: existing[0].data?.display_name || customerEmail.split('@')[0], preferred_lang: 'ja', source: 'catalog_service' }
        });
      } else if (customerEmail) {
        await base44.asServiceRole.entities.NewsletterSubscription.create({
          data: { email: customerEmail, display_name: customerEmail.split('@')[0], preferred_lang: 'ja', source: 'catalog_service', status: 'active', subscribed_at: new Date().toISOString() }
        });
      }

      return ok({
        status: 'ok', access_key: accessKey, plan: plan, tier: planConfig.tier,
        email: customerEmail,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        message: `${planConfig.name}のアクセスが有効になりました。`
      });
    }

    // ─── 決済確認 ───
    let isAuthorized = false;
    if (body.access_key) {
      isAuthorized = await verifyAccessKey(body.access_key);
    }
    if (!isAuthorized && body.user_id) {
      isAuthorized = await verifyHikariBalance(base44, body.user_id);
    }

    // ─── Get Catalog Data ───
    if (action === 'get_catalog') {
      const limit = Math.min(parseInt(body.limit) || 50, 50);
      const offset = parseInt(body.offset) || 0;
      const query = body.query;
      const industry = body.industry;

      const results = await base44.asServiceRole.entities.Question.list({
        filter: { status: 'answered' },
        limit: 500
      });

      let goIdeas = (results || []).filter(q => {
        const tags = q.data?.tags || q.tags || [];
        return tags.includes('verdict:go');
      });

      if (industry && industry !== 'all') {
        goIdeas = goIdeas.filter(q => {
          const qInd = q.data?.industry || q.industry;
          return qInd && qInd.includes(industry);
        });
      }

      if (query) {
        const qLower = query.toLowerCase();
        goIdeas = goIdeas.filter(q => {
          const text = (q.data?.text || q.text || '').toLowerCase();
          return text.includes(qLower);
        });
      }

      goIdeas.sort((a, b) => {
        const aVnd = parseFloat((a.data?.tags || a.tags || []).find(t => t.startsWith('vnd:'))?.split(':')[1] || 0);
        const bVnd = parseFloat((b.data?.tags || b.tags || []).find(t => t.startsWith('vnd:'))?.split(':')[1] || 0);
        return bVnd - aVnd;
      });

      const total = goIdeas.length;
      const paged = goIdeas.slice(offset, offset + limit);

      const formatted = paged.map((q, i) => {
        const tags = q.data?.tags || q.tags || [];
        const vndTag = tags.find(t => t.startsWith('vnd:'));
        const qIndustry = q.data?.industry || q.industry || '未分類';

        const baseData = {
          codename: toCodename(offset + i),
          v_score: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
          industry: qIndustry,
          _locked: !isAuthorized
        };

        if (isAuthorized) {
          return {
            ...baseData,
            id: q.id,
            text: q.data?.text || q.text,
            insight: q.data?.insight || q.insight,
            answer: q.data?.answer || q.answer,
            vnd: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
            source_title: q.data?.source_title || q.source_title,
            source_doi: q.data?.source_doi || q.source_doi,
            _locked: false
          };
        }
        return baseData;
      });

      return ok({
        status: 'ok', total, page: Math.floor(offset / limit) + 1,
        total_pages: Math.ceil(total / limit),
        results: formatted, authorized: isAuthorized,
        _message: isAuthorized ? null : '事業の詳細は光貨購入（¥30,000=100,000光貨）後に開放されます'
      });
    }

    // ─── Get Single Idea Detail ───
    if (action === 'get_detail') {
      const ideaId = body.idea_id;
      if (!ideaId) return ok({ status: 'error', message: 'idea_idが必要です' });

      const q = await base44.asServiceRole.entities.Question.get(ideaId);
      if (!q) return ok({ status: 'error', message: 'アイデアが見つかりません' });

      const tags = q.data?.tags || q.tags || [];
      const vndTag = tags.find(t => t.startsWith('vnd:'));
      const qIndustry = q.data?.industry || q.industry || '未分類';

      const all = await base44.asServiceRole.entities.Question.list({
        filter: { status: 'answered' },
        limit: 500
      });
      const goIdeas = (all || []).filter(item => {
        const t = item.data?.tags || item.tags || [];
        return t.includes('verdict:go');
      });
      goIdeas.sort((a, b) => {
        const aVnd = parseFloat((a.data?.tags || a.tags || []).find(t => t.startsWith('vnd:'))?.split(':')[1] || 0);
        const bVnd = parseFloat((b.data?.tags || b.tags || []).find(t => t.startsWith('vnd:'))?.split(':')[1] || 0);
        return bVnd - aVnd;
      });
      const idx = goIdeas.findIndex(item => item.id === ideaId);

      const baseData = {
        codename: idx >= 0 ? toCodename(idx) : 'TYKHC-???',
        v_score: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
        industry: qIndustry,
        _locked: !isAuthorized
      };

      if (isAuthorized) {
        return ok({
          status: 'ok',
          result: {
            ...baseData,
            id: q.id,
            text: q.data?.text || q.text,
            insight: q.data?.insight || q.insight,
            answer: q.data?.answer || q.answer,
            vnd: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
            source_doi: q.data?.source_doi || q.source_doi,
            source_title: q.data?.source_title || q.source_title,
            tags: tags,
            _locked: false
          }
        });
      }

      return ok({
        status: 'ok',
        result: {
          ...baseData,
          _message: '事業の詳細は光貨購入（¥30,000=100,000光貨）後に開放されます'
        }
      });
    }

    // ─── Get Industries List ───
    if (action === 'get_industries') {
      const results = await base44.asServiceRole.entities.Question.list({
        filter: { status: 'answered' },
        limit: 500
      });

      const goIdeas = (results || []).filter(q => {
        const tags = q.data?.tags || q.tags || [];
        return tags.includes('verdict:go');
      });
      const industries = {};
      goIdeas.forEach(q => {
        const ind = q.data?.industry || q.industry || '未分類';
        industries[ind] = (industries[ind] || 0) + 1;
      });

      return ok({
        status: 'ok',
        industries: Object.entries(industries)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count }))
      });
    }

    // ─── Get Market Summary ───
    if (action === 'get_summary') {
      return ok({
        status: 'ok', total: 748,
        market_totals: {
          tam_trillion_yen: 203.92,
          sam_trillion_yen: 22.43,
          som_trillion_yen: 2.20
        },
        doi_count: 1032,
        unit_backing_value: '1光貨 = 1,000仮想株'
      });
    }

    return ok({ status: 'error', message: '不明なアクションです' }, 400);

  } catch (err) {
    console.error('catalogService error:', err);
    return ok({ status: 'error', message: err.message }, 500);
  }
});
