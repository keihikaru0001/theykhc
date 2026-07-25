// purchaseRedirect — GET/POST両対応のリダイレクト型決済関数
// きかくん等のアプリから<a href>リンクで直接アクセス可能
// Stripe Checkoutへ302リダイレクト

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY_2') || '';
const STRIPE_API = 'https://api.stripe.com/v1';

const HIKARI_PACKAGE = {
  priceId: 'price_1Tww9fK1vpa9qUSHjM1WoMvF',
  amount: 30000,
  hikari: 100000,
};

Deno.serve(async (req: Request) => {
  try {
    // GETとPOST両方対応
    let service = 'general';
    let userId = '';
    let successUrl = 'https://theykhc.com';
    let cancelUrl = 'https://theykhc.com';

    if (req.method === 'GET') {
      const url = new URL(req.url);
      service = url.searchParams.get('service') || 'general';
      userId = url.searchParams.get('user_id') || '';
      successUrl = url.searchParams.get('success_url') || 'https://theykhc.com';
      cancelUrl = url.searchParams.get('cancel_url') || 'https://theykhc.com';
    } else if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      service = body.service || 'general';
      userId = body.user_id || '';
      successUrl = body.success_url || 'https://theykhc.com';
      cancelUrl = body.cancel_url || 'https://theykhc.com';
    }

    // Stripe Checkout作成
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('payment_method_types[0]', 'card');
    params.append('line_items[0][price]', HIKARI_PACKAGE.priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', `${successUrl}?hikari=success&session_id={CHECKOUT_SESSION_ID}`);
    params.append('cancel_url', `${cancelUrl}?hikari=cancelled`);
    params.append('metadata[type]', 'hikari_purchase');
    params.append('metadata[hikari_amount]', String(HIKARI_PACKAGE.hikari));
    params.append('metadata[service]', service);
    if (userId) params.append('metadata[user_id]', userId);

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
      return new Response(JSON.stringify({ error: session.error.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 302リダイレクト for GET, JSON for POST
    if (req.method === 'GET') {
      return new Response(null, {
        status: 302,
        headers: { Location: session.url }
      });
    } else {
      return new Response(JSON.stringify({
        checkout_url: session.url,
        session_id: session.id,
        hikari_amount: HIKARI_PACKAGE.hikari
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
