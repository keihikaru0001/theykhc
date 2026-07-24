// get_market_overview — 光貨圏GAME市場一覧
// 全GO判定アイデアの現在V/D/取引価格を返す

export default async function(req) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const skip = parseInt(url.searchParams.get("skip") || "0");
  const industry = url.searchParams.get("industry");

  try {
    const base44 = (await import("npm:@base44/sdk@0.8.23")).default;
    const client = base44.asServiceRole;

    // GO判定済みのQuestionを取得
    const filter = industry ? { status: "answered", industry } : { status: "answered" };
    const questions = await client.entities.Question.list({
      filter,
      limit,
      skip,
      sort: "-created_date"
    });

    const market = [];
    if (questions && questions.length > 0) {
      for (const q of questions) {
        const tags = q.data.tags || [];
        if (!tags.some(t => t === "verdict:go")) continue;

        const answer = q.data.answer || "";
        let tam = 0;
        const tamMatch = answer.match(/【TAM】([0-9,]+)億円/);
        if (tamMatch) tam = parseInt(tamMatch[1].replace(/,/g, ""));

        let vnd_score = 0;
        const vndMatch = answer.match(/【V=N\/Dスコア】([0-9.]+)\/10/);
        if (vndMatch) vnd_score = parseFloat(vndMatch[1]);

        const n_value = tam > 0 ? tam : vnd_score * 100;
        const d_value = vnd_score > 0 ? (10 - vnd_score) : 10;
        const v_value = d_value > 0 ? Math.round((n_value / d_value) * 100) / 100 : n_value;

        // 保有者数
        const holdings = await client.entities.GameHolding.list({
          filter: { question_id: q.id, status: "held" },
          limit: 100
        });
        const holder_count = holdings ? holdings.length : 0;

        // 直近取引価格
        const transactions = await client.entities.GameTransaction.list({
          filter: { question_id: q.id },
          sort: "-timestamp",
          limit: 1
        });
        const last_price = transactions && transactions.length > 0 ? transactions[0].data.price_hikari : null;

        market.push({
          question_id: q.id,
          title: q.data.text,
          industry: q.data.industry,
          source_doi: q.data.source_doi,
          n_value,
          d_value: Math.round(d_value * 100) / 100,
          v_value,
          vnd_score,
          tam,
          holder_count,
          last_trade_price: last_price,
          ipo_available: holder_count === 0
        });
      }
    }

    return new Response(JSON.stringify({
      total: market.length,
      market
    }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
