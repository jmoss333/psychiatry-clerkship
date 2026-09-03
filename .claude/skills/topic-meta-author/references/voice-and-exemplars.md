# House voice + exemplars

Match this voice when drafting `tldr`, `points`, `cant`, `clinicalWorkflow.*`, and `quiz`. It is
terse, imperative, and exam-aware — a senior clinician teaching a student at the bedside, not a
textbook.

## Voice patterns

**`tldr` — one sentence, the single highest-yield point.** Often pivots on an em-dash or an "until
proven otherwise" frame. Declarative and memorable.
- delirium: "New, fluctuating inattention in a hospitalized patient is delirium until proven otherwise — a medical emergency, not a psychiatric label."
- t_mood: "Before treating depression, screen for a past manic or hypomanic episode — antidepressant monotherapy can destabilize unrecognized bipolar illness."
- agitation: "Treat the driver, not just the behavior — verbal de-escalation before PRN, and PRN before restraint."

**`points` — exactly three, imperative, parallel, concrete.** Each a distinct move, not a
paraphrase of the others. Lead with the verb or the diagnostic anchor.
- delirium: "Acute onset + fluctuating course + inattention (anchor on arousal and attention)." / "It almost always has a medical cause — find and fix it." / "Reorient and mobilize, restore the sleep-wake cycle, and remove tethers and deliriogenic meds."

**`cant` — the can't-miss trap, usually "Don't…"** Names the specific reflex to suppress or the
acute pivot to make.
- delirium: "Don't sedate your way past it — benzodiazepines worsen delirium except in alcohol or benzodiazepine withdrawal."
- agitation: "Don't reach for an antipsychotic before excluding hypoglycemia, hypoxia, delirium, withdrawal, pain, akathisia, and catatonia — excited catatonia looks like agitation, and a D2 blocker can tip it into malignant catatonia/NMS."

**`clinicalWorkflow.say` — one patient-facing sentence, first person, plain and warm.** Quotable at
the bedside.
- suicide: "I ask directly about suicide because it helps us keep you safe; you will not shock me by answering honestly."
- delirium: "This looks like a brain-not-working-right-now problem, often from a medical cause, and it usually fluctuates during the day."

**`clinicalWorkflow.exam` — the shelf/COMAT test-taking point, one line.**
- delirium: "Delirium is acute/fluctuating inattention; benzodiazepines usually worsen it unless withdrawal is the cause."

**`quiz` — board-style, four options, one correct, distractors that are *real* confusions.** The
`why` teaches the discrimination, not just "because it's right." Distractors should be things a
reasonable student would actually pick.

## Full exemplar — a disease + safety page (`delirium.md`)

```json
{
  "read": 4,
  "hy": true,
  "tldr": "New, fluctuating inattention in a hospitalized patient is delirium until proven otherwise — a medical emergency, not a psychiatric label.",
  "points": [
    "Acute onset + fluctuating course + inattention (anchor on arousal and attention).",
    "It almost always has a medical cause — find and fix it.",
    "Reorient and mobilize, restore the sleep-wake cycle, and remove tethers and deliriogenic meds."
  ],
  "cant": "Don't sedate your way past it — benzodiazepines worsen delirium except in alcohol or benzodiazepine withdrawal.",
  "ruleOut": ["Infection", "Meds / anticholinergics", "Metabolic (Na, glucose, uremia)", "Hypoxia", "Withdrawal", "Intracranial event"],
  "firstMove": "Treat the cause, stop deliriogenic meds, use nonpharmacologic measures; reserve low-dose antipsychotic for dangerous agitation.",
  "quiz": {
    "q": "An 80-year-old is inattentive and fluctuating two days post-op on oxycodone and diphenhydramine. Best first step?",
    "o": [
      {"t": "Identify and treat the cause; stop deliriogenic meds", "c": true},
      {"t": "Start scheduled lorazepam"},
      {"t": "Begin donepezil"},
      {"t": "Reassure the family and observe"}
    ],
    "why": "This is delirium; the priority is finding the cause and removing contributors (opioids + anticholinergic). Benzodiazepines worsen non-withdrawal delirium."
  },
  "evidenceIds": ["nice-delirium-cg103", "project-beta-deescalation-2012"],
  "relatedTools": ["decision-aids.html", "communication-practice.html", "diagnostic-reasoning.html", "family-systems.html"],
  "workflowModes": ["ward", "safety", "family", "5min", "shelf"],
  "familyOverlay": "delirium_family_orientation_and_collateral",
  "safetyLevel": "high",
  "facultyReview": {"status": "reviewed", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-07-03"},
  "workflowStages": ["diagnosis", "safety", "treatment", "family", "team", "exam"],
  "clinicalWorkflow": {
    "ask": "Ask baseline cognition, acute onset, fluctuation, sleep-wake reversal, pain, infection, hypoxia, withdrawal, and medication changes.",
    "mse": "Prioritize attention and arousal; note fluctuation, disorientation, perceptual disturbance, psychomotor subtype, and cognition.",
    "safety": "Treat as medical emergency: remove deliriogenic medications, correct causes, prevent falls, and avoid benzodiazepines except withdrawal.",
    "say": "This looks like a brain-not-working-right-now problem, often from a medical cause, and it usually fluctuates during the day.",
    "collateral": "Ask family/nursing what is baseline, when it changed, whether it fluctuates, and what helps reorient the patient.",
    "rounds": "Present CAM-style features, likely causes, medication contributors, nonpharmacologic plan, and when medication is needed for dangerous agitation.",
    "exam": "Delirium is acute/fluctuating inattention; benzodiazepines usually worsen it unless withdrawal is the cause."
  },
  "shelfBlueprint": ["neurocog"],
  "epa": ["EPA1", "EPA2", "EPA3", "EPA10"]
}
```

Note the invariants live here naturally: `firstMove` sits with `ruleOut`; `familyOverlay` pairs with
`family-systems.html` in `relatedTools`; `safetyLevel:high` carries `evidenceIds` + a real
`facultyReview`; the quiz has exactly one `c:true`; every `epa` code follows the mapping rule
(disease → EPA1,EPA2; +EPA3 workup; +EPA10 emergency).

## Full exemplar — a skills / pocket-guide page (`pg_interview.md`)

Skills pages carry **no** `shelfBlueprint`, a lighter `epa` (here just `EPA1`), and no
`ruleOut/firstMove/safetyLevel`. The quiz can be conceptual rather than a vignette.

```json
{
  "read": 5,
  "hy": true,
  "tldr": "Use the interview as a circle with the patient's story at the center — covering all 11 domains in whatever order the conversation allows — and always gather the safety trio (suicide, violence, vulnerability) before closing.",
  "points": [
    "Ask suicide questions directly: 'Have you had thoughts of killing yourself?' — direct questions do not implant suicidal thoughts, and indirect approaches miss real risk.",
    "MSE language should be behavioral and observable: write 'affect constricted, minimally reactive, mood-congruent' rather than 'patient appeared depressed'.",
    "Close every interview with a summary in the patient's language, one correction invitation, and one named next step."
  ],
  "cant": "'Denies SI/HI — no risk' is not a risk assessment; document what you asked, what the patient reported, and the reasoning that led to your risk level.",
  "quiz": {
    "q": "A student reports on rounds: 'On MSE, mood was depressed and the patient was anxious.' Which revision uses the most precise language?",
    "o": [
      {"t": "The patient appeared to have a depressed mood and showed signs of anxiety"},
      {"t": "Patient denied euphoria and grandiosity; affect within normal limits"},
      {"t": "Mood: 'really low, like a 2 out of 10' (patient quote); affect constricted, minimally reactive, mood-congruent; no psychomotor agitation", "c": true},
      {"t": "Patient reported moderate depression and anxiety consistent with major depressive disorder"}
    ],
    "why": "The MSE separates mood (subjective, quoted in the patient's words) from affect (the clinician's behavioral observation: range, reactivity, congruence). The other options interpret rather than observe, skip the patient quote, or make a diagnostic statement where a description belongs."
  },
  "relatedTools": ["mse.html", "interview-circle.html", "communication-practice.html"],
  "workflowModes": ["ward", "5min", "family"],
  "communicationCases": ["guardedness_privacy_001"],
  "workflowStages": ["encounter", "communication", "safety", "family"],
  "epa": ["EPA1"]
}
```

## Depth calibration

- A `read` of 4–5 min = a full page (universal core fields + `clinicalWorkflow` + usually a quiz).
- A stub (`{"read": 2}`) is a placeholder — don't inflate it unless asked to build it out.
- Don't pad. If a field would be filler, omit it. Every field earns its place.
