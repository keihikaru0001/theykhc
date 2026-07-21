import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import OpenAI from 'npm:openai@4.28.0';

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, seed_id, question_id, topic, industry } = body;

    // ============================================
    // ACTION: requestion — 既存の論文から新しい問いを生成
    // ============================================
    if (action === 'requestion') {
      let seed = null;
      if (seed_id) {
        const seeds = await base44.asServiceRole.entities.SeedRecord.filter({ id: seed_id });
        seed = seeds[0];
      }
      if (!seed) {
        const allSeeds = await base44.asServiceRole.entities.SeedRecord.list();
        seed = allSeeds[0];
      }
      if (!seed) {
        return Response.json({ error: 'No seed records found' }, { status: 404 });
      }

      // 既存の問いを取得（重複回避用）
      const existingQuestions = await base44.asServiceRole.entities.Question.list();
      const existingTexts = existingQuestions
        .filter(q => q.source_doi === seed.doi)
        .map(q => q.text);

      const prompt = `以下の学術論文を読み、既存の問いとは**全く異なる**新しい問いを3つ生成してください。
それぞれ異なる角度（技術的、倫理的、経済的、社会的、実装的）からアプローチすること。

【論文タイトル】
${seed.title}

【要旨】
${(seed.abstract || '').slice(0, 2000)}

【既存の問い（これらと重複しないこと）】
${existingTexts.map((t, i) => `${i + 1}. ${t}`).join('\n')}

各問いについて以下のJSON配列を返してください:
[
  {
    "text": "問いの本文（日本語、具体的で深い問い）",
    "industry": "仕事とビジネス / 科学と技術 / 社会と倫理 / 生活と健康 / 教育と学習",
    "type": "question",
    "insight": "この問いがなぜ重要かの一言説明（日本語、子供にも分かるように）"
  }
]

JSONのみ返してください。`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        max_tokens: 800,
      });

      let newQuestions = [];
      try {
        const raw = completion.choices[0].message.content || '';
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        newQuestions = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      } catch {
        newQuestions = [];
      }

      const created = [];
      for (const q of newQuestions) {
        const record = await base44.asServiceRole.entities.Question.create({
          text: q.text,
          type: 'question',
          status: 'open',
          industry: q.industry || '科学と技術',
          insight: q.insight || null,
          source_doi: seed.doi,
          source_title: seed.title,
          depth: 2,
          parent_id: seed.id,
          root_id: seed.id,
          tags: [],
        });
        created.push(record);
      }

      return Response.json({
        action: 'requestion',
        seed: { id: seed.id, title: seed.title, doi: seed.doi },
        new_questions: created,
      });
    }

    // ============================================
    // ACTION: solve — 問いを解く（回答を生成）
    // ============================================
    if (action === 'solve') {
      let question = null;
      if (question_id) {
        const qs = await base44.asServiceRole.entities.Question.filter({ id: question_id });
        question = qs[0];
      }
      if (!question) {
        return Response.json({ error: 'Question not found' }, { status: 404 });
      }

      // 関連する論文情報を取得
      let seedContext = '';
      if (question.source_doi) {
        const seeds = await base44.asServiceRole.entities.SeedRecord.list();
        const seed = seeds.find(s => s.doi === question.source_doi);
        if (seed) {
          seedContext = `\n【出典論文】\nタイトル: ${seed.title}\n要旨: ${(seed.abstract || '').slice(0, 1500)}`;
        }
      }

      const prompt = `以下の問いに対して、実践的で具体的な回答を構築してください。
単なる解説ではなく、ビジネスや実務で使える「解」として整理してください。

【問い】
${question.text}

【問いの背景】
${question.insight || '（なし）'}

【業界カテゴリ】
${question.industry || '一般'}
${seedContext}

以下の構成で回答してください（日本語、800〜1200文字）:

## 現状の整理
（問題の現状を3行で）

## 解の方向性
（2〜3つの具体的なアプローチ）

## 実装の第一歩
（明日からできる具体的アクション3つ）

## リスクと前提
（この解が成立する条件）`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1200,
      });

      const answer = completion.choices[0].message.content || '';

      // 回答を保存
      await base44.asServiceRole.entities.Question.update(question.id, {
        answer,
        status: 'answered',
      });

      return Response.json({
        action: 'solve',
        question: { id: question.id, text: question.text, industry: question.industry },
        answer,
      });
    }

    // ============================================
    // ACTION: brainstorm — 任意のテーマでブレスト
    // ============================================
    if (action === 'brainstorm') {
      if (!topic) {
        return Response.json({ error: 'topic is required for brainstorm' }, { status: 400 });
      }

      // 関連する既存の問い・論文を検索（キーワードマッチ）
      const allQuestions = await base44.asServiceRole.entities.Question.list();
      const allSeeds = await base44.asServiceRole.entities.SeedRecord.list();
      const allLyrics = await base44.asServiceRole.entities.ArtistLyric.list();

      // 簡易キーワードマッチ
      const topicLower = topic.toLowerCase();
      const relatedQuestions = allQuestions.filter(q =>
        q.text && q.text.toLowerCase().includes(topicLower.split(' ')[0])
      ).slice(0, 3);

      const relatedSeeds = allSeeds.filter(s =>
        (s.title + ' ' + (s.abstract || '') + ' ' + (s.keywords || []).join(' '))
          .toLowerCase().includes(topicLower.split(' ')[0])
      ).slice(0, 2);

      const contextParts = [];
      if (relatedQuestions.length > 0) {
        contextParts.push('【関連する既存の問い】\n' + relatedQuestions.map(q => `- ${q.text}`).join('\n'));
      }
      if (relatedSeeds.length > 0) {
        contextParts.push('【関連論文】\n' + relatedSeeds.map(s => `- ${s.title}: ${(s.abstract || '').slice(0, 300)}`).join('\n'));
      }

      const prompt = `あなたは創造的なブレストパートナーです。
以下のテーマについて、実務で使えるブレストを行ってください。

【テーマ】
${topic}

【業界・文脈】
${industry || '指定なし'}

${contextParts.length > 0 ? '【参考情報（ECHO内の既存データ）】\n' + contextParts.join('\n\n') : ''}

以下の構成で出力してください（日本語、800〜1200文字）:

## テーマの解像度を上げる
（このテーマの本質は何か？表の問題と裏の問題を分ける）

## 3つの切り口
（異なる角度から3つのアプローチを提案。それぞれに「方向性」と「具体例」を）

## 組み合わせ案
（上記の切り口を掛け合わせた複合アイデアを1つ）

## 次のアクション
（今日・今週・今月でやるべきこと）

## ECHOからの問い
（このブレストから派生する、さらに深い問いを1つ提示）`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85,
        max_tokens: 1500,
      });

      const brainstormResult = completion.choices[0].message.content || '';

      // ブレスト結果から新しい問いを抽出して保存
      const questionExtractPrompt = `以下のブレスト結果から、最も重要な問いを1つ抽出してください。JSON形式で返してください:
{"text": "問いの本文", "industry": "カテゴリ", "insight": "なぜ重要かの一言"}

ブレスト結果:
${brainstormResult}`;

      const qCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: questionExtractPrompt }],
        max_tokens: 200,
      });

      try {
        const raw = qCompletion.choices[0].message.content || '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const newQ = JSON.parse(jsonMatch[0]);
          await base44.asServiceRole.entities.Question.create({
            text: newQ.text,
            type: 'question',
            status: 'open',
            industry: newQ.industry || '仕事とビジネス',
            insight: newQ.insight || null,
            source_doi: null,
            source_title: `Brainstorm: ${topic}`,
            depth: 1,
            tags: ['brainstorm'],
          });
        }
      } catch {}

      return Response.json({
        action: 'brainstorm',
        topic,
        result: brainstormResult,
      });
    }

    // ============================================
    // ACTION: list — 全問いの一覧取得
    // ============================================
    if (action === 'list') {
      const questions = await base44.asServiceRole.entities.Question.list();
      const seeds = await base44.asServiceRole.entities.SeedRecord.list();

      const openQs = questions.filter(q => q.status === 'open');
      const answeredQs = questions.filter(q => q.status === 'answered');

      return Response.json({
        action: 'list',
        seeds: seeds.map(s => ({ id: s.id, title: s.title, doi: s.doi, keywords: s.keywords })),
        open_questions: openQs.map(q => ({ id: q.id, text: q.text, industry: q.industry, insight: q.insight, source_title: q.source_title })),
        answered_questions: answeredQs.map(q => ({ id: q.id, text: q.text, industry: q.industry, answer: q.answer?.slice(0, 200), source_title: q.source_title })),
        stats: {
          total: questions.length,
          open: openQs.length,
          answered: answeredQs.length,
          seeds: seeds.length,
        },
      });
    }

    return Response.json({ error: 'Unknown action. Use: requestion, solve, brainstorm, list' }, { status: 400 });

  } catch (error) {
    console.error('ideaSynthetix error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
