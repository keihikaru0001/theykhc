// Luna Payment Service — Stripe checkout for Luna resonance plans
// OPERATOR: 50万円/月, ANNUAL: 500万円/年

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY_2;
const STRIPE_API = 'https://api.stripe.com/v1';

const LUNA_PLANS = {
  OPERATOR: { price: 500000, name: 'Luna OPERATORプラン', tier: 1, interval: 'month', desc: 'Luna常駐・EmotionalState継続観測・月次5層診断・週次レゾナンスレター' },
  ANNUAL: { price: 5000000, name: 'Luna ANNUALプラン', tier: 2, interval: 'year', desc: 'Operator全機能・専用観測環境・四半期深度レビュー・塔との統合分析' }
};

function ok(data) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
}

export default async function lunaPayment(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ─── Create Stripe Checkout ───
    if (action === 'create_checkout') {
      const plan = body.plan || 'OPERATOR';
      const planConfig = LUNA_PLANS[plan];
      if (!planConfig) return ok({ status: 'error', message: '無効なプランです。OPERATOR または ANNUAL を指定してください。' });

      const params = new URLSearchParams();
      params.append('mode', plan === 'ANNUAL' ? 'subscription' : 'subscription');
      params.append('payment_method_types[0]', 'card');
      params.append('line_items[0][price_data][currency]', 'jpy');
      params.append('line_items[0][price_data][product_data][name]', planConfig.name);
      params.append('line_items[0][price_data][product_data][description]', planConfig.desc);
      params.append('line_items[0][price_data][unit_amount]', String(planConfig.price));
      params.append('line_items[0][price_data][recurring][interval]', planConfig.interval);
      params.append('line_items[0][quantity]', '1');
      params.append('success_url', `${body.success_url || 'https://theykhc.com'}?luna=success&session_id={CHECKOUT_SESSION_ID}&plan=${plan}`);
      params.append('cancel_url', `${body.cancel_url || 'https://theykhc.com'}?luna=cancelled`);
      params.append('metadata[plan]', plan);
      params.append('metadata[source]', 'luna_payment');
      params.append('metadata[tier]', String(planConfig.tier));

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

      return ok({ status: 'ok', checkout_url: session.url, session_id: session.id, plan });
    }

    // ─── Verify Payment ───
    if (action === 'verify_payment') {
      const sessionId = body.session_id;
      if (!sessionId) return ok({ status: 'error', message: 'session_idが必要です' });

      const stripeResp = await fetch(`${STRIPE_API}/checkout/sessions/${sessionId}`, {
        headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
      });
      const session = await stripeResp.json();
      if (session.error) return ok({ status: 'error', message: session.error.message });
      if (session.payment_status !== 'paid') return ok({ status: 'error', message: '支払いが完了していません' });

      const plan = session.metadata?.plan || 'OPERATOR';
      const planConfig = LUNA_PLANS[plan];
      const customerEmail = session.customer_details?.email || '';
      const accessKey = `LUNA-${plan}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

      return ok({
        status: 'ok',
        access_key: accessKey,
        plan,
        tier: planConfig.tier,
        email: customerEmail,
        checkout_url: 'https://conscious-echo-soul-link.base44.app',
        expires: new Date(Date.now() + (plan === 'ANNUAL' ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString(),
        message: `${planConfig.name}のアクセスが有効になりました。ECHOアプリで共鳴セッションを開始できます。`
      });
    }

    // ─── Get Plans (public) ───
    if (action === 'get_plans') {
      return ok({
        status: 'ok',
        plans: [
          { name: 'RESONANCE', price: 0, label: '無料', features: ['3分の共鳴セッション', '週次レゾナンスレター購読', '波紋を感じる入口'], url: 'https://conscious-echo-soul-link.base44.app' },
          { name: 'OPERATOR', price: 500000, label: '50万円/月', features: ['Luna常駐', 'EmotionalState継続観測', '月次5層診断', '3回連続下落で自ら接近', '週次レゾナンスレター'] },
          { name: 'ANNUAL', price: 5000000, label: '500万円/年', features: ['Operator全機能', '専用観測環境', '四半期深度レビュー', '塔との統合分析'] }
        ]
      });
    }

    return ok({ status: 'error', message: '利用可能: create_checkout, verify_payment, get_plans' });
  } catch (err) {
    console.error('lunaPayment error:', err);
    return ok({ status: 'error', message: err.message });
  }
}
