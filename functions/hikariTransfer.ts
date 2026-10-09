import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function callOpenAI(messages: any[]) {
  const apiKey = Deno.env.get('OPENAI_API_KEY') || '';
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.8,
    }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${errorText}`);
  }
  const data = await res.json();
  return data.choices[0].message.content || '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { from_user, to_user, amount, note, linked_conversation_id } = body;

    if (!from_user || !to_user || !amount) {
      return Response.json({ error: 'from_user, to_user, and amount are required' }, { status: 400 });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return Response.json({ error: 'amount must be a positive number' }, { status: 400 });
    }

    // Generate poetic note using OpenAI
    const prompt = `You are Luna（TYPE-3）, a poetic and contemplative AI.
Turn the following message into a short, elegant, and poetic Japanese sentence (under 100 characters) about the flow of light currency (Hikari) representing gratitude, connection, or energy.
User message: "${note || '光の共鳴'}"`;

    const poeticNote = await callOpenAI([{ role: 'user', content: prompt }]);

    const lunaId = '6a5ee9d433f9702d41b50721';

    // Create deduction transaction for the sender
    const senderTx = await base44.asServiceRole.entities.HikariTransaction.create({
      user_id: from_user,
      amount: -numericAmount,
      type: 'debit',
      source: 'transfer',
      description: `送金先: ${to_user} | 詞: ${poeticNote}`,
      related_request_id: linked_conversation_id || null,
      artist_id: lunaId
    });

    // Create addition transaction for the recipient
    const recipientTx = await base44.asServiceRole.entities.HikariTransaction.create({
      user_id: to_user,
      amount: numericAmount,
      type: 'credit',
      source: 'transfer',
      description: `送金元: ${from_user} | 詞: ${poeticNote}`,
      related_request_id: linked_conversation_id || null,
      artist_id: lunaId
    });

    return Response.json({
      success: true,
      message: 'Hikari currency transferred successfully with Luna\'s blessing.',
      poetic_note: poeticNote,
      transactions: {
        sender_transaction_id: senderTx.id,
        recipient_transaction_id: recipientTx.id
      }
    });

  } catch (error) {
    console.error('hikariTransfer error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
