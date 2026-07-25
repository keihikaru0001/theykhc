// Stripe Webhook Receiver — 決済完了時にPaymentNotification + FanProfile光貨残高を更新
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

export default async function(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const event = await req.json();

    if (event.type !== 'checkout.session.completed') {
      return new Response(JSON.stringify({ received: true, ignored: event.type }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const session = event.data?.object;
    if (!session) {
      return new Response(JSON.stringify({ error: 'No session data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const amountTotal = session.amount_total || 0;
    const currency = session.currency || 'jpy';
    const customerEmail = session.customer_details?.email || session.customer_email || '';
    const customerName = session.customer_details?.name || '';
    const stripeSessionId = session.id || '';
    const stripeEventId = event.id || '';

    let productName = 'Unknown';
    if (session.metadata?.product_name) {
      productName = session.metadata.product_name;
    } else if (session.metadata?.plan) {
      productName = session.metadata.plan;
    } else if (session.metadata?.type === 'hikari_purchase') {
      productName = '光貨パッケージ';
    }

    const base44 = createClientFromRequest(req);

    // PaymentNotification保存
    const hikariAmount = session.metadata?.hikari_amount ? parseInt(session.metadata.hikari_amount) : 0;
    const record = await base44.asServiceRole.entities.PaymentNotification.create({
      data: {
        amount: amountTotal,
        currency: currency,
        customer_email: customerEmail,
        customer_name: customerName,
        product_name: productName,
        stripe_session_id: stripeSessionId,
        stripe_event_id: stripeEventId,
        status: hikariAmount > 0 ? 'hikari_credited' : 'pending_invite',
        hikari_amount: hikariAmount,
        purchase_type: session.metadata?.type || 'subscription'
      }
    });

    // ─── 光貨購入の場合: FanProfileに残高を反映 ───
    if (session.metadata?.type === 'hikari_purchase' && hikariAmount > 0) {
      const userId = session.metadata?.user_id || customerEmail;

      // user_id または email でFanProfileを検索
      let profiles = await base44.asServiceRole.entities.FanProfile.list({
        filter: { user_id: userId }
      });

      if (!profiles || profiles.length === 0) {
        // email で再検索
        profiles = await base44.asServiceRole.entities.FanProfile.list({
          filter: { user_id: customerEmail }
        });
      }

      if (profiles && profiles.length > 0) {
        // 既存プロファイルに加算
        const profile = profiles[0];
        const currentBalance = profile.data?.hikari_balance || 0;
        const newBalance = currentBalance + hikariAmount;
        await base44.asServiceRole.entities.FanProfile.update(profile.id, {
          data: { hikari_balance: newBalance }
        });

        // 取引記録
        await base44.asServiceRole.entities.HikariTransaction.create({
          data: {
            user_id: profile.data?.user_id || userId,
            amount: hikariAmount,
            type: 'credit',
            source: 'purchase',
            description: `光貨購入: ¥${amountTotal.toLocaleString()} = ${hikariAmount.toLocaleString()}光貨`
          }
        });
      } else {
        // 新規プロファイル作成
        await base44.asServiceRole.entities.FanProfile.create({
          data: {
            user_id: userId,
            hikari_balance: hikariAmount,
            membership_tier: 'free',
            interaction_count: 0,
            emotion_history: [],
            followed_artists: []
          }
        });

        await base44.asServiceRole.entities.HikariTransaction.create({
          data: {
            user_id: userId,
            amount: hikariAmount,
            type: 'credit',
            source: 'purchase',
            description: `光貨初回購入: ¥${amountTotal.toLocaleString()} = ${hikariAmount.toLocaleString()}光貨`
          }
        });
      }
    }

    return new Response(JSON.stringify({
      received: true,
      record_id: record.id,
      customer: customerName || customerEmail,
      amount: amountTotal,
      product: productName,
      hikari_credited: hikariAmount > 0,
      hikari_amount: hikariAmount
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
