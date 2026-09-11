# Capture — PHQ Screeners permission statement

| | |
|---|---|
| **Custodian** | Pfizer Inc. (PHQ Screeners) |
| **URL** | https://www.phqscreeners.com/select-screener |
| **Retrieved** | 2026-09-10 |
| **Retrieved via** | Chrome (claude-in-chrome), live page text on this machine |
| **Captured for** | `research_returns.json` — rq-10-2026-09-10 finding f4; WP-02c |

## Why this file exists

The permission for PHQ-9 and GAD-7 is a sentence on a web page. It has no DOI, no version, and
no change log, so a URL alone records nothing durable — the page can be edited and the record
would silently follow it. This is the dated local capture the dock's `primary.archivedCopy`
requires in exchange for accepting a web source as primary.

## The operative sentence, verbatim

> All PHQ, GAD-7 screeners and translations are downloadable from this website and no permission
> is required to reproduce, translate, display or distribute them.

Note the four verbs — **reproduce, translate, display, distribute**. They cover exactly what a
public educational page does. They do **not** include *modify*, *adapt*, or *create derivative
works*, which is the boundary recorded as finding f5.

## Surrounding context as captured

> Screener Overview
>
> Recognizing signs of mental health disorders is not always easy. The Patient Health
> Questionnaire (PHQ) is a diagnostic tool for mental health disorders used by health care
> professionals that is quick and easy for patients to complete. In the mid-1990s, Robert L.
> Spitzer, MD, Janet B.W. Williams, DSW, and Kurt Kroenke, MD, and colleagues at Columbia
> University developed the Primary Care Evaluation of Mental Disorders (PRIME-MD), a diagnostic
> tool containing modules on 12 different mental health disorders. They worked in collaboration
> with researchers at the Regenstrief Institute at Indiana University and with the support of an
> educational grant from Pfizer Inc. During the development of PRIME-MD, Drs. Spitzer, Williams
> and Kroenke, created the PHQ and GAD-7 screeners.
>
> The PHQ, a self-administered version of the PRIME-MD, contains the mood (PHQ-9), anxiety,
> alcohol, eating, and somatoform modules as covered in the original PRIME-MD. The GAD-7 was
> subsequently developed as a brief scale for anxiety. The PHQ-9, a tool specific to depression,
> simply scores each of the 9 DSM-IV criteria based on the mood module from the original
> PRIME-MD. The GAD-7 scores 7 common anxiety symptoms. Various versions of the PHQ scales are
> discussed in the Instruction Manual.
>
> All PHQ, GAD-7 screeners and translations are downloadable from this website and no permission
> is required to reproduce, translate, display or distribute them.

The page title as served: *Patient Health Questionnaire (PHQ) Screeners. Free Download |
phqscreeners*.

## What this capture does and does not settle

It settles that the sentence exists on the custodian's own site today, read first-hand rather
than through a model synthesis. It does not by itself move `phq9-gad7` from `provisional` to
`cleared` in `instrument_rights.json` — that is a governance decision requiring a `decisionRef`,
and the entry's own rule is that a status changes only with the decision that recorded it, never
by agent inference.
