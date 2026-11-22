# Family Meeting Playbook (90-min)

> **Review status:** Reviewed and attested by Joshua Moss, MD (2026-07-03). Educational; fictional composites only, no PHI.

**In one line** — A structured 90-minute inpatient family meeting: prepare deliberately, join the family, share the picture in plain language, surface and de-shame expressed emotion, then build a concrete plan together. Use it as a scaffold, not a script — the family's needs set the pace.

## When to use it

Convene a family meeting for a first episode, a relapse, a high-expressed-emotion home, a complex disposition, a safety plan that depends on the family, or any time the people who will support the patient after discharge need a shared understanding. Earlier is better — don't save the meeting for the day of discharge. You are **planting a seed, not harvesting one**: the relapse-prevention benefit of family work accrues over the following ~12 months, and a single meeting rarely shows its payoff on the unit — which is exactly why starting it inpatient and securing the outpatient handoff matters (the dose that works is ≥10 sessions; ≤2 is ineffective).

## Before the meeting (≈15 min prep)

- **Confirm consent and scope.** The patient agrees to the meeting and to what may be shared; document it. Respect the patient's limits on disclosure (PHI is the patient's to share).
- **Set the goal in one sentence.** "Align on the diagnosis and the discharge plan," or "Lower the temperature at home and agree on warning signs." A meeting with one clear goal beats a meeting that tries to do everything.
- **Know your audience.** Who is coming, who is missing, who holds influence, what each person is most worried about.
- **Brief the team.** Agree on who leads, who takes notes, who watches the patient's distress, and the two or three messages everyone will keep consistent.
- **Logistics.** A private room, enough chairs, phones silenced, a qualified professional interpreter if anyone needs one (not a family member), ~90 minutes protected, and a plan for breaks.

<section class="bedside-case" id="nell-family-meeting" aria-labelledby="nell-title">
<header><p class="case-kicker">Family meeting · Fictional case</p>
<h3 id="nell-title">What can we talk about together?</h3>
<p>You’re the resident. Check in with Nell before their sister Jo joins you, then practice what to say with both of them in the room.</p></header>
<div class="nell-spread">
<figure id="nell-scene" tabindex="-1" aria-labelledby="nell-scene-label"><img id="nell-scene-art" width="640" height="480" src="illustrations/nell-private.avif" alt="Nell and the resident sit together in the meeting room before Jo arrives."><figcaption><strong id="nell-scene-label"></strong><span id="nell-scene-people"></span></figcaption></figure>
<div class="nell-dialogue">
<p class="case-kicker" id="nell-speaker"></p><blockquote id="nell-scene-quote"></blockquote>
<div id="nell-choice-panel"><h4 id="nell-question" tabindex="-1"></h4><div id="nell-options" role="group" aria-labelledby="nell-question"></div></div>
<div id="nell-feedback" tabindex="-1" role="group" aria-label="Response to your words" hidden>
<p><strong>You said</strong> <span id="nell-said-line"></span></p>
<div class="case-reply"><p class="case-kicker" id="nell-reply-speaker"></p><blockquote id="nell-reply-line"></blockquote></div>
<p id="nell-coach"></p><button type="button" id="nell-feedback-action"></button></div>
<div id="nell-handoff" aria-labelledby="nell-handoff-title" hidden><h4 id="nell-handoff-title" tabindex="-1">Your update to the team</h4><blockquote></blockquote><button type="button" class="case-link" id="nell-replay">Rehearse again</button></div>
</div></div>
<template data-nell-stage="private">
<img src="illustrations/nell-private.avif" alt="Nell and the resident sit together in the meeting room before Jo arrives."><strong data-label>1 of 2 · Private check-in</strong><span data-people>Nell and you</span>
<p data-speaker>Nell · in private</p><blockquote data-quote>“I’d like Jo to drive me to my follow-up on Thursday at ten. You can talk with her about the time and the ride. I want to tell her myself what brought me here.”</blockquote><p data-question>How will you check what Nell wants?</p>
<div data-choice><button id="nell-private-broad" type="button">“I’ll fill Jo in and then we can figure out Thursday. Does that work?”</button>
<span data-speaker>Nell replies</span><blockquote data-reply>“Wait. Fill her in on what? I want to be the one to tell her why I’m here.”</blockquote><p data-coach>“Fill Jo in” leaves Nell guessing about what you will share. Try naming the part Nell asked you to handle.</p></div>
<div data-choice data-confirm><button id="nell-private-scope" type="button">“I can ask Jo about the time and the ride. You want to tell her yourself what brought you here. Did I get that right?”</button>
<span data-speaker>Nell replies</span><blockquote data-reply>“Yes. Please ask her about Thursday. I’ll decide when to tell her the rest.”</blockquote><p data-coach>Nell has confirmed what you can discuss with Jo and what they want to say themselves.</p></div>
<div data-choice><button id="nell-private-narrow" type="button">“I’ll just listen today and let you handle the conversation with Jo.”</button>
<span data-speaker>Nell replies</span><blockquote data-reply>“Could you ask her about the ride, though? That’s the part I want help with.”</blockquote><p data-coach>Nell asked for your help with one practical task. Try saying exactly what you can take on.</p></div>
</template>
<template data-nell-stage="meeting">
<img src="illustrations/nell-meeting.avif" alt="Jo joins Nell and the resident for the family meeting."><strong data-label>2 of 2 · In the meeting</strong><span data-people>Nell, Jo and you</span>
<p data-speaker>Jo · with Nell present</p><blockquote data-quote>“I can help with rides. But can someone tell me what happened? I didn’t even know Nell was here until yesterday.”</blockquote><p data-question>What will you say to Jo?</p>
<div data-choice><button id="nell-meeting-signal" type="button">“Nell told me there’s more they want to explain to you later. For now, could we talk about Thursday?”</button>
<span data-speaker>Nell replies</span><blockquote data-reply>“I didn’t say I’d explain it later. I wanted to decide that part myself.”</blockquote><p data-coach>Try a repair with Nell first. “I spoke for you. I’m sorry. You get to decide whether to have that conversation.” Then come back to Jo’s concern and the ride.</p></div>
<div data-choice><button id="nell-meeting-pressure" type="button">“It sounds like you’ve been worried. Nell, would you tell Jo what brought you in?”</button>
<span data-speaker>Nell replies</span><blockquote data-reply>“I wasn’t ready to do that right now.”</blockquote><p data-coach>Try a repair. “Nell, I put you on the spot. I’m sorry. You get to decide when you want to talk.” Then return to the part Nell asked you to handle.</p></div>
<div data-choice data-confirm><button id="nell-meeting-scope" type="button">“That sounds like a shock, Jo. I’m here to listen if there’s something you’d like us to know. Nell asked me to help with a ride for Thursday at ten. Would that time work for you?”</button>
<span data-speaker>Jo replies</span><blockquote data-reply>“Ten? Yes, I’m off that morning. I can drive you, Nell. We can figure out when to leave.”</blockquote><p data-coach>Jo confirmed she can drive on Thursday. You can now report what Nell requested and what Jo agreed to.</p></div>
</template>
<template data-nell-update>“In private, Nell asked me to discuss timing and transportation for Thursday’s follow-up with Jo. Nell wants to tell Jo personally what brought them to the hospital. In the meeting, Jo confirmed she can drive Nell to the ten o’clock visit. They still need to agree on a pickup time.”</template>
</section>

## The 90-minute arc

**1 · Open and join — 0:00–0:15.** Introduce everyone and their role. Name the goal and the rough agenda, and set simple ground rules (one person at a time; everyone gets heard; we focus on what helps next). Start by asking the family what *they* most want from the meeting — and write it down.

**2 · Share the picture — 0:15–0:35.** Give the team's understanding in plain language: what the diagnosis is and isn't, what the course and treatment look like, and what to expect. Avoid jargon; check understanding as you go ("What's your understanding of what we just covered?"). Let the patient speak to their own experience.

**3 · Hear the family and read the emotional climate — 0:35–0:55.** Invite each member's perspective and validate it. Listen for **expressed emotion** — criticism, hostility, and emotional over-involvement — without correcting it in the moment. De-shame: frame symptoms and behavior as illness and regulation, not character or fault. In our experience this is the phase most often squeezed out, and it is where expressed emotion becomes workable; protect the time for it.

**4 · Problem-solve and plan — 0:55–1:20.** Move to concrete, shared goals. Agree on roles, on a few communication skills to try at home, on early warning signs and what to do about them, on the crisis and safety plan, and on the discharge logistics (medications, follow-up, transport, supports). Keep it specific and realistic.

**5 · Summarize and close — 1:20–1:30.** Recap the plan in the family's own words, hand over a written version, name the next contact and follow-up, and answer remaining questions. End with one realistic, hopeful next step.

## The stance that makes it work

Multipartiality over neutrality — you can hold several truths at once. Take the **translator** role (structure ↔ control, anger ↔ fear). Keep a **de-shaming** lens (behavior as regulation, not character). Coach **influence, not control.** With an acutely psychotic or highly distressed patient, keep it brief, concrete, and low-stimulation — interpretation waits.

## Document it

Chart who attended, the consent and disclosure limits, the shared understanding reached, the agreed plan and roles, the warning signs and crisis plan, and the follow-up. A good note makes the meeting durable.

## Common pitfalls

Letting information-sharing eat the whole meeting; correcting expressed emotion instead of understanding it; promising what the system can't deliver; running the meeting *at* the family rather than *with* them; and convening so late that there's no time to act on what you learn.

<!-- crisis-block -->

**Pair with** the [Family Therapy Modalities](?page=family_modalities.md) overview and the expressed-emotion teaching, the [Family & Discharge](?page=exp_family.md) module, and Week 4 of the curriculum.

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI.*
