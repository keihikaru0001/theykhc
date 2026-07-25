// recalculateMarket — 効果圏GAMEの毎日市場再計算
// Hikari Sphereアプリの全IdeaエンティティのV値に自然変動を適用する

export default async function(req) {
  try {
    const HIKARI_SPHERE_APP_ID = "6a5fa515a25dd96b8fcc7bd0";
    
    // 現在のアプリのAPIキーを取得
    const apiKey = process.env.BASE44_API_KEY || process.env.API_KEY;
    
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not found" }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }

    // Step 1: Hikari Sphereアプリから全Ideaエンティティを取得
    let allIdeas = [];
    let skip = 0;
    let hasMore = true;
    
    while (hasMore && skip < 2000) {
      const listUrl = `https://app.base44.com/api/apps/${HIKARI_SPHERE_APP_ID}/entities/Idea?limit=500&skip=${skip}&sort=-v_value`;
      const listResp = await fetch(listUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!listResp.ok) {
        const errText = await listResp.text();
        return new Response(JSON.stringify({ 
          error: `Failed to list ideas: ${listResp.status}`,
          detail: errText,
          url: listUrl
        }), {
          status: 500, headers: { "Content-Type": "application/json" }
        });
      }
      
      const listData = await listResp.json();
      const records = listData.records || listData.data || [];
      allIdeas = allIdeas.concat(records);
      
      hasMore = listData.has_more || false;
      skip += 500;
      
      if (records.length < 500) hasMore = false;
    }

    if (allIdeas.length === 0) {
      return new Response(JSON.stringify({ 
        error: "No ideas found",
        detail: "Hikari Sphere app returned 0 ideas"
      }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }

    // Step 2: 自然変動を適用
    // V = N / D において、Dに微小変動（±0.5%）を与えてVを再計算
    const seed = 20260725; // 日付ベースシード
    let rng = seed;
    const random = () => {
      rng = (rng * 9301 + 49297) % 233280;
      return rng / 233280;
    };

    let vUp = 0, vDown = 0, vUnchanged = 0;
    let maxChange = { name: "", delta: 0, oldV: 0, newV: 0 };
    let totalOldV = 0, totalNewV = 0;
    let updateCount = 0;

    for (const idea of allIdeas) {
      const data = idea.data || idea;
      const oldV = data.v_value || 0;
      const n = data.n_value || 0;
      const d = data.d_value || 0;
      const ideaId = idea.id || data.id;
      
      totalOldV += oldV;
      
      if (n <= 0 || d <= 0) {
        vUnchanged++;
        totalNewV += oldV;
        continue;
      }

      // Dに微小変動: ±0.5%
      const dFluctuation = (random() - 0.5) * 0.01 * d;
      const newD = Math.max(0.01, d + dFluctuation);
      const newV = Math.round((n / newD) * 10000) / 10000;
      const newDRounded = Math.round(newD * 1000000) / 1000000;

      const delta = newV - oldV;
      if (delta > 0.01) vUp++;
      else if (delta < -0.01) vDown++;
      else vUnchanged++;

      totalNewV += newV;

      if (Math.abs(delta) > Math.abs(maxChange.delta)) {
        maxChange = { name: data.name, delta, oldV, newV };
      }

      // Step 3: Hikari SphereアプリのIdeaエンティティを更新
      try {
        const updateUrl = `https://app.base44.com/api/apps/${HIKARI_SPHERE_APP_ID}/entities/Idea/${ideaId}`;
        const updateResp = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            v_value: newV,
            d_value: newDRounded
          })
        });
        
        if (updateResp.ok) {
          updateCount++;
        }
      } catch (updateErr) {
        // 個別更新エラーは続行
      }
    }

    // Step 4: 現在のアプリにGameEventを記録
    try {
      const base44 = (await import("npm:@base44/sdk@0.8.23")).default;
      const client = base44.asServiceRole;
      
      await client.entities.GameEvent.create({
        event_type: "market_recalculation",
        description: `Market recalculation: ${updateCount}/${allIdeas.length} ideas updated. V↑${vUp} V↓${vDown} V=${vUnchanged}. Total V: ${Math.round(totalOldV)} → ${Math.round(totalNewV)}`,
        impact_level: "medium",
        question_id: null,
        v_before: Math.round(totalOldV),
        v_after: Math.round(totalNewV),
        timestamp: new Date().toISOString(),
        metadata: JSON.stringify({
          total_ideas: allIdeas.length,
          updated: updateCount,
          v_up: vUp,
          v_down: vDown,
          v_unchanged: vUnchanged,
          max_change: maxChange,
          total_old_v: totalOldV,
          total_new_v: totalNewV
        })
      });
    } catch (e) {
      // GameEvent記録エラーは無視
    }

    return new Response(JSON.stringify({
      success: true,
      total_ideas: allIdeas.length,
      updated: updateCount,
      v_up: vUp,
      v_down: vDown,
      v_unchanged: vUnchanged,
      max_change: maxChange,
      total_v_before: Math.round(totalOldV),
      total_v_after: Math.round(totalNewV),
      total_v_delta: Math.round(totalNewV - totalOldV),
      timestamp: new Date().toISOString()
    }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack
    }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
