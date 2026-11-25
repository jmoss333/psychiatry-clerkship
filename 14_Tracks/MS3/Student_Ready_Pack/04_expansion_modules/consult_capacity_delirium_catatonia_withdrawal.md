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

<section id="consult-callback" class="bedside-case" aria-labelledby="cc-title">
<h3 id="cc-title">What decision is the team waiting on?</h3>
<p class="lead">You’re with the psychiatry consult resident on morning rounds. A page comes in from medicine.</p>
<figure class="pager">
  <div class="pager-face">
    <div class="housing-mark"><span aria-hidden="true" class="diode"></span>Consult pager<span class="grille" aria-hidden="true"></span></div>
    <div class="lcd">
      <div class="lcd-head"><span>Medicine floor</span><time datetime="08:12">08:12</time></div>
      <blockquote>“Can you come see her? She won’t let us hang the antibiotic.”</blockquote>
    </div>
  </div>
  <figcaption>Fictional inpatient consult</figcaption>
</figure>
<section class="map" aria-labelledby="cc-map-title">
  <div class="map-heading"><h4 id="cc-map-title">Build the consult question</h4><span id="cc-count">0 of 3 heard</span></div>
  <p class="instruction">Choose whom to hear from. You can try a callback at any point.</p>
  <div class="stops">
    <div class="stop" data-slot="intern" data-opened="false">
      <button type="button" data-source="intern" aria-expanded="false" aria-controls="cc-source-card">
        <span class="node" aria-hidden="true"></span><span><strong>The decision</strong><span class="slot-text">Call the medicine intern</span></span><span class="arrow" aria-hidden="true">⌄</span>
      </button>
    </div>
    <div class="stop" data-slot="nurse" data-opened="false">
      <button type="button" data-source="nurse" aria-expanded="false" aria-controls="cc-source-card">
        <span class="node" aria-hidden="true"></span><span><strong>The change</strong><span class="slot-text">Check with the bedside nurse</span></span><span class="arrow" aria-hidden="true">⌄</span>
      </button>
    </div>
    <div class="stop" data-slot="patient" data-opened="false">
      <button type="button" data-source="patient" aria-expanded="false" aria-controls="cc-source-card">
        <span class="node" aria-hidden="true"></span><span><strong>Her concern</strong><span class="slot-text">Ask the patient</span></span><span class="arrow" aria-hidden="true">⌄</span>
      </button>
    </div>
  </div>
  <div id="cc-source-card" class="source-card" hidden><span class="speaker"></span><blockquote data-quote></blockquote></div>
</section>
<section class="call" aria-labelledby="cc-call-title">
  <h4 id="cc-call-title">Call medicine back</h4>
  <p class="instruction">The intern picks up. What do you say?</p>
  <div class="choices" role="group" aria-label="Choose your callback">
    <button type="button" data-call="broad" aria-pressed="false">“We’ll come see her, take a history, and put our impressions in the chart.”</button>
    <button type="button" data-call="premature" aria-pressed="false">“She’s refusing treatment for an infection. I’d start by calling her family to make the decision.”</button>
    <button type="button" data-call="focused" aria-pressed="false">“Let’s pin down the decision she’s being asked to make and what’s getting in the way.”</button>
  </div>
  <div id="cc-reply" class="reply" role="status" hidden></div>
  <div id="cc-receipt" class="receipt" hidden>
    <h4>Consult question for rounds</h4>
    <p>Can she decide about IV antibiotics for her infection right now? Her nurse describes a change in attention. She wants to check whose name is on the bag. Review the label with her, then explore what she understands about treatment, what could happen if she waits, and how she weighs those options.</p>
    <details><summary>Debrief with your resident</summary>
    <p>What she says after the label is checked matters. Her initial objection could be a reasonable safety concern. Ask what she would choose now and why. The medical team can assess the change in attention and the urgency of treatment alongside that conversation.</p>
    <p class="sources">Further reading · <a href="https://www.nice.org.uk/guidance/ng108/chapter/recommendations">Supporting decisions</a> · <a href="https://www.nice.org.uk/guidance/cg103/chapter/Recommendations#indicators-of-delirium-at-presentation">Recognizing changes in attention</a></p>
    </details>
  </div>
</section>
<footer><button type="button" id="cc-reset">Start again</button></footer>
<template data-answers>
<div data-account="intern">
<span data-speaker>Medicine intern</span>
<span data-instruction>Call the medicine intern</span>
<span data-summary>Whether to take this morning’s IV antibiotic</span>
<span data-quote>“Her blood cultures came back overnight. We recommended keeping the IV antibiotic going. She’s asking us to wait. I’m going back in with my senior. Can you help us figure out whether she understands what waiting could mean?”</span>
</div>
<div data-account="nurse">
<span data-speaker>Bedside nurse</span>
<span data-instruction>Check with the bedside nurse</span>
<span data-summary>Her attention has varied since yesterday</span>
<span data-quote>“Yesterday she walked me through her whole med list. At six this morning I kept losing her halfway through a question. At breakfast she was following me again. That’s different for her. I’ve let the medicine team know.”</span>
</div>
<div data-account="patient">
<span data-speaker>Patient</span>
<span data-instruction>Ask the patient</span>
<span data-summary>She wants to see the name on the IV bag</span>
<span data-quote>“I heard somebody say another name out in the hall. Then they came straight in here with that bag. I haven’t got my glasses. Can we look at the label together before you hook it up?”</span>
</div>
<span data-question-for="none">“Let’s pin down the decision she’s being asked to make and what’s getting in the way.”</span>
<span data-question-for="intern">“I’ll ask what’s making her hesitate about the IV antibiotic and check whether anything’s changed today.”</span>
<span data-question-for="nurse">“Her nurse has noticed a change in attention. What decision is the team trying to make with her this morning?”</span>
<span data-question-for="intern nurse">“Her attention has been up and down. Let’s hear why she wants to wait before we assess this antibiotic decision.”</span>
<span data-question-for="patient">“She wants to check the name on the bag. Can you walk me through what you’ve offered her?”</span>
<span data-question-for="intern patient">“She wants to see the label. Let’s check it with her and ask the nurse how she’s been following conversations.”</span>
<span data-question-for="nurse patient">“She wants to see the label, and her attention has varied. What exactly are you asking her to decide this morning?”</span>
<span data-question-for="intern nurse patient">“Let’s check the label with her. Given the change in attention, we’ll assess how she understands and weighs taking the IV antibiotic now. What’s your window for the decision?”</span>
<span data-reply-for="broad-initial">“Okay, but what are you coming to help us decide? I can tell you what we’re trying to do this morning.”</span>
<span data-reply-for="premature-initial">“Hang on. Has anyone asked her why she wants to wait? I’d like to hear from her before we ask family to speak for her.”</span>
<span data-reply-for="focused-intern">“Have you got a minute? Let me tell you what we talked about with her this morning and why I paged.”</span>
<span data-reply-for="broad-intern">“Thanks. My senior is coming back to the bedside. What question about this antibiotic decision should I tell her you’ll help us answer?”</span>
<span data-reply-for="focused-patient">“Yes, that’s the decision. We still need the patient’s own words. Can you ask what’s making her hesitate?”</span>
<span data-reply-for="premature-patient">“She asked about the name on the bag. Can we check it with her and hear what she thinks before asking anyone else to decide?”</span>
<span data-reply-for="focused-nurse">“I’ll bring the bag in. Would you check with the bedside nurse about how she’s been following the conversation today?”</span>
<span data-reply-for="focused-complete">“I’ll bring the bag and get my senior. We can check the label together now, explain why we’re recommending treatment today, and hear what she makes of it.”</span>
<span data-ask-intern>Ask the intern what decision is pending</span>
</template>
</section>

<section id="grief-consult" class="bedside-case" aria-labelledby="gc-title">
<h3 id="gc-title">He just lost his wife. Can you come up?</h3>
<figure class="scene">
  <img src="illustrations/grief-bedside.webp" loading="lazy" width="960" height="640" alt="A patient holds a folded tissue. A member of the consult team sits beside him at eye level.">
  <figcaption>
    <div class="scene-tabs" role="group" aria-label="Compare the original page with the patient’s latest words">
      <button type="button" data-view="page" aria-pressed="true" aria-controls="gc-scene-quote">Nurse’s page</button>
      <button type="button" data-view="words" aria-pressed="false" aria-controls="gc-scene-quote" disabled>Patient’s words</button>
    </div>
    <blockquote id="gc-scene-quote">“His daughter just called. His wife died this afternoon. He’s crying and keeps saying, ‘I can’t do this.’ I’m sitting with him. Could you come up?”</blockquote>
    <p id="gc-scene-speaker">Bedside nurse · Medicine floor · 16:10</p>
  </figcaption>
</figure>
<p class="setup">You come in with the consult resident. He turns a tissue over in his hands. There’s a chair beside him.</p>
<div class="versions" role="group" aria-label="Choose a version of this fictional encounter">
  <span>Same page, two conversations</span>
  <div><button data-version="a" aria-pressed="true" type="button">Conversation A</button><button data-version="b" aria-pressed="false" type="button">Conversation B</button></div>
</div>
<section class="visit" aria-labelledby="gc-opening">
  <h4 id="gc-opening">What do you say first?</h4>
  <div class="options" role="group" aria-label="Choose your opening line">
    <button type="button" data-opening="presence">“I’m so sorry about your wife. Would it be okay if I sat with you for a minute?”</button>
    <button type="button" data-opening="practical">“Is there somebody you’d like me to call for you?”</button>
    <button type="button" data-opening="history">“Had you been feeling down before today, too?”</button>
  </div>
  <div id="gc-reaction-panel" class="voice" aria-live="polite" hidden><span>Patient</span><blockquote id="gc-reaction"></blockquote></div>
  <button type="button" class="next" id="gc-repair" hidden></button>
  <button type="button" class="next" id="gc-meaning" hidden>“When you say ‘I can’t do this,’ what feels hardest right now?”</button>
  <div id="gc-clue-panel" class="voice" aria-live="polite" hidden><span>Patient</span><blockquote id="gc-clue" tabindex="-1"></blockquote></div>
  <section id="gc-questions" hidden>
    <h4>What do you want to ask him?</h4>
    <div class="options" role="group" aria-label="Choose a follow-up question">
      <button type="button" data-ask="support"></button>
      <button type="button" data-ask="safety"></button>
    </div>
    <div id="gc-answer-panel" class="voice" aria-live="polite" hidden><span>Patient</span><blockquote id="gc-answer"></blockquote></div>
    <p id="gc-immediate" class="bedside-action" hidden><strong>At the bedside now</strong> Stay with him. Call the nurse and supervising resident to join you now for an urgent safety assessment.</p>
  </section>
</section>
<section id="gc-handoffs" class="visit" hidden aria-labelledby="gc-handoff-title">
  <h4 id="gc-handoff-title">What will you tell the nurse?</h4>
  <div class="options" role="group" aria-label="Choose your team update">
    <button type="button" data-line="call"></button>
    <button type="button" data-line="urgent"></button>
    <button type="button" data-line="diagnosis">“He’s been crying since the call. I’d ask the resident about medication to settle him before we talk more.”</button>
  </div>
  <p id="gc-feedback" class="feedback" role="status" hidden></p>
  <div id="gc-update" class="update" hidden><h4>Bedside handoff</h4><p></p></div>
  <details id="gc-debrief" hidden><summary>Debrief with your resident</summary><p id="gc-teaching"></p><p class="readings"><a href="https://www.cancer.gov/about-cancer/advanced-cancer/caregivers/planning/bereavement-hp-pdq">NCI · Bereavement and grief</a><a href="https://www.nimh.nih.gov/research/research-conducted-at-nimh/asq-toolkit-materials/adult-inpatient/adult-inpatient-brief-suicide-safety-assessment-worksheet">NIMH · Inpatient suicide safety assessment</a></p></details>
</section>
<footer><a id="gc-contacts" href="#grief-unit-contacts">Unit and crisis contacts</a><button type="button" id="gc-reset">Start again</button></footer>
<template data-grief-common>
<span data-text="opening-presence">“Yeah. Thanks. Her name was Lynn. I keep picking up my phone to call her.”</span>
<span data-text="opening-practical">“There’s a list of people a mile long. Could you just sit for a minute first?”</span>
<span data-text="opening-history">“Before today? She called me at breakfast. We were arguing about where I’d left her car keys.”</span>
<span data-text="repair-practical">“Of course. The calls can wait. Would you like me to sit here?”</span>
<span data-text="repair-history">“I got ahead of you. I’m sorry about your wife. I can sit with you, if you’d like.”</span>
<span data-text="repaired-practical">“Thank you. Lynn would’ve known what to do. She always did.”</span>
<span data-text="repaired-history">“Yeah. Sit down. I keep thinking I should call Lynn and tell her what just happened. How crazy is that?”</span>
<span data-text="patient-label">Patient · At the bedside</span>
</template>
<template data-grief-version="a" data-requires="support" data-match="call">
<span data-text="clue">“It’s our son. I’ve got his number up on my phone. How do you tell your kid his mom died? I can’t make myself press the button.”</span>
<span data-text="teaching">The call to his son was the part he could name. Asking what he wanted gave him a choice about company and privacy. If he agrees, offer to check back after the call. Tears on the day of a loss can be part of acute grief. Assess other symptoms and safety concerns as the history warrants.</span>
<span data-text="question-support">“Would you like some privacy to call your son, or would it help if I stayed?”</span>
<span data-text="question-safety">“I want to make sure I understand. Have you been thinking about suicide today?”</span>
<span data-text="answer-support">“Stay, please. I want him to hear it from me. Would you sit here while I call my son?”</span>
<span data-text="answer-safety">“No. I don’t want to die. I just don’t know how to get those words out.”</span>
<span data-text="label-call">“I think he’d like company for the call to his son. I’ll check what he wants before I tell the team that’s the plan.”</span>
<span data-text="label-call" data-after="support">“He asked me to sit with him while he calls his son. I’ll stay for the call and offer to check back afterward.”</span>
<span data-text="label-urgent">“I’m worried by how upset he is. I’d lead with an urgent suicide evaluation.”</span>
<span data-text="feedback-call">That’s a reasonable offer. Ask him whether he would like company or privacy before you put it in the handoff.</span>
<span data-text="feedback-call" data-after="support">You checked his preference and kept him in charge of how his son hears the news.</span>
<span data-text="feedback-urgent">If you are concerned about his safety, ask him directly. So far he has told you what makes calling his son so hard.</span>
<span data-text="feedback-urgent" data-after="safety">He denied wanting to die when asked and described the call to his son. Ask about any other safety concerns, and let his specific request guide the immediate handoff.</span>
<span data-text="feedback-diagnosis">Crying soon after this news tells you he is hurting. It gives you little basis for a medication recommendation. What did he say he needed?</span>
<span data-text="update">“His wife died this afternoon. He wants to tell his son himself and asked me to sit with him while he calls. I’ll stay and offer to check back after.”</span>
<span data-text="update" data-after="safety">“His wife died this afternoon. He wants to tell his son himself and asked me to sit with him while he calls. He denied current suicidal thoughts when I asked. I’ll stay and offer to check back after.”</span>
</template>
<template data-grief-version="b" data-requires="safety" data-match="urgent" data-urgent="true">
<span data-text="clue">“I keep wishing I could go with her. I haven’t said that to my daughter. She’s got enough on her plate.”</span>
<span data-text="teaching">His wish to be with Lynn needed clarification. His next words established current suicidal thoughts and that he felt unsafe alone. Stay with him and involve the bedside nurse and supervising resident immediately. They can assess urgency, intent, access to means, and what will keep him safe. He can still choose whom he wants with him.</span>
<span data-text="question-support">“Is there someone else you’d like here with us?”</span>
<span data-text="question-safety">“When you say you want to be with Lynn, are you thinking about killing yourself right now?”</span>
<span data-text="answer-support">“Maybe my daughter later. For now, could you just stay here with me?”</span>
<span data-text="answer-safety">“Yes. I’m thinking about killing myself. It scares me to say that out loud. I don’t feel safe alone right now.”</span>
<span data-text="label-call">“I’ll offer to call his daughter and give him some private time with her.”</span>
<span data-text="label-urgent">“He said he wants to be with his wife. I’m staying with him. Please join us while I ask him directly what he meant.”</span>
<span data-text="label-urgent" data-after="safety">“He says he’s thinking about suicide right now and feels unsafe alone. I’m staying. Please join us and get the supervising resident here now.”</span>
<span data-text="feedback-call">His comment about wanting to be with his wife still needs clarification. Stay with him and ask about suicide directly. You can bring the nurse in now.</span>
<span data-text="feedback-call" data-after="safety">He has told you he feels unsafe alone. Stay with him and bring the nurse and supervising resident to the bedside now. Contacting family can come alongside that response.</span>
<span data-text="feedback-urgent">Bring the nurse in and stay with him now. Tell the nurse exactly what he said, then ask directly about suicide. There is no need to wait for his answer to call for help.</span>
<span data-text="feedback-urgent" data-after="safety">You passed along his own words, stayed with him, and asked the team to come now.</span>
<span data-text="feedback-diagnosis">Crying soon after this news tells you he is hurting. It gives you little basis for a medication recommendation. What did he say he needed?</span>
<span data-text="feedback-diagnosis" data-after="safety">He has told you he feels unsafe alone. Stay with him and bring the nurse and supervising resident to the bedside now. Contacting family can come alongside that response.</span>
<span data-text="update">“His wife died this afternoon. He told me he’s thinking about suicide now and feels unsafe alone. I’m with him. Please come to the bedside and ask the supervising resident to join us for an urgent safety assessment.”</span>
</template>
</section>

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
| New psychosis | substance/medication, delirium, medical/neurologic illness (e.g., encephalitis, seizure, endocrine), mania, trauma, primary psychotic disorder |
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

<span id="grief-unit-contacts"></span>

<!-- crisis-block -->
