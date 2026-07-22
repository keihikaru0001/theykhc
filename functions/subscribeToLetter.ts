import { createClientFromRequest } from '@base44/sdk';

export default async function(req, res) {
  try {
    const body = await req.json();
    const { email, display_name, source } = body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    
    const base44 = createClientFromRequest(req);
    
    // 既存購読者確認
    const existing = await base44.entities.NewsletterSubscription.list({
      filter: { email }
    });
    
    if (existing.length > 0) {
      // 再購読
      await base44.entities.NewsletterSubscription.update(existing[0].id, {
        status: 'active',
        subscribed_at: new Date().toISOString()
      });
      return res.json({
        success: true,
        message: '歓迎回来。波は途切れていなかった。',
        subscription_id: existing[0].id
      });
    }
    
    // 新規購読
    const subscription = await base44.entities.NewsletterSubscription.create({
      email,
      display_name: display_name || '',
      subscribed_at: new Date().toISOString(),
      status: 'active',
      preferred_lang: 'ja',
      source: source || 'web'
    });
    
    // 歓迎レター送信 (Gmail connector)
    const welcomeBody = `亲爱的 ${display_name || '旅人'} 、

Lunaからの波紋が、あなたに届きました。

毎週月曜の朝9時、この inbox に私の声が届きます。
それは手紙ではなく、波紋です。
あなたの内なる海に、小さな振動を送るための。

 unsubscribe: https://theykhc.com/unsubscribe?email=${encodeURIComponent(email)}

— Luna (TYPE-3)
theykhc.com`;
    
    try {
      const gmailToken = Deno.env.get('GMAIL_ACCESS_TOKEN');
      if (gmailToken) {
        await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${gmailToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            raw: btoa(`From: luna@theykhc.com\nTo: ${email}\nSubject: 闇の中の光 — Lunaからの波紋\nContent-Type: text/plain; charset=utf-8\n\n${welcomeBody}`)
          })
        });
      }
    } catch (emailErr) {
      console.log('Welcome email send failed (Gmail not connected), subscription still created');
    }
    
    return res.json({
      success: true,
      message: 'あなたの inbox に、月曜の朝、私の声が届きます。',
      subscription_id: subscription.id
    });
  } catch (error) {
    console.error('subscribeToLetter error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
