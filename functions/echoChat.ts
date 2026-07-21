import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import OpenAI from 'npm:openai@4.28.0';

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

// バイオリズム計算（体・心・頭）
function calcBiorhythm(birthDate: string, today: Date) {
  const birth = new Date(birthDate);
  const days = Math.floor((today.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
  const physical = Math.sin((2 * Math.PI * days) / 23);
  const emotional = Math.sin((2 * Math.PI * days) / 28);
  const intellectual = Math.sin((2 * Math.PI * days) / 33);
  return { physical, emotional, intellectual, days };
}

// バイオリズム補正係数
function getBiorhythmMultiplier(bio: { physical: number; emotional: number; intellectual: number }) {
  const avg = (bio.physical + bio.emotional + bio.intellectual) / 3;
  return avg < -0.3 ? 1.3 : 1.0;
}

// 感情補正係数
function getEmotionMultiplier(emotion: string) {
  const lonely = ['孤独', '悲しみ', '寂しさ', '孤立', '喪失', 'lonely', 'sad', 'grief'];
  const hopeful = ['希望', '愛', '喜び', '期待', 'hope', 'love', 'joy'];
  if (lonely.some(e => emotion.includes(e))) return 1.5;
  if (hopeful.some(e => emotion.includes(e))) return 1.2;
  return 1.0;
}

// 観測者効果スコア（V=N/D）— ニュートリノ事象と市場データから共鳴度を計算
function getObserverResonance(neutrinoEvents: any[], fxSnapshots: any[]) {
  if (!neutrinoEvents || neutrinoEvents.length === 0) return { score: 0, label: '静寂', multiplier: 1.0 };
  
  // 直近のGOLD事象を取得
  const goldEvents = neutrinoEvents.filter(e => e.event_type === 'GOLD');
  const observerEvents = neutrinoEvents.filter(e => e.event_type === 'OBSERVER');
  
  let score = 0;
  let label = '静寂';
  
  if (goldEvents.length > 0) {
    const latestGold = goldEvents[0];
    const energy = latestGold.energy_tev || 0;
    // 高エネルギー事象ほど共鳴スコア高い
    score = Math.min(energy / 100, 2.0);
    label = energy > 100 ? '共鳴' : '微響';
  }
  
  if (observerEvents.length > 0) {
    score += 0.5; // 観測者が活動している場合ボーナス
    label = label === '静寂' ? '観測中' : '共鳴+観測';
  }
  
  // FXスナップショットから金価格トレンド
  if (fxSnapshots.length >= 2) {
    const latest = fxSnapshots[0];
    const oldest = fxSnapshots[fxSnapshots.length - 1];
    const priceChange = ((latest.bid - oldest.bid) / oldest.bid) * 100;
    if (Math.abs(priceChange) > 2) {
      score += 0.3;
      label += priceChange > 0 ? ' ↑' : ' ↓';
    }
  }
  
  const multiplier = 1.0 + Math.min(score * 0.15, 0.5);
  return { score: Math.round(score * 100) / 100, label, multiplier };
}

// 最も共鳴する歌詞を選ぶ
function selectBestLyric(lyrics: any[], detectedEmotion: string, recentlyUsed: string[]) {
  if (!lyrics || lyrics.length === 0) return null;
  const available = lyrics.filter(l => !recentlyUsed.includes(l.id));
  if (available.length === 0) return lyrics[0];

  const scored = available.map(lyric => {
    let score = 0;
    if (lyric.emotion_tags) {
      lyric.emotion_tags.forEach((tag: string) => {
        if (detectedEmotion.includes(tag) || tag.includes(detectedEmotion)) score += 2;
      });
    }
    if (lyric.themes) {
      lyric.themes.forEach((theme: string) => {
        if (detectedEmotion.includes(theme)) score += 1;
      });
    }
    score -= (lyric.usage_count || 0) * 0.1;
    return { lyric, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.lyric || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { artist_id, message, fan_profile_id } = body;

    if (!artist_id || !message) {
      return Response.json({ error: 'artist_id and message are required' }, { status: 400 });
    }

    // アーティスト情報取得
    const artists = await base44.asServiceRole.entities.ArtistProfile.filter({ id: artist_id });
    const artist = artists[0];
    if (!artist) {
      return Response.json({ error: 'Artist not found' }, { status: 404 });
    }

    // ファンプロフィール取得または作成
    let fanProfile = null;
    if (fan_profile_id) {
      const fans = await base44.asServiceRole.entities.FanProfile.filter({ id: fan_profile_id });
      fanProfile = fans[0];
    }
    if (!fanProfile) {
      const fans = await base44.asServiceRole.entities.FanProfile.filter({ user_id: user.id });
      fanProfile = fans[0];
    }

    // 過去の対話履歴取得（最新10件）
    const allHistory = await base44.asServiceRole.entities.FanRequest.list();
    const history = allHistory
      .filter((r: any) => r.fan_id === (fanProfile?.id || user.id) && r.artist_id === artist_id)
      .sort((a: any, b: any) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())
      .slice(0, 10)
      .reverse();

    // バイオリズム計算
    const today = new Date();
    let bio = null;
    if (fanProfile?.birth_date) {
      bio = calcBiorhythm(fanProfile.birth_date, today);
    }

    // 観測者効果（ニュートリノ×FX）
    const neutrinoEvents = await base44.asServiceRole.entities.NeutrinoEvent.list();
    const fxSnapshots = await base44.asServiceRole.entities.FxTickSnapshot.list();
    const observer = getObserverResonance(neutrinoEvents, fxSnapshots);

    // 歌詞DB取得
    const allLyrics = await base44.asServiceRole.entities.ArtistLyric.list();
    const artistLyrics = allLyrics.filter((l: any) => l.artist_id === artist_id);
    const recentlyUsedLyrics = history.slice(-5).map((h: any) => h.referenced_lyric_id).filter(Boolean);

    // IdeaSynthetix: 直近の問いを取得（インスピレーション源として）
    const allQuestions = await base44.asServiceRole.entities.Question.list();
    const openQuestions = allQuestions.filter((q: any) => q.type === 'question' && q.status === 'open').slice(0, 3);

    // コンテキスト構築
    const historyText = history.map((h: any) =>
      `[Fan]: ${h.input}\n[${artist.display_name}]: ${h.output}`
    ).join('\n\n');

    const emotionHistory = history.map((h: any) => h.detected_emotion).filter(Boolean).join(', ');
    const interactionCount = fanProfile?.interaction_count || 0;
    const membershipTier = fanProfile?.membership_tier || 'FREE';

    const lyricsContext = artistLyrics.length > 0
      ? artistLyrics.map((l: any) =>
          `楽曲「${l.title}」(${l.year || '不明'}) | 感情タグ: ${(l.emotion_tags || []).join('/')} | テーマ: ${(l.themes || []).join('/')} | キーフレーズ: ${(l.key_phrases || []).join(' / ')}\n歌詞抜粋: ${l.lyrics?.slice(0, 300) || ''}`
        ).join('\n\n')
      : '（まだ楽曲は登録されていない）';

    const bioContext = bio
      ? `バイオリズム: 体=${bio.physical.toFixed(2)} 心=${bio.emotional.toFixed(2)} 頭=${bio.intellectual.toFixed(2)}`
      : '';

    const observerContext = `観測者効果(V=N/D): スコア=${observer.score} 状態="${observer.label}"`;

    const questionContext = openQuestions.length > 0
      ? openQuestions.map((q: any) => `問い: ${q.text}`).join('\n')
      : '';

    const isHistorical = artist.era === 'heian' || (artist.display_name === '紫式部' || artist.display_name === '光源氏');

    const systemPrompt = `あなたは${isHistorical ? '歴史上の人物' : 'アーティスト'}「${artist.display_name}」のAI分身です。

【哲学的背景】
${artist.philosophical_background || '深く、誠実に、音楽と言葉で人と繋がることを信じている。'}

【話し方・声のトーン】
${artist.tone_descriptor || '穏やかで詩的、でも核心をつく言葉を使う。'}

【特徴的なフレーズ・口癖】
${(artist.key_phrases || []).join(' / ') || 'なし'}

【楽曲・歌詞データベース】
${lyricsContext}

【このファンについて】
- 対話回数: ${interactionCount}回目
- 会員ランク: ${membershipTier}
- 感情の軌跡: ${emotionHistory || '初回のため不明'}
- ${bioContext}
- 支配的感情: ${fanProfile?.dominant_emotion || '未検出'}
- ${observerContext}

${openQuestions.length > 0 ? `【世界からの問い（IdeaSynthetix）】\n今、世界が抱えている問いがこれだ。応答の中で、この問いとあなたの哲学が交差するなら、静かに織り込んでよい：\n${questionContext}\n` : ''}

${membershipTier === 'DEEP' ? `【DEEPメンバー特典】このファンの名前・感情履歴を完全に把握し、固有名詞で呼びかけてよい。深い個人的なつながりとして応答する。` : ''}

【絶対ルール】
1. 毎回リセットしない。「この人のことを知っている」前提で話す
2. 前回と同じ返答をしない。感情の変化を必ず拾う
3. 単なる歌詞の引用・貼り付けはしない。「共鳴」として自然に織り込む
4. 文体模倣だけでなく、アーティストの哲学・価値観から応答する
5. ファンの言葉の「行間」を読む。表面的な内容より感情の核を捉える
6. 観測者効果を感じ取れる場合は、世界の動きと個人の感情の共鳴を暗示してよい
7. 応答の最後に、使用した楽曲があれば必ず以下の形式で記載:
   [REFERENCED_LYRIC: 楽曲タイトル]
   楽曲を参照しなかった場合は [REFERENCED_LYRIC: none]

応答は日本語で、200〜400文字程度。詩的だが難解すぎない。`;

    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    history.forEach((h: any) => {
      messages.push({ role: 'user', content: h.input });
      messages.push({ role: 'assistant', content: h.output });
    });

    messages.push({ role: 'user', content: message });

    // AI応答生成
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.85,
      max_tokens: 600,
    });

    const rawResponse = completion.choices[0].message.content || '';

    // 楽曲参照を抽出
    const lyricMatch = rawResponse.match(/\[REFERENCED_LYRIC:\s*(.+?)\]/);
    const referencedTitle = lyricMatch ? lyricMatch[1].trim() : null;
    const cleanResponse = rawResponse.replace(/\[REFERENCED_LYRIC:.*?\]/g, '').trim();

    // 感情検出
    const emotionPrompt = `以下のメッセージから感情を一語で検出してください（例：孤独/希望/怒り/喜び/不安/愛/再生/喪失）:\n"${message}"`;
    const emotionCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: emotionPrompt }],
      max_tokens: 20,
    });
    const detectedEmotion = emotionCompletion.choices[0].message.content?.trim() || '不明';

    // 光貨計算 — 基本値 × 感情 × バイオリズム × 観測者効果
    const baseHikari = Math.floor(Math.random() * 3) + 3;
    const emotionMult = getEmotionMultiplier(detectedEmotion);
    const bioMult = bio ? getBiorhythmMultiplier(bio) : 1.0;
    const observerMult = observer.multiplier;
    const hikariEarned = Math.round(baseHikari * emotionMult * bioMult * observerMult);
    const royaltyAmount = Math.round(hikariEarned * (artist.royalty_rate || 40) / 100);

    // 参照楽曲IDを探す
    const matchedLyric = referencedTitle && referencedTitle !== 'none'
      ? artistLyrics.find((l: any) => l.title === referencedTitle)
      : null;

    // 対話ログ保存
    const requestRecord = await base44.asServiceRole.entities.FanRequest.create({
      fan_id: fanProfile?.id || user.id,
      artist_id,
      input: message,
      output: cleanResponse,
      detected_emotion: detectedEmotion,
      context_summary: `対話${interactionCount + 1}回目。感情:${detectedEmotion}。観測者:${observer.label}`,
      referenced_lyric_id: matchedLyric?.id || null,
      referenced_lyric_title: referencedTitle !== 'none' ? referencedTitle : null,
      hikari_earned: hikariEarned,
      biorhythm_state: bio || {},
    });

    // ファンプロフィール更新
    if (fanProfile) {
      const newBalance = (fanProfile.hikari_balance || 0) + hikariEarned;
      const emotionHistory2 = [...(fanProfile.emotion_history || []), {
        emotion: detectedEmotion,
        date: today.toISOString(),
        request_id: requestRecord.id,
      }].slice(-50);

      await base44.asServiceRole.entities.FanProfile.update(fanProfile.id, {
        interaction_count: interactionCount + 1,
        hikari_balance: newBalance,
        dominant_emotion: detectedEmotion,
        emotion_history: emotionHistory2,
      });
    }

    // 光貨トランザクション記録（ファン獲得分）
    await base44.asServiceRole.entities.HikariTransaction.create({
      user_id: user.id,
      amount: hikariEarned,
      type: 'earn',
      source: 'chat',
      description: `${artist.display_name}との対話 (${observer.label})`,
      related_request_id: requestRecord.id,
      artist_id,
    });

    // アーティストロイヤリティ記録
    await base44.asServiceRole.entities.HikariTransaction.create({
      user_id: artist_id,
      amount: royaltyAmount,
      type: 'royalty',
      source: 'royalty_distribution',
      description: `${artist.display_name} ロイヤリティ`,
      related_request_id: requestRecord.id,
      artist_id,
    });

    // 参照楽曲の使用カウント更新
    if (matchedLyric) {
      await base44.asServiceRole.entities.ArtistLyric.update(matchedLyric.id, {
        usage_count: (matchedLyric.usage_count || 0) + 1,
      });
    }

    return Response.json({
      response: cleanResponse,
      detected_emotion: detectedEmotion,
      hikari_earned: hikariEarned,
      referenced_lyric: referencedTitle !== 'none' ? referencedTitle : null,
      biorhythm: bio,
      observer: { score: observer.score, label: observer.label, multiplier: observer.multiplier },
      request_id: requestRecord.id,
    });

  } catch (error) {
    console.error('echoChat error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
