# Interview Room: speech, emotion, and faculty portrayal controls

Research and design memo · 2026-09-09 · **Draft for faculty listening review**

The aim is to make each fictional person sound consistent with the authored encounter. A diagnosis does not supply a universal voice. The recommended control is **Portrayal intensity: Subtle / Standard / More pronounced**. It changes how clearly the existing portrayal is expressed while preserving the person's words, facts, boundaries, uncertainty, and access to the floor.

This memo does not attest the generated audio, establish diagnostic accuracy, or change any case's faculty-review status. The research supports portrayal choices and limits; the actual synthetic performances still require listening. It is a design reference, not a new learner-facing diagnostic guide.

## Scope checked in the current source

The hosted registry contains five full encounters. The fifth has two speakers. Three additional Practice a Moment exercises have their own authored emotional states.

| Encounter or speaker | What the source establishes | Voice and current direction |
| --- | --- | --- |
| Dana | A major depressive episode; tired after poor sleep, embarrassed, polite and reserved, with occasional self-deprecating humor. | Marin; measured, understated conversation. |
| Marcus | A manic episode; rapid connected ideas, conviction, limited sleep without tiredness, brief irritation when contradicted, and ability to follow a clear redirect. | Cedar; the user-selected refined cadence at provider speed 1.12. |
| Ray | Paranoid psychosis in a quiet, guarded, frightened young adult; careful short sentences and pauses. The case explicitly describes him as not hostile. | Cedar; audible caution and restrained fear. |
| Morgan, individual MI encounter | Medical stabilization after an alcohol-related fall; mixed feelings about alcohol and protection of personal choice. A specific diagnosis and current intoxication findings are not established. | Marin; thoughtful ordinary speech, with meaning-sensitive emphasis. |
| Morgan and Maya, family encounter | Morgan is protective of choice; Maya is an adult daughter who cares and has clear limits. The hosted encounter is a shared meeting. | Morgan uses Marin; Maya uses Cedar. Each speaks only for themself. |
| Elena | Hurt, disappointment, guarded frustration after an earlier student's minimizing response to job loss; worry about rent. No diagnosis established. | Marin; conversational disappointment. |
| Priya | Feeling low, wanting help, and concern about possible treatment-related slowing at work. No diagnosis or actual cognitive impairment established. | Marin; concerned and clear. |
| Luis | A referral-versus-booking misunderstanding and a practical inability to answer calls at work. No language deficit or cognitive diagnosis established. | Cedar; engaged, practical uncertainty. |

Source authority: `_prototypes/sp-interview/sp-interview.pack.json`, `sp-interview.local-cases.js`, `family-visit-case.mjs`, `conversation-speech-profiles.mjs`, and hosted `sp-preview/lib/{case,family,portrayal}.mjs` and `lib/moments/catalog.mjs`. The hosted family restrictions take precedence over capabilities available only in the older local family prototype. No new history or hidden emotional motive is licensed by this table.

## What the evidence supports

### Depression: changes in timing are plausible; a permanently sad voice is too narrow

NIMH describes depression as potentially involving low mood, anxiety, emptiness, irritability, fatigue, and slowing, with symptoms varying between people. Dana's subdued presentation should therefore follow her case rather than erase all humor, frustration, or responsiveness. [NIMH, Depression, signs and symptoms](https://www.nimh.nih.gov/health/publications/depression).

Mundt and colleagues' four-week study analyzed 105 evaluable adults with major depression. Its results included shorter pause time and fewer pauses among treatment responders, with smaller or different changes among nonresponders. This supports attending to pauses and rhythm. It does not establish a universal rate, pitch target, or TTS setting for depression. The trial's recording task and treatment context differ from a simulated admission interview. **Source anchor, Results/Table 4:** “Free Speech total pause time”; **Discussion:** “which shorten with clinical improvement following treatment”. [Mundt et al., 2012, full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC3409931/); [bibliographic record](https://pubmed.ncbi.nlm.nih.gov/22541039/).

**Design inference for Dana:** preserve the current voice identity. Use measured phrasing, moderate restriction of pitch variation, and occasional meaningful pauses. Keep the words audible and allow irritation, embarrassment, concern, or a small joke when the actual line supports it. Never add sobbing, sighs, a breathy whisper, invented word-finding failure, or risk-related emotion that has not been disclosed. The learner's thinking time is a separate control from Dana's delivery.

### Mania: pressure involves continuity and the urge to keep talking

NIMH includes fast speech across many topics, racing thoughts, increased activity, and elevated or irritable mood among manic features. Its description emphasizes change from the person's usual state. [NIMH, Bipolar Disorder, symptom table](https://www.nimh.nih.gov/health/publications/bipolar-disorder).

In a prospective naturalistic study of 51 people with bipolar disorder, acoustic associations with symptoms varied markedly between the reported sex subgroups; several associations had opposite directions. The authors identify sample-size limits to generalization. This is a reason to avoid treating a higher pitch or louder volume as a universal mania setting, and to compare one authored person's portrayals rather than infer their diagnosis from sound. **Source anchor, Results:** “Significant differences in the effect sizes and directions are observed between female and male subgroups.” [Kaczmarek-Majer et al., published online 2024, issue 2025](https://pubmed.ncbi.nlm.nih.gov/39118422/); [full-text study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11787917/).

**Design inference for Marcus:** keep refined cadence as Standard. Rapid, connected clauses, compressed pauses, varied emphatic stress, and a sense of the next thought pressing forward can make him sound more pressured without an exaggerated fast-forward effect. A connected tangent must use an already permitted fact. A respectful redirect can change his topic while the energetic delivery persists. Technical interruption must always yield to the learner; subsequent authored dialogue may briefly acknowledge the interruption. “More pronounced” must not create shouting, aggression, invented grandiosity, random distractions, or a rule that a student has to overpower him.

### Psychosis: distinguish guarded fear from negative symptoms and from hostility

NIMH distinguishes psychotic, negative, and cognitive symptom domains. Its examples place limited vocal expression among negative symptoms, while thought disorder concerns organization of speech. These are separate features, and they should not be bundled into every portrayal of psychosis. [NIMH, Schizophrenia, symptom domains](https://www.nimh.nih.gov/health/publications/schizophrenia).

A cross-language study of 231 people with schizophrenia and 238 controls found a limited generalizable acoustic pattern; timing findings varied across languages. Clinical features, medication, age, and gender also related to the acoustic measures, with substantial variation. Ray is an authored psychosis encounter, not a confirmed schizophrenia diagnosis; transferring group findings directly to him would add unwarranted findings. **Source anchor, Study results:** “duration atypicalities replicated only in some languages.” [Parola et al., 2023, study record](https://pubmed.ncbi.nlm.nih.gov/36946527/); [full text, Results and Table 2](https://academic.oup.com/schizophreniabulletin/article/49/Supplement_2/S125/7083522).

An experimental study of 23 male participants with schizophrenia and 20 male controls found reduced outward facial expression without finding lower self-reported positive and negative emotion. This older, small, film-based experiment does not establish equivalence of emotional experience or prescribe vocal settings. It illustrates why outward restraint should not be treated as absence of feelings. **Source anchor, Abstract:** “reported experiencing as much positive and negative emotion”. [Kring and Neale, 1996, study record](https://pubmed.ncbi.nlm.nih.gov/8723006/); [author-hosted full text, Results](https://esilab.berkeley.edu/wp-content/uploads/2017/12/Kring-Neale-1996.pdf).

**Design inference for Ray:** portray the fear and caution actually in his words, with careful entry into a sentence and occasional uneven pauses. When the words express relief, let a little relief be audible. Keep him intelligible. Do not add a sinister whisper, threatening delivery, flat affect, slurring, neologisms, thought blocking, or hallucinatory behavior as generic “psychosis realism.” Presets can vary guarded tension without changing his beliefs or disclosure rules.

### Alcohol ambivalence and family discussion: ordinary human voices

SAMHSA TIP 35 treats ambivalence as a normal part of change and emphasizes autonomy, collaboration, and reflective listening. It does not define a characteristic voice for people discussing alcohol. **Source anchor, key messages:** “Ambivalence about change is normal”. [SAMHSA TIP 35, Chapter 3](https://www.ncbi.nlm.nih.gov/books/NBK571068/).

**Design inference for Morgan:** express the contrast between the benefits and costs already named in the dialogue. Choice can sound firm; concern about consequences can carry weight. Maintain ordinary fluency and articulation. No slurring, withdrawal tremor, shame, dishonesty, or automatic defensiveness should be introduced. Current medical stabilization does not establish a blood alcohol level, a diagnosis, or withdrawal safety.

SAMHSA TIP 39 recognizes that family members can have different goals and that involvement should respect the person's choices. It provides a basis for attending to each perspective, not a vocal stereotype for a concerned relative. **Source anchor, Chapter 4:** “The goal of each family member may differ”. [SAMHSA TIP 39, Chapter 4](https://www.ncbi.nlm.nih.gov/books/NBK571079/).

**Design inference for Maya:** warm directness and steady boundaries can coexist. Increase emphasis on the words she actually speaks without turning her into a scolding parent, a hostile antagonist, or a narrator. Morgan and Maya can remain uncertain and disagree after a good learner response. The hosted shared-room scope must prevent their private facts from leaking through dialogue or vocal staging.

### The three moments: intensify the authored emotion, not an invented disorder

Elena's disappointment can remain audible after a respectful repair; she need not instantly become warm. Priya can be clear and firm about work while worried about treatment. Her fear of slowing is not evidence that she is slowed. Luis can ask an understandable practical question without sounding unintelligent or linguistically impaired. These are case-grounded design choices, not diagnostic claims.

AHRQ describes teach-back as checking how clearly the clinician explained information, using the patient's own account of what they understood. That supports preserving Luis's agency and distinguishing a misunderstanding from his separate work-call barrier. **Source anchor, Tool 5:** “not a test of the patient's knowledge”. [AHRQ teach-back guidance](https://www.ahrq.gov/sites/default/files/wysiwyg/professionals/quality-resources/tools/literacy-toolkit/healthlittoolkit2_tool5.pdf); [current toolkit index](https://www.ahrq.gov/health-literacy/improve/precautions/toolkit.html).

## Faculty control design

Recommended first version: one optional selector per new encounter, with three allowlisted choices. **Standard** retains the accepted voice. “Subtle” and “More pronounced” alter delivery instructions only; they preserve the core authored characteristic and all factual limits. Explain the selector as *How strongly the patient's existing speech and emotion are expressed.* Do not label the levels mild/moderate/severe illness, cooperative/difficult, or readiness.

| Speaker | Subtle | Standard | More pronounced |
| --- | --- | --- | --- |
| Dana | Restrained tiredness with fluid phrases. | Existing measured, reserved delivery. | More audible hesitation and narrowed expression, keeping words clear and emotional variation available. |
| Marcus | Brisk connected momentum with slightly more breathing room. | User-selected refined cadence. | Tighter clause joins and more insistent meaningful stress; varied rhythm stays intelligible. |
| Ray | Cautious but relatively fluid. | Existing short, careful phrasing. | Greater guarded tension and hesitation, maintaining normal audibility. |
| Morgan | Subtle reflective emphasis. | Existing thoughtful ambivalence. | Stronger contrast where the text names concern or choice, with intact ordinary speech. |
| Maya | Quietly warm and direct. | Existing care with steady limits. | Firmer emphasis on an expressed boundary, with care still audible. |
| Elena | Understated disappointment. | Existing hurt and guarded frustration. | Clearer hurt/frustration within the supplied words, with no manufactured emotional collapse. |
| Priya | Quiet concern and clarity. | Existing concerned, clear priorities. | Firmer stress on help and work functioning, with no slowing or cognitive deficit. |
| Luis | Matter-of-fact questioning. | Existing practical uncertainty. | More noticeable questioning emphasis, with comprehension and articulation intact. |

All table entries are **proposed performance directions**, not clinically validated intensity thresholds. The implementation may use `gentle`, `standard`, and `expressive` as the corresponding allowlisted preset IDs. Keep the existing numeric synthesis speed fixed across these delivery presets; do not attach prescribed words-per-minute, pitch, loudness, or pause-duration ranges. Keep the identity and accent stable across levels. A future case that deliberately teaches dysarthria, language disorder, negative symptoms, intoxication, or a different mood state needs its own authored facts and review.

The server should bind the selected preset to the encounter and apply the same allowlisted profile to every speech segment and retry. Arbitrary browser-supplied performance prompts must not be accepted. Keep the selection out of learner feedback criteria and out of any inference about learner ability. A mid-encounter change should be an explicit faculty action with clear effect on subsequent speech, not an invisible response to learner accent, speed, or a hidden score.

Speech synthesis and actor generation need separate responsibilities. The actor determines an allowed response using heard conversation and case authority. The voice expresses exactly that response. More intense delivery cannot create a new disclosure, convert uncertainty into certainty, or imply agreement the dialogue does not contain.

## Listening rubric and bounded audition

The ASPE standards call for accurate, consistent role portrayal, practice with feedback, and case design that avoids stereotyping. Applying those principles to synthetic voices is a design adaptation; ASPE's document concerns human simulated participants and does not validate this technology. **Source anchor, 3.2.4:** “Ensure consistency and accuracy of role portrayal”. [ASPE Standards of Best Practice, 2017, domains 2 and 3](https://link.springer.com/article/10.1186/s41077-017-0043-4).

Use the same short, already authorized text for all three levels so faculty can assess the voice independently of changed wording. Then test three conversational situations: an open invitation, an emotionally relevant reflection, and a clear redirect or boundary. A faculty reviewer records **fits / needs adjustment / not assessed**, with a time-stamped example, for:

1. **Case fit:** the sound matches the authored person's state without adding a symptom.
2. **Meaning:** stress, pauses, uncertainty, and negation preserve the exact line's meaning.
3. **Naturalness:** connected phrasing and variation avoid a presenter voice, fixed cadence, or repeated artificial sighs.
4. **Range:** emotional variation follows the topic; one skillful phrase does not automatically resolve illness, hurt, fear, or ambivalence.
5. **Continuity:** the same person remains recognizable between chunks, intensity levels, and redirections.
6. **Access to the floor:** speaking, keyboard interruption, Pause, and End work reliably; partial playback never becomes a completed disclosure in the conversation record.
7. **Respect:** the portrayal avoids diagnostic, cultural, age, gender, or substance-use stereotypes.

Keep acoustic measurement limited to the synthetic patient's output when useful for troubleshooting. It can identify a long gap or clipped syllable; it cannot establish the clinical truth of the portrayal. Faculty listening and the user's physical-microphone test should be reported separately from automated protocol tests.

## Further realism ideas, ordered for usefulness

These are proposals, not implemented claims or research-backed outcome improvements.

1. **Acknowledge an interruption naturally.** After the learner takes the floor, the next response can follow the new question without restarting a monologue or scolding. Preserve the exact heard prefix and retain a route to replay omitted content only when appropriate.
2. **Let short listening sounds remain listening.** An optional future backchannel mode could distinguish “mm-hmm” from an attempt to take the floor. This needs individual calibration and easy override; a single sound classifier should never decide learner intent or grade communication.
3. **Give each person a small emotional history.** Carry forward only responses supported by the actual exchange: a worry remains important, a misunderstanding stays corrected, a boundary stays in place. Avoid a hidden rapport score that makes the patient reward stock phrases.
4. **Faculty-directed room events.** A faculty member can introduce an explicit, authored event such as a colleague entering or a brief noise, with visible provenance and an opt-out. Marcus can respond to that real simulated event. The actor must not invent a distraction simply to look manic.
5. **Two appropriate paths through the same moment.** Faculty can compare two different but reasonable learner approaches and check that the patient and feedback both remain plausible. This catches a simulation that rewards one script and invents faults in alternatives.
6. **A shared family floor.** Later, offer purposeful turn allocation and brief overlapping starts, while retaining each person's identity, audience permissions, and immediate learner control. Natural overlap should not hide who spoke or leak a private disclosure.

**Next best option:** audition the faculty presets with identical case-grounded lines, then conduct a short headphones-and-speakers interruption test. Approve the portrayal and the interaction independently before calling the result ready for broader learner use.
