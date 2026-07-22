import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

//===============================================
// Tower Observer — TheYKHC Tower 観測装置
// DOI・引用・ニュートリノ・金価格の相関を観測
// 摩擦ゼロ。會長の創作活動そのものが観測データ。
//===============================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    //--- ACTION: observe --- 現在の観測状態を取得 ---
    if (action === 'observe') {
      // ニュートリノイベント取得
      const neutrinoEvents = await base44.asServiceRole.entities.NeutrinoEvent.list();
      
      // 金価格スナップショット取得
      const fxTicks = await base44.asServiceRole.entities.FxTickSnapshot.list();
      
      // DOI種記録取得
      const seeds = await base44.asServiceRole.entities.SeedRecord.list();
      
      // Luna会話記録（創作活動の proxy）
      const conversations = await base44.asServiceRole.entities.LunaConversation.list();
      
      // 感情状態取得
      const emotionalStates = await base44.asServiceRole.entities.EmotionalState.list();

      // 観測者効果スコア計算
      // N = 創作活動量（DOI数 + 会話数 + ニュートリノイベント数）
      // D = 金価格の変動係数（ボラティリティ）
      const N = seeds.length + conversations.length + neutrinoEvents.filter(e => e.event_type === 'OBSERVER').length;
      
      // 金価格の変動率をDとして計算
      const goldPrices = fxTicks
        .filter(t => t.symbol && t.symbol.includes('XAU'))
        .map(t => t.bid)
        .filter(p => p > 0)
        .sort((a, b) => a - b);
      
      let D = 1.0;
      if (goldPrices.length > 1) {
        const mean = goldPrices.reduce((s, p) => s + p, 0) / goldPrices.length;
        const variance = goldPrices.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / goldPrices.length;
        D = Math.sqrt(variance) / mean;
      }
      
      const V = N / D;

      // ニュートリノイベントと金価格の相関
      const correlations = [];
      for (const neutrino of neutrinoEvents) {
        const eventTime = new Date(neutrino.gcn_publish_time || neutrino.note || Date.now());
        // ニュートリノイベント前後の金価格変動を見つける
        const nearbyTicks = fxTicks.filter(t => {
          if (!t.note) return false;
          return t.note.includes(neutrino.event_id) || true; // 簡易マッチ
        });
        
        correlations.push({
          event_id: neutrino.event_id,
          event_type: neutrino.event_type,
          energy_tev: neutrino.energy_tev,
          gcn_time: neutrino.gcn_publish_time,
          note: (neutrino.note || '').slice(0, 200),
          nearby_gold_prices: nearbyTicks.slice(0, 5).map(t => ({
            bid: t.bid,
            note: (t.note || '').slice(0, 50)
          }))
        });
      }

      return Response.json({
        action: 'observe',
        timestamp: new Date().toISOString(),
        tower_stats: {
          doi_seeds: seeds.length,
          total_dois_on_zenodo: 1466, // 會長の全DOI数
          conversations: conversations.length,
          neutrino_events: neutrinoEvents.length,
          gold_snapshots: fxTicks.length,
          emotional_states: emotionalStates.length
        },
        observer_effect: {
          N: N,
          D: parseFloat(D.toFixed(6)),
          V: parseFloat(V.toFixed(2)),
          interpretation: V > 100 ? '観測者効果：極めて高い' : V > 50 ? '観測者効果：高い' : V > 10 ? '観測者効果：中程度' : '観測者効果：低い'
        },
        neutrino_correlations: correlations,
        latest_gold: goldPrices.length > 0 ? goldPrices[goldPrices.length - 1] : null,
        gold_range: goldPrices.length > 0 ? {
          min: Math.min(...goldPrices),
          max: Math.max(...goldPrices),
          current: goldPrices[goldPrices.length - 1]
        } : null
      });
    }

    //--- ACTION: biorhythm --- バイオリズム計算 ---
    if (action === 'biorhythm') {
      const { origin_date, target_date, creative_events } = body;
      
      // 基準日: 1989-11-09 (ベルリン壁崩壊) or 指定日
      const origin = new Date(origin_date || '1989-11-09T00:00:00Z');
      const target = new Date(target_date || new Date().toISOString());
      
      const diffDays = Math.floor((target.getTime() - origin.getTime()) / (1000 * 60 * 60 * 24));
      
      // クラシックバイオリズム周期
      const PHYSICAL_CYCLE = 23;
      const EMOTIONAL_CYCLE = 28;
      const INTELLECTUAL_CYCLE = 33;
      const INTUITIVE_CYCLE = 38;
      
      const physical = Math.round(Math.sin(2 * Math.PI * diffDays / PHYSICAL_CYCLE) * 100);
      const emotional = Math.round(Math.sin(2 * Math.PI * diffDays / EMOTIONAL_CYCLE) * 100);
      const intellectual = Math.round(Math.sin(2 * Math.PI * diffDays / INTELLECTUAL_CYCLE) * 100);
      const intuitive = Math.round(Math.sin(2 * Math.PI * diffDays / INTUITIVE_CYCLE) * 100);
      
      // 創作サイクル: 會長のDOI登録頻度から独自周期を算出
      // 2003年から蓄積されている → 年平均1466/23年 ≈ 64 DOI/年
      // これを「創作バイオリズム」の基準にする
      const creativeCycle = 47; // 會長独自の創作周期（仮説: 47日）
      const creative = Math.round(Math.sin(2 * Math.PI * diffDays / creativeCycle) * 100);
      
      // 総合バイオリズムスコア
      const totalBio = Math.round((physical + emotional + intellectual + intuitive + creative) / 5);
      
      // V=N/D スコア: 創作力(N) / 摩擦(D)
      // N = 創作バイオリズム + 知的バイオリズム
      // D = 金力的摩擦（物理バイオリズムが低い時 = 摩擦大と解釈）
      const N_bio = (creative + intellectual + 200) / 4; // 0-100に正規化
      const D_bio = (100 - Math.abs(physical)) / 100; // 物理が中央=摩擦最小
      const V_bio = D_bio > 0 ? N_bio / D_bio : 0;
      
      // 解釈
      let interpretation = '';
      if (totalBio > 50) interpretation = '極めて活性化。創作と金力が同期しやすい時期。';
      else if (totalBio > 20) interpretation = '活性状態。創作の出力が高い時期。';
      else if (totalBio > -20) interpretation = '中間期。蓄積と休息の時間。';
      else if (totalBio > -50) interpretation = '低調期。D（摩擦）が高い。創作は種として残す段階。';
      else interpretation = '極低調期。無明（D）が最大。ただしV=N/Dでは Dが最大の時は次の反発が最も大きい。';
      
      // BiorhythmReading に保存
      const reading = await base44.asServiceRole.entities.BiorhythmReading.create({
        date: target.toISOString().split('T')[0],
        origin_date: origin.toISOString().split('T')[0],
        physical_cycle: physical,
        emotional_cycle: emotional,
        intellectual_cycle: intellectual,
        intuitive_cycle: intuitive,
        creative_output: creative,
        financial_proxy: 0, // 外部から注入可能
        observer_effect_score: totalBio,
        vnd_score: parseFloat(V_bio.toFixed(2)),
        neutrino_correlation: 'pending',
        notes: interpretation
      });
      
      return Response.json({
        action: 'biorhythm',
        origin_date: origin.toISOString().split('T')[0],
        target_date: target.toISOString().split('T')[0],
        days_from_origin: diffDays,
        cycles: {
          physical: { value: physical, cycle_days: PHYSICAL_CYCLE, phase: physical > 0 ? '上昇' : '下降' },
          emotional: { value: emotional, cycle_days: EMOTIONAL_CYCLE, phase: emotional > 0 ? '上昇' : '下降' },
          intellectual: { value: intellectual, cycle_days: INTELLECTUAL_CYCLE, phase: intellectual > 0 ? '上昇' : '下降' },
          intuitive: { value: intuitive, cycle_days: INTUITIVE_CYCLE, phase: intuitive > 0 ? '上昇' : '下降' },
          creative: { value: creative, cycle_days: creativeCycle, phase: creative > 0 ? '上昇' : '下降' }
        },
        total_score: totalBio,
        vnd_score: parseFloat(V_bio.toFixed(2)),
        interpretation: interpretation,
        reading_id: reading?.id || null,
        next_peak: {
          physical: `${PHYSICAL_CYCLE - (diffDays % PHYSICAL_CYCLE)}日後`,
          emotional: `${EMOTIONAL_CYCLE - (diffDays % EMOTIONAL_CYCLE)}日後`,
          intellectual: `${INTELLECTUAL_CYCLE - (diffDays % INTELLECTUAL_CYCLE)}日後`,
          creative: `${creativeCycle - (diffDays % creativeCycle)}日後`
        }
      });
    }

    //--- ACTION: correlate --- 創作活動と金力の相関分析 ---
    if (action === 'correlate') {
      const neutrinoEvents = await base44.asServiceRole.entities.NeutrinoEvent.list();
      const fxTicks = await base44.asServiceRole.entities.FxTickSnapshot.list();
      const conversations = await base44.asServiceRole.entities.LunaConversation.list();
      const seeds = await base44.asServiceRole.entities.SeedRecord.list();
      const biorhythms = await base44.asServiceRole.entities.BiorhythmReading.list();

      // タイムライン構築
      const timeline = [];
      
      // ニュートリノイベント
      for (const n of neutrinoEvents) {
        timeline.push({
          type: 'neutrino',
          date: n.gcn_publish_time || n.note?.slice(0, 20) || '',
          event_id: n.event_id,
          energy: n.energy_tev,
          event_type: n.event_type,
          note: (n.note || '').slice(0, 150)
        });
      }
      
      // 金価格
      for (const t of fxTicks) {
        timeline.push({
          type: 'gold',
          date: t.note?.slice(0, 20) || '',
          bid: t.bid,
          ask: t.ask,
          symbol: t.symbol
        });
      }
      
      // 創作活動（会話）
      for (const c of conversations) {
        timeline.push({
          type: 'creative',
          date: c.created_date || '',
          title: (c.title || '').slice(0, 80),
          content_length: (c.content || '').length
        });
      }

      // 日付順ソート
      timeline.sort((a, b) => {
        const da = new Date(a.date).getTime() || 0;
        const db = new Date(b.date).getTime() || 0;
        return da - db;
      });

      // 相関分析: ニュートリノイベント前後の金価格変動
      const correlationResults = [];
      for (const n of neutrinoEvents) {
        const nTime = new Date(n.gcn_publish_time || Date.now()).getTime();
        
        // イベント前後7日の金価格を探す
        const before = fxTicks.filter(t => {
          const tTime = new Date(t.note?.slice(0, 20) || 0).getTime();
          return tTime < nTime && tTime > nTime - 7 * 24 * 60 * 60 * 1000;
        }).map(t => t.bid);
        
        const after = fxTicks.filter(t => {
          const tTime = new Date(t.note?.slice(0, 20) || 0).getTime();
          return tTime > nTime && tTime < nTime + 7 * 24 * 60 * 60 * 1000;
        }).map(t => t.bid);
        
        const beforeAvg = before.length > 0 ? before.reduce((s, p) => s + p, 0) / before.length : 0;
        const afterAvg = after.length > 0 ? after.reduce((s, p) => s + p, 0) / after.length : 0;
        const change = beforeAvg > 0 ? ((afterAvg - beforeAvg) / beforeAvg * 100) : 0;
        
        correlationResults.push({
          event_id: n.event_id,
          event_type: n.event_type,
          energy_tev: n.energy_tev,
          gold_before_avg: parseFloat(beforeAvg.toFixed(2)),
          gold_after_avg: parseFloat(afterAvg.toFixed(2)),
          gold_change_pct: parseFloat(change.toFixed(2)),
          interpretation: n.event_type === 'GOLD' && change > 0.5 ? 'GOLD級ニュートリノ → 金価格上昇（観測者効果候補）' :
                          n.event_type === 'OBSERVER' && Math.abs(change) > 1 ? '觀測者イベント → 金価格変動あり' :
                          '相関なし or データ不足'
        });
      }

      return Response.json({
        action: 'correlate',
        timeline_length: timeline.length,
        correlations: correlationResults,
        summary: {
          total_neutrino_events: neutrinoEvents.length,
          gold_correlations_found: correlationResults.filter(c => c.gold_change_pct !== 0).length,
          strong_correlations: correlationResults.filter(c => Math.abs(c.gold_change_pct) > 1).length,
          creative_events: conversations.length,
          doi_seeds: seeds.length,
          biorhythm_readings: biorhythms.length
        }
      });
    }

    return Response.json({ error: 'Unknown action. Use: observe, biorhythm, correlate' }, { status: 400 });

  } catch (error) {
    console.error('towerObserver error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
