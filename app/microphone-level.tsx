'use client';
import {useEffect,useState} from 'react';
import {microphoneLevel} from '@/lib/amplitude';
export default function MicrophoneLevel({analyser,track,paused}:{analyser:AnalyserNode|null;track:MediaStreamTrack|null;paused:boolean}){
  const [history,setHistory]=useState<number[]>(Array(48).fill(0));
  const [db,setDb]=useState(-100);const [silent,setSilent]=useState(false);const [muted,setMuted]=useState(false);
  useEffect(()=>{setHistory(Array(48).fill(0));setSilent(false);if(!analyser||paused)return;
    const samples=new Float32Array(analyser.fftSize);let quietSince=performance.now();
    const timer=setInterval(()=>{const unavailable=!track||track.muted||!track.enabled||track.readyState==='ended';
      analyser.getFloatTimeDomainData(samples);const reading=unavailable?{db:-100,level:0}:microphoneLevel(samples);
      setDb(reading.db);setMuted(unavailable);if(reading.db>-55)quietSince=performance.now();
      setSilent(performance.now()-quietSince>3000);setHistory(values=>[...values.slice(1),reading.level]);
    },65);return()=>clearInterval(timer);
  },[analyser,track,paused]);
  const status=paused?'Pegelanzeige pausiert':!analyser?'Mikrofonpegel nicht verfügbar':muted?'Mikrofon liefert kein Signal – bitte Stummschaltung prüfen.':silent?'Sehr leise oder kein Signal – bitte Mikrofon prüfen.':'Mikrofonpegel';
  return <div className="level-display"><div className="waveform" role="img" aria-label={status}>{history.map((level,i)=><i key={i} style={{height:Math.max(2,level*49)+'px',opacity:level?1:.35}}/>)}</div><div className={'level-caption '+(!paused&&(silent||muted)?'level-warning':'')}><span role="status">{status}</span>{!paused&&analyser&&<span aria-hidden="true">{db<=-90?'−∞':Math.round(db)} dBFS</span>}</div></div>;
}
