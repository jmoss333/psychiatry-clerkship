// Faculty workflow hints, not a clinical risk score or evidence of consistency.
// Match quoted teaching only: a source title or question stem alone is not a safety flag.
const SAFETY_TERMS = /\b(?:suicid(?:e|al|ality)|self[- ]harm|overdos(?:e|ing)|respiratory depression|agranulocytosis|neutropenia|neuroleptic malignant syndrome|serotonin syndrome|withdrawal|delirium|contraindicat(?:ed|ion|ions))\b/gi;
export function reviewPriority(packet){
 const candidates=packet.candidates||[],readings=packet.readings||[],targets=packet.targets||[];
 const counts={questions:new Set(candidates.map(c=>c.questionId).filter(Boolean)).size,readings:new Set(readings.map(r=>r.source).filter(Boolean)).size};
 const reasons=[],coverage=packet.coverage||{};
 const incomplete=packet.scanStatus!=='complete'||packet.mappingStatus==='unavailable'||
  !Number.isInteger(coverage.active)||coverage.active<=0||coverage.scanned!==coverage.active||
  !Array.isArray(coverage.errors)||coverage.errors.length>0;
 const stale=candidates.some(c=>{const t=targets.find(t=>t.itemKey==='question:'+c.questionId);return t&&(!t.revision||t.revision!==c.itemRevision);})||
  readings.some(r=>{const t=targets.find(t=>t.itemKey==='reading:'+r.source);return t&&(!t.revision||t.revision!==r.revision);});
 if(incomplete)reasons.push('Scan or mapping incomplete; coverage needs checking.');
 if(stale)reasons.push('Teaching changed or was removed after the scan; recheck current wording.');
 const contradictions=candidates.filter(c=>c.kind==='possible-contradiction');
 const matches=[...new Set(contradictions.flatMap(c=>String(c.quote||'').match(SAFETY_TERMS)||[]).map(s=>s.toLowerCase()))].sort();
 if(matches.length)reasons.push('Possible contradiction with safety-related wording: '+matches.join(', ')+'.');
 else if(contradictions.length)reasons.push('Possible contradiction in teaching; clinical context needs review.');
 else reasons.push('Related source change; no contradiction was detected by the heuristic.');
 const observed=Date.parse(packet.observedAt);
 if(!Number.isFinite(observed))reasons.push('Observation date unavailable.');
 const history=['resolved','superseded'].includes(packet.status);
 const rank=history?4:incomplete||stale?0:matches.length?1:contradictions.length?2:3;
 const label=['Check evidence completeness','Review first: safety wording','Review possible contradiction','Review related teaching','Review history'][rank];
 return {rank,label,reasons,counts,observed:Number.isFinite(observed)?observed:Number.NEGATIVE_INFINITY};
}
export function orderPackets(packets){
 return packets.map(packet=>({packet,priority:reviewPriority(packet)})).sort((a,b)=>
  a.priority.rank-b.priority.rank||
  (b.priority.counts.questions+b.priority.counts.readings)-(a.priority.counts.questions+a.priority.counts.readings)||
  (a.priority.observed===b.priority.observed?0:a.priority.observed<b.priority.observed?-1:1)||
  String(a.packet.revision).localeCompare(String(b.packet.revision))
 ).map(({packet})=>packet);
}
