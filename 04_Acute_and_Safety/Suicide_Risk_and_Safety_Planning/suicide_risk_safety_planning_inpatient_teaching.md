# Suicide Risk & Safety Planning on the Inpatient Unit

> **Review status:** Reviewed and attested by Joshua Moss, MD (2026-07-09). Educational; fictional composites only, no PHI.

**In one line.** Suicide risk assessment is a structured clinical judgment that stratifies risk and drives two decisions — the level of care and a collaborative safety plan — rather than a prediction of an inherently unpredictable event.

**How it presents on the unit.** Ideation runs a spectrum, and where a patient sits on it matters more than a yes/no. A passive death wish ("I wish I wouldn't wake up") is not the same as active ideation, and the features that escalate concern are a specific *plan*, *intent* to act, *access to means*, and any *preparatory or rehearsal behavior* (writing a note, giving away possessions, stockpiling pills, researching methods). Denial does not exclude risk: patients minimize, and a flat "no SI" charted without detail is one of the weakest things in a note. The mental state around the ideation — hopelessness, agitation, severe insomnia, intolerable psychic pain — often tells you more than the patient's rating of their own intent.

**Ask directly — it does not plant the idea.** Asking about suicide does not increase suicidal thinking; avoiding the question only forfeits information. Move stepwise from passive death wish → active ideation → plan → intent → access to means → any preparatory acts, and document what the patient actually said, not a global "denies SI." Structure the screen with the **Columbia Suicide Severity Rating Scale (C-SSRS)**, remembering it is a screening and severity tool, not a device that predicts who will die.

**Separate risk factors from warning signs.** *Static* risk factors set the baseline and cannot be changed: a prior attempt is the single strongest long-term predictor, alongside older age, male sex, chronic or painful illness, and family history of suicide. Access to firearms raises baseline risk sharply — but unlike the others it is modifiable, which is exactly why means restriction is the intervention. *Dynamic, modifiable* factors are the treatment targets: active depression, hopelessness, agitation and insomnia, substance use, command hallucinations, and acute psychosocial loss. *Warning signs* are the near-term behavioral shifts (a sudden calm after agitation, giving things away, saying goodbye) that change the picture tonight. Protective factors (strong supports, treatment engagement, responsibility for children) are real and worth documenting, but they never override acute high-risk findings.

**Mind the high-risk windows.** Risk is not flat across the admission. The peri-discharge and immediate post-discharge period is the highest-risk window of the entire episode — the transition, not the acute inpatient stay, is when many deaths occur. Treat discharge planning as a safety intervention, not paperwork.

[Rehearse the first evening home with Leah](/tools/one-patient-six-weeks.html?case=leah&chapter=5). Ask which check-ins her friend can offer, what Leah would do if the call goes unanswered, and what the team still needs to resolve.

**Management.** Reducing access to lethal means (**means restriction**) is the prevention step with the most consistent evidence for fewer suicide deaths, though that evidence is mostly population-level. Counselling the patient and family to remove or secure firearms and lethal medication before discharge is how it reaches one patient; no high-quality trial has tested whether counselling alone lowers deaths, so do it as part of the plan rather than as the whole plan. On the unit, determine the level of care (e.g., 1:1 observation, environmental safety) with your supervisor. Build a collaborative **safety plan** (Stanley–Brown format): the patient's personal warning signs → internal coping strategies → people and settings that provide distraction → people to ask for help → professionals and crisis resources → and making the environment safer through means restriction. A safety plan is a working tool the patient co-authors — it is **not** a "no-suicide contract," which has no evidence of protecting anyone and can create false reassurance. The form itself, and the authors' training in the intervention, come from Stanley and Brown directly at [suicidesafetyplan.com](https://suicidesafetyplan.com/) — this library teaches the six steps and never reproduces or programs the form, because the authors require written permission to alter it or place it in an EMR. Treat the underlying disorder in parallel; where indicated, remember that clozapine carries an anti-suicidal indication in schizophrenia and schizoaffective disorder, and that lithium's anti-suicidal signal in mood disorders is meaningful but uncertain.

<!-- crisis-block -->

<section id="lucia-rehearsal" class="bedside-case visual-practice" aria-labelledby="lucia-title">
<header><p class="case-kicker">Discharge rehearsal · Fictional case</p>
<h3 id="lucia-title" tabindex="-1">Who could you reach at 2 a.m.?</h3>
<p>Before discharge, you and Lucía rehearse what she’ll do if suicidal thoughts return on her first night home.</p></header>
<div id="lucia-day" class="lucia-scene">
<figure><img src="illustrations/lucia-on-unit.avif" width="576" height="432" loading="lazy" alt="Lucía and a clinician sit together on the unit with her written plan."><figcaption>4 p.m. · On the inpatient unit</figcaption></figure>
<div class="step"><div class="lucia-paper"><span class="folio">Lucía’s first draft</span><blockquote>“If I feel unsafe, I’ll call my sister.”</blockquote></div>
<p><strong>Lucía:</strong> “My sister usually picks up during the day. We talk while she walks home from work.”</p>
<button type="button" id="lucia-try-night" aria-controls="lucia-night">Try it at 2 a.m.</button></div>
</div>
<div id="lucia-night" class="lucia-scene" hidden>
<figure><img src="illustrations/lucia-at-night.avif" width="576" height="432" loading="lazy" alt="Lucía imagines sitting at home with her phone in the middle of the night."><figcaption>2 a.m. · Imagining the first night home</figcaption></figure>
<div class="step"><div class="lucia-paper"><span class="folio">Lucía’s first draft</span><blockquote>“If I feel unsafe, I’ll call my sister.”</blockquote></div>
<p id="lucia-barrier" tabindex="-1"><strong>Lucía:</strong> “Oh. My sister keeps her phone on silent at night. She’d see the call in the morning.”</p></div>
</div>
<div id="lucia-work" class="step" hidden>
<h4 id="lucia-questions" tabindex="-1">Ask Lucía what might work</h4>
<p>Ask a question to hear her answer. You can ask both.</p>
<button id="lucia-ask-roommate" type="button" aria-expanded="false" aria-controls="lucia-reply-roommate">Who at home have you talked with about waking them up?</button>
<p id="lucia-reply-roommate" class="vp-reply" hidden><strong>Lucía:</strong> “My roommate told me I could knock, even late. She’s a heavy sleeper, though. If she doesn’t answer, I could text {{lifeline-number}}.”</p>
<button id="lucia-ask-text" type="button" aria-expanded="false" aria-controls="lucia-reply-text">If talking out loud felt hard, how would you want to ask for help?</button>
<p id="lucia-reply-text" class="vp-reply" hidden><strong>Lucía:</strong> “I’d rather start with a text. I could text {{lifeline-number}} myself. It’s easier to type the first sentence.”</p>
<fieldset><legend>Revise the overnight line</legend>
<p>Choose a line Lucía could use. Her answers open up the choices.</p>
<label><input type="radio" id="lucia-pick-roommate" name="lucia-revision" value="roommate" disabled> “I’ll knock on my roommate’s door.”</label>
<label><input type="radio" id="lucia-pick-text" name="lucia-revision" value="text" disabled> “I’ll text the 24-hour crisis line.”</label>
<label><input type="radio" id="lucia-pick-sister" name="lucia-revision" value="sister"> “I’ll try my sister again.”</label>
</fieldset>
<button type="button" id="lucia-apply" disabled>Apply revision</button>
<p id="lucia-feedback" class="vp-safety" tabindex="-1" hidden>Another call still goes to a silent phone. Ask Lucía about a different way to reach someone tonight, then revise her line.</p>
</div>
<div id="lucia-result" class="step" hidden>
<h4 id="lucia-result-title" tabindex="-1">Lucía’s revised plan</h4>
<dl class="lucia-paper"><dt>Before</dt><dd>“If I feel unsafe, I’ll call my sister.”</dd>
<dt>During the day</dt><dd>“I can call my sister during the day, when she usually picks up.”</dd>
<dt>At 2 a.m.</dt><dd id="lucia-new-line"></dd>
<dt>If I’m in immediate danger</dt><dd>“I’ll call {{emergency-number}} for emergency help right away.”</dd></dl>
<div class="case-choices"><button type="button" id="lucia-edit">Try another revision</button><button type="button" id="lucia-reset">Rehearse again</button></div>
</div>
<template id="lucia-line-roommate">“If I feel unsafe at 2 a.m., I’ll knock on my roommate’s door. If she doesn’t answer, I’ll text {{lifeline-number}} right away.”</template>
<template id="lucia-line-text">“If I feel unsafe at 2 a.m., I’ll text {{lifeline-number}} myself. I can start by telling the counselor I need help getting through tonight.”</template>
<footer><a href="https://www.mentalhealth.va.gov/docs/VA_SafetyPlan_quickguide.pdf">VA clinician guide to safety planning (PDF)</a></footer>
</section>

**What the student does.**
- Ask directly and document the specifics — plan, intent, means, preparatory behavior — never a bare "denies SI."
- Chase collateral and the record for a prior attempt and for firearm access — the two facts most likely to change the plan.
- Help build the safety plan *with* the patient, and know why it replaces the discredited no-suicide contract.
- Flag the peri-discharge window explicitly and make sure means-restriction counseling actually happened before the patient leaves.

**High-yield pearls.**
- A prior attempt is the strongest long-term predictor — always establish whether one exists.
- Asking about suicide does not increase risk; not asking only loses information.
- Means restriction — firearms and lethal medication above all — is the highest-yield single intervention.
- Use a collaborative safety plan, not a no-suicide contract; contracts are not protective.
- The post-discharge period is the highest-risk window — treat the transition as the intervention.

**Pair with** the C-SSRS reference page (which links Columbia's official forms and free training — the screener itself is not reproduced here), the Suicide Risk & Safety pocket card, the Mood page, and the Decisional Capacity module.

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI.*
