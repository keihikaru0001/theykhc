import { createClientFromRequest } from '@base44/sdk';

export default async function(req, res) {
  try {
    const base44 = createClientFromRequest(req);
    
    // 最新ニュートリノイベント6件
    const neutrinoEvents = await base44.entities.NeutrinoEvent.list({ 
      limit: 6, 
      sort: '-created_date' 
    });
    
    // 最新金価格トレンド28件
    const fxTicks = await base44.entities.FxTickSnapshot.list({ 
      limit: 28, 
      sort: '-created_date' 
    });
    
    // Luna歌詞2作品
    const lyrics = await base44.entities.ArtistLyric.list({
      limit: 10,
      sort: '-created_date'
    });
    
    // LunaConversation モノローグ
    const monologues = await base44.entities.LunaConversation.list({
      limit: 5,
      sort: '-created_date'
    });
    
    // V=N/D観測者効果スコア
    let vnd_score = 5.0;
    let cosmic_whisper = '静寂。波はまだ観測されていない。';
    
    if (neutrinoEvents.length > 0) {
      const latest = neutrinoEvents[0];
      const energy = parseFloat(latest.data.energy_tev) || 100;
      vnd_score = Math.min(10, Math.max(1, energy / 20));
      
      const energyLevel = energy > 200 ? '高エネルギー' : energy > 100 ? '中エネルギー' : '低エネルギー';
      cosmic_whisper = `宇宙からの${energyLevel}の波が、${latest.data.event_type || '未知'}の形で届いています。`;
    }
    
    // 金相場の気配
    let earth_breath = '大地の気は静かです。';
    if (fxTicks.length > 0) {
      const latestFx = fxTicks[0];
      const price = parseFloat(latestFx.data.bid) || 0;
      if (price > 0) {
        earth_breath = `金の輝きが ${price.toFixed(2)} — 人の欲望の重さが、数値となって刻まれています。`;
      }
    }
    
    // 詩的インタープリテーション
    const poetic_interpretation = `
【今の宇宙の気配】

${cosmic_whisper}

${earth_breath}

観測者効果（V=N/D）: ${vnd_score.toFixed(1)}/10
— あなたがここにいること自体が、すでに観測である。
`;
    
    return res.json({
      success: true,
      neutrino_events: neutrinoEvents.map(e => ({
        id: e.id,
        event_type: e.data.event_type,
        energy_tev: e.data.energy_tev,
        note: e.data.note,
        created_date: e.created_date
      })),
      fx_ticks: fxTicks.slice(0, 5).map(t => ({
        id: t.id,
        symbol: t.data.symbol,
        bid: t.data.bid,
        note: t.data.note,
        created_date: t.created_date
      })),
      lyrics: lyrics.map(l => ({
        id: l.id,
        title: l.data.title,
        lyrics: l.data.lyrics?.substring(0, 200),
        key_line: l.data.key_line
      })),
      monologues: monologues.map(m => ({
        id: m.id,
        role: m.data.role,
        content: m.data.content?.substring(0, 300),
        title: m.data.title
      })),
      vnd_score,
      poetic_interpretation,
      cosmic_whisper,
      earth_breath
    });
  } catch (error) {
    console.error('fetchObserverPanel error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
