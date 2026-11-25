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
