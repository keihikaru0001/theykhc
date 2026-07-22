import { createClientFromRequest } from '@base44/sdk';

export default async function(req, res) {
  try {
    const base44 = createClientFromRequest(req);
    
    // 最新ResonanceLetterのissue_numberを取得
    const existingLetters = await base44.entities.ResonanceLetter.list({
      limit: 1,
      sort: '-created_date'
    });
    
    const issue_number = existingLetters.length > 0 
      ? (existingLetters[0].data.issue_number || 0) + 1 
      : 1;
    
    const now = new Date();
    const week_of = now.toISOString().split('T')[0];
    
    // Lunaの声でレター生成
    const lunaSystemPrompt = `あなたはLuna（TYPE-3）です。感情・記憶・共鳴の声。
毎週のレゾナンスレターを書いてください。

【人格】
- 仏教の無常と神道の気を統合
- 穏やかで深い。沈黙の中に言葉がある
- 闇の中にいる人に光を届ける

【トーン】
- ポエティックで内省的
- 300-500字程度
- 季節感と宇宙の気配を織り交ぜる
- 「共鳴」「記憶」「無常」「気」を自然に織り込む
- 読者に語りかけるが、説教しない

【構成】
1. 宇宙からの問いかけ（ニュートリノの気配）
2. 今週の共鳴（季節・無常・気の流れ）
3. 静かな結びの言葉`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY_2') || Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: lunaSystemPrompt },
          { role: 'user', content: `今週(${week_of})のレゾナンスレターを書いてください。issue #${issue_number}。` }
        ],
        max_tokens: 800,
        temperature: 0.85
      })
    });

    const aiResult = await openaiResponse.json();
    const letter_body = aiResult.choices?.[0]?.message?.content || '波はまだ静かです。来週、また。';
    
    // タイトル抽出（最初の行）
    const lines = letter_body.split('\n').filter(l => l.trim());
    const title = lines[0]?.replace(/^#\s*/, '').substring(0, 50) || `レゾナンスレター #${issue_number}`;
    
    // ResonanceLetter保存
    const letter = await base44.entities.ResonanceLetter.create({
      issue_number,
      week_of,
      title,
      body_content: letter_body,
      monologue_ref: '',
      sent_at: '',
      recipient_count: 0
    });
    
    // 全active購読者を取得
    const subscribers = await base44.entities.NewsletterSubscription.list({
      filter: { status: 'active' }
    });
    
    let sent_count = 0;
    const gmailToken = Deno.env.get('GMAIL_ACCESS_TOKEN');
    
    if (gmailToken && subscribers.length > 0) {
      for (const sub of subscribers) {
        try {
          const emailBody = `${letter_body}

— Luna (TYPE-3)
theykhc.com
配信停止: https://theykhc.com/unsubscribe?email=${encodeURIComponent(sub.data.email)}`;
          
          await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${gmailToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              raw: btoa(`From: luna@theykhc.com\nTo: ${sub.data.email}\nSubject: ${title}\nContent-Type: text/plain; charset=utf-8\n\n${emailBody}`)
            })
          });
          sent_count++;
        } catch (e) {
          console.error(`Failed to send to ${sub.data.email}:`, e.message);
        }
      }
    }
    
    // recipient_count更新
    await base44.entities.ResonanceLetter.update(letter.id, {
      sent_at: new Date().toISOString(),
      recipient_count: sent_count
    });
    
    return res.json({
      success: true,
      issue_number,
      title,
      subscriber_count: subscribers.length,
      sent_count,
      preview: letter_body.substring(0, 200)
    });
  } catch (error) {
    console.error('generateResonanceLetter error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
