# Ethics & the Law: Confidentiality, Tarasoff & Reporting

> **Review status:** Reviewed and attested by Joshua Moss, MD (2026-07-31). Educational; fictional composites only, no PHI.

**In one line** — Psychiatry runs on confidentiality, but the exam and the ward turn on knowing its **limits** — when you *must* break it to protect a third party, when you *must* report abuse, and when you can treat or hold a patient *against their will* — always choosing the **least restrictive** option that keeps people safe.

**Confidentiality and its limits** — Protect patient information by default. The recognized exceptions where disclosure is permitted or required include: a **serious, credible threat to an identifiable person** (duty to protect), **mandatory reporting of abuse**, **imminent danger to self**, certain communicable-disease reporting, and specific legal/court mandates. Disclose the **minimum necessary**. Note that HIPAA permits sharing for treatment, payment, and operations — but do not take that as the whole rule on an inpatient unit, because two carve-outs sit on top of it. Records originating from a **federally assisted substance use disorder treatment program** fall under **42 CFR Part 2**, which carries its own consent requirements; recent rulemaking has been aligning Part 2 more closely with HIPAA, so confirm the current rule and whether your program is a Part 2 program rather than assuming either way. **Psychotherapy notes** are separately protected. The practical default: assume SUD-treatment information needs its own consent before you repeat it to an outside provider or a family member.

<section class="bedside-case" id="celia-family-call" aria-labelledby="cf-title">
<h3 id="cf-title">What can you tell her sister?</h3>
<p class="stem">Celia’s sister is on hold. “I was with her before she left home. Can you tell me if she’s there?” You and your resident check with Celia first.</p>
<figure><img class="art" src="illustrations/celia-and-sister.webp" width="1080" height="540" alt="Celia sits in the unit interview room. Her sister is on the phone at home."><figcaption class="names"><span>Celia · on the unit</span><span>Her sister · at home</span></figcaption></figure>
<div><h4>What does Celia want?</h4><p class="ask">Choose one version of her answer to rehearse the call.</p>
<div class="cf-preferences" role="group" aria-label="Choose Celia’s preference"><button type="button" data-case="glasses" aria-controls="cf-wish cf-phone" aria-pressed="false">“She can know I’m here.”</button><button type="button" data-case="private" aria-controls="cf-wish cf-phone" aria-pressed="false">“I’ll call her myself.”</button></div>
<div id="cf-wish" class="case-reply" aria-live="polite" hidden><p class="speaker">Celia, in private</p><blockquote id="cf-wish-words"></blockquote></div></div>
<div id="cf-phone" class="step" hidden><h4>How do you pick up the call?</h4>
<p class="source-note">Celia understands the choice and has made her wishes clear. Your resident verifies the caller’s identity, documents Celia’s limits, and takes the call with you.</p>
<p class="caller spoken">“I just want to know how she’s doing. I was up with her the other night.”</p>
<div id="cf-phone-choices" class="cf-options" role="group" aria-label="Choose what to say to the caller"></div><p id="cf-phone-feedback" role="status" class="case-reply cf-feedback" hidden></p>
<div id="cf-sister-detail" class="case-reply cf-sister" hidden><p class="speaker">Her sister</p><blockquote>“At three in the morning she was sorting the kitchen drawers. I sat with her for an hour, then I went back to bed. I don’t know when she finally slept.”</blockquote></div>
<dl class="cf-ledger" id="cf-ledger" aria-label="What crossed the phone line" hidden><div><dt><span class="dir" aria-hidden="true">←</span>Sister to team</dt><dd id="cf-incoming">At about 3 a.m., Celia was sorting drawers. Her sister stayed with her for an hour.</dd></div><div id="cf-out-row"><dt><span class="dir" aria-hidden="true">→</span>Team to sister</dt><dd id="cf-outgoing"></dd></div></dl></div>
<div id="cf-handoffs" class="step" hidden><h4>Which handoff belongs on rounds?</h4><p class="ask">Carry forward what the sister observed and the limit Celia set.</p><div class="cf-options" id="cf-rounds-options" role="group" aria-label="Choose a handoff"></div><p class="case-reply cf-feedback" id="cf-handoff-feedback" role="status" hidden></p>
<details id="cf-debrief" hidden><summary>Why this changes the handoff</summary><p id="cf-lesson"></p><p>The sister can contribute information even when Celia asks the team to keep her admission private. For an actual family call, review the patient’s wishes and applicable unit policy with the supervising clinician.</p><p><a href="https://www.hhs.gov/hipaa/for-professionals/faq/what-options-do-family-members-adult-patient-mental-illness-have-if-they-are-concerned-about.html">HHS guidance on listening to families</a> · <a href="https://legislature.maine.gov/statutes/34-b/title34-Bsec1207.html">Maine confidentiality statute</a></p></details></div>
<footer><span>Fictional encounter</span><button type="button" data-reset class="case-link">Start again</button></footer>
<template data-account="glasses">
<span data-copy="wish">“Yes, tell her I’m here. And could she bring my glasses? They’re on the hall table. I’ll tell her about the rest myself.”</span>
<span data-copy="outgoing">Presence on the unit and Celia’s request for her glasses.</span>
<span data-copy="lesson">Being allowed to ask for the glasses does not answer a later question about diagnosis, medication, or discharge. Check back with Celia if the topic changes.</span>
<div data-options="phone">
<button type="button" data-phone="spill" aria-pressed="false" aria-controls="cf-phone-feedback cf-sister-detail">“She’s here. She’s getting some rest today. Would you bring her glasses when you come?”</button>
<button type="button" data-phone="scope" aria-pressed="false" aria-controls="cf-phone-feedback cf-sister-detail">“Yes, she’s here. She asked if you’d bring her glasses. You said you were up with her. What did you see?”</button>
<button type="button" data-phone="shut" aria-pressed="false" aria-controls="cf-phone-feedback cf-sister-detail">“Yes, she’s here and she needs her glasses. I’ll have to leave the rest of the conversation to her.”</button>
</div>
<span data-comment="phone-spill">Saying how Celia is doing adds a clinical update. She gave you permission to confirm her admission and ask for her glasses.</span>
<span data-comment="phone-scope">You passed along Celia’s request and gave her sister room to describe what she saw.</span>
<span data-comment="phone-shut">You stayed within the limit on sharing. You can also invite her sister to tell you about that night. Try that opening.</span>
<div data-options="handoff">
<button type="button" data-handoff="authority" aria-pressed="false" aria-controls="cf-handoff-feedback cf-debrief">Her sister saw her up around three. Celia is comfortable with her sister receiving updates during the admission.</button>
<button type="button" data-handoff="certainty" aria-pressed="false" aria-controls="cf-handoff-feedback cf-debrief">Her sister confirmed Celia was awake all night. We asked her to bring the glasses Celia requested.</button>
<button type="button" data-handoff="supported" aria-pressed="false" aria-controls="cf-handoff-feedback cf-debrief">Her sister saw Celia up from about three to four. With Celia’s permission, we confirmed she’s here and asked for her glasses.</button>
</div>
<span data-comment="handoff-authority">Celia named two things you could share. Regular updates would need a fresh conversation about her wishes.</span>
<span data-comment="handoff-certainty">Her sister saw roughly one hour. What happened after she went back to bed is still unknown.</span>
<span data-comment="handoff-supported">That gives the team an observed window and a precise record of what Celia authorized.</span>
</template>
<template data-account="private">
<span data-copy="wish">“Please don’t tell her I’m here. I know she’s worried. I want her to hear it from me when I call.”</span>
<span data-copy="outgoing">No patient details. The team listened without confirming an admission.</span>
<span data-copy="lesson">A private admission still leaves room to listen. Record the sister’s observation, its limits, and Celia’s request so the next shift can handle a second call consistently.</span>
<div data-options="phone">
<button type="button" data-phone="shut" aria-pressed="false" aria-controls="cf-phone-feedback cf-sister-detail">“I can’t discuss anyone on the unit. You’ll need to wait until you hear from your sister.”</button>
<button type="button" data-phone="spill" aria-pressed="false" aria-controls="cf-phone-feedback cf-sister-detail">“I understand you’re worried. She wants to call you herself, so I’ll let her give you the update.”</button>
<button type="button" data-phone="scope" aria-pressed="false" aria-controls="cf-phone-feedback cf-sister-detail">“I hear how worried you are. I can’t confirm who’s here, but I can listen. What happened that night?”</button>
</div>
<span data-comment="phone-shut">This protects privacy, but closes off a firsthand observation. Try an opening that also lets the caller speak.</span>
<span data-comment="phone-spill">Relaying Celia’s private message would signal you have spoken with her. She asked you to keep even her presence private.</span>
<span data-comment="phone-scope">You invited the sister’s account while keeping Celia’s presence private.</span>
<div data-options="handoff">
<button type="button" data-handoff="supported" aria-pressed="false" aria-controls="cf-handoff-feedback cf-debrief">Her sister saw Celia awake from about three to four. We heard her account and respected Celia’s request for privacy about her admission.</button>
<button type="button" data-handoff="authority" aria-pressed="false" aria-controls="cf-handoff-feedback cf-debrief">Her sister gave us useful sleep history. Since she’s involved now, the team can confirm the admission on the next call.</button>
<button type="button" data-handoff="certainty" aria-pressed="false" aria-controls="cf-handoff-feedback cf-debrief">We kept the admission private. Her sister confirmed that Celia went the entire night without sleep.</button>
</div>
<span data-comment="handoff-supported">The next shift knows both the source of the history and the limit on what it may say to this caller.</span>
<span data-comment="handoff-authority">Providing information gives the sister a voice in the history. It does not give the team permission to confirm the admission.</span>
<span data-comment="handoff-certainty">The privacy limit is correct. The sister went back to bed after about an hour and could not observe the rest of the night.</span>
</template>
</section>

**Duty to protect / warn (Tarasoff)** — When a patient makes a **serious threat of violence against a reasonably identifiable victim**, the clinician may have a duty to take reasonable protective steps — which may include **warning the potential victim, notifying police, hospitalizing the patient, or intensifying treatment**. The duty, and what discharges it, varies by state (mandatory in some, permissive in others, absent in a few). Check your state's statute; in Maine, 34-B M.R.S. §1207(6-A) directs a licensed mental health professional to disclose, in good faith, the information needed to avert a serious and imminent threat to health or safety to anyone reasonably able to prevent or minimize it, including the target. The tested principle is: *a specific threat to a specific person overrides confidentiality.*

**Mandatory reporting** — Report suspected **child abuse or neglect** (mandated in every state) and, where your state mandates it (most do, not all), **elder/dependent-adult abuse** to the appropriate agency — reporting requires **reasonable suspicion, not proof**, and mandated reporters are generally protected when reporting in good faith. Check your state's statute; in Maine, physicians, residents and mental health professionals must report immediately when they know or have reasonable cause to suspect that an incapacitated or dependent adult has been or is likely to be abused, neglected or exploited (22 M.R.S. §3477) — the trigger is incapacity or dependency, not age alone. Remember: **factitious disorder imposed on another (medical child abuse)** is reportable, and many jurisdictions add specific duties (e.g., certain injuries, some intimate-partner situations). When in doubt, protect the vulnerable person.

**Involuntary hospitalization (civil commitment)** — The usual criteria are a mental illness *plus* **danger to self, danger to others, or grave disability** (inability to meet basic needs). Emergency holds allow short-term detention for evaluation; longer commitment requires due process (hearing), and under *Addington v. Texas* (1979) the constitutionally required minimum standard of proof is **"clear and convincing evidence"** (some states require more). Check your state's statute; in Maine, the District Court must find by clear and convincing evidence that the person is mentally ill and that the illness poses a likelihood of serious harm (34-B M.R.S. §3864(6)). A person who is **not dangerous and can survive safely in the community cannot be confined** against their will (*O'Connor v. Donaldson*, 1975). Involuntary hospitalization does **not** by itself authorize involuntary medication.

**Right to refuse & involuntary medication** — Competent patients (including many involuntarily hospitalized ones) generally retain the **right to refuse medication**. Overriding that refusal requires either a **true emergency** (imminent danger) or a **separate legal/adjudicated process** (e.g., a court or independent review depending on jurisdiction) — for example, an **administrative review** for a dangerous, mentally ill prisoner (*Washington v. Harper*, 1990), or the **four-part *Sell* test** to medicate a defendant solely to restore competency to stand trial (*Sell v. United States*, 2003) — both criminal-justice cases; civil involuntary medication follows state law. Commitment status ≠ consent. Check your state's statute; in Maine, the District Court can authorize treatment over objection for a committed patient who lacks capacity (34-B M.R.S. §3864(7-A)), or a clinical review panel can order it for a committed patient who lacks capacity at a state or designated hospital (34-B M.R.S. §3861(3)).

**Informed consent & capacity** — Valid consent requires **capacity, disclosure (risks/benefits/alternatives), and voluntariness**. **Capacity is decision-specific and clinical** (a physician assesses it); **competence is a legal determination** (a court decides). The four abilities: *communicate a choice, understand, appreciate, and reason.* The **emergency exception** permits necessary treatment when consent can't be obtained and delay would cause harm. For patients who lack capacity, use advance directives or a surrogate/substituted judgment.

**Minors & special situations** — Parents/guardians generally consent for minors, with exceptions (emancipated/mature minors and, in many states, care for STIs, contraception, substance use, and some mental-health services). Balance adolescent confidentiality against safety.

**Boundaries & professionalism** — Maintain professional boundaries; **sexual relationships with patients are never acceptable**. Avoid dual relationships and manage conflicts of interest. Document decisions — especially risk assessments and any breach of confidentiality — with your reasoning.

**What the student does** —
- Treat confidentiality as the default and know the specific exceptions cold.
- For a threat to an identifiable person, escalate (warn/notify/hospitalize) — don't sit on it.
- Report suspected child abuse — and elder/dependent-adult abuse where your state mandates it — on *reasonable suspicion*; you don't need proof.
- Separate the four legal states: voluntary vs committed, and has-capacity vs court-determined-incompetent — commitment doesn't equal consent to medicate.
- Document capacity assessments and the reasoning behind any disclosure or involuntary intervention.

**High-yield pearls**
- A serious threat to an identifiable victim can trigger a duty to protect (Tarasoff) — mandatory, permissive or absent depending on the state; where it applies, confidentiality yields.
- Child abuse is a mandated report on *reasonable suspicion*; elder/dependent-adult abuse is mandated in most states (check yours); good-faith reporters are protected.
- Commitment criteria: danger to self, danger to others, or grave disability — and use the least restrictive option.
- The constitutional minimum standard of proof for commitment is *clear and convincing evidence* (*Addington v. Texas*; some states require more); a non-dangerous patient who can survive safely in the community cannot be confined (*O'Connor v. Donaldson*).
- Involuntary hospitalization ≠ involuntary medication; refusal stands absent an emergency or legal process.
- Capacity is clinical and decision-specific; competence is a legal (court) determination.
- Informed consent = capacity + disclosure + voluntariness; the emergency exception covers necessary urgent care.
- Sexual contact with a patient is always an ethics violation.

<!-- crisis-block -->

**Pair with** — the <a href="tools/capacity.html" target="_blank" rel="noopener">Decisional Capacity tool</a>, the [Suicide Risk & Safety pocket guide](?page=pg_suicide.md), the <a href="tools/violence.html" target="_blank" rel="noopener">Violence Risk (FRST) tool</a>, and [Culture, Disparities & Formulation](?page=cultural_psychiatry.md).

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI. Laws vary by state — follow your institution's policy and local statute.*
