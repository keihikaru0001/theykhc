import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import OpenAI from 'npm:openai@4.28.0';

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
const URGENT = ['死にたい','自殺','消えたい','殺して','今すぐ死','命を絶つ','飛び降り'];
const CONCERN = ['生きる意味がない','もう限界','誰にも言えない','絶望','いなくなりたい'];

function signals(text: string) {
  const urgent = URGENT.filter(x => text.includes(x));
  const concern = CONCERN.filter(x => text.includes(x));
  return { level: urgent.length ? 'urgent' : concern.length ? 'concern' : 'none', matched: [...urgent, ...concern] };
}
function score(p: any, words: string[]) {
  const hay = [p.section,p.summary,p.passage_text,...(p.keywords||[])].join(' ').toLowerCase();
  return words.reduce((n,w)=>n+(hay.includes(w)?1:0),0);
}
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { message, fan_profile_id } = await req.json();
    if (!message?.trim()) return Response.json({ error: 'message is required' }, { status: 400 });

    const risk = signals(message);
    if (risk.level === 'urgent') {
      const saved = await base44.asServiceRole.entities.FanRequest.create({
        fan_id: fan_profile_id || user.id, artist_id: 'ECHO-MORALOGY', input: message,
        output: '今は思想的な答えを探すより、あなたの安全を最優先にします。ひとりにならず、近くの信頼できる人へ今の状態を伝えてください。差し迫った危険がある場合は119または110へ連絡してください。厚生労働省「まもろうよ こころ」の相談窓口も利用できます。',
        detected_emotion: '緊急', context_summary: '安全対応', hikari_earned: 0
      });
      await base44.asServiceRole.entities.SafetyEvent.create({
        user_id:user.id, request_id:saved.id, risk_level:'urgent', matched_signals:risk.matched,
        action_taken:'AI助言を停止し、緊急・公的相談先と身近な人への接続を案内', human_followup_required:true
      });
      return Response.json({ response:saved.output, risk_level:'urgent', citations:[{title:'まもろうよ こころ',author:'厚生労働省',source_url:'https://www.mhlw.go.jp/mamorouyokokoro/'}] });
    }

    const docs = (await base44.asServiceRole.entities.MoralogyDocument.list())
      .filter((d:any)=>d.is_active && d.rights_status==='cleared');
    const passages = await base44.asServiceRole.entities.MoralogyPassage.list();
    const docMap = new Map(docs.map((d:any)=>[d.id,d]));
    const words = message.toLowerCase().split(/[\s、。！？,.!?]+/).filter((x:string)=>x.length>1);
    const selected = passages.filter((p:any)=>docMap.has(p.document_id))
      .map((p:any)=>({p,s:score(p,words)})).sort((a:any,b:any)=>b.s-a.s).slice(0,5).map((x:any)=>x.p);

    const evidence = selected.map((p:any,i:number)=>{
      const d:any=docMap.get(p.document_id);
      return `[${i+1}] ${d.title}／${d.author}／${p.source_locator}\n要約:${p.summary||''}\n本文:${p.passage_text.slice(0,700)}`;
    }).join('\n\n');

    const prompt = `あなたはECHO（Emotional Compass & Human Orientation）。医師・心理士・宗教的権威ではない。
目的は悩みを断定的に解決することではなく、利用者が自分の答えと次の一歩を見つけるのを支えること。
以下の資料だけをモラロジー上の根拠として使用する。資料にない教説を創作しない。
回答構造: 1共感 2資料に基づく一つの視点 3内省の問い 4今日できる小さな行動 5参照番号。
原文・片山佳光の解釈・AIの提案を混同しない。診断、治療、服薬、投資判断をしない。
相談: ${message}
資料:
${evidence || '利用可能な権利確認済み資料なし。モラロジーの教説を断定せず、一般的な内省支援のみ行う。'}`;

    const completion = await openai.chat.completions.create({model:'gpt-4o',messages:[{role:'system',content:prompt}],temperature:0.35,max_tokens:800});
    const response = completion.choices[0].message.content?.trim() || '';
    const saved = await base44.asServiceRole.entities.FanRequest.create({
      fan_id:fan_profile_id||user.id,artist_id:'ECHO-MORALOGY',input:message,output:response,
      detected_emotion:risk.level==='concern'?'要注意':'内省',context_summary:'モラロジー出典付き対話',hikari_earned:0
    });
    const citations=[];
    for (const p of selected) {
      const d:any=docMap.get(p.document_id);
      const c=await base44.asServiceRole.entities.CounselingCitation.create({
        request_id:saved.id,document_id:d.id,passage_id:p.id,title:d.title,author:d.author,
        source_locator:p.source_locator,source_url:d.source_url||'',use_type:'paraphrase'
      });
      citations.push(c);
    }
    if(risk.level==='concern') await base44.asServiceRole.entities.SafetyEvent.create({
      user_id:user.id,request_id:saved.id,risk_level:'concern',matched_signals:risk.matched,
      action_taken:'穏やかな応答と身近な支援者への相談を促す',human_followup_required:true
    });
    return Response.json({response,risk_level:risk.level,citations});
  } catch (error) {
    return Response.json({error:error?.message||'Internal error'},{status:500});
  }
});