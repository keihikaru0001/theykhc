/* TheYKHC pump laboratory 0.1.0. Illustrative lumped model; not a clinical model. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PumpLab=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const version='0.1.0';
const defaults={volume:20,compliance:1,resistance:2,backpressure:1,frequency:1,amplitude:.1,cycles:12,dt:.002};
const bounds={volume:[5,50],compliance:[.25,3],resistance:[.5,5],backpressure:[0,3],frequency:[.5,2],amplitude:[0,.3],cycles:[12,12],dt:[.00025,.002]};
function parameters(input={}){const p={...defaults};for(const k of Object.keys(bounds)){if(input[k]!==undefined)p[k]=input[k];const [a,b]=bounds[k];if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<a||p[k]>b)throw Error('条件の範囲外: '+k);}return p;}
function drive(t,p,axes,amp){const w=2*Math.PI*p.frequency,s=(1-Math.cos(w*t))/2,ds=w*Math.sin(w*t)/2,b=1-amp*s;return [p.volume*Math.pow(b,axes),-p.volume*axes*amp*Math.pow(b,axes-1)*ds];}
function simulate(input={},options={}){
const p=parameters(input),axes=options.axes??3,amp=options.amplitude??p.amplitude,valves=options.valves!==false;
if(![1,3].includes(axes)||!Number.isFinite(amp)||amp<0||amp>=1)throw Error('無効な軸または短縮率');
const T=1/p.frequency,end=p.cycles*T,N=Math.ceil(end/p.dt),h=end/N,start=(p.cycles-2)*T;
let y=[0,0,0],rows=[],peak=-Infinity,minvol=Infinity,peakFlow=-Infinity,window=null,previousCycle=null;
const flow=pressure=>{const qi=-pressure/p.resistance,qo=(pressure-p.backpressure)/p.resistance;return valves?[Math.max(qi,0),Math.max(qo,0)]:[qi,qo];};
const derivative=(t,z)=>{const [qi,qo]=flow(z[0]);return [(qi-qo-drive(t,p,axes,amp)[1])/p.compliance,qi,qo];};
const add=(a,b,s)=>a.map((x,i)=>x+s*b[i]);
function record(t){const [qi,qo]=flow(y[0]),rest=drive(t,p,axes,amp)[0],v=rest+p.compliance*y[0];minvol=Math.min(minvol,v);if(t>=start-1e-9){peak=Math.max(peak,y[0]);peakFlow=Math.max(peakFlow,qo);rows.push({t,pressure:y[0],volume:v,inlet:qi,outlet:qo,referenceVolume:rest});}}
record(0);
for(let j=0;j<N;j++){
const t=j*h,k1=derivative(t,y),k2=derivative(t+h/2,add(y,k1,h/2)),k3=derivative(t+h/2,add(y,k2,h/2)),k4=derivative(t+h,add(y,k3,h));
y=y.map((x,i)=>x+h*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);
const nt=(j+1)*h;
// N is selected as a multiple of cycles below only approximately; interpolate cumulative states at window boundaries.
if(!window&&nt>=start){const fraction=(nt-start)/h;const prev=y.map((x,i)=>x-h*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);const z=y.map((x,i)=>x-fraction*(x-prev[i]));window={t:start,y:z,v:drive(start,p,axes,amp)[0]+p.compliance*z[0]};}
const cp=(p.cycles-1)*T;if(!previousCycle&&nt>=cp){const fraction=(nt-cp)/h;const prev=y.map((x,i)=>x-h*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);previousCycle=y.map((x,i)=>x-fraction*(x-prev[i]));}
record(nt);
}
const finalVolume=drive(end,p,axes,amp)[0]+p.compliance*y[0],qin=y[1]-window.y[1],qout=y[2]-window.y[2],residual=qin-qout-(finalVolume-window.v),last=qout-(previousCycle[2]-window.y[2]),prior=previousCycle[2]-window.y[2];
return {modelVersion:version,parameters:p,axes,amplitude:amp,valves,stroke:p.volume*(1-Math.pow(1-amp,axes)),meanFlow:qout/(2*T),peakPressure:peak,peakFlow,minVolume:minvol,massResidual:residual,cycleFlowDifference:Math.abs(last-prior)/T,rows,valid:minvol>0&&Number.isFinite(peak)&&Math.abs(residual)<.001,actualStep:h};
}
function compare(input={}){const p=parameters(input),equal=1-Math.pow(1-p.amplitude,3);return [
['一軸・指定短縮率',{axes:1}],['三軸・指定短縮率',{axes:3}],['一軸・同じ幾何ストローク',{axes:1,amplitude:equal}],['三軸・逆止弁なし',{axes:3,valves:false}],['駆動なし',{axes:1,amplitude:0}]
].map(([name,options])=>({name,...simulate(p,options)}));}
return {version,defaults,bounds,parameters,drive,simulate,compare};
});
