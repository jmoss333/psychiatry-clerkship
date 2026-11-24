# Geriatric Psychiatry on the Inpatient Unit

> **Review status:** Reviewed and attested by Joshua Moss, MD (2026-07-09). Educational; fictional composites only, no PHI.

**In one line** — On the geriatric inpatient unit, your central job is to separate reversible from irreversible causes of cognitive and behavioral change, treat the treatable, and avoid iatrogenic harm from the very drugs meant to help.

**How it presents on the unit** — Older adults rarely arrive with a tidy chief complaint. Watch for late-life depression (often somatic, apathetic, or framed as "I just want to go home"), new or worsening psychosis (which in this age group is a red flag for an organic cause until proven otherwise), agitation in the setting of dementia, and the overlapping delirium-dementia-depression triad. Functional decline, falls, poor intake, and "failure to thrive" are common admitting framings that hide a psychiatric or medical driver.

**Differential & can't-miss mimics** — The skill that defines competent geriatric psychiatry is distinguishing delirium vs dementia vs depression. Delirium is acute, fluctuating, and marked by inattention; it is a medical emergency and the can't-miss diagnosis on every confused elder. Dementia is chronic and progressive with preserved alertness early. Depression can masquerade as cognitive impairment — the pseudodementia presentation (Caine 1981), where patients say "I don't know" rather than confabulate, show effortful disengagement, and improve cognitively when mood is treated. Do not forget vascular depression (Alexopoulos 1997): late-onset depression with executive dysfunction and white-matter burden, often less responsive to monotherapy. These three states coexist; finding one does not exclude the others.

**Initial workup** — Keep it focused and bedside-anchored. Formally test attention (digit span, months-of-the-year backward, serial subtraction) — inattention reorients you toward delirium. Perform a structured cognitive screen and document a baseline. Review every medication for deliriogenic and anticholinergic load. Screen for infection (UTI, pneumonia), metabolic derangement, hypoxia, urinary retention, constipation, and pain. Collateral history is not optional; establish the true baseline and the tempo of change.

**Acute inpatient management** — Apply the Beers Criteria and assess cumulative anticholinergic burden, then actively deprescribe deliriogenic and high-risk agents. Dose with start-low-go-slow titration. Treat fall risk and orthostasis as primary safety issues, not afterthoughts — many psychotropics worsen both. Respect the antipsychotic boxed warning for dementia-related behavioral disturbance: non-pharmacologic strategies come first, and antipsychotics are used only when necessary, at the lowest effective dose, time-limited, with documented risk-benefit discussion. Capacity assessment is frequently in play (treatment refusal, disposition disputes); assess it for the specific decision at hand. For severe, treatment-resistant, psychotic, or catatonic late-life depression, ECT is effective and often well-tolerated in older adults — keep it on the table early rather than as a last resort.

<section class="bedside-case" id="pat-near-fall" data-pat-fall aria-labelledby="pat-title">
  <header>
    <span class="case-kicker">Morning group · Inpatient psychiatry</span>
    <h3 id="pat-title">What changed when Pat stood up?</h3>
    <p>Pat wants to join the first group of the day. The nurse is beside the chair when Pat gets up.</p>
  </header>
  <figure>
    <div class="pat-frame">
      <img id="pat-scene" src="illustrations/pat-seated.webp" width="680" height="681" loading="lazy" alt="Pat sits in an armchair, talking with the nurse.">
      <span id="pat-clock">8:55 AM</span>
    </div>
    <figcaption id="pat-caption" aria-live="polite">Pat has been talking comfortably while seated.</figcaption>
  </figure>
  <div class="pat-positions" role="group" aria-label="Compare positions">
    <button type="button" data-position="seated" aria-pressed="true">In the chair</button>
    <button type="button" data-position="standing" aria-pressed="false">On standing →</button>
  </div>
  <div class="step" id="pat-interview" hidden>
    <span class="case-kicker">MS3 prompt</span>
    <h4>What happened between standing and sitting back down?</h4>
    <p>Hear both accounts before you give the team an update.</p>
    <button type="button" data-hear="patient" aria-controls="pat-patient" aria-expanded="false">Ask Pat what it felt like</button>
    <div id="pat-patient" class="case-reply" hidden><span class="case-kicker">Pat</span><blockquote>“My head went light as soon as I got up. Sitting back down helped. I still want to go to group.”</blockquote></div>
    <button type="button" data-hear="nurse" aria-controls="pat-nurse" aria-expanded="false">Ask the nurse what they saw</button>
    <div id="pat-nurse" class="case-reply" hidden><span class="case-kicker">Nurse</span><blockquote>“Pat swayed and grabbed the armrest. I helped them sit back down. They were talking to me the whole time. They didn’t hit the floor.”</blockquote></div>
  </div>
  <div class="step" id="pat-reason" hidden>
    <span class="case-kicker">Resident follow-up</span>
    <h4>What can you call this on rounds?</h4>
    <p>The nurse is with Pat and has called the covering clinician. There is no blood pressure recorded during the episode.</p>
    <p>You can also check two chart entries.</p>
    <button type="button" data-record="overnight" aria-controls="pat-overnight" aria-expanded="false">Overnight medication record</button>
    <p id="pat-overnight" class="pat-record" hidden>The administration record shows a sedating as-needed medication was given overnight.</p>
    <button type="button" data-record="intake" aria-controls="pat-intake" aria-expanded="false">Breakfast intake</button>
    <p id="pat-intake" class="pat-record" hidden>Breakfast flowsheet: a few bites and half a cup of tea.</p>
    <div class="pat-claims" role="group" aria-label="Choose your opening sentence">
      <button type="button" data-claim="pressure" aria-pressed="false">“Pat had a documented drop in blood pressure on standing.”</button>
      <button type="button" data-claim="event" aria-pressed="false">“Pat reported lightheadedness on standing and nearly fell.”</button>
      <button type="button" data-claim="medication" aria-pressed="false">“An overnight medication caused Pat to lose their balance.”</button>
    </div>
    <p id="pat-feedback" class="pat-record" role="status" hidden></p>
    <div id="pat-rounds" class="case-reply" hidden>
      <span class="case-kicker">Your update to the team</span>
      <p id="pat-update" aria-live="polite"></p>
      <a href="https://www.cdc.gov/steadi/media/pdfs/STEADI-Assessment-MeasuringBP-508.pdf">CDC STEADI guide to measuring orthostatic blood pressure</a>
    </div>
  </div>
  <footer><span>Fictional case</span><button type="button" class="case-link" id="pat-reset" hidden>Start again</button></footer>
  <template id="pat-standing"><img src="illustrations/pat-standing.webp" alt="Pat reaches for the chair after standing. The nurse is at their side."><span>8:56 AM</span><p>Pat reaches back for the chair. The nurse helps them sit and stays with them.</p></template>
  <template id="pat-copy">
    <span data-line="pressure">The timing is worth reporting. A blood pressure change was never measured during the episode. Try an opening supported by the two accounts.</span>
    <span data-line="medication">A medication could have contributed. Timing and the medication record alone cannot establish the cause. Start with what Pat and the nurse can tell you.</span>
    <span data-line="event">Pat felt lightheaded immediately on standing. The nurse saw Pat sway and helped them sit. There was no fall.</span>
    <span data-line="overnight">The medication record shows a sedating PRN overnight.</span>
    <span data-line="intake">The breakfast record documents a few bites and half a cup of tea.</span>
    <span data-line="next">We need to assess Pat before another walk, including orthostatic vitals when it is safe to stand with assistance.</span>
  </template>
</section>

**What the student does** —
- Test attention at the bedside daily and document fluctuation.
- Build a complete medication reconciliation and flag every Beers/anticholinergic agent for the team.
- Call family or the facility for collateral on baseline cognition and function.
- Screen for and report constipation, retention, pain, and infection signs.
- Sit with the patient unhurried — orientation, sensory aids (glasses, hearing aids), and presence are real interventions.

**Disposition & discharge essentials** — Confirm cognitive and functional baseline before discharge; clarify whether the patient can return to prior setting or needs a higher level of care. Reconcile medications again, document what was deprescribed and why, and ensure a clear taper plan for any time-limited antipsychotic. Confirm follow-up, caregiver education, and safety supports (fall precautions, supervision of meds).

**High-yield pearls**
- New psychosis in an older adult is delirium or a medical cause until proven otherwise.
- Inattention is the fingerprint of delirium — test it, don't infer it.
- "I don't know" answers and effortful disengagement suggest pseudodementia; treat the depression.
- The drug list is often the diagnosis — deprescribing is active treatment.
- Non-pharmacologic management is first-line for dementia-related agitation; antipsychotics are time-limited exceptions.

<!-- crisis-block -->

**Pair with** — the [Delirium guidance](?page=delirium.md), the <a href="tools/capacity.html" target="_blank" rel="noopener">Decisional Capacity tool</a>, and the [Differential Diagnosis scaffolds](?page=ddx.md).

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI.*
