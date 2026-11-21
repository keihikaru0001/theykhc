const assert=require('node:assert/strict');
const lab=require('../pump-lab-engine.js');
const runs=lab.compare();
for(const r of runs){assert(r.valid);assert(Math.abs(r.massResidual)<1e-5);}
assert(Math.abs(runs[0].meanFlow-.05664)<.0001);
assert(Math.abs(runs[1].meanFlow-.31706)<.0001);
assert(Math.abs(runs[2].meanFlow-.31684)<.0001);
assert.equal(runs[4].meanFlow,0);
assert(runs[3].meanFlow<0,'Absent valves permit backflow under adverse pressure');
assert(Math.abs(runs[1].stroke-runs[2].stroke)<1e-12);
const fine=lab.simulate({dt:.001});assert(Math.abs(fine.meanFlow-runs[1].meanFlow)<.0001);
const finer=lab.simulate({dt:.0005});assert(Math.abs(finer.meanFlow-fine.meanFlow)<.0001);
const zero=lab.compare({amplitude:0});for(const r of zero.filter(x=>x.valves))assert.equal(r.meanFlow,0);
for(const p of [{resistance:0},{frequency:NaN},{volume:'20'},{amplitude:.9}])assert.throws(()=>lab.simulate(p));
// Exercise slow relaxation and fast/high-amplitude corners without assuming periodic steady state.
for(const p of [{compliance:3,resistance:5,frequency:2,amplitude:.3},{compliance:.25,resistance:.5,frequency:.5,backpressure:3}]){
const r=lab.simulate(p);assert(Number.isFinite(r.meanFlow));assert(r.rows.length>0);assert(Math.abs(r.massResidual)<.001);
}
console.log(JSON.stringify(runs.map(({name,meanFlow,stroke,massResidual,cycleFlowDifference})=>({name,meanFlow,stroke,massResidual,cycleFlowDifference})),null,2));
console.log('PASS: reference, conservation, reverse flow, zero drive, refinement, validation and parameter corners');
