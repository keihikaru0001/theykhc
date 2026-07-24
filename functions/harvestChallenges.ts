/**
 * harvestChallenges — 実験・観測結果から課題を抽出し、新しい問いとしてQuestionに書き戻す
 * 
 * 螺旋ループ: 問い → 事業・商品 → 観測・実験 → 課題 → 新しい問い → ...
 * 
 * この関数は:
 * 1. 今日のMarketSimulation結果（トーナメント + 買い分析）を取得
 * 2. 今日のGameEvent（市場イベント）を取得
 * 3. 今日の観測データ（NeutrinoEvent, FxTickSnapshot, BiorhythmReading）を取得
 * 4. これらから「D削減の余地」「市場の裂け目」「観測異常」を抽出
 * 5. 新しいQuestionレコードとして書き戻す（type=challenge, status=pending）
 * 6. 翌朝の圭光るがこれらを判定する
 */

export default async function harvestChallenges(req: any, res: any) {
  try {
    const base44 = (req as any).base44;
    if (!base44) {
      return res.status(500).json({ error: "base44 SDK not available" });
    }

    // today's date range (JST)
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + jstOffset);
    const todayStr = jstNow.toISOString().split('T')[0];
    const todayStart = new Date(todayStr + 'T00:00:00+09:00');
    const todayEnd = new Date(todayStr + 'T23:59:59+09:00');

    // === 1. 今日のMarketSimulation取得 ===
    const simResults = await base44.entities.MarketSimulation.list({
      filter: {
        simulation_date: { $gte: todayStr, $lte: todayStr }
      }
    });

    // === 2. 今日のGameEvent取得 ===
    const gameEvents = await base44.entities.GameEvent.list({
      limit: 50,
      sort: "-created_date"
    });

    const todayEvents = gameEvents.filter((e: any) => {
      const eDate = new Date(e.created_date);
      return eDate >= todayStart && eDate <= todayEnd;
    });

    // === 3. 今日の観測データ取得 ===
    const neutrinoEvents = await base44.entities.NeutrinoEvent.list({
      limit: 20,
      sort: "-created_date"
    });
    const todayNeutrinos = neutrinoEvents.filter((e: any) => {
      if (!e.created_date) return false;
      const eDate = new Date(e.created_date);
      return eDate >= todayStart && eDate <= todayEnd;
    });

    const fxTicks = await base44.entities.FxTickSnapshot.list({
      limit: 20,
      sort: "-created_date"
    });
    const todayFx = fxTicks.filter((e: any) => {
      if (!e.created_date) return false;
      const eDate = new Date(e.created_date);
      return eDate >= todayStart && eDate <= todayEnd;
    });

    const biorhythms = await base44.entities.BiorhythmReading.list({
      limit: 10,
      sort: "-created_date"
    });
    const todayBiorhythms = biorhythms.filter((e: any) => {
      if (!e.created_date) return false;
      const eDate = new Date(e.created_date);
      return eDate >= todayStart && eDate <= todayEnd;
    });

    // === 4. 課題抽出 ===
    const challenges: any[] = [];

    // 4a. トーナメント結果から課題抽出
    for (const sim of simResults) {
      const simData = sim.result_data || {};
      
      if (sim.simulation_type === 'tournament' && simData.new_idea_rank) {
        // 新アイデアが低順位だった場合 → 「なぜ勝てないのか」が問い
        if (simData.new_idea_rank > 10) {
          challenges.push({
            text: `【実験課題】トーナメントで順位${simData.new_idea_rank}位だった事業アイデア。なぜ既存事業に勝てないのか？D削減によってどの程度Vが上昇する可能性があるか？`,
            type: 'challenge',
            status: 'pending',
            tags: ['tournament', 'experiment', 'd_reduction_potential'],
            industry: simData.new_idea_industry || 'unknown',
            source_doi: simData.new_idea_doi || null,
            depth: 3,
            insight: `順位${simData.new_idea_rank} / 勝率${simData.win_rate || 'N/A'}`
          });
        }
      }
      
      if (sim.simulation_type === 'buy_analysis' && simData.d_reduction_potential) {
        // D削減ポテンシャルが高いアイデア → 「何がDを下げるのか」が問い
        const topDReduction = simData.d_reduction_potential;
        if (Array.isArray(topDReduction)) {
          for (const item of topDReduction.slice(0, 3)) {
            if (item.v_uplift_percent && item.v_uplift_percent > 50) {
              challenges.push({
                text: `【D削減課題】事業「${item.idea_name || item.question_id}」はD-1でVが${item.v_uplift_percent}%上昇する可能性。どの知識・研究がDを減らすのか？具体的なD削減路径は何か？`,
                type: 'challenge',
                status: 'pending',
                tags: ['d_reduction', 'buy_analysis', 'high_potential'],
                industry: item.industry || 'unknown',
                parent_id: item.question_id || null,
                depth: 4,
                insight: `V上昇率 ${item.v_uplift_percent}% / 現在D値 ${item.current_d || 'N/A'}`
              });
            }
          }
        }
      }
    }

    // 4b. GameEventから課題抽出
    for (const event of todayEvents) {
      if (event.event_type === 'investigation') {
        challenges.push({
          text: `【市場異常課題】取引監視で異常が検出された：${event.description || '詳細不明'}。この異常の原因は何か？閉鎖系の整合性に影響があるか？`,
          type: 'challenge',
          status: 'pending',
          tags: ['market_anomaly', 'investigation', 'integrity'],
          depth: 5,
          insight: event.metadata || {}
        });
      }
      if (event.event_type === 'ipo' && event.v_after) {
        // IPO後のV値変動から需要の問い
        challenges.push({
          text: `【IPO需要課題】新規IPOのV値が${event.v_before || '?'} → ${event.v_after}に変動。市場の需要と供給のバランスは適切か？プレイヤーの関心が偏っている理由は何か？`,
          type: 'challenge',
          status: 'pending',
          tags: ['ipo', 'demand_supply', 'market_balance'],
          question_id: event.question_id || null,
          depth: 3,
          insight: `V変動: ${event.v_before || '?'} → ${event.v_after}`
        });
      }
    }

    // 4c. 観測データから課題抽出
    for (const neutrino of todayNeutrinos) {
      if (neutrino.energy_tev && neutrino.energy_tev > 1) {
        challenges.push({
          text: `【観測異常課題】高エネルギーニュートリノ（${neutrino.energy_tev} TeV）を観測。この事象と事業アイデアの共鳴関係はあるか？N値への影響はどう測定すべきか？`,
          type: 'challenge',
          status: 'pending',
          tags: ['neutrino', 'high_energy', 'observation', 'resonance'],
          depth: 3,
          insight: `Energy: ${neutrino.energy_tev} TeV / Event: ${neutrino.event_id || 'N/A'}`
        });
      }
    }

    for (const fx of todayFx) {
      if (fx.anomaly_score && fx.anomaly_score > 0.7) {
        challenges.push({
          text: `【市場観測課題】FX市場で異常スコア${fx.anomaly_score}を観測（${fx.symbol || 'N/A'}）。この異常は事業アイデアのD値（市場摩擦）とどう相関するか？外部市場の動揺が閉鎖系に映り込む経路はあるか？`,
          type: 'challenge',
          status: 'pending',
          tags: ['fx_anomaly', 'market_observation', 'correlation'],
          depth: 3,
          insight: `Anomaly: ${fx.anomaly_score} / Symbol: ${fx.symbol || 'N/A'} / Spread: ${fx.spread || 'N/A'}`
        });
      }
    }

    for (const bio of todayBiorhythms) {
      if (bio.vnd_score && bio.vnd_score < 3) {
        challenges.push({
          text: `【バイオリズム課題】V=N/D観測スコアが${bio.vnd_score}と低値。観測者の状態が塔の観測精度にどう影響しているか？D（無明）の増大要因は何か？`,
          type: 'challenge',
          status: 'pending',
          tags: ['biorhythm', 'low_vnd', 'observer_effect'],
          depth: 4,
          insight: `V=N/D Score: ${bio.vnd_score} / Date: ${bio.date || 'N/A'}`
        });
      }
    }

    // 4d. 観測データが空だった場合の問い
    if (todayNeutrinos.length === 0) {
      challenges.push({
        text: `【観測空白課題】今日のニュートリノ観測データが空である。観測インフラの課題は何か？空白期間中のN値推定方法はどうすべきか？`,
        type: 'challenge',
        status: 'pending',
        tags: ['observation_gap', 'neutrino', 'infrastructure'],
        depth: 3,
        insight: 'No neutrino events observed today'
      });
    }

    // === 5. Questionレコード作成 ===
    const createdQuestions: any[] = [];
    const adminBase44 = base44.asServiceRole || base44;
    
    for (const challenge of challenges) {
      try {
        const newQuestion = await adminBase44.entities.Question.create({
          text: challenge.text,
          type: challenge.type,
          status: challenge.status,
          tags: challenge.tags,
          industry: challenge.industry || 'general',
          parent_id: challenge.parent_id || null,
          source_doi: challenge.source_doi || null,
          depth: challenge.depth || 3,
          insight: typeof challenge.insight === 'string' ? challenge.insight : JSON.stringify(challenge.insight),
          cross_note: 'Generated by harvestChallenges — experiment/observation feedback loop',
          answer: null,
          sheet_synced: false
        });
        createdQuestions.push({
          id: newQuestion.id,
          text: challenge.text.substring(0, 80) + '...'
        });
      } catch (e) {
        console.error('Failed to create question:', e);
      }
    }

    // === 6. 結果返却 ===
    const summary = {
      date: todayStr,
      sources: {
        market_simulations: simResults.length,
        game_events: todayEvents.length,
        neutrino_events: todayNeutrinos.length,
        fx_ticks: todayFx.length,
        biorhythms: todayBiorhythms.length
      },
      challenges_extracted: challenges.length,
      questions_created: createdQuestions.length,
      created: createdQuestions
    };

    console.log('[harvestChallenges] Summary:', JSON.stringify(summary, null, 2));
    
    return res.status(200).json(summary);

  } catch (error) {
    console.error('[harvestChallenges] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Unknown error',
      detail: 'Failed to harvest challenges from experiment/observation data'
    });
  }
}
