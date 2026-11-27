const assert=require('node:assert/strict');const lab=require('../pump-lab-engine.js');
const result=lab.mechanics();
for(const r of result.runs){assert(r.valid);assert(r.peakForce>0);assert(r.damperLoss>=0);assert(Math.abs(r.positiveWork-r.returnedWork-r.signedWork)<1e-12);for(const point of r.rows){assert(Math.abs(point.referenceVolumeFromGeometry-point.referenceVolume)<1e-10);assert(Math.abs(point.mechanicalPower-point.wallPower-point.damperPower-r.axes*r.mechanicalParameters.stiffness*point.displacement*point.speed)<1e-12);}}
assert.equal(result.runs[0].meanFlow,result.runs[1].meanFlow);
assert.equal(result.runs[0].peakPressure,result.runs[1].peakPressure);
assert(result.runs[0].peakDisplacement>result.runs[1].peakDisplacement);
const fine=lab.mechanics({dt:.001}),finer=lab.mechanics({dt:.0005});
for(let i=0;i<2;i++){assert(Math.abs(fine.runs[i].meanPositivePower-result.runs[i].meanPositivePower)<1e-6);assert(Math.abs(finer.runs[i].meanPositivePower-fine.runs[i].meanPositivePower)<1e-6);assert(Math.abs(fine.runs[i].balanceResidual)<=Math.abs(result.runs[i].balanceResidual)+1e-10);}
const lossless=lab.mechanics({}, {stiffness:0,damping:0});assert(Math.abs(lossless.runs[0].signedWork-lossless.runs[1].signedWork)<1e-12);assert(Math.abs(lossless.runs[0].meanPositivePower-lossless.runs[1].meanPositivePower)<1e-12);
const zero=lab.mechanics({amplitude:0});for(const r of zero.runs){assert.equal(r.peakForce,0);assert.equal(r.meanPositivePower,0);assert.equal(r.outputWork,0);}
const stiff=lab.mechanics({}, {stiffness:200,damping:.5});assert(stiff.runs[0].peakForce>result.runs[0].peakForce);
const damped=lab.mechanics({}, {stiffness:100,damping:1});for(let i=0;i<2;i++)assert(Math.abs(damped.runs[i].damperLoss-2*result.runs[i].damperLoss)<1e-12);
for(const p of [{stiffness:-1},{damping:NaN},{stiffness:'100'}])assert.throws(()=>lab.mechanics({},p));
for(const p of [{frequency:2,amplitude:.3,volume:50,compliance:.25,resistance:.5,backpressure:3},{frequency:.5,amplitude:.3,volume:50,compliance:3,resistance:5}]){const r=lab.mechanics(p,{stiffness:1000,damping:10});for(const run of r.runs)assert(Number.isFinite(run.balanceResidual));}
console.log(JSON.stringify(result.runs.map(({axes,meanFlow,peakForce,peakDisplacement,meanPositivePower,damperLoss,balanceResidual})=>({axes,meanFlow,peakForce,peakDisplacement,meanPositivePower,damperLoss,balanceResidual})),null,2));
console.log('PASS: matched volume/flow, force-power identity, energy balance, timestep refinement, zero drive, lossless invariance and mechanical parameter checks');
// Independent analytic viscous work for one-axis sinusoidal displacement over two periods.
const p=result.parameters,m=result.mechanicalParameters,L=Math.cbrt(p.volume*1e-6),A=1-(1-p.amplitude)**3;
const expectedLoss=m.damping*L*L*A*A*Math.PI*Math.PI*p.frequency;
assert(Math.abs(result.runs[0].damperLoss-expectedLoss)<1e-12);
console.log('PASS: one-axis damper loss agrees with analytic two-cycle integral');
