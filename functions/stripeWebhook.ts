// Stripe Webhook Receiver — 決済完了時にPaymentNotificationエンティティに保存
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

export default async function(req: Request): Promise<Response> {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const event = await req.json();

    // Only handle checkout.session.completed
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

    // Extract payment details
    const amountTotal = session.amount_total || 0;
    const currency = session.currency || 'jpy';
    const customerEmail = session.customer_details?.email || session.customer_email || '';
    const customerName = session.customer_details?.name || '';
    const stripeSessionId = session.id || '';
    const stripeEventId = event.id || '';

    // Determine product name from metadata or line items
    let productName = 'Unknown';
    if (session.metadata?.product_name) {
      productName = session.metadata.product_name;
    } else if (session.metadata?.plan) {
      productName = session.metadata.plan;
    }

    // Save to PaymentNotification entity
    const base44 = createClientFromRequest(req);
    const record = await base44.asServiceRole.entities.PaymentNotification.create({
      data: {
        amount: amountTotal,
        currency: currency,
        customer_email: customerEmail,
        customer_name: customerName,
        product_name: productName,
        stripe_session_id: stripeSessionId,
        stripe_event_id: stripeEventId,
        status: 'pending_invite'
      }
    });

    return new Response(JSON.stringify({
      received: true,
      record_id: record.id,
      customer: customerName || customerEmail,
      amount: amountTotal,
      product: productName
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
