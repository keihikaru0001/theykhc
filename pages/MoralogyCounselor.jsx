import { useState } from "react";
import { echoCounselor } from "../api/backendFunctions";

export default function MoralogyCounselor() {
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const send=async()=>{
    const text=input.trim(); if(!text||loading)return;
    setInput(""); setMessages(x=>[...x,{role:"user",text}]); setLoading(true);
    try{
      const r=await echoCounselor({message:text});
      setMessages(x=>[...x,{role:"echo",text:r.response,citations:r.citations||[],risk:r.risk_level}]);
    }catch{
      setMessages(x=>[...x,{role:"echo",text:"接続できませんでした。時間をおいて、もう一度お話しください。",citations:[]}]);
    }finally{setLoading(false)}
  };
  return <main style={{maxWidth:760,margin:"0 auto",padding:24,fontFamily:"'Hiragino Sans','Yu Gothic',sans-serif"}}>
    <h1>ECHO — モラロジー対話</h1>
    <p style={{color:"#666"}}>診断や治療ではなく、出典を示しながら内省と次の一歩を支えます。</p>
    <section aria-live="polite">
      {messages.map((m,i)=><article key={i} style={{margin:"18px 0",padding:16,borderRadius:12,background:m.role==="user"?"#f3f4f6":"#f8f5ff"}}>
        <strong>{m.role==="user"?"あなた":"ECHO"}</strong>
        <div style={{whiteSpace:"pre-wrap",marginTop:8}}>{m.text}</div>
        {m.citations?.length>0&&<details style={{marginTop:12}}><summary>参照資料</summary><ul>{m.citations.map((c,j)=><li key={j}>{c.title} — {c.author}（{c.source_locator}）</li>)}</ul></details>}
      </article>)}
    </section>
    <textarea value={input} onChange={e=>setInput(e.target.value)} rows={5} placeholder="今、考えていることを話してください" style={{width:"100%",padding:12}}/>
    <button onClick={send} disabled={loading} style={{marginTop:8,padding:"10px 20px"}}>{loading?"考えています…":"ECHOに話す"}</button>
    <p style={{fontSize:12,color:"#777",marginTop:20}}>差し迫った危険がある場合は、AIではなく119・110、身近な人、専門相談窓口へ連絡してください。</p>
  </main>
}