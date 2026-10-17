// purchaseHikari — 統一光貨購入関数
// ¥30,000 = 100,000光貨 (1パッケージのみ)
// 3サービス共通: 効果圏GAME / きかくん / Luna

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY_2') || '';
const STRIPE_API = 'https://api.stripe.com/v1';

const HIKARI_PACKAGE = {
  priceId: 'price_1Tww9fK1vpa9qUSHjM1WoMvF',
  amount: 30000,        // ¥30,000
  hikari: 100000,       // 100,000光貨
  name: '光貨パッケージ — 100,000光貨',
  desc: 'TheYKHC全サービス共通光貨'
};

function ok(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return ok({ error: 'POST only' }, 405);

    const body = await req.json().catch(() => ({}));
    const { success_url, cancel_url, user_id, service } = body;

    // Stripe Checkout作成
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('payment_method_types[0]', 'card');
    params.append('line_items[0][price]', HIKARI_PACKAGE.priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', `${success_url || 'https://theykhc.com'}?hikari=success&session_id={CHECKOUT_SESSION_ID}`);
    params.append('cancel_url', `${cancel_url || 'https://theykhc.com'}?hikari=cancelled`);
    params.append('metadata[type]', 'hikari_purchase');
    params.append('metadata[hikari_amount]', String(HIKARI_PACKAGE.hikari));
    params.append('metadata[service]', service || 'general');
    if (user_id) params.append('metadata[user_id]', user_id);

    const stripeResp = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const session = await stripeResp.json();
    if (session.error) return ok({ error: session.error.message }, 400);

    return ok({
      checkout_url: session.url,
      session_id: session.id,
      hikari_amount: HIKARI_PACKAGE.hikari,
      price: HIKARI_PACKAGE.amount
    });
  } catch (error) {
    return ok({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
