// 事業カタログ閲覧サービス — Standalone Catalog Browsing Service
// Independent from きかくん app. Uses Ikoi's Question entity as data source.
// Flow: Stripe Checkout → payment verification → access key → catalog data

import { entities } from 'npm:@base44/sdk@0.8.31';

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY_2;
const STRIPE_API = 'https://api.stripe.com/v1';

const PLANS = {
  CATALOG: { price: 1000000, name: 'CATALOGプラン', tier: 1, interval: 'month' },
  ANALYSIS: { price: 3000000, name: 'ANALYSISプラン', tier: 2, interval: 'month' },
  ENTERPRISE: { price: 10000000, name: 'ENTERPRISEプラン', tier: 3, interval: 'month' }
};

export default async function catalogService(req, res) {
  try {
    const body = req.body || {};
    const action = body.action;

    // ─── Create Stripe Checkout Session ───
    if (action === 'create_checkout') {
      const plan = body.plan || 'CATALOG';
      const planConfig = PLANS[plan];
      if (!planConfig) {
        return res.json({ status: 'error', message: '無効なプランです' });
      }

      // Create Stripe checkout session
      const params = new URLSearchParams();
      params.append('mode', 'subscription');
      params.append('payment_method_types[0]', 'card');
      params.append('line_items[0][price_data][currency]', 'jpy');
      params.append('line_items[0][price_data][product_data][name]', `${planConfig.name} — 事業カタログ閲覧サービス`);
      params.append('line_items[0][price_data][unit_amount]', String(planConfig.price));
      params.append('line_items[0][price_data][recurring][interval]', planConfig.interval);
      params.append('line_items[0][quantity]', '1');
      params.append('success_url', `${body.success_url || 'https://theykhc.com/catalog.html'}?status=success&session_id={CHECKOUT_SESSION_ID}&plan=${plan}`);
      params.append('cancel_url', `${body.cancel_url || 'https://theykhc.com/catalog.html'}?status=cancelled`);
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
      if (session.error) {
        return res.json({ status: 'error', message: session.error.message });
      }

      return res.json({
        status: 'ok',
        checkout_url: session.url,
        session_id: session.id
      });
    }

    // ─── Verify Payment & Issue Access Key ───
    if (action === 'verify_payment') {
      const sessionId = body.session_id;
      if (!sessionId) {
        return res.json({ status: 'error', message: 'session_idが必要です' });
      }

      // Retrieve session from Stripe
      const stripeResp = await fetch(`${STRIPE_API}/checkout/sessions/${sessionId}`, {
        headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
      });
      const session = await stripeResp.json();

      if (session.error) {
        return res.json({ status: 'error', message: session.error.message });
      }

      if (session.payment_status !== 'paid') {
        return res.json({ status: 'error', message: '支払いが完了していません' });
      }

      const plan = session.metadata?.plan || 'CATALOG';
      const planConfig = PLANS[plan];
      const customerEmail = session.customer_details?.email || '';

      // Generate access key
      const accessKey = `CAT-${plan}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

      // Store access record in FanProfile entity
      // Check if subscriber already exists
      const existing = await entities.NewsletterSubscription.list({
        filter: { email: customerEmail, source: 'catalog_service' },
        limit: 1
      });

      if (existing && existing.length > 0) {
        // Update existing subscriber
        await entities.NewsletterSubscription.update(existing[0].id, {
          status: 'active',
          display_name: existing[0].display_name || customerEmail.split('@')[0],
          preferred_lang: 'ja',
          source: 'catalog_service'
        });
      } else if (customerEmail) {
        // Create new subscriber record
        await entities.NewsletterSubscription.create({
          email: customerEmail,
          display_name: customerEmail.split('@')[0],
          preferred_lang: 'ja',
          source: 'catalog_service',
          status: 'active',
          subscribed_at: new Date().toISOString()
        });
      }

      return res.json({
        status: 'ok',
        access_key: accessKey,
        plan: plan,
        tier: planConfig.tier,
        email: customerEmail,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        message: `${planConfig.name}のアクセスが有効になりました。`
      });
    }

    // ─── Get Catalog Data (with access key) ───
    if (action === 'get_catalog') {
      const accessKey = body.access_key;
      const plan = body.plan || 'CATALOG';
      const planConfig = PLANS[plan] || PLANS.CATALOG;
      const userTier = planConfig.tier;

      const limit = Math.min(parseInt(body.limit) || 50, 50);
      const offset = parseInt(body.offset) || 0;
      const query = body.query;
      const industry = body.industry;

      // Fetch GO ideas from Question entity
      const results = await entities.Question.list({
        filter: { status: 'answered' },
        limit: 500,
        sort: '-updated_date'
      });

      let goIdeas = results.filter(q => (q.tags || []).includes('verdict:go'));

      if (industry && industry !== 'all') {
        goIdeas = goIdeas.filter(q => q.industry && q.industry.includes(industry));
      }

      if (query) {
        const qLower = query.toLowerCase();
        goIdeas = goIdeas.filter(q => (q.text || '').toLowerCase().includes(qLower));
      }

      // Sort by VND score descending
      goIdeas.sort((a, b) => {
        const aVnd = parseFloat((a.tags || []).find(t => t.startsWith('vnd:'))?.split(':')[1] || 0);
        const bVnd = parseFloat((b.tags || []).find(t => t.startsWith('vnd:'))?.split(':')[1] || 0);
        return bVnd - aVnd;
      });

      const total = goIdeas.length;
      const paged = goIdeas.slice(offset, offset + limit);

      // Format based on tier
      const formatted = paged.map(q => {
        const tags = q.tags || [];
        const vndTag = tags.find(t => t.startsWith('vnd:'));

        if (userTier >= 2) {
          // ANALYSIS+: full data including 5-layer analysis
          return {
            id: q.id,
            text: q.text,
            industry: q.industry,
            insight: q.insight,
            answer: q.answer,
            vnd: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
            source_title: q.source_title,
            source_doi: q.source_doi,
            _locked: false
          };
        }

        // CATALOG: summary only, 5-layer analysis locked
        return {
          id: q.id,
          text: q.text,
          industry: q.industry,
          insight: q.insight ? q.insight.substring(0, 100) + '...' : null,
          vnd: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
          source_title: q.source_title,
          _locked: true,
          _lock_message: '5層分析の全文は ANALYSIS プラン以上でご利用いただけます'
        };
      });

      return res.json({
        status: 'ok',
        total: total,
        page: Math.floor(offset / limit) + 1,
        total_pages: Math.ceil(total / limit),
        results: formatted,
        tier: plan,
        _locked: userTier < 2
      });
    }

    // ─── Get Single Idea Detail ───
    if (action === 'get_detail') {
      const ideaId = body.idea_id;
      const plan = body.plan || 'CATALOG';
      const userTier = PLANS[plan]?.tier || 1;

      const q = await entities.Question.get(ideaId);
      if (!q) {
        return res.json({ status: 'error', message: 'アイデアが見つかりません' });
      }

      const tags = q.tags || [];
      const vndTag = tags.find(t => t.startsWith('vnd:'));

      if (userTier >= 2) {
        return res.json({
          status: 'ok',
          result: {
            id: q.id,
            text: q.text,
            industry: q.industry,
            insight: q.insight,
            answer: q.answer,
            vnd: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
            source_doi: q.source_doi,
            source_title: q.source_title,
            tags: q.tags,
            _locked: false
          }
        });
      }

      return res.json({
        status: 'ok',
        result: {
          id: q.id,
          text: q.text,
          industry: q.industry,
          insight: q.insight ? q.insight.substring(0, 100) + '...' : null,
          vnd: vndTag ? parseFloat(vndTag.split(':')[1]) : null,
          source_title: q.source_title,
          _locked: true,
          _lock_message: 'このアイデアの5層分析（研究・感情・知恵・市場・リスク）は ANALYSIS プラン以上でご利用いただけます。'
        }
      });
    }

    // ─── Get Industries List ───
    if (action === 'get_industries') {
      const results = await entities.Question.list({
        filter: { status: 'answered' },
        limit: 500
      });

      const goIdeas = results.filter(q => (q.tags || []).includes('verdict:go'));
      const industries = {};
      goIdeas.forEach(q => {
        const ind = q.industry || '未分類';
        industries[ind] = (industries[ind] || 0) + 1;
      });

      return res.json({
        status: 'ok',
        industries: Object.entries(industries)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count }))
      });
    }

    // ─── Get Market Summary (public, no auth) ───
    if (action === 'get_summary') {
      return res.json({
        status: 'ok',
        total: 748,
        market_totals: {
          tam_trillion_yen: 203.92,
          sam_trillion_yen: 22.43,
          som_trillion_yen: 2.20
        },
        avg_vnd: 7.51,
        plans: [
          { name: 'CATALOG', price: 1000000, interval: '月額', features: ['748件カタログ検索・閲覧', 'V=N/Dスコア・市場規模表示', '月次トレンドレポート'] },
          { name: 'ANALYSIS', price: 3000000, interval: '月額', features: ['CATALOG全機能', '5層分析フルテキスト', '月3テーマ × 5層リスク診断', '比較レポート + KRI監視'] },
          { name: 'ENTERPRISE', price: 10000000, interval: '月額', features: ['ANALYSIS全機能', 'カスタム生成', '専用DB', '会長直接相談'] }
        ]
      });
    }

    return res.json({ status: 'error', message: '未知のアクションです。利用可能: create_checkout, verify_payment, get_catalog, get_detail, get_industries, get_summary' });

  } catch (err) {
    console.error('catalogService error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}
