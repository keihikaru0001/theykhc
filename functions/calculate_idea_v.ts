// calculate_idea_V — V=N/D 計算関数
// 事業売買は廃止。V=N/D値の計算のみ。

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

    const answer = question.data.answer || "";
    
    let tam = 0;
    const tamMatch = answer.match(/【TAM】([0-9,]+)億円/);
    if (tamMatch) tam = parseInt(tamMatch[1].replace(/,/g, ""));
    
    let sam = 0;
    const samMatch = answer.match(/【SAM】([0-9,]+)億円/);
    if (samMatch) sam = parseInt(samMatch[1].replace(/,/g, ""));
    
    let som = 0;
    const somMatch = answer.match(/【SOM】([0-9,]+)億円/);
    if (somMatch) som = parseInt(somMatch[1].replace(/,/g, ""));

    let vnd_score = 0;
    const vndMatch = answer.match(/【V=N\/Dスコア】([0-9.]+)\/10/);
    if (vndMatch) vnd_score = parseFloat(vndMatch[1]);

    const n_value = tam > 0 ? tam : vnd_score * 100;
    const d_value = vnd_score > 0 ? (10 - vnd_score) : 10;
    const v_value = d_value > 0 ? Math.round((n_value / d_value) * 100) / 100 : n_value;

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
      som
    }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
