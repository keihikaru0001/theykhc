// update_market_cap — 光貨圏GAMEの時価総額更新
// Knowledge Standard Updateと同期して全アセットのV合計を再計算

export default async function(req) {
  try {
    const base44 = (await import("npm:@base44/sdk@0.8.23")).default;
    const client = base44.asServiceRole;

    // 全GameHoldingからV合計を取得
    const holdings = await client.entities.GameHolding.list({
      filter: { status: "held" },
      limit: 500
    });

    let total_game_v = 0;
    if (holdings && holdings.length > 0) {
      for (const h of holdings) {
        total_game_v += (h.data.current_v || 0);
      }
    }

    // KnowledgeStandardから最新のTAM/SAM/SOMを取得
    const standards = await client.entities.KnowledgeStandard.list({
      sort: "-created_date",
      limit: 1
    });

    let tam = 0, sam = 0, som = 0, doi_count = 0, go_count = 0;
    if (standards && standards.length > 0) {
      const s = standards[0].data;
      tam = s.tam_trillion_yen || 0;
      sam = s.sam_trillion_yen || 0;
      som = s.som_trillion_yen || 0;
      doi_count = s.doi_count || 0;
      go_count = s.go_idea_count || 0;
    }

    // GameEvent作成
    await client.entities.GameEvent.create({
      event_type: "market_cap_update",
      description: `Market cap update: Game V total = ${Math.round(total_game_v)}, TAM = ${tam}T, SAM = ${sam}T, SOM = ${som}T, DOI = ${doi_count}, GO = ${go_count}`,
      impact_level: "medium",
      question_id: null,
      v_before: null,
      v_after: Math.round(total_game_v),
      timestamp: new Date().toISOString(),
      metadata: JSON.stringify({ total_game_v, tam, sam, som, doi_count, go_count })
    });

    return new Response(JSON.stringify({
      success: true,
      total_game_v: Math.round(total_game_v),
      active_holdings: holdings ? holdings.length : 0,
      knowledge_standard: { tam, sam, som, doi_count, go_count },
      timestamp: new Date().toISOString()
    }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
