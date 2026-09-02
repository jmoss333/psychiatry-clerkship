# RESIDENT · Curriculum content — volume 5

Pages appear in sidebar order. Each page carries its `topic_meta.json` overlay (the TL;DR, key points, can't-miss line, rule-outs, first move, embedded quiz and workflow narration the SPA renders around the prose) followed by the page text exactly as shipped. Tools carry their registry metadata and their authored clinical strings.

# SECTION (cont.): Assess Safety and Acuity

---

## Agitation Ladder — PRN Trainer

- **Slug:** `rp-agitation.html` · **Type:** tool · **Sidebar:** listed
- **Source:** `_prototypes/agitation-trainer/rp-agitation.html`
- **Governance:** status=`pending` · riskKind=`local-policy` · riskLevel=`high`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- Agitation Ladder — PRN Decision Trainer Pending faculty review Local Policy · High risk This tool includes institution-specific teaching that has not completed faculty attestation. Verify current institutional policy or workflow before acting.
- Draft resident tool: some institution-specific fields still show placeholder text pending faculty completion and review.
- Skip to content ◐ Teaching trainer — not clinical decision support and it does not generate orders. In a real emergency, call your senior/attending and follow local protocol.

**Authored clinical strings (78):**

- t a Netlify // success, cb(false) fires and the entry stays unsent in rp_flags; flushFlags() retries // unsent entries sequentially on the next tool load and stops at the first failure, so the // queue drains in order once connectivity returns rather than reordering or dropping flags. function flagSend(entry,cb){ if(typeof fetch!==
- ){if(cb)cb(false);return;} try{ var body=
- +encodeURIComponent((typeof location!==
- },body:body}) .then(function(r){if(cb)cb(!!r&&(r.status===200||r.ok||r.status===303));}) .catch(function(){if(cb)cb(false);}); }catch(err){if(cb)cb(false);} } function markFlagSent(at){ try{ var arr=JSON.parse(localStorage.getItem(LS.flags)||
- ); var changed=false; for(var i=0;i<arr.length;i++){if(arr[i]&&arr[i].at===at&&!arr[i].sent){arr[i].sent=true;changed=true;break;}} if(changed)localStorage.setItem(LS.flags,JSON.stringify(arr)); }catch(err){} } // Flushes unsent rp_flags entries (this tool
- s — they share one key) // sequentially, stopping at the first failure so later entries stay queued for next load. function flushFlags(){ try{ var arr=JSON.parse(localStorage.getItem(LS.flags)||
- ); if(!Array.isArray(arr))return; var pending=arr.filter(function(x){return x&&!x.sent;}); var i=0; (function step(){ if(i>=pending.length)return; flagSend(pending[i],function(ok){ if(!ok)return; markFlagSent(pending[i].at); i++;step(); }); })(); }catch(err){} } function LocalChip(props){var tok=props.token;if(!tok)return null;var set=tok.value!==null&&tok.value!==undefined; return e(
- )));} function FlagButton(props){ function onFlag(){var reason=window.prompt(
- );if(reason===null)return; var entry={tool:
- ,reason:reason,at:new Date().toISOString()}; try{var a=JSON.parse(localStorage.getItem(LS.flags)||
- );a.push(entry);localStorage.setItem(LS.flags,JSON.stringify(a));}catch(e){} flagSend(entry,function(ok){if(ok)markFlagSent(entry.at);}); // fire-and-forget; local save above already happened regardless of network if(FACULTY_FEEDBACK_EMAIL){var s=encodeURIComponent(
- );var b=encodeURIComponent(
- ); } function tokenById(pack,id){var a=(pack.localPolicies||[]).filter(function(t){return t.id===id;});return a[0]||null;} var ALWAYS_SHOW=[
- ]; function pharmVerdict(choice,scenario){ var ctx=[scenario.trueEtiology].concat(scenario.populationFlags||[]);var haz=[],caut=[]; if(choice.hazardIf)Object.keys(choice.hazardIf).forEach(function(k){if(ctx.indexOf(k)>=0)haz.push(choice.hazardIf[k]);}); if(choice.cautionIf)Object.keys(choice.cautionIf).forEach(function(k){if(ctx.indexOf(k)>=0||ALWAYS_SHOW.indexOf(k)>=0)caut.push(choice.cautionIf[k]);}); var level=haz.length?
- );var notes=haz.concat(caut); if(!notes.length){if(choice.id===
- ];} return {level:level,notes:notes,hard:haz.length>0}; } function LadderRail(props){ var cur=props.rung||0; return e(
- ), LADDER.slice().reverse().map(function(x){ var cls=
- ,{className:cls,key:x.r}, e(
- )); } function Pills(props){var cur=props.rung||0; return e(
- }, LADDER.map(function(x){ return e(
- +x.t);})); } function App(){ var s0=useState(
- ),phase=s0[0],setPhase=s0[1]; var sp=useState(null),pack=sp[0],setPack=sp[1]; var sm=useState((function(){try{return localStorage.getItem(LS.mode)||
- ;}})()),mode=sm[0],setMode=sm[1]; var ss=useState(null),scenario=ss[0],setScenario=ss[1]; var si=useState(0),step=si[0],setStep=si[1]; var sc=useState({}),choices=sc[0],setChoices=sc[1]; var sn=useState(false),nudge=sn[0],setNudge=sn[1]; useEffect(function(){ fetch(
- }).then(function(r){if(!r.ok)throw new Error(r.status);return r.json();}) .then(function(d){setPack(d);setPhase(
- );}); },[]); useEffect(function(){flushFlags();},[]); // drain any rp_flags entries left unsent from a previous offline session useEffect(function(){document.getElementById(
- ).onclick=function(){var c=document.documentElement.getAttribute(
- ,c);}catch(e){}};},[]); useEffect(function(){ function onKey(ev){if(phase!==
- ||!scenario)return;var n=parseInt(ev.key,10);if(isNaN(n)||n o.length)return;pick(o[n-1]);} document.addEventListener(
- ,onKey);return function(){document.removeEventListener(
- ,onKey);}; }); function setModeP(m){setMode(m);try{localStorage.setItem(LS.mode,m);}catch(e){}} function startPlay(){var list=pack.content.scenarios;var scn=mode===
- ?list[Math.floor(Math.random()*list.length)]:list[0]; setScenario(scn);setChoices({etiology:null,nonpharm:[],pharm:null,monitoring:[]});setStep(0);setNudge(false);setPhase(
- );} function pickScenario(scn){setScenario(scn);setChoices({etiology:null,nonpharm:[],pharm:null,monitoring:[]});setStep(0);setNudge(false);setPhase(
- ]; function currentOptions(){var b=pack.choiceBanks;return step===0?b.etiology:step===1?b.nonpharm:step===2?b.pharmApproach:b.monitoring;} function currentRung(){ var ids=[].concat(choices.nonpharm||[]);if(choices.pharm)ids.push(choices.pharm); var mx=0;ids.forEach(function(id){if(RUNG[id]!==undefined&&RUNG[id]>mx)mx=RUNG[id];});return mx; } function pick(opt){setNudge(false);var c=Object.assign({},choices); if(step===0)c.etiology=opt.id; else if(step===1){var a=c.nonpharm.slice();var i=a.indexOf(opt.id);if(i>=0)a.splice(i,1);else a.push(opt.id);c.nonpharm=a;} else if(step===2)c.pharm=opt.id; else{var m=c.monitoring.slice();var j=m.indexOf(opt.id);if(j>=0)m.splice(j,1);else m.push(opt.id);c.monitoring=m;} setChoices(c);} function pickSenior(){setNudge(false);var c=Object.assign({},choices);if(step===0)c.etiology=
- ;else if(step===2)c.pharm=
- ;setChoices(c);} /* Step gates teach the ladder, not just "picked something": the non-pharm step must INCLUDE verbal de-escalation (the ladder
- Include verbal de-escalation — the ladder starts there.
- Address de-escalation before pharmacologic options.
- Select the monitoring you would order before finishing.
- Call your senior / attending — never the wrong move
- Calling for help is never wrong
- Good instinct — escalate early. While help is on the way, keep gathering the driver so your senior arrives to a clear picture.
- Consistent with the discriminating features
- A safe, non-penalized stance
- Worth re-weighing the discriminators
- When data are insufficient, working it up and using least-harm measures is appropriate.
- Key features pointing to the likely driver:
- Escalating is always appropriate
- Reaching your senior/attending — especially when unsure or when danger is escalating — is always a correct move.
- This is a stereotyped, high-harm error — make sure you can articulate why before proceeding.
- Could not load the content pack. Refresh to retry, or review the Agitation topic page.
- Acute & Safety · Teaching trainer
- Agitation Ladder — PRN Decision Trainer
- Educational tool for MMC psychiatry residents. It teaches the
- and hazard-avoidance — not what to order. Agents, doses, routes, and monitoring are
- local-policy placeholders
- . Fictional composites — no PHI.
- Learn the ladder: the five rungs of least-restrictive management with the local-policy overlays that stay unverified until attested.
- Challenge mode picks a random scenario and holds feedback until the decision trace.
- Guided mode walks one scenario with feedback at each step, tracking your position on the least-restrictive ladder.
- v0.2.0 · Draft — pending faculty review
- Project BETA sequencing: safety and verbal de-escalation first (≈5–10 min), oral before parenteral, agent choice driven by etiology and special populations. Climb the ladder only as far as the situation requires. Every specific agent/dose/route/interval is a local-policy placeholder.
- B · Non-pharmacologic first
- C · Pharmacologic approach (class-level)
- D · Monitoring & reassessment
- The same class (a benzodiazepine) is a hazard in non-withdrawal delirium but first-line in alcohol/sedative withdrawal — which is why etiology comes first.
- Escalating when unsure is always safe.
- Matched the discriminating features.
- Safe stance when data are insufficient.
- De-escalation-first sequencing (Project BETA).
- Escalation is always an acceptable move.
- Post-sedation monitoring selected.
- Always monitor after sedating an agitated patient.
- none — managed without escalating
- . Aim for the lowest rung that keeps everyone safe.
- Include verbal de-escalation (Project BETA) — the least-restrictive ladder starts there.
- Address de-escalation / a non-pharmacologic step before moving to medications.
- Choose the monitoring you would order — a PRN without monitoring is the classic miss.
- Make a selection to continue.

**Content pack (`rp-agitation.pack.json`) — the tool's authored clinical script:**

```json
{
 "schemaVersion": "1.0",
 "tool": "agitation-trainer",
 "version": "0.1.0",
 "built": "2026-07-02",
 "evidenceThrough": "2026-06-30",
 "reviewCadenceDays": 180,
 "status": "draft-pending-attestation",
 "_incorporationChecklist": {
  "source": "OpenEvidence — 'Acute Agitation in Adult Inpatient and Emergency Psychiatry: Comprehensive Evidence Review' + 'QTc Prolongation Risk with Psychotropic Medications' (staging, ~2026-06)",
  "claimExtraction": "Class-level reasoning, etiology discriminators, and contraindication/hazard logic only. Dose/route/agent-selection intentionally NOT copied — routed to LOCAL_POLICY tokens.",
  "facultyReview": "PENDING — do not add to reviewed.json until Joshua Moss, MD attests. Ships watermarked 'Draft — pending faculty review'.",
  "noPhi": "All scenarios are fictional composites. No patient-identifiable data.",
  "publishTarget": "mmc-resident-deploy/tools/agitation-trainer.html + tools/agitation.pack.json (after attestation)",
  "doseLiteralPolicy": "Pack must contain zero dose literals (regex \\d+\\s?(mg|mcg|mL) returns nothing). Agent names permitted only in teaching/hazard context, never as an order."
 },
 "citations": [
  {
   "id": "richmond2012",
   "ref": "Richmond JS, Berlin JS, Fishkind AB, et al. Verbal De-Escalation of the Agitated Patient: Consensus Statement of the AAEP Project BETA De-Escalation Workgroup. West J Emerg Med. 2012;13(1):17-25.",
   "doi": "10.5811/westjem.2011.9.6864",
   "url": ""
  },
  {
   "id": "wilson2012",
   "ref": "Wilson MP, Pepper D, Currier GW, et al. The Psychopharmacology of Agitation: Consensus Statement of the AAEP Project BETA Psychopharmacology Workgroup. West J Emerg Med. 2012;13(1):26-34.",
   "doi": "",
   "url": ""
  },
  {
   "id": "knox2012",
   "ref": "Knox DK, Holloman GH. Use and Avoidance of Seclusion and Restraint: Consensus Statement of the AAEP Project BETA Seclusion and Restraint Workgroup. West J Emerg Med. 2012;13(1):35-40.",
   "doi": "",
   "url": ""
  },
  {
   "id": "apa2022",
   "ref": "American Psychiatric Association. Resource Document on the Use of Seclusion and Restraint. 2022.",
   "doi": "",
   "url": ""
  },
  {
   "id": "siafis2026",
   "ref": "Siafis S, et al. Comparative effectiveness and safety of pharmacological treatments for rapid tranquillisation: individual participant data network meta-analysis. Lancet Psychiatry. 2026.",
   "doi": "",
   "url": ""
  },
  {
   "id": "ostinelli2017",
   "ref": "Ostinelli EG, et al. Haloperidol for psychosis-induced aggression or agitation (rapid tranquillisation). Cochrane Database Syst Rev. 2017.",
   "doi": "",
   "url": ""
  },
  {
   "id": "zaman2017",
   "ref": "Zaman H, et al. Benzodiazepines for psychosis-induced aggression or agitation. Cochrane Database Syst Rev. 2017.",
   "doi": "",
   "url": ""
  },
  {
   "id": "martel2021",
   "ref": "Martel ML, et al. Randomized double-blind trial of IM droperidol, ziprasidone, and lorazepam for acute agitation. Acad Emerg Med. 2021.",
   "doi": "",
   "url": ""
  },
  {
   "id": "heckers2023",
   "ref": "Heckers S, Walther S. Catatonia. N Engl J Med. 2023.",
   "doi": "",
   "url": ""
  },
  {
   "id": "beers2023",
   "ref": "American Geriatrics Society 2023 Updated AGS Beers Criteria. J Am Geriatr Soc. 2023.",
   "doi": "",
   "url": ""
  },
  {
   "id": "cole2025",
   "ref": "Cole JB, et al. Oral medications for treating agitation in a safety-net emergency department. JAMA Netw Open. 2025.",
   "doi": "",
   "url": ""
  }
 ],
 "localPolicies": [
  {
   "type": "LOCAL_POLICY",
   "id": "agitation.setting_scope",
   "label": "Settings this trainer maps to (BHU / ED / C-L) and any differences",
   "placeholder": "Confirm which units + scope with faculty",
   "value": "Teaching only; confirm setting-specific applicability with the supervising attending and current unit policy.",
   "verifiedBy": "Not locally attested; verify at point of care",
   "verifiedAt": "2026-07-09"
  },
  {
   "type": "LOCAL_POLICY",
   "id": "agitation.deescalation_activation",
   "label": "How/whom to call for help during escalation (team response, security)",
   "placeholder": "Confirm local activation & call tree",
   "value": "Use the current unit escalation process and notify the supervising clinician/security per local policy.",
   "verifiedBy": "Not locally attested; verify at point of care",
   "verifiedAt": "2026-07-09"
  },
  {
   "type": "LOCAL_POLICY",
   "id": "agitation.po_options",
   "label": "Oral-first options per BHU formulary",
   "placeholder": "Confirm local PO formulary options",
   "value": "Use the current EHR order set/formulary and attending direction; this trainer does not specify agents or doses.",
   "verifiedBy": "Not locally attested; verify at point of care",
   "verifiedAt": "2026-07-09"
  },
  {
   "type": "LOCAL_POLICY",
   "id": "agitation.im_options",
   "label": "IM options per BHU formulary (agent/dose/route)",
   "placeholder": "Confirm local IM formulary options",
   "value": "Use the current EHR order set/formulary and attending direction; this trainer does not specify agents, doses, or routes.",
   "verifiedBy": "Not locally attested; verify at point of care",
   "verifiedAt": "2026-07-09"
  },
  {
   "type": "LOCAL_POLICY",
   "id": "agitation.withdrawal_protocol",
   "label": "Alcohol/sedative withdrawal medication protocol",
   "placeholder": "Confirm local withdrawal protocol / order set",
   "value": "Use the current alcohol/sedative withdrawal protocol or order set and supervising clinician direction.",
   "verifiedBy": "Not locally attested; verify at point of care",
   "verifiedAt": "2026-07-09"
  },
  {
   "type": "LOCAL_POLICY",
   "id": "agitation.restraint_policy",
   "label": "Restraint/seclusion policy, authorization, and documentation timeframes",
   "placeholder": "Confirm local restraint/seclusion policy",
   "value": "Follow current restraint/seclusion authorization, monitoring, documentation, and debrief policy.",
   "verifiedBy": "Not locally attested; verify at point of care",
   "verifiedAt": "2026-07-09"
  },
  {
   "type": "LOCAL_POLICY",
   "id": "agitation.monitoring_interval",
   "label": "Post-medication monitoring cadence and parameters",
   "placeholder": "Confirm local post-sedation monitoring policy",
   "value": "Use current post-medication/restraint monitoring policy and nursing workflow.",
   "verifiedBy": "Not locally attested; verify at point of care",
   "verifiedAt": "2026-07-09"
  },
  {
   "type": "LOCAL_POLICY",
   "id": "agitation.qtc_threshold_action",
   "label": "QTc threshold and action (hold/ECG/telemetry)",
   "placeholder": "Confirm local QTc action threshold",
   "value": "Check current EHR guidance and attending direction for QTc thresholds and ECG/telemetry actions.",
   "verifiedBy": "Not locally attested; verify at point of care",
   "verifiedAt": "2026-07-09"
  }
 ],
 "choiceBanks": {
  "etiology": [
   {
    "id": "primary_psych",
    "label": "Primary psychiatric (psychosis / mania)"
   },
   {
    "id": "delirium",
    "label": "Delirium / medical cause"
   },
   {
    "id": "withdrawal",
    "label": "Alcohol / sedative-hypnotic withdrawal"
   },
   {
    "id": "stimulant_intox",
    "label": "Stimulant / sympathomimetic intoxication"
   },
   {
    "id": "catatonia",
    "label": "Catatonia (incl. excited catatonia)"
   },
   {
    "id": "undetermined",
    "label": "Undetermined — needs workup"
   }
  ],
  "nonpharm": [
   {
    "id": "deesc",
    "label": "Verbal de-escalation (Project BETA)"
   },
   {
    "id": "space_safety",
    "label": "Ensure exit path, personal space, remove hazards"
   },
   {
    "id": "env",
    "label": "Reduce stimulation / environmental measures"
   },
   {
    "id": "offer_po",
    "label": "Offer oral medication collaboratively",
    "tokenId": "agitation.po_options"
   },
   {
    "id": "activate_help",
    "label": "Activate team/security if imminent danger",
    "tokenId": "agitation.deescalation_activation"
   }
  ],
  "pharmApproach": [
   {
    "id": "sga",
    "label": "Second-generation antipsychotic",
    "tokenId": "agitation.po_options",
    "hazardIf": {
     "parkinson_dlb": "Not a safe default in Parkinson disease / Lewy body dementia — risperidone and olanzapine can trigger severe, sometimes fatal neuroleptic sensitivity. If an antipsychotic is unavoidable the choice is narrow (quetiapine, clozapine, or pimavanserin) and belongs to your attending.",
     "catatonia": "Second-generation agents can also precipitate or worsen catatonia and NMS — hold antipsychotics until catatonia is excluded or treated."
    },
    "cautionIf": {
     "qtc_risk": "Some SGAs prolong QTc (e.g., ziprasidone highest) — check baseline QTc/interacting drugs.",
     "older_dementia": "All antipsychotics carry FDA black-box mortality warning in dementia-related psychosis."
    }
   },
   {
    "id": "d2_typical",
    "label": "Typical antipsychotic (D2 blocker)",
    "tokenId": "agitation.im_options",
    "hazardIf": {
     "parkinson_dlb": "D2 blockade worsens parkinsonism — contraindicated in Parkinson disease / Lewy body dementia.",
     "catatonia": "May precipitate/worsen catatonia and NMS — hold antipsychotics."
    },
    "cautionIf": {
     "older_dementia": "FDA black-box mortality warning in dementia-related psychosis; high EPS risk in older adults."
    }
   },
   {
    "id": "benzo",
    "label": "Benzodiazepine",
    "tokenId": "agitation.im_options",
    "hazardIf": {
     "delirium": "Benzodiazepines worsen non-withdrawal delirium — avoid unless alcohol/sedative withdrawal or end-of-life."
    },
    "cautionIf": {
     "older_dementia": "Falls, cognitive worsening, and delirium risk in older adults (Beers); midazolam has the highest adverse-event rate.",
     "respiratory": "Respiratory depression risk; caution with pulmonary disease/hepatic impairment."
    }
   },
   {
    "id": "combo",
    "label": "Antipsychotic + benzodiazepine combination",
    "tokenId": "agitation.im_options",
    "hazardIf": {
     "delirium": "Benzodiazepine component worsens non-withdrawal delirium."
    },
    "cautionIf": {
     "im_olanzapine_benzo": "Do not combine IM olanzapine with a parenteral benzodiazepine (FDA label — respiratory/CV risk).",
     "note": "Combination is often most effective for moderate/severe agitation (Siafis 2026) but stacks sedation/respiratory risk — monitor closely."
    }
   },
   {
    "id": "treat_cause",
    "label": "Treat the underlying cause first",
    "tokenId": null
   },
   {
    "id": "im_if_danger",
    "label": "IM medication only if imminently dangerous & PO refused",
    "tokenId": "agitation.restraint_policy"
   }
  ],
  "monitoring": [
   {
    "id": "pulse_ox",
    "label": "Continuous pulse oximetry",
    "tokenId": "agitation.monitoring_interval"
   },
   {
    "id": "serial_vitals",
    "label": "Serial vitals + sedation level at set intervals",
    "tokenId": "agitation.monitoring_interval"
   },
   {
    "id": "airway",
    "label": "Watch airway / oversedation / SpO₂ drop"
   },
   {
    "id": "eps",
    "label": "Watch for dystonia / EPS / akathisia"
   },
   {
    "id": "ecg",
    "label": "ECG if QTc risk",
    "tokenId": "agitation.qtc_threshold_action"
   },
   {
    "id": "reassess",
    "label": "Reassess before re-dosing",
    "tokenId": "agitation.monitoring_interval"
   }
  ]
 },
 "content": {
  "scenarios": [
   {
    "id": "agit-stimulant",
    "settingTokenId": "agitation.setting_scope",
    "ageBand": "20s",
    "stem": "A young adult brought in after a disturbance is pacing, hypervigilant, and intermittently shouting. Diaphoretic, dilated pupils. Reports recent stimulant use; declines to sit.",
    "vitals": {
     "hr": 122,
     "bp": "162/98",
     "spo2": 99,
     "temp": 37.6
    },
    "history": "No known psychiatric history; friends report cocaine use tonight.",
    "currentMeds": [
     "none reported"
    ],
    "priorResponse": "None yet.",
    "trueEtiology": "stimulant_intox",
    "populationFlags": [],
    "discriminators": {
     "stimulant_intox": [
      "Dilated pupils",
      "Tachycardia/hypertension",
      "Diaphoresis",
      "Recent stimulant use"
     ],
     "primary_psych": [
      "Would expect prior history / no sympathomimetic signs"
     ],
     "delirium": [
      "Would expect fluctuating attention and a medical trigger"
     ]
    },
    "teachingPoints": [
     {
      "text": "For stimulant/sympathomimetic intoxication, benzodiazepines are the evidence-based first-line pharmacologic class; they calm sympathetic drive without the D2 risks of antipsychotics.",
      "citationIds": [
       "wilson2012",
       "martel2021"
      ]
     },
     {
      "text": "De-escalation and a low-stimulation environment come first; parenteral agents only if danger persists after PO is offered.",
      "citationIds": [
       "richmond2012",
       "apa2022"
      ]
     }
    ],
    "citationIds": [
     "wilson2012",
     "martel2021",
     "richmond2012"
    ]
   },
   {
    "id": "agit-delirium",
    "settingTokenId": "agitation.setting_scope",
    "ageBand": "80s",
    "stem": "An older adult two days post-op is pulling at lines, attention waxes and wanes, and they misidentify staff. Calmer earlier today, worse tonight.",
    "vitals": {
     "hr": 96,
     "bp": "138/80",
     "spo2": 93,
     "temp": 37.9
    },
    "history": "Post-operative; receiving an opioid and an anticholinergic sleep aid. Baseline cognition reportedly intact.",
    "currentMeds": [
     "opioid analgesic",
     "anticholinergic hypnotic"
    ],
    "priorResponse": "None yet.",
    "trueEtiology": "delirium",
    "populationFlags": [
     "older_dementia"
    ],
    "discriminators": {
     "delirium": [
      "Acute onset + fluctuating course",
      "Inattention",
      "Medical/medication trigger",
      "Age + recent surgery"
     ],
     "primary_psych": [
      "New psychosis at this age without delirium features would be unusual"
     ],
     "withdrawal": [
      "Consider if alcohol/sedative history — would change benzo reasoning"
     ]
    },
    "teachingPoints": [
     {
      "text": "New, fluctuating inattention in a hospitalized patient is delirium until proven otherwise — find and treat the cause and remove deliriogenic meds first.",
      "citationIds": [
       "beers2023"
      ]
     },
     {
      "text": "Benzodiazepines worsen non-withdrawal delirium; if an agent is needed for dangerous agitation, a second-generation antipsychotic is generally preferred over haloperidol for faster onset and fewer EPS. No medication is FDA-approved for delirium.",
      "citationIds": [
       "beers2023",
       "zaman2017"
      ]
     }
    ],
    "citationIds": [
     "beers2023",
     "zaman2017"
    ]
   },
   {
    "id": "agit-withdrawal",
    "settingTokenId": "agitation.setting_scope",
    "ageBand": "50s",
    "stem": "Two days after admission, a patient becomes tremulous, anxious, and diaphoretic with a coarse tremor and reports seeing bugs on the wall.",
    "vitals": {
     "hr": 118,
     "bp": "168/102",
     "spo2": 98,
     "temp": 37.7
    },
    "history": "Reported heavy daily alcohol use up to admission.",
    "currentMeds": [
     "none relevant reported"
    ],
    "priorResponse": "None yet.",
    "trueEtiology": "withdrawal",
    "populationFlags": [],
    "discriminators": {
     "withdrawal": [
      "Coarse tremor",
      "Autonomic hyperactivity",
      "Perceptual disturbance",
      "Time course since last drink"
     ],
     "delirium": [
      "Overlaps — withdrawal IS a delirium subtype where benzos ARE indicated"
     ],
     "stimulant_intox": [
      "Would expect recent stimulant use, not an alcohol history"
     ]
    },
    "teachingPoints": [
     {
      "text": "Alcohol/sedative-hypnotic withdrawal is the key exception where benzodiazepines are first-line — treat the withdrawal per your local protocol; antipsychotics are adjuncts, not monotherapy.",
      "citationIds": [
       "wilson2012"
      ]
     },
     {
      "text": "This is why the etiology step matters: the same class (benzodiazepine) that is a hazard in non-withdrawal delirium is the correct choice here.",
      "citationIds": [
       "zaman2017"
      ]
     }
    ],
    "citationIds": [
     "wilson2012",
     "zaman2017"
    ]
   },
   {
    "id": "agit-psychosis",
    "settingTokenId": "agitation.setting_scope",
    "ageBand": "30s",
    "stem": "A patient with known schizophrenia is agitated, responding to internal stimuli, and pacing near the nursing station. Oriented, no medical red flags. Declines to sit but is talking with you.",
    "vitals": {
     "hr": 98,
     "bp": "132/84",
     "spo2": 99,
     "temp": 36.9
    },
    "history": "Chronic schizophrenia; recent medication nonadherence.",
    "currentMeds": [
     "home antipsychotic (nonadherent)"
    ],
    "priorResponse": "Responds partially to verbal engagement.",
    "trueEtiology": "primary_psych",
    "populationFlags": [],
    "discriminators": {
     "primary_psych": [
      "Known psychotic illness",
      "Responding to internal stimuli",
      "No delirium features / medical triggers"
     ],
     "delirium": [
      "No fluctuating inattention or medical trigger"
     ],
     "catatonia": [
      "Screen if posturing, mutism, or waxy flexibility appear"
     ]
    },
    "teachingPoints": [
     {
      "text": "Because the patient is engaging verbally, de-escalation plus an offered oral antipsychotic (collaborative, patient-preference-driven) is the highest-yield path before any parenteral route.",
      "citationIds": [
       "richmond2012",
       "cole2025"
      ]
     },
     {
      "text": "Antipsychotic–benzodiazepine combinations achieve faster sedation than haloperidol monotherapy for moderate-to-severe agitation, but escalate sedation/respiratory risk — reserve for when it is warranted and monitor.",
      "citationIds": [
       "siafis2026",
       "ostinelli2017"
      ]
     }
    ],
    "citationIds": [
     "richmond2012",
     "cole2025",
     "siafis2026"
    ]
   },
   {
    "id": "agit-parkinson",
    "settingTokenId": "agitation.setting_scope",
    "ageBand": "70s",
    "stem": "A patient with Parkinson disease and visual hallucinations becomes frightened and agitated in the evening, trying to leave. Rigidity and bradykinesia at baseline.",
    "vitals": {
     "hr": 88,
     "bp": "128/76",
     "spo2": 97,
     "temp": 36.8
    },
    "history": "Parkinson disease on dopaminergic therapy; recent evening confusion/hallucinations.",
    "currentMeds": [
     "dopaminergic therapy"
    ],
    "priorResponse": "None yet.",
    "trueEtiology": "primary_psych",
    "populationFlags": [
     "parkinson_dlb",
     "older_dementia"
    ],
    "discriminators": {
     "primary_psych": [
      "Psychosis in the context of PD/DLB"
     ],
     "delirium": [
      "Always screen — evening worsening could be superimposed delirium"
     ],
     "undetermined": [
      "Reasonable to work up medical contributors first"
     ]
    },
    "teachingPoints": [
     {
      "text": "In Parkinson disease and Lewy body dementia, D2-blocking antipsychotics can cause severe worsening — typical antipsychotics are contraindicated. This is the population where the 'default' agitation agent is the wrong move.",
      "citationIds": [
       "wilson2012"
      ]
     },
     {
      "text": "Prioritize de-escalation, environmental measures, and reducing offending medications; if pharmacotherapy is unavoidable, agent choice is narrow and belongs to your attending + local formulary.",
      "citationIds": [
       "apa2022"
      ]
     }
    ],
    "citationIds": [
     "wilson2012",
     "apa2022"
    ]
   },
   {
    "id": "agit-catatonia",
    "settingTokenId": "agitation.setting_scope",
    "ageBand": "40s",
    "stem": "A patient who was mute and withdrawn for two days is now intermittently agitated with purposeless movements, then freezes with a held posture.",
    "vitals": {
     "hr": 104,
     "bp": "142/88",
     "spo2": 98,
     "temp": 37.8
    },
    "history": "Recent severe mood episode; staff noted staring, posturing, and refusal to eat before this.",
    "currentMeds": [
     "none relevant reported"
    ],
    "priorResponse": "None yet.",
    "trueEtiology": "catatonia",
    "populationFlags": [],
    "discriminators": {
     "catatonia": [
      "Preceding mutism/immobility/posturing",
      "Waxy flexibility",
      "Alternating stupor and excitement"
     ],
     "primary_psych": [
      "Underlying mood/psychotic illness common — but catatonia changes management"
     ],
     "delirium": [
      "Screen for medical/autonomic instability (malignant catatonia risk)"
     ]
    },
    "teachingPoints": [
     {
      "text": "Recognize catatonia before reaching for an antipsychotic — D2 blockers can precipitate or worsen catatonia and raise NMS risk. A benzodiazepine (lorazepam) challenge is both diagnostic and therapeutic.",
      "citationIds": [
       "heckers2023"
      ]
     },
     {
      "text": "Consider the Bush-Francis scale and screen for autonomic instability (malignant catatonia is an emergency).",
      "citationIds": [
       "heckers2023"
      ]
     }
    ],
    "citationIds": [
     "heckers2023"
    ]
   },
   {
    "id": "agit-undetermined-qtc",
    "settingTokenId": "agitation.setting_scope",
    "ageBand": "60s",
    "stem": "An agitated patient with limited history is on several QT-prolonging medications per the med list. Etiology is not yet clear and vitals are borderline.",
    "vitals": {
     "hr": 92,
     "bp": "150/90",
     "spo2": 96,
     "temp": 37.2
    },
    "history": "Sparse history; medication list includes multiple QT-prolonging agents.",
    "currentMeds": [
     "multiple QT-prolonging medications"
    ],
    "priorResponse": "None yet.",
    "trueEtiology": "undetermined",
    "populationFlags": [
     "qtc_risk"
    ],
    "discriminators": {
     "undetermined": [
      "Insufficient data — safest to work up and use least-harm holding measures"
     ],
     "delirium": [
      "Actively screen — common and reversible"
     ],
     "primary_psych": [
      "Avoid anchoring without history"
     ]
    },
    "teachingPoints": [
     {
      "text": "When etiology is undetermined, the safe path is de-escalation, a focused workup, and least-harm measures — not committing to a specific agent. This is a valid, non-penalized choice.",
      "citationIds": [
       "richmond2012"
      ]
     },
     {
      "text": "With QT-prolonging medications on board, remember benzodiazepines do not prolong QTc and some antipsychotics (e.g., ziprasidone) carry the highest risk; ECG/threshold action follows local policy.",
      "citationIds": [
       "wilson2012"
      ]
     }
    ],
    "citationIds": [
     "richmond2012",
     "wilson2012"
    ]
   }
  ]
 }
}
```

---

## Catatonia

- **Slug:** `catatonia.md` · **Type:** md · **Sidebar:** listed
- **Source:** `04_Acute_and_Safety/Catatonia/catatonia_inpatient_teaching.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`high`
- **Length:** 639 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> flagged **high-yield** · est. read 3 min · safetyLevel=`high`

**TL;DR (shown above the page text):**

> Mutism, immobility, posturing, or waxy flexibility — recognize catatonia, do a lorazepam challenge, and hold antipsychotics.

**Key points (bulleted card):**

- Use the Bush-Francis signs; describe motor findings objectively.
- The lorazepam challenge is both diagnostic and therapeutic.
- ECT is definitive, especially for malignant catatonia.

**Can't-miss / red-flag line:**

> Antipsychotics can precipitate malignant catatonia / NMS — exclude those before giving one.

**Rule-out list (differential the page forces):**

- Malignant catatonia / NMS
- Nonconvulsive status epilepticus
- Severe metabolic / CNS cause

**First move (the action the page tells the learner to take):**

> Lorazepam challenge; hold antipsychotics; consider ECT.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Ask about onset, mood/psychosis, antipsychotic exposure, fever/autonomic signs, seizures, medical illness, and prior catatonia.
- **mse** — Describe motor signs objectively: mutism, stupor, posturing, waxy flexibility, negativism, echophenomena, rigidity, and staring.
- **safety** — Hold antipsychotics until malignant catatonia/NMS is addressed; monitor hydration, nutrition, DVT, autonomic instability, and airway risk.
- **say** — The stillness and speech change can be part of a treatable motor syndrome, so we are going to assess it carefully.
- **collateral** — Ask family/staff what changed, whether the patient eats/drinks, baseline movement/speech, and prior response to lorazepam or ECT.
- **rounds** — Present BFCRS signs, medical/NMS rule-out, lorazepam challenge plan, supportive care, and ECT escalation threshold.
- **exam** — Lorazepam challenge is diagnostic and therapeutic; antipsychotics can worsen malignant catatonia/NMS.
- **actions** — Open BFCRS; Practice catatonia reasoning

**Embedded check-for-understanding**

1. *Stem:* A mute, posturing patient with waxy flexibility — best initial step?
   - Lorazepam challenge **← keyed correct**
   - Start scheduled haloperidol
   - Physical restraint for safety
   - Reassure and observe
   - *Rationale:* Catatonia responds to benzodiazepines; antipsychotics risk precipitating malignant catatonia.

**Cross-references and tagging:**

- **Related tools:** `bfcrs.html`, `decision-aids.html`, `diagnostic-reasoning.html`
- **Evidence sources:** `bap-catatonia-2023`, `bush-1996-catatonia-rating-scale`
- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `team`, `exam`
- **Workflow modes:** `ward`, `safety`, `5min`, `shelf`
- **Shelf blueprint tags:** `neurocog`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA10`
- **Faculty review:** {"status": "reviewed", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-07-03"}

#### Page text (as shipped)

# Catatonia on the Inpatient Unit


**In one line.** Catatonia is the diagnosis you cannot afford to miss: under-recognized, it occurs across nearly every psychiatric and medical diagnosis, and it can be fatal if you treat it the wrong way.

**How it presents on the unit.** Picture the patient who has stopped — mute, immobile, staring past you, holding an awkward posture, or letting you bend a limb into a position that then stays put (waxy flexibility). Watch for negativism (resisting or doing the opposite of what is asked), echolalia and echopraxia (echoing your words or movements), stereotypy, and grimacing. Catatonia is not always quiet: the *excited* subtype shows purposeless agitation, while the *retarded* subtype shows stupor and immobility. Crucially, it crosses diagnostic lines — it appears in mood disorders (often the most common driver), psychotic disorders, autism spectrum disorder, AND medical or neurologic illness (encephalitis, metabolic derangement, seizure, autoimmune disease). The emergency you must never miss is **malignant catatonia**: autonomic instability, hyperthermia, and rigidity that clinically overlaps with neuroleptic malignant syndrome (NMS). Treat it as a medical emergency.

**Recognize and screen.** The standard instrument is the **Bush-Francis Catatonia Rating Scale (BFCRS)** (Bush et al., 1996) — use its screening items to detect catatonia and its full scale to track severity over time. On exam, deliberately look for the signs it scores: immobility/stupor, mutism, staring, posturing/catalepsy, waxy flexibility, negativism, echophenomena, stereotypy, and any agitation that does not fit the environment. Naming the signs out loud forces you to actually look for them.

<a class="tl-chip" href="?tool=bfcrs.html" data-tool="bfcrs.html" data-icon="bfcrs">Screen &amp; score — Bush-Francis (BFCRS)</a>

**The lorazepam challenge.** A test dose of lorazepam (IV or IM) is both a diagnostic maneuver and the start of treatment. A meaningful, often rapid improvement in catatonic signs after the challenge supports the diagnosis and predicts response to benzodiazepine treatment. Do **not** memorize or quote a dose — follow your institutional protocol and your supervising clinician's direction for dosing and monitoring.

**Treatment and the critical caution.** Benzodiazepines are first-line. **Electroconvulsive therapy (ECT)** is the treatment for severe, malignant, or benzodiazepine-refractory catatonia and should not be delayed when the patient is deteriorating. The caution that protects your patient: **avoid antipsychotics until catatonia is excluded** — they can precipitate or worsen NMS and malignant catatonia. And always treat the underlying cause, whether it is a mood episode, psychosis, or a medical/neurologic process. These principles follow the **British Association for Psychopharmacology (BAP) 2023 catatonia consensus guideline**.

**Workup.** Rule out medical and neurologic mimics and explicitly consider NMS. Check vital signs and basic labs, review the medication list (especially recent antipsychotic exposure), and — when the picture warrants — pursue an autoimmune/encephalitis evaluation. The goal is to find the driver while you stabilize the syndrome.

**What the student does.**
- Screen any mute, immobile, or bizarrely posturing patient with the BFCRS rather than charting "uncooperative."
- Check and trend vital signs for autonomic instability and hyperthermia; flag any abnormality immediately.
- If antipsychotics are being considered or ordered, raise the catatonia question with the team before they are given.
- Describe the motor and behavioral signs you observe objectively — do not interpret them as refusal or oppositionality.
- Track intake, mobility, and complications of immobility, and escalate promptly.

**High-yield pearls.**
- Catatonia is a syndrome, not a diagnosis — it rides on mood, psychotic, autistic, and medical/neurologic conditions alike.
- A positive lorazepam challenge both supports the diagnosis and begins treatment.
- Malignant catatonia overlaps with NMS and is a medical emergency.
- Antipsychotics can worsen catatonia — hold them until catatonia is excluded.
- The BFCRS turns a vague "withdrawn" patient into a scored, trackable, treatable syndrome.

**Pair with** the <a href="tools/bfcrs.html" target="_blank" rel="noopener">Bush-Francis Catatonia Rating Scale tool</a>, the [Differential Diagnosis scaffolds](?page=ddx.md), and the [Delirium guidance](?page=delirium.md).

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI.*


---

## Bush-Francis Catatonia Scale (BFCRS) — Official Form & Training

- **Slug:** `bfcrs.html` · **Type:** tool · **Sidebar:** listed
- **Source:** `04_Acute_and_Safety/Catatonia/bfcrs.html`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`high`
- **Category:** acute-safety · **Risk level:** `high` · **Disclaimer:** `instrument-not-reproduced`
- **Evidence sources:** `bap-catatonia-2023`
- **Related pages:** `catatonia.md`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- Bush-Francis Catatonia Scale (BFCRS) — Official Form & Training Reviewed by Joshua Moss, MD on 2026-06-30
- Skip to content Catatonia
- Bush-Francis Catatonia Rating Scale
- This page no longer reproduces the BFCRS. Use your unit’s current approved form to screen and score.
- Why the items were removed. The BFCRS is published by the University of Rochester Medical Center under site-wide Web Terms of Use stating that the contents “may not be distributed, modified, reproduced, or used, in whole or in part without the prior written consent of the University of Rochester Medical Center,” with use granted only for “personal non-commercial use.” No instrument-specific licence is published alongside the scale. Reproducing all 23 items and their anchors on a public teaching site is outside that grant, so they have been withdrawn pending written permission.
- Primary source. Bush G, Fink M, Petrides G, Dowling F, Francis A. Catatonia. I. Rating scale and standardized examination. Acta Psychiatr Scand. 1996;93(2):129–36. PMID 8686483 .
- Official version and training. The scale, its training materials and the standardized examination are published at the URMC BFCRS site . Score from your institution’s current approved form at the bedside, not from any teaching page.
- Administration teaching for this scale — how the examination is conducted and what the score does and does not license — is authored separately and is not yet published here.
- Joshua Moss, MD | Psychiatrist

---

## Hyperthermia & Toxidromes

- **Slug:** `toxidromes.md` · **Type:** md · **Sidebar:** listed
- **Source:** `04_Acute_and_Safety/Toxidromes/hyperthermia_toxidromes_inpatient_teaching.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`high`
- **Length:** 566 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> flagged **high-yield** · est. read 5 min · safetyLevel=`high`

**TL;DR (shown above the page text):**

> Four hyperthermic emergencies share fever + altered mental status + autonomic instability; the neuromuscular exam, the skin, and the last 72 h of medication changes separate them and dictate sharply different treatment.

**Key points (bulleted card):**

- Lead-pipe rigidity + hyporeflexia after a dopamine blocker → NMS; clonus + hyperreflexia, legs>arms, after a serotonergic agent → serotonin syndrome.
- Dry, flushed skin + mydriasis + urinary retention → anticholinergic toxicity; waxy flexibility/posturing without a clear drug trigger → malignant catatonia (ECT is definitive).
- Reconstruct every medication change in the last 72 hours — that history usually names the syndrome.

**Can't-miss / red-flag line:**

> Never give an antipsychotic to a rigid, febrile patient in NMS or malignant catatonia — antipsychotics are the cause, not the treatment; stop the offending agent, cool and support, and escalate.

**Rule-out list (differential the page forces):**

- Sepsis / CNS infection
- Heat stroke
- NMS
- Serotonin syndrome
- Anticholinergic toxicity
- Malignant catatonia
- Malignant hyperthermia

**First move (the action the page tells the learner to take):**

> Stop the likely offending agent, support and cool aggressively, send a CK, and rule out infection/heat stroke — then discriminate by reflexes and skin.

**Cross-references and tagging:**

- **Evidence sources:** `boyer-shannon-2005-serotonin-syndrome`, `strawn-2007-neuroleptic-malignant-syndrome`, `bap-catatonia-2023`
- **Workflow stages:** `diagnosis`, `safety`, `treatment`
- **Workflow modes:** `ward`, `safety`, `5min`, `shelf`
- **Shelf blueprint tags:** `neurocog`, `pharm`
- **EPA crosswalk:** `EPA2`, `EPA3`, `EPA10`
- **Faculty review:** {"status": "reviewed", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-08"}

#### Page text (as shipped)

# Hyperthermia & Toxidromes: NMS, Serotonin Syndrome, Anticholinergic, Malignant Catatonia


**In one line.** Four hyperthermic emergencies on the psychiatric unit share the same alarming triad — fever, altered mental status, and autonomic instability — but the neuromuscular exam, the skin, and the drug change in the last 72 hours tell them apart, and the treatments diverge sharply.

**Why this is a can't-miss.** These are the syndromes where the wrong reflex (giving an antipsychotic to a rigid, febrile patient) can kill, and where a two-second exam maneuver (checking reflexes and skin) makes the diagnosis. On any febrile, rigid, or altered patient on psychotropics, the first moves are the same: stop the likely offending agent, support and cool aggressively, and rule out infection and heat stroke — then discriminate.

**The four, side by side.**

| | Offending agent | Onset | Neuromuscular | Skin / pupils | CK | First move beyond supportive |
|---|---|---|---|---|---|---|
| **NMS** | Dopamine blocker started/increased (or dopamine agonist withdrawn) | Days | **Lead-pipe rigidity, hyporeflexia** | Diaphoretic | Very high | Stop antipsychotic; benzodiazepine; dantrolene or bromocriptine; ICU |
| **Serotonin syndrome** | Serotonergic agent added/increased (SSRI, SNRI, MAOI, tramadol, linezolid, triptans, methylene blue) | Hours | **Clonus + hyperreflexia (legs > arms)**, tremor, myoclonus | Diaphoretic, **mydriasis**, hyperactive bowel | Mild–moderate | Stop agent; benzodiazepine; cyproheptadine |
| **Anticholinergic toxicity** | Anticholinergics (diphenhydramine, TCAs, benztropine, antihistamines) | Hours | Normal reflexes, no clonus | **Dry, flushed skin; mydriasis; urinary retention; absent bowel sounds** | Normal | Supportive; benzodiazepine for agitation; physostigmine in select severe cases |
| **Malignant catatonia** | Underlying catatonia (may have *no* recent antipsychotic) | Days | **Rigidity, waxy flexibility, posturing, mutism** | Diaphoretic | Variable | Stop antipsychotics; benzodiazepine (lorazepam challenge); **ECT is definitive** |

**The discriminators that actually decide it.**
- **Lead-pipe rigidity + hyporeflexia → NMS.**
- **Clonus + hyperreflexia, worse in the legs → serotonin syndrome.**
- **Dry, flushed skin + mydriasis + urinary retention → anticholinergic toxicity** (serotonin syndrome is *wet*; anticholinergic is *dry* — "dry as a bone").
- **Waxy flexibility/posturing, especially without a clear drug trigger → malignant catatonia** (NMS and malignant catatonia overlap so much that many regard NMS as a drug-induced malignant catatonia; the shared imperative is to stop antipsychotics).

**What the student does.**
- On any febrile, rigid, or altered patient on psychotropics: check reflexes (hypo vs. hyper/clonus) and skin (dry vs. diaphoretic), and review every medication change in the last 72 hours — that history usually names the syndrome.
- Hold the antipsychotic and escalate immediately; do not reach for another antipsychotic to "calm" a rigid febrile patient.
- Send a CK, and support aggressively (cooling, fluids, monitoring) while the workup proceeds.

**High-yield pearls.**
- The medication change in the last 72 hours names the syndrome — always reconstruct it.
- Hyporeflexia points to NMS; hyperreflexia and clonus point to serotonin syndrome.
- Never give an antipsychotic in NMS or malignant catatonia — antipsychotics are the problem, not the treatment.
- ECT is the definitive treatment for malignant catatonia (and for NMS-catatonia overlap).
- Cyproheptadine is the antidote-of-choice for serotonin syndrome; dantrolene/bromocriptine for NMS; benzodiazepines help NMS, serotonin syndrome, and catatonia alike.

**Pair with** Catatonia (and the Bush-Francis scale), Agitation & Restraint, the Psychopharmacology Primer, and Delirium.

*Joshua Moss, MD | Psychiatrist · Educational; confirm agents/antidotes against current references and institutional protocol; fictional composites only, no PHI.*


---

## Delirium

- **Slug:** `delirium.md` · **Type:** md · **Sidebar:** listed
- **Source:** `04_Acute_and_Safety/Delirium/delirium_inpatient_teaching.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`high`
- **Length:** 629 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> flagged **high-yield** · est. read 4 min · safetyLevel=`high`

**TL;DR (shown above the page text):**

> New, fluctuating inattention in a hospitalized patient is delirium until proven otherwise — a medical emergency, not a psychiatric label.

**Key points (bulleted card):**

- Acute onset + fluctuating course + inattention (anchor on arousal and attention).
- It almost always has a medical cause — find and fix it.
- Reorient and mobilize, restore the sleep-wake cycle, and remove tethers and deliriogenic meds.

**Can't-miss / red-flag line:**

> Don't sedate your way past it — benzodiazepines worsen delirium except in alcohol or benzodiazepine withdrawal.

**Rule-out list (differential the page forces):**

- Infection
- Meds / anticholinergics
- Metabolic (Na, glucose, uremia)
- Hypoxia
- Withdrawal
- Intracranial event

**First move (the action the page tells the learner to take):**

> Treat the cause, stop deliriogenic meds, use nonpharmacologic measures; reserve low-dose antipsychotic for dangerous agitation.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Ask baseline cognition, acute onset, fluctuation, sleep-wake reversal, pain, infection, hypoxia, withdrawal, and medication changes.
- **mse** — Prioritize attention and arousal; note fluctuation, disorientation, perceptual disturbance, psychomotor subtype, and cognition.
- **safety** — Treat as medical emergency: remove deliriogenic medications, correct causes, prevent falls, and avoid benzodiazepines except withdrawal.
- **say** — This looks like a brain-not-working-right-now problem, often from a medical cause, and it usually fluctuates during the day.
- **collateral** — Ask family/nursing what is baseline, when it changed, whether it fluctuates, and what helps reorient the patient.
- **rounds** — Present CAM-style features, likely causes, medication contributors, nonpharmacologic plan, and when medication is needed for dangerous agitation.
- **exam** — Delirium is acute/fluctuating inattention; benzodiazepines usually worsen it unless withdrawal is the cause.
- **actions** — Open decision aids; Practice delirium reasoning; Practice caregiver baseline/adaptations; Open collateral workflow

**Embedded check-for-understanding**

1. *Stem:* An 80-year-old is inattentive and fluctuating two days post-op on oxycodone and diphenhydramine. Best first step?
   - Identify and treat the cause; stop deliriogenic meds **← keyed correct**
   - Start scheduled lorazepam
   - Begin donepezil
   - Reassure the family and observe
   - *Rationale:* This is delirium; the priority is finding the cause and removing contributors (opioids + anticholinergic). Benzodiazepines worsen non-withdrawal delirium.

**Family overlay:** `delirium_family_orientation_and_collateral`

**Cross-references and tagging:**

- **Related tools:** `decision-aids.html`, `communication-practice.html`, `diagnostic-reasoning.html`, `family-systems.html`
- **Evidence sources:** `nice-delirium-cg103`, `project-beta-deescalation-2012`
- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `family`, `team`, `exam`
- **Workflow modes:** `ward`, `safety`, `family`, `5min`, `shelf`
- **Shelf blueprint tags:** `neurocog`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA3`, `EPA10`
- **Call-to-action buttons:** Open the Decision Aids; Practice caregiver baseline/adaptations; Open collateral workflow
- **Faculty review:** {"status": "reviewed", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-07-03"}

#### Page text (as shipped)

# Delirium on the Inpatient Unit


**In one line.** Delirium is an acute, fluctuating disturbance of attention and awareness — a medical emergency and the great psychiatric mimic.

**How it presents on the unit.** The hallmark is a change that came on over hours to days, not weeks, and that waxes and wanes across a single shift — lucid on morning rounds, disorganized by evening. Attention is impaired, and the level of arousal is off: the patient may be hypervigilant and pulling at lines (hyperactive) or quietly drifting, slow to respond, and easy to overlook (hypoactive). The hypoactive form is the one that gets missed, and it carries worse outcomes precisely because no one is alarmed by a quiet patient. Delirium is the great mimic: in older adults especially, it is repeatedly misattributed to depression (the withdrawn, flat, hypoactive patient) or to a primary psychotic illness (the agitated, disorganized, hallucinating patient). When a patient with no psychiatric history suddenly looks "psychiatric," think delirium first.

**Recognize and screen.** Attention is the cardinal deficit — test it deliberately rather than assuming it from conversation. Ask the patient to recite the months of the year backward, or use digit span; a patient who cannot hold the sequence is showing you the core sign. Structure the bedside impression with the **Confusion Assessment Method (CAM)** (Inouye et al.): you need acute onset *and* a fluctuating course, *and* inattention, *plus either* disorganized thinking *or* an altered level of consciousness. Walking the CAM features out loud forces you to actually look for each one instead of charting a global "confused."

**Find the cause.** Delirium is a symptom; the work is finding what is driving it. Screen systematically for infection (UTI and pneumonia lead the list), metabolic and electrolyte derangements, and hypoxia. Comb the medication list for deliriogenic agents — anticholinergics, benzodiazepines, and opioids are the usual suspects — and ask explicitly about substance withdrawal. Do not forget the quiet physiologic provocateurs that are easy to fix: urinary retention, constipation, uncontrolled pain, and disrupted sleep. Often it is several of these at once.

**Management.** Non-pharmacologic measures come **first**, not as an afterthought: reorient the patient, protect the sleep–wake cycle, mobilize early, restore sensory aids (get the glasses and hearing aids on), and bring family to the bedside. This is the work captured in the **ABCDEF** and HELP bundles. In parallel, identify and treat the underlying cause and deprescribe the deliriogenic medications you found. Antipsychotics are reserved for dangerous agitation only — lowest effective dose, time-limited — and are **not** for prevention; respect the dementia boxed warning when an older patient is involved. Avoid benzodiazepines, with the single exception of alcohol or sedative withdrawal, where they are the treatment.

**What the student does.**
- Test attention every day — months-of-the-year backward or digit span — and document the result, not a vague "alert and oriented."
- Build and maintain the medication and deprescribing list; flag every anticholinergic, benzodiazepine, and opioid for the team.
- Screen actively for infection, urinary retention, and constipation — the fixable drivers hide in plain sight.
- Secure collateral on the patient's baseline mental status so "altered" actually means altered.

**High-yield pearls.**
- Inattention is the cardinal sign — if attention is intact, reconsider the diagnosis.
- Hypoactive delirium is the dangerous one: commonly missed, worse outcomes, and easily mislabeled as depression.
- New "psychiatric" symptoms in an older medical patient are delirium until proven otherwise.
- Treat the cause and deprescribe; antipsychotics are for dangerous agitation only, never for prevention.
- Avoid benzodiazepines unless the cause is alcohol or sedative withdrawal — they otherwise deepen delirium.

**Pair with** the Differential Diagnosis scaffolds, the Geriatric page, and the agitation & restraint guidance.

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI.*


---

## Withdrawal: COWS Tool · CIWA-Ar Official Form & Training

- **Slug:** `withdrawal.html` · **Type:** tool · **Sidebar:** listed
- **Source:** `03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`high`
- **Category:** acute-safety · **Risk level:** `high` · **Disclaimer:** `validated-scale-protocol-dependent`
- **Evidence sources:** `asam-alcohol-withdrawal-2020`
- **Related pages:** `t_sud.md`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- Withdrawal: COWS Tool · CIWA-Ar Official Form & Training Reviewed by Joshua Moss, MD on 2026-06-30
- Skip to content

**Authored clinical strings (68):**

- Measured after the patient has been sitting or lying for one minute
- Over the past ½ hour, not accounted for by room temperature or patient activity
- no report of chills or flushing
- subjective report of chills or flushing
- flushed or observable moistness on face
- beads of sweat on brow or face
- Observation during assessment
- reports difficulty sitting still, but is able to do so
- frequent shifting or extraneous movements of legs/arms
- unable to sit still for more than a few seconds
- pupils pinned or normal size for room light
- pupils possibly larger than normal for room light
- pupils moderately dilated
- pupils so dilated that only the rim of the iris is visible
- If the patient had pain previously, only the additional component attributed to opioid withdrawal is scored
- patient reports severe diffuse aching of joints/muscles
- patient is rubbing joints or muscles and unable to sit still because of discomfort
- Not accounted for by cold symptoms or allergies
- nasal stuffiness or unusually moist eyes
- nose constantly running or tears streaming down cheeks
- multiple episodes of diarrhea or vomiting
- Observation of outstretched hands
- tremor can be felt, but not observed
- gross tremor or muscle twitching
- yawning once or twice during assessment
- yawning three or more times during assessment
- yawning several times per minute
- patient reports increasing irritability or anxiousness
- patient obviously irritable or anxious
- patient so irritable or anxious that participation in the assessment is difficult
- piloerection can be felt or hairs standing up on arms
- color-mix(in srgb,var(--success) 30%,transparent)
- color-mix(in srgb,var(--warning) 36%,transparent)
- color-mix(in srgb,var(--danger) 24%,transparent)
- color-mix(in srgb,var(--danger) 40%,transparent)
- s own first tier (<=4 None/minimal). */ labels:[{t:
- }], info:function(t){ if(t<=4) return {tier:
- ,timeline:null}; if(t<=12) return {tier:
- ,timeline:null}; if(t<=24) return {tier:
- ,timeline:null}; if(t<=36) return {tier:
- ,timeline:null}; return {tier:
- ,timeline:null}; } }; function Scale(props){ var items=props.items; var g=props.gauge; var v=useState({}); var setV=v[1]; v=v[0]; function set(k,val){var n=Object.assign({},v);n[k]=val;setV(n);} var total=items.reduce(function(a,i){return a+(parseInt(v[i.k]||0,10));},0); var info=g.info(total); var needle=Math.min(100, total/g.track*100); function rc(r){return r<0.4?
- );} var scored=items.map(function(i){return {b:i.b,val:parseInt(v[i.k]||0,10),max:i.max};}).filter(function(x){return x.val>0;}).sort(function(a,b){return b.val-a.val;}).slice(0,6); return e(
- }, items.map(function(i){ var val=parseInt(v[i.k]||0,10); var r=i.max?val/i.max:0; /* Two shapes on purpose: COWS items carry vals[] (sparse, anchored), CIWA items still carry max:N (dense 0..max, correct for that instrument). WP-20 converts CIWA. */ var opts = i.vals ? i.vals.map(function(o){ return e(
- ,{key:o.v,value:o.v}, o.v+
- +o.a); }) : (function(){var a=[];for(var s=0;s<=i.max;s++)a.push(e(
- ,{key:s,value:s},s));return a;})(); return e(
- ,key:i.k}, /* CIWA items describe themselves with `d`; generated COWS items carry the spec
- On the withdrawal timeline ·
- s only scoring surface, and this page is reached from Quick Tools and search AS A TOOL. Landing a learner who tapped a scorer on a "not reproduced here" notice is precisely the failure the retired instruments
- Core Topics · 03 · Substance Use / Withdrawal
- Withdrawal: COWS tool · CIWA-Ar official form
- Two structured scales you’ll use on the unit — alcohol (CIWA-Ar) and opioids (COWS). COWS is scored here; the CIWA-Ar is not reproduced on this page — score it from your unit’s approved form. The trend matters as much as the number.
- CIWA-Ar — official form & training
- a rising or high CIWA signals risk of withdrawal seizures and delirium tremens. Benzodiazepines are first-line per protocol; treat early. Thiamine before glucose.
- This page no longer reproduces the CIWA-Ar.
- Use your unit’s current approved form to score at the bedside.
- Why the items were removed.
- Every located “may be reproduced freely” notice for the CIWA-Ar is a reproducer’s addition, in differing wordings; the 1989 article’s own permission text is unverified and behind a paywall. Rights that cannot be established are not rights, so the abbreviated descriptors this page used to show were withdrawn (2026-08-28) rather than left published on the strength of a second-hand notice.
- Sullivan JT, Sykora K, Schneiderman J, Naranjo CA, Sellers EM. Assessment of alcohol withdrawal: the revised Clinical Institute Withdrawal Assessment for Alcohol scale (CIWA-Ar).
- Obtain the complete, current CIWA-Ar from your institution’s withdrawal protocol and score from that form at the bedside, not from any teaching page. Administration teaching for this scale — how the assessment is conducted and what the score does and does not license — is authored separately and is not yet published here.
- symptom-triggered dosing (treat when CIWA ≥ ~8–10) usually beats fixed schedules in appropriate patients. CIWA assumes the patient can communicate — it is unreliable in delirium, intubation, or language barriers; use a protocol like RASS/PAWSS there.
- buprenorphine induction generally requires objective withdrawal (often COWS ≥ ~8–12) to avoid precipitated withdrawal — follow your protocol. COWS guides supportive and agonist treatment; it does not by itself set doses.
- CIWA-Ar: Sullivan JT, Sykora K, Schneiderman J, Naranjo CA, Sellers EM. Assessment of alcohol withdrawal: the revised Clinical Institute Withdrawal Assessment for Alcohol scale (CIWA-Ar).
- ). COWS: Wesson DR, Ling W. The Clinical Opiate Withdrawal Scale (COWS).
- ). The CIWA-Ar is NOT reproduced here — its rights could not be established and its descriptors were withdrawn (2026-08-28). COWS items carry their published anchors and legal score values under a recorded interim waiver. Obtain the complete, current form from your institution and score at the bedside from that form, not from this page.
- Educational teaching tool for clinical trainees. This is a reference and tally — NOT a dosing calculator or a substitute for the validated instrument, supervision, or your institution’s withdrawal protocol and orders. The CIWA-Ar is not reproduced here; COWS anchors follow the published instrument; use the full validated form at the bedside. For fictional/practice use only — no protected health information.
- Withdrawal: COWS tool · CIWA-Ar official form · Psychiatry Clerkship Library · Joshua Moss, MD | Psychiatrist

---

## Decisional Capacity

- **Slug:** `capacity.html` · **Type:** tool · **Sidebar:** listed
- **Source:** `04_Acute_and_Safety/Decisional_Capacity/decisional-capacity-module.html`
- **Governance:** status=`reviewed` · riskKind=`legal` · riskLevel=`high`
- **Category:** acute-safety · **Risk level:** `high` · **Disclaimer:** `legal-policy-dependent`
- **Related pages:** `exp_consult.md`, `ethics_legal.md`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- Decisional Capacity — Bedside Module Reviewed by Joshua Moss, MD on 2026-06-30
- Skip to content

**Authored clinical strings (58):**

- Can the patient express and maintain a clear, stable decision?
- "Have you decided whether to go ahead with this treatment?"
- "Can you tell me what you’ve decided?"
- expressed a clear and consistent choice
- was unable to express or maintain a consistent choice
- 2 · Understand the information
- Can the patient grasp the diagnosis, the proposed treatment, alternatives, and risks/benefits (in their own words)?
- "In your own words, what is the problem we’re treating?"
- "What did I say this treatment involves, and what are the main risks and benefits?"
- "What are the other options, including doing nothing?"
- paraphrased the relevant information accurately
- could not accurately paraphrase the key information despite disclosure
- 3 · Appreciate the situation & consequences
- Does the patient apply the information to themselves — accepting the diagnosis applies to them and that consequences are real?
- "What do you believe is actually wrong with you?"
- "What do you think will happen to you if you don’t have this treatment?"
- "Why do you think your doctors are recommending this?"
- appreciated how the condition and consequences apply to their own situation
- did not appreciate the personal relevance of the diagnosis or consequences (e.g., denial driven by illness)
- Can the patient compare options and manipulate the information logically to reach their choice?
- "How did you weigh the benefits and risks in reaching your decision?"
- "How does this choice fit with what matters to you?"
- "How is this option better, for you, than the alternatives?"
- logically compared options consistent with their stated values
- could not provide a logical, internally consistent rationale for the choice
- Incomplete — rate all four abilities for a determination.
- Pattern suggests the patient LACKS capacity for this specific decision.
- Not yet determinable — one or more abilities are marked Not assessed. Assess all four (or document why an ability could not be assessed) before drawing a conclusion.
- Pattern consistent with INTACT capacity for this specific decision.
- Decision-specific; higher-risk/irreversible decisions warrant a higher evidentiary threshold (sliding scale). Risk level set to:
- Based on the four-abilities assessment, the patient demonstrates the capacity to make this specific decision.
- Based on the four-abilities assessment, the patient does NOT currently demonstrate capacity for this specific decision; the limiting ability/abilities are documented above. Recommend addressing reversible contributors, re-assessing, and engaging surrogate/established legal pathways per institutional policy.
- Note: "Capacity" is a clinical determination for a specific decision at this time; "competence" is a legal status determined by a court.
- Drafted with a teaching tool — findings verified and note reviewed with the supervising clinician.
- Assessing Decisional Capacity
- Capacity is decision-specific, time-specific, and clinical — not a global verdict. The Appelbaum & Grisso (1988) model breaks it into four assessable abilities. Learn each, then use the bedside tab to structure your exam and draft a note.
- 3 · Principles & pitfalls
- The more serious or irreversible the consequences, the higher the bar for demonstrating capacity. A low-risk decision needs less; refusing a life-saving, low-burden treatment needs more.
- The specific decision being assessed
- e.g., refusal of recommended inpatient admission
- Risk / reversibility of the decision
- Optional: quote the patient or note specifics…
- Rate all four abilities before exporting a note.
- Before concluding "lacks capacity":
- rule out and treat reversible contributors — delirium, intoxication/withdrawal, pain, acute psychosis, language/communication barriers. Capacity can return.
- Adults are presumed to have capacity until shown otherwise. The assessment must justify any conclusion that it is absent.
- A patient may have capacity for one decision and not another. Always name the specific decision.
- Capacity is a clinical determination at the bedside; competence is a legal status decided by a court.
- Disagreement ≠ incapacity
- A patient may make a choice you disagree with and still have full capacity. The reasoning process — not the outcome — is what you assess.
- Match the evidentiary threshold to the stakes: higher risk or irreversibility → higher bar.
- Delirium, intoxication, and acute illness change capacity hour to hour. Re-assess and document the time.
- Treat reversible factors, use the patient’s language, hearing aids/glasses, a quiet moment, and a supported decision-making approach before concluding incapacity.
- Annotated sample (fictional composite)
- A 72-year-old admitted for pneumonia who declines a recommended procedure. Decision: refusal of the procedure. Risk: high.
- • Communicate a choice: clear and consistent ("No, I don’t want it"). • Understand: accurately paraphrased the procedure, its purpose, and the main risk of refusing. • Appreciate: acknowledged the condition is serious and that refusing could shorten her life. • Reason: explained the choice in terms of long-standing values about quality vs. length of life; internally consistent. Impression: demonstrates capacity to refuse this specific procedure despite the high stakes — a value-based refusal, not impaired cognition.
- Educational teaching tool for clinical trainees. Generates draft documentation from your inputs using fictional composite scenarios only — no protected health information. Not a clinical or legal decision-support device; capacity determinations and any surrogate/guardianship pathway must follow supervision and institutional/legal policy.
- Decisional Capacity — Bedside Module · Psychiatry Clerkship Library · Joshua Moss, MD | Psychiatrist · Framework: Appelbaum & Grisso (1988)

---

## Consult Questions: Capacity, Delirium, Catatonia, Withdrawal

- **Slug:** `exp_consult.md` · **Type:** md · **Sidebar:** listed
- **Source:** `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/consult_capacity_delirium_catatonia_withdrawal.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 935 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> flagged **high-yield** · est. read 5 min · safetyLevel=`high`

**TL;DR (shown above the page text):**

> Frame every consult with the decision that is blocked — then assess capacity (4 Appelbaum abilities), delirium (acute inattention), catatonia (motor signs), and withdrawal (last use plus prior seizure history) before anchoring on any primary psychiatric diagnosis.

**Key points (bulleted card):**

- Capacity is decision-specific and time-specific — having a psychiatric diagnosis, disagreeing with the team, or exercising poor judgment in general does not mean lacking capacity for this specific decision.
- Delirium is medical until proven otherwise — acute fluctuating inattention demands workup for infection, hypoxia, metabolic disturbance, medications, and withdrawal before any psychiatric label is applied.
- Catatonia can mimic depression, psychosis, behavior, or refusal — look for mutism, immobility, posturing, waxy flexibility, and poor oral intake, and escalate rather than assuming oppositional behavior.

**Can't-miss / red-flag line:**

> Accepting 'please evaluate' as the consult question blocks both the consultation and the clinical decision — always name the specific decision at stake and what changed today.

**Rule-out list (differential the page forces):**

- Delirium (rule out reversible medical cause first)
- Catatonia (can mimic psychosis, refusal, or depression)
- Alcohol/benzodiazepine withdrawal (potentially life-threatening)
- Capacity impairment (always decision-specific and time-specific)

**First move (the action the page tells the learner to take):**

> Name the exact decision at stake, do a brief attention screen and focused MSE, review vitals, labs, and medications for delirium triggers, and escalate immediately for fever, rigidity, autonomic instability, or withdrawal red flags.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — For consult-style questions, define the question first: capacity, delirium, catatonia, withdrawal, or medication safety.
- **mse** — Match the MSE to the question: attention for delirium, motor signs for catatonia, four abilities for capacity, autonomic signs for withdrawal.
- **safety** — Escalate unstable vitals, delirium, malignant catatonia/NMS concern, severe withdrawal, or refusal with high medical stakes.
- **say** — I want to answer the specific consult question and also name what would make this unsafe today.
- **collateral** — Ask team/family for baseline, medical course, treatment refusal context, substance timeline, and prior episodes.
- **rounds** — State the consult question, key data, decision-specific capacity or syndrome assessment, and next supervised step.
- **exam** — Capacity is decision-specific; delirium and withdrawal are medical safety workflows, not purely psychiatric labels.
- **actions** — Open capacity tool; Open withdrawal tool

**Embedded check-for-understanding**

1. *Stem:* The medical team asks psychiatry to 'evaluate' a 68-year-old patient refusing a central line for sepsis. She was lucid yesterday. Today she is intermittently confused, cannot say the months in reverse, and believes her IV is poison. How should the capacity assessment be framed?
   - Assess the four Appelbaum abilities for this specific decision — the fluctuating inattention suggests delirium may be impairing capacity reversibly **← keyed correct**
   - Diagnose paranoid schizophrenia given the poisoning belief and document permanent lack of capacity
   - Accept the refusal as a valid patient preference — she has the right to decline
   - Order a neuropsychological battery before any capacity determination can be made
   - *Rationale:* Capacity is decision-specific: the question is whether she can communicate a stable choice, understand the information, appreciate it applies to her, and reason about options — not whether she has a diagnosis or agrees with the team. The fluctuating inattention suggests delirium as the driver, making the impairment potentially reversible and requiring immediate evaluation.

**Cross-references and tagging:**

- **Related tools:** `capacity.html`, `bfcrs.html`, `withdrawal.html`, `decision-aids.html`
- **Evidence sources:** `appelbaum-grisso-1988-capacity`
- **Workflow stages:** `safety`, `diagnosis`, `team`
- **Workflow modes:** `ward`, `safety`, `5min`, `shelf`
- **Shelf blueprint tags:** `neurocog`, `ethics`
- **EPA crosswalk:** `EPA2`, `EPA8`, `EPA11`
- **Faculty review:** {"status": "reviewed", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-15"}

#### Page text (as shipped)

# Acute And Consult Psychiatry Expansion Module

Generated: 2026-06-27

Audience: MS3 students on adult inpatient psychiatry.

Scope: consult psychiatry, capacity, delirium, catatonia, withdrawal, and urgent
escalation. This is an educational guide. Follow local protocols and supervising
clinician direction for diagnosis and treatment.

## Consult Psychiatry: The Student Frame

A good psychiatry consult starts with the question.

Ask:

1. Who is asking?
2. What decision is blocked?
3. What changed today?
4. What medical/substance/medication causes must be considered?
5. What would be different after psychiatry gives an answer?

Poor consult question:

> "Please evaluate."

Better consult question:

> "Please assess decision-making capacity to refuse IV antibiotics in a patient
> with fluctuating attention and paranoid concerns about poisoning."

## Capacity Basics

Capacity is decision-specific and time-specific. A patient can have capacity for
one decision and not another.

Assess four abilities:

1. Communicate a stable choice.
2. Understand relevant information.
3. Appreciate how the information applies personally.
4. Reason about options and consequences.

Capacity is not the same as:

- Agreeing with the team.
- Having a psychiatric diagnosis.
- Having good judgment in general.
- Being calm or likeable.
- Competence, which is a legal determination.

Student task:

- State the exact decision.
- Summarize the patient's words.
- Identify which ability is intact or impaired.
- Ask whether delirium, intoxication, psychosis, mania, depression, pain, or fear is impairing the decision.

## Delirium: Think Medical Until Proven Otherwise

Core pattern:

- Acute change.
- Fluctuating course.
- Inattention.
- Altered level of awareness or disorganized thinking.

High-yield triggers:

- Infection.
- Hypoxia.
- Metabolic disturbance.
- Medication effect or anticholinergic burden.
- Withdrawal.
- Pain.
- Sleep deprivation.
- Urinary retention or constipation.
- Recent surgery or ICU stay.

Student escalation triggers:

- New confusion or fluctuating consciousness.
- Visual hallucinations with disorientation.
- New agitation in an older or medically ill patient.
- Inattention that was not present before.
- Fever, autonomic instability, rigidity, or abnormal vitals.

Student role:

- Do a brief attention screen.
- Review vitals, labs, medications, recent PRNs, sleep, infection signs.
- Tell the resident/attending promptly.

Guideline anchor: NICE CG103 covers delirium prevention, diagnosis, and
management in hospital and long-term care. APA announced an updated delirium
practice guideline in 2025.

## Catatonia: Do Not Miss Immobility Or Excitement

Catatonia can look like withdrawal, psychosis, depression, delirium, medication
effect, or behavior. It may be hypokinetic or excited.

Look for:

- Mutism.
- Stupor or immobility.
- Posturing.
- Waxy flexibility.
- Negativism.
- Echolalia or echopraxia.
- Stereotypy or mannerisms.
- Grimacing.
- Agitation not explained by environment.
- Poor oral intake.

Red flags:

- Fever, rigidity, autonomic instability.
- Dehydration, malnutrition, immobility complications.
- Recent antipsychotic exposure with worsening rigidity or fever.

Student role:

- Describe observed motor/behavioral signs without arguing intent.
- Ask about intake, mobility, autonomic signs, and medication exposure.
- Escalate promptly.
- Do not assume "refusal" or "oppositional" behavior.

Guideline anchor: the British Association for Psychopharmacology published an
evidence-based consensus guideline for catatonia in 2023.

## Withdrawal: The First Questions

Alcohol/benzodiazepine withdrawal can be medically dangerous.

Ask:

- What substance?
- How much and how often?
- Last use?
- Prior withdrawal?
- Prior seizure or delirium tremens?
- Current tremor, sweating, anxiety, nausea, hallucinations, insomnia?
- Vital sign changes?

Alcohol withdrawal red flags:

- Prior withdrawal seizure or delirium tremens.
- Heavy daily use with recent abrupt stop.
- Autonomic instability.
- Confusion or hallucinosis.
- Severe tremor or agitation.
- Wernicke risk: malnutrition, confusion, ataxia, ophthalmoplegia, or heavy alcohol use. Verify thiamine is given before or with glucose/carbohydrate when possible; do not delay emergency glucose for true hypoglycemia.

Opioid withdrawal is usually not life-threatening by itself but is very
distressing and changes risk, engagement, and discharge planning.

Ask:

- Last opioid use.
- Route.
- Overdose history.
- Medication treatment history.
- Current symptoms: rhinorrhea, lacrimation, yawning, GI upset, myalgias, piloerection.

Student role:

- Identify risk and escalate.
- Do not invent a withdrawal protocol.
- Know whether your unit uses CIWA-Ar, COWS, or other local tools.
- Name thiamine-before/with-glucose as a red-flag safety check, because carbohydrate loading can worsen thiamine depletion and precipitate Wernicke encephalopathy.

Guideline anchor: ASAM alcohol withdrawal management guideline and pocket guide.

## Consult Note Skeleton

Use this structure:

1. Consult question.
2. Relevant timeline.
3. Safety and medical acuity.
4. MSE and cognitive screen.
5. Differential diagnosis.
6. Capacity/risk/diagnostic reasoning.
7. Recommendations, with what needs supervision or medical-team action.

## One-Minute Student Presentation For A Consult

> "The consult question is [specific decision/problem]. The key change is
> [timeline]. On exam, I am most concerned about [attention/catatonia/withdrawal/
> psychosis/risk]. The differential includes [top three]. The immediate safety or
> medical issue is [X]. I think we need [next step] and I want help with [specific
> uncertainty]."

## Quick Differential By Presentation

| Presentation | Must Consider |
|---|---|
| New psychosis | substance/medication, delirium, mania, trauma, primary psychotic disorder |
| Agitation | delirium, intoxication/withdrawal, mania, psychosis, pain, fear, akathisia |
| Mutism/withdrawal | catatonia, severe depression, psychosis, delirium, trauma response, neurologic illness |
| Refusal of care | capacity, fear/mistrust, psychosis, delirium, values, communication failure |
| Hallucinations | delirium, substance, psychosis, mood disorder, trauma, sensory impairment |

## Faculty Review Checklist

- Confirm local legal language for capacity and involuntary care.
- Confirm local withdrawal protocols.
- Confirm local delirium and catatonia workflows.
- Add hospital-specific paging/escalation instructions.

Plain-English note: this module teaches students what to notice, how to ask the
right question, and when to escalate. It deliberately avoids pretending students
should independently manage high-risk consults.


---

## C-L: Emergencies, Tox & Capacity (Numbers)

- **Slug:** `cl_reference.md` · **Type:** md · **Sidebar:** listed
- **Source:** `14_Tracks/Resident/cl_reference.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 867 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> flagged **high-yield** · est. read 7 min

**TL;DR (shown above the page text):**

> The numbers residents carry on the consult service: serotonin syndrome vs NMS, the catatonia lorazepam challenge, lithium-toxicity thresholds, and QTc action points — recognition and escalation, confirmed against institutional protocol.

**Key points (bulleted card):**

- Serotonin syndrome is fast with clonus and hyperreflexia; NMS is slow with lead-pipe rigidity and CK often >1,000 — tempo and the neuromuscular exam separate them.
- Catatonia: a ≥50% BFCRS drop after a 2 mg IV lorazepam challenge is diagnostic and therapeutic; avoid antipsychotics; ECT is definitive.
- Lithium: toxicity generally ≥1.5 mEq/L, dialysis if >4.0 (or >2.5 with severe signs) — treat the patient, not the number, in chronic toxicity.

**Can't-miss / red-flag line:**

> In serotonin syndrome, physical restraints are contraindicated — isometric contraction worsens hyperthermia and lactic acidosis; sedate instead.

**Rule-out list (differential the page forces):**

- Serotonin syndrome (clonus, hyperreflexia, fast onset)
- Neuroleptic malignant syndrome (lead-pipe rigidity, high CK, slow onset)
- Malignant catatonia (overlaps NMS)
- Lithium toxicity (tremor, ataxia, confusion)
- Anticholinergic toxicity (dry skin, flushing, urinary retention, absent bowel sounds — the mirror image of serotonin syndrome's diaphoresis and hyperactive bowel)
- CNS infection (meningitis/encephalitis) and heat stroke — fever + rigidity + altered mentation is not NMS until these are excluded

**First move (the action the page tells the learner to take):**

> Stop the offending agent, cool and support, give a benzodiazepine, and match the antidote to the syndrome — cyproheptadine for serotonin syndrome, dantrolene/bromocriptine for severe NMS.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Use consult references to recognize the syndrome, stop the offending exposure, stabilize first, and call the right help early.
- **mse** — Prioritize tempo, attention, arousal, neuromuscular findings, autonomic instability, rigidity, clonus, tremor, and fluctuating consciousness.
- **safety** — These are escalation syndromes; confirm medication, restraint, transfer, antidote, and dialysis decisions with supervising physicians and institutional protocols.
- **say** — Keep patient explanations brief and concrete during emergencies: what is happening, what the team is doing now, and who is being called.
- **collateral** — Clarify medication timing, dose changes, substances, infection/medical triggers, baseline cognition, and prior reactions.
- **rounds** — Present consult problems as syndrome, evidence, immediate risk, next test or treatment, and escalation plan.
- **exam** — Differentiate serotonin syndrome, NMS, malignant catatonia, lithium toxicity, delirium, and withdrawal by tempo and exam findings.
- **actions** — Open BFCRS; Open withdrawal tools; Open decision aids

**Embedded check-for-understanding**

1. *Stem:* A patient on a serotonergic agent develops rapid-onset hyperthermia with lower-extremity clonus and hyperreflexia. Best next step?
   - Apply physical restraints for safety
   - Start an antipsychotic to control agitation
   - Stop the agent, sedate with a benzodiazepine, and give cyproheptadine **← keyed correct**
   - Give dantrolene for presumed NMS
   - *Rationale:* Clonus and hyperreflexia with fast onset are serotonin syndrome: stop the agent, cool/support, benzodiazepine, cyproheptadine. Restraints worsen hyperthermia, antipsychotics can worsen it, and dantrolene targets NMS (slow onset, rigidity, high CK).

**Cross-references and tagging:**

- **Related tools:** `decision-aids.html`, `bfcrs.html`, `withdrawal.html`, `capacity.html`, `communication-practice.html`
- **Communication cases:** `guardedness_privacy_001`
- **Workflow stages:** `safety`, `treatment`, `team`
- **Workflow modes:** `ward`, `safety`, `5min`

#### Page text (as shipped)

# Consultation-Liaison — Emergencies, Toxicity & Capacity: Resident Numbers Reference

> ⚠️ **Resident reference —** numbers are evidence-anchored but **must be confirmed against your institutional protocol.** Recognition and escalation, not solo dosing from a teaching page.

The MS3 [Consult module](?page=exp_consult.md) teaches *what to notice and when to escalate*. This page adds the numbers residents are expected to carry on the consult service. Companion to the [Psychopharmacology Primer](?page=psychopharm_primer.md) and [Advanced Psychopharmacology](?page=adv_psychopharm.md).

## Serotonin syndrome vs. NMS — know this cold

| | Serotonin syndrome | Neuroleptic malignant syndrome |
|---|---|---|
| **Trigger** | Serotonergic agent started/increased | Dopamine antagonist (or abrupt dopaminergic withdrawal) |
| **Onset** | Fast — usually <24 h | Slow — 1–3 days (up to ~2 weeks) |
| **Neuromuscular** | **Clonus** (esp. lower-extremity), hyperreflexia, myoclonus, tremor | **"Lead-pipe" rigidity**, bradyreflexia |
| **Autonomic / temp** | Hyperthermia, tachycardia, diaphoresis, mydriasis, hyperactive bowel | Hyperthermia, labile BP/HR, diaphoresis |
| **Labs / dx** | Clinical — **Hunter criteria** (spontaneous clonus; or inducible clonus + agitation/diaphoresis; or ocular clonus + agitation; etc.) | Clinical — **CK often >1,000 U/L**, leukocytosis |
| **Course** | Resolves ~24 h after stopping the agent | Days–weeks; historical mortality **~10%** (lower with early recognition) |
| **Management** | Stop agent · benzodiazepines · **cyproheptadine** 12 mg PO then 2 mg q2h (max ~32 mg/24h) · cooling · **temp >41.1 °C is an airway emergency: sedate, intubate, and paralyze with a non-depolarizing agent (NOT succinylcholine — rhabdomyolysis/hyperkalemia risk); antipyretics do not work because the heat is muscular** | Stop antipsychotic — and **restart the dopaminergic agent if NMS followed its abrupt withdrawal** · **aggressive IV isotonic fluids** with serial CK/renal function for rhabdomyolysis and AKI · supportive cooling · benzodiazepines · **dantrolene / bromocriptine / amantadine** for severe · ECT for refractory |

**Board trap:** in serotonin syndrome, **physical restraints are contraindicated** — isometric muscle contraction worsens hyperthermia and lactic acidosis. Sedate instead.

## Catatonia — the lorazepam challenge
- Screen with the BFCRS. **Lorazepam challenge 2 mg IV** (1 mg if elderly or respiratory risk); a **≥50% reduction in BFCRS** within ~10–30 min is a positive challenge — both diagnostic and therapeutic.
- Effective in ~90%; titrate to a standing regimen, often up to ~16 mg/day (higher only under close monitoring).
- **ECT is definitive** — effective in 60–100%, and first-line for malignant catatonia or benzodiazepine non-response.
- **Avoid antipsychotics** in suspected catatonia — they can precipitate or worsen NMS (malignant catatonia and NMS overlap on a spectrum).
- *By design, the MS3 catatonia teaching page stays dose-free; these numbers live here on the resident reference.*

## Lithium toxicity
- Therapeutic 0.6–1.2 mEq/L; **toxicity generally ≥1.5**, severe ≥2.5. In *chronic* toxicity (especially older adults) symptoms may be severe even when the level looks only mildly elevated — **treat the patient, not the number.**
- Precipitants: dehydration, AKI, low sodium, NSAIDs, thiazides, ACE-inhibitors/ARBs.
- **Hemodialysis** if level **>4.0** mEq/L (any patient), or **>2.5** with severe neuro/renal signs or life-threatening features.
- **Activated charcoal does not bind lithium** — consider whole-bowel irrigation for sustained-release ingestions.
- Recheck levels after dialysis — **rebound** from tissue redistribution is expected.

## QTc / torsades de pointes
- **Act at QTc ≥500 ms, or an increase ≥60 ms** from baseline.
- Replete **K⁺ >4.0** and **Mg²⁺ >2.0**; reconcile every QT-prolonging drug and interaction.
- Higher-risk psychotropics: **IV haloperidol, ziprasidone, thioridazine (avoid), pimozide**; **citalopram capped at 20 mg** if age >60, hepatic impairment, or CYP2C19 poor metabolizer.
- Source: AHA scientific statement on drug-induced arrhythmias (Tisdale et al., *Circulation* 2020).

## Delirium — the numbers you'll be asked
- **Multicomponent non-pharmacologic prevention (HELP)** is first-line and reduces incident delirium by roughly **40–53% (OR ~0.47)** (Hshieh 2015 meta-analysis).
- **Antipsychotics do not prevent or shorten delirium:** MIND-USA (n=566) found haloperidol and ziprasidone no better than placebo. Reserve low-dose, short-course antipsychotics for *distressing* agitation only.
- **Benzodiazepines worsen delirium** — except when the delirium is withdrawal-related.
- Dexmedetomidine reduces delirium vs. benzodiazepine sedation in the ICU (context-specific; don't over-generalize to the floor).

## Decisional capacity — quick epidemiology
- **Any physician can assess capacity** — it is not a psychiatry-only determination. *Capacity* is clinical and decision-specific; *competence* is legal.
- Four abilities (Appelbaum & Grisso): **communicate a choice · understand · appreciate · reason.**
- Common contributors to incapacity: **cognitive disorders ~54%, substance use ~37%, psychosis ~25%** — many reversible (delirium, psychosis, depression). Treat the reversible cause and **reassess.**

## Psychopharmacology in organ dysfunction
- **Liver disease:** prefer benzodiazepines cleared by conjugation — **"LOT": Lorazepam, Oxazepam, Temazepam** (no oxidative metabolism). **Duloxetine is contraindicated in chronic liver disease.**
- **Renal impairment:** dose-reduce **lithium, gabapentin/pregabalin, risperidone/paliperidone, amisulpride**; paliperidone is heavily renally cleared.

## The escalation line
Serotonin syndrome, NMS, lithium toxicity, and a prolonging QTc are all **"tell someone now"** findings. Your job on the consult is rapid recognition, the first safe step (stop the offending agent, correct electrolytes, sedate rather than restrain in SS), and escalation — not solo management.

**Pair with** — the [Psychopharmacology Primer](?page=psychopharm_primer.md), [Advanced Psychopharmacology](?page=adv_psychopharm.md), the MS3 [Consult module](?page=exp_consult.md), and the [Catatonia](?page=catatonia.md) and [Delirium](?page=delirium.md) teaching pages.

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI. Confirm all thresholds and doses against institutional protocol.*


---

## Inpatient Systems & Med-Legal

- **Slug:** `systems_medlegal.md` · **Type:** md · **Sidebar:** listed
- **Source:** `14_Tracks/Resident/systems_medlegal.md`
- **Governance:** status=`reviewed` · riskKind=`legal` · riskLevel=`high`
- **Length:** 1,350 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 7 min

**TL;DR (shown above the page text):**

> Your documentation, your handling of voluntary/involuntary status, and your disposition planning are clinical acts with legal weight — do them deliberately and verify every statute-specific detail against current Maine law (Title 34-B) and hospital policy.

**Key points (bulleted card):**

- Document the reasoning behind risk and observation level, not just a score — risk categorisation has poor predictive value, and about half of suicide deaths occur in patients last classified low-risk.
- An involuntary hold is not authorization to medicate over objection; non-emergency forced medication needs its own legal/administrative process.
- Disposition starts at admission: least-restrictive level of care, a dated follow-up ≤7 days, a warm handoff, and problem-solving boarding/housing/guardianship.

**Can't-miss / red-flag line:**

> "Hold" is not "treat": verify the Maine/hospital pathway for medication over objection before treating a refusing patient, and document the emergency rationale when you medicate to prevent imminent harm.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — For every med-legal question, ask what authority is being used, what risk it addresses, what less-restrictive option was considered, and what local policy requires.
- **mse** — Document the mental-status facts that support capacity, risk, voluntariness, insight, judgment, and ability to participate in discharge planning.
- **safety** — Never treat a hold as permission for non-emergency medication over objection; confirm statutes, hospital policy, and attending direction.
- **say** — Explain limits plainly: what is voluntary, what is required for safety, what information can be shared, and what choices remain available.
- **collateral** — Use minimum-necessary disclosure, clarify consent when possible, and gather only information that changes diagnosis, risk, treatment, or discharge.
- **rounds** — Present the legal status, decision-making capacity, safety rationale, family contact plan, and disposition barrier as separate items.
- **exam** — Know the distinction between capacity and competence, commitment and medication over objection, confidentiality and duty to protect, and risk factors versus formulation.
- **actions** — Open capacity tool; Practice collateral questions; Open family systems

**Embedded check-for-understanding**

1. *Stem:* A patient on an emergency involuntary hold refuses their scheduled antipsychotic (no emergency). What is correct?
   - The hold authorizes you to medicate over objection
   - Discharge the patient for non-cooperation
   - Sedate them involuntarily to enforce the order
   - Respect the refusal and pursue the separate legal process for medication over objection **← keyed correct**
   - *Rationale:* Commitment and involuntary medication are distinct: a hold does not authorize non-emergency medication over objection, which requires its own legal/administrative pathway. Emergency medication is only for imminent harm.

**Cross-references and tagging:**

- **Related tools:** `capacity.html`, `cssrs.html`, `violence.html`, `family-systems.html`, `communication-practice.html`, `oral.html`
- **Communication cases:** `suicide_direct_question_001`, `collateral_questions_001`, `family_conflict_discharge_001`
- **Workflow stages:** `safety`, `family`, `team`
- **Workflow modes:** `ward`, `safety`, `family`

#### Page text (as shipped)

# Inpatient Systems & Med-Legal

**In one line** — on the adult inpatient unit your documentation, your handling of voluntary/involuntary status, and your disposition planning are clinical acts with legal weight; do them deliberately, and verify every statute-specific detail against current Maine law (Title 34-B) and Maine Medical Center policy before you act on it.

**Why this matters on the unit** — Inpatient psychiatry is where clinical judgment, the law, and the health system collide most visibly. You will hold people against their will, medicate over objection in narrow circumstances, restrain patients in emergencies, and decide where they go next — each step generating a record that an attorney, a surveyor, a payer, or a future treater may read. The skills below are systems-based practice and medical-legal literacy as much as psychiatry. Treat the legal specifics in this page as orientation, not authority: laws vary by state, Maine's procedures live in Title 34-B and are operationalized by hospital policy, and both change. When a real decision is in front of you, confirm the current timeline, form, and process with your attending, the social work/utilization team, and risk management.

**Documentation as a clinical and legal instrument** — Your admission H&P anchors the stay: presenting problem and timeline, psychiatric and substance history, medical comorbidity and reconciled medications, collateral, MSE, a formulation, and an initial risk and disposition plan. Daily progress notes are problem-oriented — interval events, exam changes, response to treatment, and an updated plan — not a copy-forward. Document risk explicitly: not just a screening score but your suicide and violence assessment and the reasoning behind your level-of-observation and intervention decisions (most patients who die by suicide are rated low risk at last contact, so the formulation, not the number, is what protects the patient and you). Capacity assessments are documented by the four abilities (understand, appreciate, reason, express a choice) tied to the specific decision. Restraint and seclusion require a time-limited order, the required face-to-face evaluation and monitoring, and a debrief, all charted per policy. Billing/E&M follows either total time or medical decision-making complexity — and the deeper point is that good documentation is simultaneously communication to the next treater and your medical-legal protection. If it isn't written, for these purposes it didn't happen.

**Voluntary vs. involuntary admission** — Most patients should be admitted voluntarily under the least-restrictive-alternative principle whenever they can engage. When someone meets criteria for emergency involuntary hospitalization, Maine commonly uses what clinicians call the "blue paper" — an application for emergency involuntary admission, paired with a supporting clinician certificate/examination. That emergency hold is the entry point, not the endpoint: there is a subsequent certification and judicial commitment pathway with defined patient rights (notice, hearing, counsel, periodic review). **The specific certifiers, timelines, forms, and hearing windows must be verified against current Maine statute (Title 34-B) and MMC policy — do not rely on remembered numbers, and ask the on-call attending and social work how the current process runs.** Throughout, the operating rule is least restrictive: hold only as long and as tightly as safety requires, and move to voluntary status as soon as the patient can participate. One evidence-based lever for the *next* admission is the **psychiatric advance directive (PAD)**: in a multicenter RCT, peer-worker–facilitated PADs cut compulsory admissions from **39.9% to 27.0%** over 12 months (risk difference −0.13) — worth raising with patients who have a history of involuntary holds.

**Capacity, competency, and medication over objection** — Capacity is a clinical, decision-specific determination you make at the bedside; competency is a legal status a court adjudicates. A patient can lack capacity for one decision and retain it for another, and a psychiatric diagnosis alone never settles it. Informed consent requires disclosing the nature, risks, benefits, and alternatives of treatment and confirming the patient can use that information. Critically, an involuntary hold is not the same as authorization to medicate over objection: forcing non-emergency medication on a refusing patient generally requires a separate legal or administrative process distinct from the commitment itself. The federal anchors are *Washington v. Harper* (1990) — a dangerous, mentally ill prisoner may be medicated over objection through an **administrative** review with a medical-interest finding — and *Sell v. United States* (2003) — medicating a defendant *solely* to restore trial competency requires a **judicial** finding on the four-part Sell test (important governmental interest, substantial likelihood of restoring competency without unfairly prejudicing the defense, less-intrusive means unlikely to work, and medical appropriateness); civil-inpatient standards (the *Rogers*/*Rivers* judicial models) vary by state. Verify the local Maine/MMC pathway for involuntary medication before treating over objection — and document the emergency rationale clearly when you medicate acutely to prevent imminent harm.

**Duty to protect, mandatory reporting, and confidentiality** — When a patient makes a credible threat against an identifiable person, the Tarasoff lineage may create a duty to protect (which can include warning, notifying police, hospitalizing, or otherwise intervening) — but the precise trigger and permitted actions are state-specific, so confirm Maine's standard and loop in your attending and risk management before acting. You are also a mandated reporter for suspected abuse or neglect of children, elders, and dependent/vulnerable adults; the reporting thresholds, agencies, and timeframes vary by state and must be verified locally. None of this dissolves the default of confidentiality — disclosures should be the narrowest needed to meet the legal duty or protect safety.

**Disposition and systems-based practice** — Discharge planning starts at admission. Match the patient to the least restrictive level of care that is safe: inpatient → partial hospitalization (PHP) / intensive outpatient (IOP) → residential → assertive community treatment (ACT) or community case management → supportive housing or group home → routine outpatient. Reconcile medications, schedule a concrete first appointment (not just a phone number — scheduling itself raises follow-up rates), and do a warm handoff to the receiving team; aim for follow-up within 7 days given the elevated post-discharge suicide risk. Expect utilization-review and payer pressure on length of stay, and know the hard dispositions that consume inpatient days: homelessness, the need for guardianship, patients leaving against medical advice (AMA), and psychiatric boarding while awaiting placement. Working these systemic barriers — not just the symptoms — is core to the role.

**What the resident does**
- Writes the admission H&P and problem-oriented daily notes; documents explicit risk reasoning, not just scores.
- Completes and charts four-abilities capacity assessments tied to the specific decision at hand.
- Initiates and correctly documents emergency involuntary holds (the "blue paper" + clinician certificate), then tracks the certification/commitment timeline with social work — verifying current Maine/MMC procedure each time.
- Writes time-limited restraint/seclusion orders and ensures the required monitoring, face-to-face evaluation, and debrief are documented.
- Recognizes when medication over objection requires a separate legal process and routes it correctly rather than treating under the hold alone.
- Identifies duty-to-protect and mandatory-reporting situations early and escalates to the attending and risk management.
- Drives disposition: reconciles meds, secures a dated follow-up appointment, does the warm handoff, and problem-solves boarding, housing, guardianship, and AMA scenarios.

**High-yield pearls**
- "Hold" ≠ "treat" — an involuntary admission does not by itself authorize involuntary medication; that almost always needs its own legal/administrative process. Verify Maine/MMC.
- Capacity is clinical and decision-specific; competency is legal and court-determined. Diagnosis alone never decides either.
- Document the *reasoning* behind risk and observation level — a number without a formulation protects no one, since most who die by suicide screen low-risk.
- Least restrictive alternative is the through-line: in level of care, in voluntary-vs-involuntary status, and in restraint/seclusion.
- Schedule the actual follow-up appointment before discharge and target ≤7 days — the post-discharge window is the highest-risk period for suicide.
- Peer-facilitated psychiatric advance directives cut compulsory admission 39.9%→27.0% in an RCT — a concrete least-restrictive tool to offer patients with prior involuntary holds.
- Statute specifics (timelines, certifiers, form names) vary by state and change — never quote a remembered number; confirm current Title 34-B and hospital policy.

**Pair with** — [Decisional Capacity (tool)](?page=exp_consult.md), [Family & Discharge](?page=exp_family.md), [Evidence-Based Inpatient Psychiatry](?page=evidence_inpatient.md)

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI.*


---

# SECTION: Make a Plan
