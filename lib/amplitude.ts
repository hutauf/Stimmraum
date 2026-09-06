/** RMS level in dBFS. A fixed scale keeps silence flat instead of auto-amplifying it. */
export function microphoneLevel(samples:Float32Array){
  if(!samples.length)return {db:-100,level:0};
  let mean=0;for(const sample of samples)mean+=sample;mean/=samples.length;
  let energy=0;for(const sample of samples)energy+=(sample-mean)**2;
  const rms=Math.sqrt(energy/samples.length);
  const db=Math.max(-100,20*Math.log10(Math.max(rms,0.00001)));
  return {db,level:Math.max(0,Math.min(1,(db+60)/60))};
}
