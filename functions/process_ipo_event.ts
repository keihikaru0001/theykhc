// process_ipo_event — MorningHarvest新問いをIPOイベント化
// 新規GO判定アイデアを取引可能アセットとして市場に投入

export default async function(req) {
  const url = new URL(req.url);
  const question_id = url.searchParams.get("question_id");

  if (!question_id) {
    return new Response(JSON.stringify({ error: "question_id required" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const base44 = (await import("npm:@base44/sdk@0.8.23")).default;
    const client = base44.asServiceRole;

    const question = await client.entities.Question.get(question_id);
    if (!question) throw new Error("Question not found");

    // GO判定済みか確認
    const tags = question.data.tags || [];
    const is_go = tags.some(t => t === "verdict:go");
    if (!is_go) {
      return new Response(JSON.stringify({ error: "Question is not GO-judged", tags }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    // V=N/D初期計算
    const answer = question.data.answer || "";
    let tam = 0;
    const tamMatch = answer.match(/【TAM】([0-9,]+)億円/);
    if (tamMatch) tam = parseInt(tamMatch[1].replace(/,/g, ""));

    let vnd_score = 0;
    const vndMatch = answer.match(/【V=N\/Dスコア】([0-9.]+)\/10/);
    if (vndMatch) vnd_score = parseFloat(vndMatch[1]);

    const n_value = tam > 0 ? tam : vnd_score * 100;
    const d_value = vnd_score > 0 ? (10 - vnd_score) : 10;
    const v_initial = d_value > 0 ? Math.round((n_value / d_value) * 100) / 100 : n_value;

    // IPO価格 = V初期値の10%（初期流動性確保のため割安設定）
    const ipo_price = Math.max(10, Math.round(v_initial * 0.1));

    // GameEvent作成
    const gameEvent = await client.entities.GameEvent.create({
      event_type: "ipo",
      description: `IPO: ${question.data.text} — ${question.data.industry} — 初期V: ${v_initial} — IPO価格: ${ipo_price}光貨`,
      impact_level: "high",
      question_id,
      v_before: 0,
      v_after: v_initial,
      timestamp: new Date().toISOString(),
      metadata: JSON.stringify({
        ipo_price,
        n_value,
        d_value,
        industry: question.data.industry,
        source_doi: question.data.source_doi
      })
    });

    return new Response(JSON.stringify({
      success: true,
      event_id: gameEvent.id,
      question_id,
      title: question.data.text,
      industry: question.data.industry,
      n_value,
      d_value: Math.round(d_value * 100) / 100,
      v_initial,
      ipo_price,
      message: `IPO event created. ${question.data.text} is now available for trading at ${ipo_price} Hikari.`
    }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
