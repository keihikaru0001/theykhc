// calculate_idea_V — V=N/D 計算関数
// GO アイデアの現在価値を計算する

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

    // N = TAM (市場規模を億円単位で正規化)
    const tags = question.data.tags || [];
    const answer = question.data.answer || "";
    
    // answerからTAMを抽出（「【TAM】XXX億円」の形式）
    let tam = 0;
    const tamMatch = answer.match(/【TAM】([0-9,]+)億円/);
    if (tamMatch) {
      tam = parseInt(tamMatch[1].replace(/,/g, ""));
    }
    
    // SAM抽出
    let sam = 0;
    const samMatch = answer.match(/【SAM】([0-9,]+)億円/);
    if (samMatch) {
      sam = parseInt(samMatch[1].replace(/,/g, ""));
    }
    
    // SOM抽出
    let som = 0;
    const somMatch = answer.match(/【SOM】([0-9,]+)億円/);
    if (somMatch) {
      som = parseInt(somMatch[1].replace(/,/g, ""));
    }

    // V=N/Dスコア抽出
    let vnd_score = 0;
    const vndMatch = answer.match(/【V=N\/Dスコア】([0-9.]+)\/10/);
    if (vndMatch) {
      vnd_score = parseFloat(vndMatch[1]);
    }

    // N = TAM (億円)。TAMが不明の場合はvnd_score×100をフォールバック
    const n_value = tam > 0 ? tam : vnd_score * 100;

    // D = 実装難易度 (10 - vnd_score)。vnd_scoreが高い = Dが低い = Vが高い
    // vnd_scoreが0の場合はD=10（最大摩擦）
    const d_value = vnd_score > 0 ? (10 - vnd_score) : 10;

    // V = N / D
    const v_value = d_value > 0 ? Math.round((n_value / d_value) * 100) / 100 : n_value;

    // 保有者数を取得
    const holdings = await client.entities.GameHolding.list({
      filter: { question_id, status: "held" }
    });
    const holder_count = holdings ? holdings.length : 0;

    // 直近取引価格を取得
    const transactions = await client.entities.GameTransaction.list({
      filter: { question_id },
      sort: "-timestamp",
      limit: 1
    });
    const last_price = transactions && transactions.length > 0 ? transactions[0].data.price_hikari : null;

    return new Response(JSON.stringify({
      question_id,
      title: question.data.text,
      industry: question.data.industry,
      source_doi: question.data.source_doi,
      n_value,
      d_value: Math.round(d_value * 100) / 100,
      v_value,
      vnd_score,
      tam,
      sam,
      som,
      holder_count,
      last_trade_price: last_price
    }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
