# Practice coaching content — authored draft

**Status:** New teaching wording; faculty review pending. This document does not attest the content or inherit approval from the existing cases. It supports the [implementation plan](../plans/2026-09-13-practice-goals-coaching.md).

## Purpose and scope

The learner chooses one communication goal before a full encounter. During an intentional coaching pause, a question encourages reflection before an optional hint and two possible wordings are revealed. The closing reflection returns to that goal. Asking for help is never scored.

The examples are alternatives to adapt to what the patient has actually said, not a script or an answer key. Some explicitly depend on an earlier statement or offer. Learners should not introduce an unexpressed concern, mixed feeling, event, commitment, or offer merely because an example mentions it. The interface must not copy or send an example automatically.

Student and resident options change coaching depth only. Both retain the case's existing MD/DO student identity, role, supervision, and decision-making boundaries. Resident guidance adds attention to uncertainty, source attribution, competing explanations, and what to bring to the team; it does not grant attending authority.

These are communication goals, not diagnostic tests, complete assessments, or treatment protocols. The content supplies no hidden case facts, diagnosis answers, medication doses, legal determinations, instrument items, or promises about disposition or privacy. Faculty should judge the examples in context rather than treat matching a wording as evidence of competence.

## Curriculum inventory

The module [practice-content.js](../../../sp-preview/public/practice-content.js) is the authoritative wording. Each row contains distinct student and resident questions, hints, two examples, and end reflections.

| Public case | Goal | Additional resident emphasis |
| --- | --- | --- |
| Dana | Make another interview useful | Explain the assessment purpose and negotiate focus without unnecessary repetition. |
| Dana | Understand the effect on daily life | Clarify course and functioning; distinguish report, observation, and inference. |
| Dana | Ask directly and follow the answer | Identify unresolved safety questions and what requires prompt supervision. |
| Marcus | Redirect while keeping his priorities in view | Make redirection purposeful without assuming cooperation means agreement. |
| Marcus | Make one question answerable | Establish baseline and course while keeping reported and observed information distinct. |
| Marcus | Summarize without promising a decision | Separate priorities, established information, and unresolved team decisions. |
| Ray | Be clear about your role and information | Verify actual information practices without interpreting a concern as proof of illness. |
| Ray | Understand the experience before explaining it | Clarify experience, context, and meaning while leaving explanations open. |
| Ray | Explore impact and immediate needs | Prioritize reported needs and specify missing assessment or supervisory input. |
| Morgan | Find a useful shared agenda | Hold the clinical purpose alongside the person's own priorities. |
| Morgan | Reflect mixed feelings accurately | Offer a tentative reflection, invite correction, and avoid manufacturing commitment. |
| Morgan | Invite a next step without requiring one | Distinguish consideration, preference, and an actual chosen commitment. |
| Morgan and Maya | Make room for each person's purpose | Preserve both perspectives before seeking a shared focus. |
| Morgan and Maya | Keep each account attributable | Distinguish firsthand knowledge, another person's report, and interpretation. |
| Morgan and Maya | Separate support, choice, and limits | Check each person's agreement without assigning a monitoring role. |

## Primary-source rationale

These are issuing-authority recommendations and teaching guidance. They inform the design; they do not establish that this interface, these exact example sentences, or the simulated portrayals improve learning. Brief excerpts below record the specific source language supporting each limited rationale. Links were checked on 2026-09-13.

- **Patient-centered communication:** NICE CG138 recommendation 1.5.7 says, “Use open-ended questions to encourage discussion.” Recommendations 1.4.4–1.4.5 address introducing oneself and explaining roles; 1.5.8 addresses summaries and checking understanding. This supports the opening, focused-question, and summary goals. The choice of three goals and progressive help is our design decision. [NICE CG138 recommendations](https://www.nice.org.uk/guidance/cg138/chapter/Recommendations#communication).
- **Direct, proportionate safety inquiry:** NICE NG222 recommendation 1.2.8 says, “Always ask people with depression directly about suicidal ideation and intent.” The same recommendation addresses support and help appropriate to need. Dana's goal therefore teaches direct inquiry followed by clarification and supervision. Neither sample question is a complete assessment, and a denial is not treated as a global safety conclusion. [NICE NG222 risk assessment and management](https://www.nice.org.uk/guidance/ng222/chapter/Recommendations#risk-assessment-and-management).
- **Broader assessment and uncertainty:** NICE CG178 recommendation 1.3.3.1 calls for a “comprehensive multidisciplinary assessment,” covering multiple domains including functioning and possible harm. Ray's goals invite an account of the experience and practical needs while acknowledging missing medical assessment, collateral, and team input. They do not equate unusual experiences or reluctance to talk with dangerousness. [NICE CG178 assessment and care planning](https://www.nice.org.uk/Guidance/CG178/chapter/recommendations#assessment-and-care-planning).
- **Autonomy and tentative reflection:** SAMHSA TIP 35, chapter 3, states, “People make their own decisions about taking action,” and advises, “Be open to being wrong.” Morgan's examples preserve choice, invite correction of a reflection, and distinguish talking about change from agreeing to it. They are newly authored examples, not reproduced instrument items. [SAMHSA TIP 35, chapter 3](https://www.ncbi.nlm.nih.gov/books/NBK571068/).
- **Multiple family perspectives:** SAMHSA TIP 39, chapter 4, advises, “Avoid jumping too quickly into goal consensus.” Its discussion recognizes differing family goals and cautions against taking an arbiter role. The family goals therefore preserve each person's account, wishes, and limits before summarizing an actual agreement. [SAMHSA TIP 39, chapter 4](https://www.ncbi.nlm.nih.gov/books/NBK571079/).

Marcus's coaching uses the canonical encounter objectives and general communication principles. This draft makes no new claim that a particular synthetic speech pattern establishes a diagnosis or reproduces a clinical examination. Information-sharing examples for Ray require the actual notice and verified practices; generic clinical-room assumptions cannot substitute for them. Family examples remain in the shared meeting and never assume that Maya witnessed an event or is responsible for monitoring Morgan.

## Data and integration contract

- A dependency-free UMD module exposes `window.PracticeContent` in a browser and `module.exports` in Node.
- `ids()` returns a new array containing exactly the five supported full-case identifiers. Practice a Moment cases are not included.
- `getCase(caseId)` returns a new deep copy with `id`, `title`, and three `goals`. Each goal has `id`, `title`, `student`, and `resident`. Each depth has `question`, `hint`, two `examples`, and `reflection`.
- Unknown, non-string, inherited-property, or malformed identifiers return `null` without coercion. There is no depth argument; the view must validate its choice against `student` and `resident` before selecting that entry.
- The public module contains static authored guidance only. It imports no private actor material and performs no requests, storage, learner inspection, scoring, or automatic submission. Returned-copy mutation does not change later results.
- The controller does not receive coaching content. The selected goal, coaching depth, reveal state, and learner reflection belong to page memory, not patient request bodies or exports. Runtime tests elsewhere must establish this integration boundary; content-module tests alone cannot establish it.
- Suggested shared interface copy: “Student/resident changes coaching depth only. Your role in this case stays the same. These new coaching examples await faculty review; asking for help is never scored.”

## Validation and review limits

The focused Node tests cover both UMD entry points, exact five-case and fifteen-goal coverage, required fields at both depths, invalid identifiers, protected copies, and lack of storage or request use during loading. Narrow example regressions catch previously identified credential, privacy, safety-assurance, coerced-promise, and family-monitoring defects. Mutation checks demonstrate that those particular example defects would fail the checks.

Those tests are deliberately not a semantic validator. Passing does not establish clinical correctness, patient realism, instructional effectiveness, complete safety assessment, faculty approval, or a working microphone-pause interface. The tests also cannot decide whether a context-dependent example is appropriate in a particular conversation.

Before approval, faculty should review all thirty goal/depth entries, with particular attention to:

1. Whether the student and resident emphases are useful while preserving the same simulated role.
2. Whether the Dana safety examples invite suitable follow-up and supervision without becoming a checklist or implying completeness.
3. Whether Ray's information-practice coaching fits the verified notice and the learner's actual setting.
4. Whether Morgan's reflections remain tentative and the family examples preserve both participants' choices and information sources.
5. Whether two different, appropriate learner responses could satisfy each goal without requiring a preferred phrase.

The next useful content check is a faculty review of a few contrasting conversation excerpts for each goal, including an example where the suggested wording should not be used. A later extension could offer faculty-authored pairs of equally appropriate responses, helping learners compare their purposes without ranking speaking style or fluency.
