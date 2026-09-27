# Card audit — native Concepts and Anki snapshots

> Mechanical candidate/package comparison for owner review. This records identities, source text, option-length cues, and exclusions; it records no clinical approval.

## Snapshot and method

- Final fix-wave source based on `253835a`; refreshed 2026-09-27. Historical package receipts below retain their original snapshot labels.
- Legacy Concepts package: `09_Exam_Prep/anki_export/psychiatry_clerkship_concepts.apkg`, SHA-256 `c8f919209ec8cbaa2b6875e90906f53594abc4ff39be8a0d80eb280045a0c85c`; **142 notes / 158 rendered cards**.
- Crosswalk: `13_Faculty_Resources/_automation/site_build/concept_guid_crosswalk.json`, SHA-256 `8f0624b6f1d00549d517bb1d33f1e87a87a82818c7168b7a0b7b6532065570a5`. All 158 historical GUID/ordinal pairs are accounted for, including rendered occluded fronts for all four withdrawals.
- Candidate map: `13_Faculty_Resources/_automation/site_build/concept_candidates.json`, SHA-256 `10e0a0ea79aab2bd6af817f91723e6bb32c75a6e95abcaea8643326c7bc29fbc`; **138 mapped notes / 154 target cards**. Exact source excerpts remain unchanged; 12 target revisions advance after removing citation markers from rendered faces.
- Identity actions: **107 preserve-guid**, **47 new-note-required**, **4 withdrawn**. The **51 changed or withdrawn faces** below include the original 40-face audit plus 11 additional citation-cleanup changes. The 47 active changed faces comprise 21 summaries and 26 pearls.
- Anki ordinals are zero-based; site IDs contain the content revision. The 12 citation-bearing cards advance by one revision (11 from 1 to 2; `t_psychosis-pearl5:1` from 2 to 3). All 11 evidence IDs resolve to existing canonical HTTPS URLs; no citation or clinical wording was invented.
- **Template-wide visual change:** all 154 Anki fronts now say “Concepts” instead of displaying Topic. Topic, source, and evidence links appear on the answer side. This affects the appearance of all cards, including the 107 whose fields and GUIDs are unchanged; it is separate from the 47 field/identity changes.
- Anki re-import does not delete old notes. Nine formerly preserved notes (11 cards) now receive new GUIDs, in addition to the previously changed notes; the owner must review retirement of obsolete imported notes before replacing downloads. Browser revision history is retained but excluded from current queues.

## Every legacy-to-candidate rendered concept identity (158)

| Old rendered ID (UID + ordinal) | Old GUID | Old ordinal | New rendered ID | Identity action | Source path | Page |
|---|---|---:|---|---|---|---|
| <code>brief_psychotherapy_inpatient::oneline@ord0</code> | <code>Ns[e&lt;#Yc7]</code> | 0 | <code>CONCEPT#brief_psychotherapy-summary:1@2</code> | <code>new-note-required</code> | <code>02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md</code> | <code>brief_psychotherapy.md</code> |
| <code>adjustment_disorders_inpatient_teaching::oneline@ord0</code> | <code>f%/3YNlKJ?</code> | 0 | <code>CONCEPT#t_adjustment-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Adjustment/adjustment_disorders_inpatient_teaching.md</code> | <code>t_adjustment.md</code> |
| <code>adjustment_disorders_inpatient_teaching::pearl1@ord0</code> | <code>g+Y/L%0))7</code> | 0 | <code>CONCEPT#t_adjustment-pearl1:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Adjustment/adjustment_disorders_inpatient_teaching.md</code> | <code>t_adjustment.md</code> |
| <code>adjustment_disorders_inpatient_teaching::pearl1@ord1</code> | <code>g+Y/L%0))7</code> | 1 | <code>CONCEPT#t_adjustment-pearl1:2@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Adjustment/adjustment_disorders_inpatient_teaching.md</code> | <code>t_adjustment.md</code> |
| <code>adjustment_disorders_inpatient_teaching::pearl2@ord0</code> | <code>FguuM8DVnc</code> | 0 | <code>CONCEPT#t_adjustment-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Adjustment/adjustment_disorders_inpatient_teaching.md</code> | <code>t_adjustment.md</code> |
| <code>adjustment_disorders_inpatient_teaching::pearl3@ord0</code> | <code>d)^e!IR!ir</code> | 0 | <code>CONCEPT#t_adjustment-pearl3:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Adjustment/adjustment_disorders_inpatient_teaching.md</code> | <code>t_adjustment.md</code> |
| <code>adjustment_disorders_inpatient_teaching::pearl3@ord1</code> | <code>d)^e!IR!ir</code> | 1 | <code>CONCEPT#t_adjustment-pearl3:2@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Adjustment/adjustment_disorders_inpatient_teaching.md</code> | <code>t_adjustment.md</code> |
| <code>adjustment_disorders_inpatient_teaching::pearl4@ord0</code> | <code>y$nm&#124;W@FxX</code> | 0 | <code>CONCEPT#t_adjustment-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Adjustment/adjustment_disorders_inpatient_teaching.md</code> | <code>t_adjustment.md</code> |
| <code>adjustment_disorders_inpatient_teaching::pearl5@ord0</code> | <code>hp,c]rqf!A</code> | 0 | <code>CONCEPT#t_adjustment-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Adjustment/adjustment_disorders_inpatient_teaching.md</code> | <code>t_adjustment.md</code> |
| <code>adjustment_disorders_inpatient_teaching::pearl5@ord1</code> | <code>hp,c]rqf!A</code> | 1 | <code>CONCEPT#t_adjustment-pearl5:2@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Adjustment/adjustment_disorders_inpatient_teaching.md</code> | <code>t_adjustment.md</code> |
| <code>adjustment_disorders_inpatient_teaching::pearl6@ord0</code> | <code>N;o$+%}C`E</code> | 0 | <code>CONCEPT#t_adjustment-pearl6:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Adjustment/adjustment_disorders_inpatient_teaching.md</code> | <code>t_adjustment.md</code> |
| <code>anxiety_trauma_ocd_inpatient_teaching::oneline@ord0</code> | <code>zUJY)F){4&lt;</code> | 0 | <code>CONCEPT#t_anxiety-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md</code> | <code>t_anxiety.md</code> |
| <code>anxiety_trauma_ocd_inpatient_teaching::pearl1@ord0</code> | <code>Aixvea&gt;vN]</code> | 0 | <code>CONCEPT#t_anxiety-pearl1:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md</code> | <code>t_anxiety.md</code> |
| <code>anxiety_trauma_ocd_inpatient_teaching::pearl2@ord0</code> | <code>i}@1ZyXCSX</code> | 0 | <code>CONCEPT#t_anxiety-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md</code> | <code>t_anxiety.md</code> |
| <code>anxiety_trauma_ocd_inpatient_teaching::pearl3@ord0</code> | <code>K$k1]&#124;V8N4</code> | 0 | <code>CONCEPT#t_anxiety-pearl3:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md</code> | <code>t_anxiety.md</code> |
| <code>anxiety_trauma_ocd_inpatient_teaching::pearl4@ord0</code> | <code>g*W7SZUGQc</code> | 0 | <code>withdrawn</code> | <code>withdrawn</code> | <code>03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md</code> | <code>t_anxiety.md</code> |
| <code>anxiety_trauma_ocd_inpatient_teaching::pearl5@ord0</code> | <code>CX_F7rPGOI</code> | 0 | <code>CONCEPT#t_anxiety-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md</code> | <code>t_anxiety.md</code> |
| <code>anxiety_trauma_ocd_inpatient_teaching::pearl5@ord1</code> | <code>CX_F7rPGOI</code> | 1 | <code>CONCEPT#t_anxiety-pearl5:2@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md</code> | <code>t_anxiety.md</code> |
| <code>anxiety_trauma_ocd_inpatient_teaching::pearl5@ord2</code> | <code>CX_F7rPGOI</code> | 2 | <code>CONCEPT#t_anxiety-pearl5:3@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md</code> | <code>t_anxiety.md</code> |
| <code>anxiety_trauma_ocd_inpatient_teaching::pearl6@ord0</code> | <code>DTayR:LXYe</code> | 0 | <code>CONCEPT#t_anxiety-pearl6:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md</code> | <code>t_anxiety.md</code> |
| <code>anxiety_trauma_ocd_inpatient_teaching::pearl7@ord0</code> | <code>BgpkZMAUdd</code> | 0 | <code>CONCEPT#t_anxiety-pearl7:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md</code> | <code>t_anxiety.md</code> |
| <code>cultural_psychiatry_inpatient_teaching::oneline@ord0</code> | <code>kQ2u}SV&gt;UN</code> | 0 | <code>CONCEPT#cultural_psychiatry-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Cultural_Psychiatry/cultural_psychiatry_inpatient_teaching.md</code> | <code>cultural_psychiatry.md</code> |
| <code>cultural_psychiatry_inpatient_teaching::pearl1@ord0</code> | <code>s}GFXOO8e7</code> | 0 | <code>CONCEPT#cultural_psychiatry-pearl1:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Cultural_Psychiatry/cultural_psychiatry_inpatient_teaching.md</code> | <code>cultural_psychiatry.md</code> |
| <code>cultural_psychiatry_inpatient_teaching::pearl2@ord0</code> | <code>y5d~E:r;Y:</code> | 0 | <code>CONCEPT#cultural_psychiatry-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Cultural_Psychiatry/cultural_psychiatry_inpatient_teaching.md</code> | <code>cultural_psychiatry.md</code> |
| <code>cultural_psychiatry_inpatient_teaching::pearl3@ord0</code> | <code>GWYUidK&lt;~/</code> | 0 | <code>CONCEPT#cultural_psychiatry-pearl3:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Cultural_Psychiatry/cultural_psychiatry_inpatient_teaching.md</code> | <code>cultural_psychiatry.md</code> |
| <code>cultural_psychiatry_inpatient_teaching::pearl4@ord0</code> | <code>f;J@&gt;(_*)B</code> | 0 | <code>CONCEPT#cultural_psychiatry-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Cultural_Psychiatry/cultural_psychiatry_inpatient_teaching.md</code> | <code>cultural_psychiatry.md</code> |
| <code>cultural_psychiatry_inpatient_teaching::pearl5@ord0</code> | <code>J#~_WC[*wd</code> | 0 | <code>CONCEPT#cultural_psychiatry-pearl5:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Cultural_Psychiatry/cultural_psychiatry_inpatient_teaching.md</code> | <code>cultural_psychiatry.md</code> |
| <code>cultural_psychiatry_inpatient_teaching::pearl5@ord1</code> | <code>J#~_WC[*wd</code> | 1 | <code>CONCEPT#cultural_psychiatry-pearl5:2@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Cultural_Psychiatry/cultural_psychiatry_inpatient_teaching.md</code> | <code>cultural_psychiatry.md</code> |
| <code>cultural_psychiatry_inpatient_teaching::pearl6@ord0</code> | <code>O:9%e7()cA</code> | 0 | <code>CONCEPT#cultural_psychiatry-pearl6:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Cultural_Psychiatry/cultural_psychiatry_inpatient_teaching.md</code> | <code>cultural_psychiatry.md</code> |
| <code>dissociative_disorders_inpatient_teaching::oneline@ord0</code> | <code>xWODOF#&gt;o)</code> | 0 | <code>CONCEPT#t_dissociative-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Dissociative/dissociative_disorders_inpatient_teaching.md</code> | <code>t_dissociative.md</code> |
| <code>dissociative_disorders_inpatient_teaching::pearl1@ord0</code> | <code>de;[m}tR8B</code> | 0 | <code>CONCEPT#t_dissociative-pearl1:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Dissociative/dissociative_disorders_inpatient_teaching.md</code> | <code>t_dissociative.md</code> |
| <code>dissociative_disorders_inpatient_teaching::pearl2@ord0</code> | <code>v8UVEQv5vP</code> | 0 | <code>CONCEPT#t_dissociative-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Dissociative/dissociative_disorders_inpatient_teaching.md</code> | <code>t_dissociative.md</code> |
| <code>dissociative_disorders_inpatient_teaching::pearl3@ord0</code> | <code>e`x9.p3Oz}</code> | 0 | <code>CONCEPT#t_dissociative-pearl3:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Dissociative/dissociative_disorders_inpatient_teaching.md</code> | <code>t_dissociative.md</code> |
| <code>dissociative_disorders_inpatient_teaching::pearl4@ord0</code> | <code>Cya(+WDLeC</code> | 0 | <code>CONCEPT#t_dissociative-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Dissociative/dissociative_disorders_inpatient_teaching.md</code> | <code>t_dissociative.md</code> |
| <code>dissociative_disorders_inpatient_teaching::pearl5@ord0</code> | <code>c:h@T,V`8[</code> | 0 | <code>CONCEPT#t_dissociative-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Dissociative/dissociative_disorders_inpatient_teaching.md</code> | <code>t_dissociative.md</code> |
| <code>dissociative_disorders_inpatient_teaching::pearl6@ord0</code> | <code>cr_HB0FE^Z</code> | 0 | <code>CONCEPT#t_dissociative-pearl6:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Dissociative/dissociative_disorders_inpatient_teaching.md</code> | <code>t_dissociative.md</code> |
| <code>eating_disorders_inpatient_teaching::pearl1@ord0</code> | <code>rp_Gak/)!?</code> | 0 | <code>CONCEPT#t_eating-pearl1:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md</code> | <code>t_eating.md</code> |
| <code>eating_disorders_inpatient_teaching::pearl2@ord0</code> | <code>q{&lt;&amp;Fac@W+</code> | 0 | <code>CONCEPT#t_eating-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md</code> | <code>t_eating.md</code> |
| <code>eating_disorders_inpatient_teaching::pearl3@ord0</code> | <code>h2BAmt5[id</code> | 0 | <code>CONCEPT#t_eating-pearl3:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md</code> | <code>t_eating.md</code> |
| <code>eating_disorders_inpatient_teaching::pearl4@ord0</code> | <code>M{*K]v4?M4</code> | 0 | <code>CONCEPT#t_eating-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md</code> | <code>t_eating.md</code> |
| <code>eating_disorders_inpatient_teaching::pearl5@ord0</code> | <code>M/`ne3_-$q</code> | 0 | <code>CONCEPT#t_eating-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md</code> | <code>t_eating.md</code> |
| <code>eating_disorders_inpatient_teaching::pearl5@ord1</code> | <code>M/`ne3_-$q</code> | 1 | <code>CONCEPT#t_eating-pearl5:2@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md</code> | <code>t_eating.md</code> |
| <code>eating_disorders_inpatient_teaching::pearl5@ord2</code> | <code>M/`ne3_-$q</code> | 2 | <code>CONCEPT#t_eating-pearl5:3@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md</code> | <code>t_eating.md</code> |
| <code>eating_disorders_inpatient_teaching::pearl6@ord0</code> | <code>m#Jvyu.[:,</code> | 0 | <code>CONCEPT#t_eating-pearl6:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md</code> | <code>t_eating.md</code> |
| <code>eating_disorders_inpatient_teaching::pearl7@ord0</code> | <code>QRH&#124;j189H3</code> | 0 | <code>CONCEPT#t_eating-pearl7:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md</code> | <code>t_eating.md</code> |
| <code>ethics_law_confidentiality_inpatient_teaching::oneline@ord0</code> | <code>F@O%&#124;irbE</code> | 0 | <code>CONCEPT#ethics_legal-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md</code> | <code>ethics_legal.md</code> |
| <code>ethics_law_confidentiality_inpatient_teaching::pearl1@ord0</code> | <code>GC$HiX]ZQk</code> | 0 | <code>CONCEPT#ethics_legal-pearl1:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md</code> | <code>ethics_legal.md</code> |
| <code>ethics_law_confidentiality_inpatient_teaching::pearl2@ord0</code> | <code>ggiGk38}LU</code> | 0 | <code>CONCEPT#ethics_legal-pearl2:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md</code> | <code>ethics_legal.md</code> |
| <code>ethics_law_confidentiality_inpatient_teaching::pearl3@ord0</code> | <code>JcPnt,U&amp;db</code> | 0 | <code>CONCEPT#ethics_legal-pearl3:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md</code> | <code>ethics_legal.md</code> |
| <code>ethics_law_confidentiality_inpatient_teaching::pearl3@ord1</code> | <code>JcPnt,U&amp;db</code> | 1 | <code>CONCEPT#ethics_legal-pearl3:2@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md</code> | <code>ethics_legal.md</code> |
| <code>ethics_law_confidentiality_inpatient_teaching::pearl4@ord0</code> | <code>nTKHz?9-s1</code> | 0 | <code>CONCEPT#ethics_legal-pearl4:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md</code> | <code>ethics_legal.md</code> |
| <code>ethics_law_confidentiality_inpatient_teaching::pearl5@ord0</code> | <code>FVX=M.q]+n</code> | 0 | <code>CONCEPT#ethics_legal-pearl5:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md</code> | <code>ethics_legal.md</code> |
| <code>ethics_law_confidentiality_inpatient_teaching::pearl6@ord0</code> | <code>Du!#H#C%uA</code> | 0 | <code>CONCEPT#ethics_legal-pearl6:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md</code> | <code>ethics_legal.md</code> |
| <code>ethics_law_confidentiality_inpatient_teaching::pearl7@ord0</code> | <code>OfaRquV?Z&gt;</code> | 0 | <code>CONCEPT#ethics_legal-pearl7:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md</code> | <code>ethics_legal.md</code> |
| <code>ethics_law_confidentiality_inpatient_teaching::pearl8@ord0</code> | <code>d81G*k0:)D</code> | 0 | <code>CONCEPT#ethics_legal-pearl8:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md</code> | <code>ethics_legal.md</code> |
| <code>geriatric_psychiatry_inpatient_teaching::oneline@ord0</code> | <code>Gth(,X2%x&#124;</code> | 0 | <code>CONCEPT#t_geri-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Geriatric/geriatric_psychiatry_inpatient_teaching.md</code> | <code>t_geri.md</code> |
| <code>geriatric_psychiatry_inpatient_teaching::pearl1@ord0</code> | <code>xLMEh5Cu@w</code> | 0 | <code>CONCEPT#t_geri-pearl1:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Geriatric/geriatric_psychiatry_inpatient_teaching.md</code> | <code>t_geri.md</code> |
| <code>geriatric_psychiatry_inpatient_teaching::pearl2@ord0</code> | <code>LDj^gJq&#124;6d</code> | 0 | <code>CONCEPT#t_geri-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Geriatric/geriatric_psychiatry_inpatient_teaching.md</code> | <code>t_geri.md</code> |
| <code>geriatric_psychiatry_inpatient_teaching::pearl3@ord0</code> | <code>Q7^;8L7y:c</code> | 0 | <code>CONCEPT#t_geri-pearl3:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Geriatric/geriatric_psychiatry_inpatient_teaching.md</code> | <code>t_geri.md</code> |
| <code>geriatric_psychiatry_inpatient_teaching::pearl4@ord0</code> | <code>LZ,m.$K&#124;w3</code> | 0 | <code>CONCEPT#t_geri-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Geriatric/geriatric_psychiatry_inpatient_teaching.md</code> | <code>t_geri.md</code> |
| <code>geriatric_psychiatry_inpatient_teaching::pearl5@ord0</code> | <code>w6FCq%Q_B_</code> | 0 | <code>CONCEPT#t_geri-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Geriatric/geriatric_psychiatry_inpatient_teaching.md</code> | <code>t_geri.md</code> |
| <code>impulse_control_conduct_inpatient_teaching::oneline@ord0</code> | <code>i=DAW=r%!E</code> | 0 | <code>CONCEPT#t_impulse-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Impulse_Control/impulse_control_conduct_inpatient_teaching.md</code> | <code>t_impulse.md</code> |
| <code>impulse_control_conduct_inpatient_teaching::pearl1@ord0</code> | <code>Gd[x*t&amp;GiS</code> | 0 | <code>CONCEPT#t_impulse-pearl1:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Impulse_Control/impulse_control_conduct_inpatient_teaching.md</code> | <code>t_impulse.md</code> |
| <code>impulse_control_conduct_inpatient_teaching::pearl1@ord1</code> | <code>Gd[x*t&amp;GiS</code> | 1 | <code>CONCEPT#t_impulse-pearl1:2@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Impulse_Control/impulse_control_conduct_inpatient_teaching.md</code> | <code>t_impulse.md</code> |
| <code>impulse_control_conduct_inpatient_teaching::pearl2@ord0</code> | <code>qk3x$%mav5</code> | 0 | <code>CONCEPT#t_impulse-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Impulse_Control/impulse_control_conduct_inpatient_teaching.md</code> | <code>t_impulse.md</code> |
| <code>impulse_control_conduct_inpatient_teaching::pearl3@ord0</code> | <code>Dkai&amp;LXG00</code> | 0 | <code>CONCEPT#t_impulse-pearl3:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Impulse_Control/impulse_control_conduct_inpatient_teaching.md</code> | <code>t_impulse.md</code> |
| <code>impulse_control_conduct_inpatient_teaching::pearl4@ord0</code> | <code>C3U3sDo^Dz</code> | 0 | <code>CONCEPT#t_impulse-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Impulse_Control/impulse_control_conduct_inpatient_teaching.md</code> | <code>t_impulse.md</code> |
| <code>impulse_control_conduct_inpatient_teaching::pearl5@ord0</code> | <code>zdtlLqf!9d</code> | 0 | <code>CONCEPT#t_impulse-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Impulse_Control/impulse_control_conduct_inpatient_teaching.md</code> | <code>t_impulse.md</code> |
| <code>impulse_control_conduct_inpatient_teaching::pearl6@ord0</code> | <code>C.n7h)Cmy_</code> | 0 | <code>CONCEPT#t_impulse-pearl6:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Impulse_Control/impulse_control_conduct_inpatient_teaching.md</code> | <code>t_impulse.md</code> |
| <code>mood_disorders_inpatient_teaching::oneline@ord0</code> | <code>M!L:A&gt;&amp;O^~</code> | 0 | <code>CONCEPT#t_mood-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md</code> | <code>t_mood.md</code> |
| <code>mood_disorders_inpatient_teaching::pearl1@ord0</code> | <code>toUO@+9i0@</code> | 0 | <code>CONCEPT#t_mood-pearl1:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md</code> | <code>t_mood.md</code> |
| <code>mood_disorders_inpatient_teaching::pearl2@ord0</code> | <code>l6u6moK(XU</code> | 0 | <code>CONCEPT#t_mood-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md</code> | <code>t_mood.md</code> |
| <code>mood_disorders_inpatient_teaching::pearl3@ord0</code> | <code>f9v7OJXFv[</code> | 0 | <code>CONCEPT#t_mood-pearl3:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md</code> | <code>t_mood.md</code> |
| <code>mood_disorders_inpatient_teaching::pearl4@ord0</code> | <code>e3~Pw!MgSZ</code> | 0 | <code>CONCEPT#t_mood-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md</code> | <code>t_mood.md</code> |
| <code>mood_disorders_inpatient_teaching::pearl5@ord0</code> | <code>isZ35H^tYL</code> | 0 | <code>CONCEPT#t_mood-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md</code> | <code>t_mood.md</code> |
| <code>mood_disorders_inpatient_teaching::pearl6@ord0</code> | <code>rLF.XB0WK7</code> | 0 | <code>withdrawn</code> | <code>withdrawn</code> | <code>03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md</code> | <code>t_mood.md</code> |
| <code>mood_disorders_inpatient_teaching::pearl7@ord0</code> | <code>p9zE,=9@?%</code> | 0 | <code>CONCEPT#t_mood-pearl7:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md</code> | <code>t_mood.md</code> |
| <code>neurocognitive_disorders_inpatient_teaching::oneline@ord0</code> | <code>M!SJ/NrAgs</code> | 0 | <code>CONCEPT#t_neurocog-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md</code> | <code>t_neurocog.md</code> |
| <code>neurocognitive_disorders_inpatient_teaching::pearl1@ord0</code> | <code>q(T2S&amp;LCu</code> | 0 | <code>CONCEPT#t_neurocog-pearl1:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md</code> | <code>t_neurocog.md</code> |
| <code>neurocognitive_disorders_inpatient_teaching::pearl2@ord0</code> | <code>nKu5Di0?t.</code> | 0 | <code>CONCEPT#t_neurocog-pearl2:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md</code> | <code>t_neurocog.md</code> |
| <code>neurocognitive_disorders_inpatient_teaching::pearl3@ord0</code> | <code>be%Lasq;W,</code> | 0 | <code>CONCEPT#t_neurocog-pearl3:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md</code> | <code>t_neurocog.md</code> |
| <code>neurocognitive_disorders_inpatient_teaching::pearl4@ord0</code> | <code>d&lt;q;u]&gt;/t{</code> | 0 | <code>CONCEPT#t_neurocog-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md</code> | <code>t_neurocog.md</code> |
| <code>neurocognitive_disorders_inpatient_teaching::pearl5@ord0</code> | <code>dS;o]T-17~</code> | 0 | <code>CONCEPT#t_neurocog-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md</code> | <code>t_neurocog.md</code> |
| <code>neurocognitive_disorders_inpatient_teaching::pearl6@ord0</code> | <code>mTc=A79}9w</code> | 0 | <code>CONCEPT#t_neurocog-pearl6:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md</code> | <code>t_neurocog.md</code> |
| <code>neurocognitive_disorders_inpatient_teaching::pearl7@ord0</code> | <code>O&amp;3bn5*^ZA</code> | 0 | <code>CONCEPT#t_neurocog-pearl7:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md</code> | <code>t_neurocog.md</code> |
| <code>neurocognitive_disorders_inpatient_teaching::pearl7@ord1</code> | <code>O&amp;3bn5*^ZA</code> | 1 | <code>CONCEPT#t_neurocog-pearl7:2@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md</code> | <code>t_neurocog.md</code> |
| <code>neurodevelopmental_disorders_inpatient_teaching::oneline@ord0</code> | <code>v:}3:.C!Vi</code> | 0 | <code>CONCEPT#t_neurodev-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Neurodevelopmental/neurodevelopmental_disorders_inpatient_teaching.md</code> | <code>t_neurodev.md</code> |
| <code>neurodevelopmental_disorders_inpatient_teaching::pearl1@ord0</code> | <code>hk,TXldL,&gt;</code> | 0 | <code>CONCEPT#t_neurodev-pearl1:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Neurodevelopmental/neurodevelopmental_disorders_inpatient_teaching.md</code> | <code>t_neurodev.md</code> |
| <code>neurodevelopmental_disorders_inpatient_teaching::pearl2@ord0</code> | <code>c!,QHyR`q&#124;</code> | 0 | <code>CONCEPT#t_neurodev-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Neurodevelopmental/neurodevelopmental_disorders_inpatient_teaching.md</code> | <code>t_neurodev.md</code> |
| <code>neurodevelopmental_disorders_inpatient_teaching::pearl3@ord0</code> | <code>uk4Ui(:Ti)</code> | 0 | <code>CONCEPT#t_neurodev-pearl3:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Neurodevelopmental/neurodevelopmental_disorders_inpatient_teaching.md</code> | <code>t_neurodev.md</code> |
| <code>neurodevelopmental_disorders_inpatient_teaching::pearl4@ord0</code> | <code>d^EfP~7*EH</code> | 0 | <code>CONCEPT#t_neurodev-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Neurodevelopmental/neurodevelopmental_disorders_inpatient_teaching.md</code> | <code>t_neurodev.md</code> |
| <code>neurodevelopmental_disorders_inpatient_teaching::pearl5@ord0</code> | <code>MS@Lg:yrY8</code> | 0 | <code>CONCEPT#t_neurodev-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Neurodevelopmental/neurodevelopmental_disorders_inpatient_teaching.md</code> | <code>t_neurodev.md</code> |
| <code>neurodevelopmental_disorders_inpatient_teaching::pearl6@ord0</code> | <code>urWVWO3GOu</code> | 0 | <code>CONCEPT#t_neurodev-pearl6:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Neurodevelopmental/neurodevelopmental_disorders_inpatient_teaching.md</code> | <code>t_neurodev.md</code> |
| <code>neurodevelopmental_disorders_inpatient_teaching::pearl6@ord1</code> | <code>urWVWO3GOu</code> | 1 | <code>CONCEPT#t_neurodev-pearl6:2@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Neurodevelopmental/neurodevelopmental_disorders_inpatient_teaching.md</code> | <code>t_neurodev.md</code> |
| <code>neurodevelopmental_disorders_inpatient_teaching::pearl7@ord0</code> | <code>c`-PN:u,[(</code> | 0 | <code>CONCEPT#t_neurodev-pearl7:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Neurodevelopmental/neurodevelopmental_disorders_inpatient_teaching.md</code> | <code>t_neurodev.md</code> |
| <code>perinatal_psychiatry_inpatient_teaching::oneline@ord0</code> | <code>p9gswOQ6&#124;l</code> | 0 | <code>CONCEPT#t_perinatal-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md</code> | <code>t_perinatal.md</code> |
| <code>perinatal_psychiatry_inpatient_teaching::pearl1@ord0</code> | <code>M9nv-sR5_T</code> | 0 | <code>CONCEPT#t_perinatal-pearl1:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md</code> | <code>t_perinatal.md</code> |
| <code>perinatal_psychiatry_inpatient_teaching::pearl1@ord1</code> | <code>M9nv-sR5_T</code> | 1 | <code>CONCEPT#t_perinatal-pearl1:2@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md</code> | <code>t_perinatal.md</code> |
| <code>perinatal_psychiatry_inpatient_teaching::pearl2@ord0</code> | <code>xuRE&amp;G-ez/</code> | 0 | <code>CONCEPT#t_perinatal-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md</code> | <code>t_perinatal.md</code> |
| <code>perinatal_psychiatry_inpatient_teaching::pearl3@ord0</code> | <code>s&gt;Zm7)6X*M</code> | 0 | <code>CONCEPT#t_perinatal-pearl3:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md</code> | <code>t_perinatal.md</code> |
| <code>perinatal_psychiatry_inpatient_teaching::pearl4@ord0</code> | <code>GA0=q=IdM`</code> | 0 | <code>CONCEPT#t_perinatal-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md</code> | <code>t_perinatal.md</code> |
| <code>perinatal_psychiatry_inpatient_teaching::pearl5@ord0</code> | <code>hafQ+4&#124;/Z+</code> | 0 | <code>CONCEPT#t_perinatal-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md</code> | <code>t_perinatal.md</code> |
| <code>personality_disorders_inpatient_teaching::oneline@ord0</code> | <code>F~E7}GLXk?</code> | 0 | <code>CONCEPT#t_personality-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md</code> | <code>t_personality.md</code> |
| <code>personality_disorders_inpatient_teaching::pearl1@ord0</code> | <code>w{]%Z@xb};</code> | 0 | <code>CONCEPT#t_personality-pearl1:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md</code> | <code>t_personality.md</code> |
| <code>personality_disorders_inpatient_teaching::pearl2@ord0</code> | <code>sdXvJk}y~E</code> | 0 | <code>CONCEPT#t_personality-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md</code> | <code>t_personality.md</code> |
| <code>personality_disorders_inpatient_teaching::pearl3@ord0</code> | <code>O4w#rkeNN?</code> | 0 | <code>CONCEPT#t_personality-pearl3:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md</code> | <code>t_personality.md</code> |
| <code>personality_disorders_inpatient_teaching::pearl4@ord0</code> | <code>Of!A0&lt;9cuP</code> | 0 | <code>CONCEPT#t_personality-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md</code> | <code>t_personality.md</code> |
| <code>personality_disorders_inpatient_teaching::pearl5@ord0</code> | <code>B&gt;huK3ZM,X</code> | 0 | <code>CONCEPT#t_personality-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md</code> | <code>t_personality.md</code> |
| <code>personality_disorders_inpatient_teaching::pearl6@ord0</code> | <code>L~`W2V!+Q&gt;</code> | 0 | <code>CONCEPT#t_personality-pearl6:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md</code> | <code>t_personality.md</code> |
| <code>psychotic_disorders_inpatient_teaching::oneline@ord0</code> | <code>v&lt;,N9CiKCX</code> | 0 | <code>CONCEPT#t_psychosis-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md</code> | <code>t_psychosis.md</code> |
| <code>psychotic_disorders_inpatient_teaching::pearl1@ord0</code> | <code>CGUXK&gt;2x1&gt;</code> | 0 | <code>CONCEPT#t_psychosis-pearl1:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md</code> | <code>t_psychosis.md</code> |
| <code>psychotic_disorders_inpatient_teaching::pearl2@ord0</code> | <code>K8E.&gt;OT=$a</code> | 0 | <code>CONCEPT#t_psychosis-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md</code> | <code>t_psychosis.md</code> |
| <code>psychotic_disorders_inpatient_teaching::pearl3@ord0</code> | <code>iTxRHKXKhv</code> | 0 | <code>CONCEPT#t_psychosis-pearl3:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md</code> | <code>t_psychosis.md</code> |
| <code>psychotic_disorders_inpatient_teaching::pearl4@ord0</code> | <code>j*r&gt;{7UpsB</code> | 0 | <code>CONCEPT#t_psychosis-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md</code> | <code>t_psychosis.md</code> |
| <code>psychotic_disorders_inpatient_teaching::pearl4@ord1</code> | <code>j*r&gt;{7UpsB</code> | 1 | <code>CONCEPT#t_psychosis-pearl4:2@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md</code> | <code>t_psychosis.md</code> |
| <code>psychotic_disorders_inpatient_teaching::pearl5@ord0</code> | <code>o{4&#124;Y5x!i&amp;</code> | 0 | <code>CONCEPT#t_psychosis-pearl5:1@3</code> | <code>new-note-required</code> | <code>03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md</code> | <code>t_psychosis.md</code> |
| <code>psychotic_disorders_inpatient_teaching::pearl6@ord0</code> | <code>s9t6*h-c&amp;Z</code> | 0 | <code>CONCEPT#t_psychosis-pearl6:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md</code> | <code>t_psychosis.md</code> |
| <code>psychotic_disorders_inpatient_teaching::pearl7@ord0</code> | <code>euk(=^V/&#124;6</code> | 0 | <code>CONCEPT#t_psychosis-pearl7:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md</code> | <code>t_psychosis.md</code> |
| <code>psychotic_disorders_inpatient_teaching::pearl8@ord0</code> | <code>DKkUSBhBW1</code> | 0 | <code>CONCEPT#t_psychosis-pearl8:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md</code> | <code>t_psychosis.md</code> |
| <code>psychotic_disorders_inpatient_teaching::pearl8@ord1</code> | <code>DKkUSBhBW1</code> | 1 | <code>CONCEPT#t_psychosis-pearl8:2@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md</code> | <code>t_psychosis.md</code> |
| <code>substance_use_inpatient_teaching::oneline@ord0</code> | <code>FG*y]?XDUX</code> | 0 | <code>CONCEPT#t_sud-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md</code> | <code>t_sud.md</code> |
| <code>substance_use_inpatient_teaching::pearl1@ord0</code> | <code>IQ8Blfg)Fw</code> | 0 | <code>CONCEPT#t_sud-pearl1:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md</code> | <code>t_sud.md</code> |
| <code>substance_use_inpatient_teaching::pearl2@ord0</code> | <code>P&gt;J6nXjZQH</code> | 0 | <code>CONCEPT#t_sud-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md</code> | <code>t_sud.md</code> |
| <code>substance_use_inpatient_teaching::pearl3@ord0</code> | <code>Bfq0wh`3Wq</code> | 0 | <code>CONCEPT#t_sud-pearl3:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md</code> | <code>t_sud.md</code> |
| <code>substance_use_inpatient_teaching::pearl4@ord0</code> | <code>PKwx[r75rI</code> | 0 | <code>CONCEPT#t_sud-pearl4:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md</code> | <code>t_sud.md</code> |
| <code>substance_use_inpatient_teaching::pearl5@ord0</code> | <code>vYDB:_zG?C</code> | 0 | <code>CONCEPT#t_sud-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md</code> | <code>t_sud.md</code> |
| <code>substance_use_inpatient_teaching::pearl6@ord0</code> | <code>sK_Rm!V~68</code> | 0 | <code>CONCEPT#t_sud-pearl6:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md</code> | <code>t_sud.md</code> |
| <code>sexual_paraphilic_gender_inpatient_teaching::oneline@ord0</code> | <code>v@LT223~l#</code> | 0 | <code>CONCEPT#t_sexual-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Sexual_Gender/sexual_paraphilic_gender_inpatient_teaching.md</code> | <code>t_sexual.md</code> |
| <code>sexual_paraphilic_gender_inpatient_teaching::pearl1@ord0</code> | <code>zQy5Pc#oJW</code> | 0 | <code>CONCEPT#t_sexual-pearl1:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Sexual_Gender/sexual_paraphilic_gender_inpatient_teaching.md</code> | <code>t_sexual.md</code> |
| <code>sexual_paraphilic_gender_inpatient_teaching::pearl2@ord0</code> | <code>r&#124;^VR)6wap</code> | 0 | <code>CONCEPT#t_sexual-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Sexual_Gender/sexual_paraphilic_gender_inpatient_teaching.md</code> | <code>t_sexual.md</code> |
| <code>sexual_paraphilic_gender_inpatient_teaching::pearl3@ord0</code> | <code>c;+/#kk_,D</code> | 0 | <code>withdrawn</code> | <code>withdrawn</code> | <code>03_Core_Topics/Sexual_Gender/sexual_paraphilic_gender_inpatient_teaching.md</code> | <code>t_sexual.md</code> |
| <code>sexual_paraphilic_gender_inpatient_teaching::pearl4@ord0</code> | <code>xb2d?Bx:M&amp;</code> | 0 | <code>CONCEPT#t_sexual-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Sexual_Gender/sexual_paraphilic_gender_inpatient_teaching.md</code> | <code>t_sexual.md</code> |
| <code>sexual_paraphilic_gender_inpatient_teaching::pearl5@ord0</code> | <code>QuG=x31eTu</code> | 0 | <code>CONCEPT#t_sexual-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Sexual_Gender/sexual_paraphilic_gender_inpatient_teaching.md</code> | <code>t_sexual.md</code> |
| <code>sexual_paraphilic_gender_inpatient_teaching::pearl6@ord0</code> | <code>q[{$[R?&gt;&amp;k</code> | 0 | <code>CONCEPT#t_sexual-pearl6:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Sexual_Gender/sexual_paraphilic_gender_inpatient_teaching.md</code> | <code>t_sexual.md</code> |
| <code>sleep_wake_disorders_inpatient_teaching::oneline@ord0</code> | <code>t$?hnx%{Xl</code> | 0 | <code>CONCEPT#t_sleep-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Sleep/sleep_wake_disorders_inpatient_teaching.md</code> | <code>t_sleep.md</code> |
| <code>sleep_wake_disorders_inpatient_teaching::pearl1@ord0</code> | <code>H}h$odYqm&#124;</code> | 0 | <code>CONCEPT#t_sleep-pearl1:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Sleep/sleep_wake_disorders_inpatient_teaching.md</code> | <code>t_sleep.md</code> |
| <code>sleep_wake_disorders_inpatient_teaching::pearl2@ord0</code> | <code>j.9nXUMs[O</code> | 0 | <code>CONCEPT#t_sleep-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Sleep/sleep_wake_disorders_inpatient_teaching.md</code> | <code>t_sleep.md</code> |
| <code>sleep_wake_disorders_inpatient_teaching::pearl3@ord0</code> | <code>I794ZA-@gT</code> | 0 | <code>CONCEPT#t_sleep-pearl3:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Sleep/sleep_wake_disorders_inpatient_teaching.md</code> | <code>t_sleep.md</code> |
| <code>sleep_wake_disorders_inpatient_teaching::pearl4@ord0</code> | <code>qX_bz~.Hfm</code> | 0 | <code>CONCEPT#t_sleep-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Sleep/sleep_wake_disorders_inpatient_teaching.md</code> | <code>t_sleep.md</code> |
| <code>sleep_wake_disorders_inpatient_teaching::pearl5@ord0</code> | <code>x8~:WL,Zua</code> | 0 | <code>CONCEPT#t_sleep-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Sleep/sleep_wake_disorders_inpatient_teaching.md</code> | <code>t_sleep.md</code> |
| <code>sleep_wake_disorders_inpatient_teaching::pearl6@ord0</code> | <code>vDruot-W$e</code> | 0 | <code>CONCEPT#t_sleep-pearl6:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Sleep/sleep_wake_disorders_inpatient_teaching.md</code> | <code>t_sleep.md</code> |
| <code>somatic_symptom_disorders_inpatient_teaching::oneline@ord0</code> | <code>uN^]?swIyZ</code> | 0 | <code>CONCEPT#t_somatic-summary:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Somatic/somatic_symptom_disorders_inpatient_teaching.md</code> | <code>t_somatic.md</code> |
| <code>somatic_symptom_disorders_inpatient_teaching::pearl1@ord0</code> | <code>KHiPsh3)H&amp;</code> | 0 | <code>CONCEPT#t_somatic-pearl1:1@2</code> | <code>new-note-required</code> | <code>03_Core_Topics/Somatic/somatic_symptom_disorders_inpatient_teaching.md</code> | <code>t_somatic.md</code> |
| <code>somatic_symptom_disorders_inpatient_teaching::pearl2@ord0</code> | <code>z;/$fMR:rg</code> | 0 | <code>CONCEPT#t_somatic-pearl2:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Somatic/somatic_symptom_disorders_inpatient_teaching.md</code> | <code>t_somatic.md</code> |
| <code>somatic_symptom_disorders_inpatient_teaching::pearl3@ord0</code> | <code>mX]KZpz4Tk</code> | 0 | <code>CONCEPT#t_somatic-pearl3:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Somatic/somatic_symptom_disorders_inpatient_teaching.md</code> | <code>t_somatic.md</code> |
| <code>somatic_symptom_disorders_inpatient_teaching::pearl3@ord1</code> | <code>mX]KZpz4Tk</code> | 1 | <code>CONCEPT#t_somatic-pearl3:2@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Somatic/somatic_symptom_disorders_inpatient_teaching.md</code> | <code>t_somatic.md</code> |
| <code>somatic_symptom_disorders_inpatient_teaching::pearl4@ord0</code> | <code>CQ_`c$Cv]t</code> | 0 | <code>CONCEPT#t_somatic-pearl4:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Somatic/somatic_symptom_disorders_inpatient_teaching.md</code> | <code>t_somatic.md</code> |
| <code>somatic_symptom_disorders_inpatient_teaching::pearl5@ord0</code> | <code>Q%WAS}T=[Y</code> | 0 | <code>CONCEPT#t_somatic-pearl5:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Somatic/somatic_symptom_disorders_inpatient_teaching.md</code> | <code>t_somatic.md</code> |
| <code>somatic_symptom_disorders_inpatient_teaching::pearl6@ord0</code> | <code>QP(&gt;7zEKI.</code> | 0 | <code>CONCEPT#t_somatic-pearl6:1@1</code> | <code>preserve-guid</code> | <code>03_Core_Topics/Somatic/somatic_symptom_disorders_inpatient_teaching.md</code> | <code>t_somatic.md</code> |
| <code>ect_neuromodulation_inpatient_teaching::oneline@ord0</code> | <code>t:I1};h!k[</code> | 0 | <code>CONCEPT#ect_neuromodulation-summary:1@2</code> | <code>new-note-required</code> | <code>05_Psychopharmacology/ECT_Neuromodulation/ect_neuromodulation_inpatient_teaching.md</code> | <code>ect_neuromodulation.md</code> |
| <code>ect_neuromodulation_inpatient_teaching::pearl1@ord0</code> | <code>g2_2&gt;:wsZe</code> | 0 | <code>CONCEPT#ect_neuromodulation-pearl1:1@1</code> | <code>preserve-guid</code> | <code>05_Psychopharmacology/ECT_Neuromodulation/ect_neuromodulation_inpatient_teaching.md</code> | <code>ect_neuromodulation.md</code> |
| <code>ect_neuromodulation_inpatient_teaching::pearl2@ord0</code> | <code>P&amp;P]f8,6IE</code> | 0 | <code>CONCEPT#ect_neuromodulation-pearl2:1@1</code> | <code>preserve-guid</code> | <code>05_Psychopharmacology/ECT_Neuromodulation/ect_neuromodulation_inpatient_teaching.md</code> | <code>ect_neuromodulation.md</code> |
| <code>ect_neuromodulation_inpatient_teaching::pearl3@ord0</code> | <code>s8DV}`A/NI</code> | 0 | <code>withdrawn</code> | <code>withdrawn</code> | <code>05_Psychopharmacology/ECT_Neuromodulation/ect_neuromodulation_inpatient_teaching.md</code> | <code>ect_neuromodulation.md</code> |
| <code>ect_neuromodulation_inpatient_teaching::pearl4@ord0</code> | <code>E}%NRBBBzs</code> | 0 | <code>CONCEPT#ect_neuromodulation-pearl4:1@1</code> | <code>preserve-guid</code> | <code>05_Psychopharmacology/ECT_Neuromodulation/ect_neuromodulation_inpatient_teaching.md</code> | <code>ect_neuromodulation.md</code> |
| <code>ect_neuromodulation_inpatient_teaching::pearl5@ord0</code> | <code>g36_Qg_Rc}</code> | 0 | <code>CONCEPT#ect_neuromodulation-pearl5:1@1</code> | <code>preserve-guid</code> | <code>05_Psychopharmacology/ECT_Neuromodulation/ect_neuromodulation_inpatient_teaching.md</code> | <code>ect_neuromodulation.md</code> |
| <code>ect_neuromodulation_inpatient_teaching::pearl6@ord0</code> | <code>PonhvP,m@,</code> | 0 | <code>CONCEPT#ect_neuromodulation-pearl6:1@1</code> | <code>preserve-guid</code> | <code>05_Psychopharmacology/ECT_Neuromodulation/ect_neuromodulation_inpatient_teaching.md</code> | <code>ect_neuromodulation.md</code> |
| <code>collateral_micro_workflow::oneline@ord0</code> | <code>bc:y?BMV.u</code> | 0 | <code>CONCEPT#collateral_workflow-summary:1@2</code> | <code>new-note-required</code> | <code>06_Family_and_Relational/collateral_micro_workflow.md</code> | <code>collateral_workflow.md</code> |
| <code>family_meeting_playbook_90min::oneline@ord0</code> | <code>N_$e.~eOo{</code> | 0 | <code>CONCEPT#family_playbook-summary:1@2</code> | <code>new-note-required</code> | <code>06_Family_and_Relational/family_meeting_playbook_90min.md</code> | <code>family_playbook.md</code> |

## Changed or withdrawn faces (51)

Plain-text comparison values below exclude template decoration. `null` means withdrawn. Every changed face still requires faculty review; canonical exact excerpts remain in the candidate catalog. Evidence URLs are shown only after reveal.

### CONCEPT#brief_psychotherapy-summary:1@2

Source: `02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md` · page `brief_psychotherapy.md` · old `brief_psychotherapy_inpatient::oneline@ord0` · GUID `Ns[e<#Yc7]` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "You will not complete a course of therapy on an inpatient unit, but almost every encounter is a micro-intervention. The skill is to read the mechanism driving this patient's crisis right now and match one brief technique to it — then hand the work off to outpatient care.",
  "newFront": "You will not complete a course of therapy on an inpatient unit, but almost every encounter is a […]. The skill is to read the mechanism driving this patient's crisis right now and match one brief technique to it — then hand the work off to outpatient care.",
  "newBack": "You will not complete a course of therapy on an inpatient unit, but almost every encounter is a micro-intervention. The skill is to read the mechanism driving this patient's crisis right now and match one brief technique to it — then hand the work off to outpatient care.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_adjustment-summary:1@2

Source: `03_Core_Topics/Adjustment/adjustment_disorders_inpatient_teaching.md` · page `t_adjustment.md` · old `adjustment_disorders_inpatient_teaching::oneline@ord0` · GUID `f%/3YNlKJ?` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "An adjustment disorder is clinically significant distress or impairment that begins within 3 months of an identifiable stressor and resolves within 6 months after the stressor (or its consequences) ends — it is the diagnosis for someone struggling more than expected with a real-life event who does not meet criteria for another disorder, and it still carries meaningful, sometimes acute, suicide risk.",
  "newFront": "An adjustment disorder is clinically significant distress or impairment that begins […] and resolves within 6 months after the stressor (or its consequences) ends — it is the diagnosis for someone struggling more than expected with a real-life event who does not meet criteria for another disorder, and it still carries meaningful, sometimes acute, suicide risk.",
  "newBack": "An adjustment disorder is clinically significant distress or impairment that begins within 3 months of an identifiable stressor and resolves within 6 months after the stressor (or its consequences) ends — it is the diagnosis for someone struggling more than expected with a real-life event who does not meet criteria for another disorder, and it still carries meaningful, sometimes acute, suicide risk.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_anxiety-summary:1@2

Source: `03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md` · page `t_anxiety.md` · old `anxiety_trauma_ocd_inpatient_teaching::oneline@ord0` · GUID `zUJY)F){4<` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "On the unit, anxiety, OCD, and PTSD are usually layered onto a primary admission diagnosis; your job is to separate the medical and substance mimics from the psychiatric disorder, treat the disorder with antidepressants plus structured behavioral work, and resist the reflex to standing benzodiazepines.",
  "newFront": "On the unit, anxiety, OCD, and PTSD are usually layered onto a primary admission diagnosis; your job is to separate the medical and substance mimics from the psychiatric disorder, treat the disorder with […], and resist the reflex to standing benzodiazepines.",
  "newBack": "On the unit, anxiety, OCD, and PTSD are usually layered onto a primary admission diagnosis; your job is to separate the medical and substance mimics from the psychiatric disorder, treat the disorder with antidepressants plus structured behavioral work, and resist the reflex to standing benzodiazepines.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### t_anxiety-pearl4:1 (withdrawn)

Source: `03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md` · page `t_anxiety.md` · old `anxiety_trauma_ocd_inpatient_teaching::pearl4@ord0` · GUID `g*W7SZUGQc` / ordinal `0` · action `withdrawn`.

~~~json
{
  "oldFront": "[…] are first-line; benzodiazepines are a liability on the unit, not a maintenance plan.",
  "oldBack": "SSRIs/SNRIs are first-line; benzodiazepines are a liability on the unit, not a maintenance plan.",
  "newFront": null,
  "newBack": null,
  "reason": "Published target no longer occurs in current source; withdraw instead of substituting a changed clinical claim. FACULTY REVIEW REQUIRED."
}
~~~

### CONCEPT#cultural_psychiatry-summary:1@2

Source: `03_Core_Topics/Cultural_Psychiatry/cultural_psychiatry_inpatient_teaching.md` · page `cultural_psychiatry.md` · old `cultural_psychiatry_inpatient_teaching::oneline@ord0` · GUID `kQ2u}SV>UN` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "Culture shapes how distress is experienced, expressed, and treated — and ignoring it produces misdiagnosis and inequity — so the core clerkship skills are eliciting the patient's own explanatory model, using the Cultural Formulation Interview, working correctly with interpreters, and recognizing the disparities and biases that distort psychiatric care.",
  "newFront": "Culture shapes how distress is experienced, expressed, and treated — and ignoring it produces misdiagnosis and inequity — so the core clerkship skills are eliciting the patient's own explanatory model, using the […], working correctly with interpreters, and recognizing the disparities and biases that distort psychiatric care.",
  "newBack": "Culture shapes how distress is experienced, expressed, and treated — and ignoring it produces misdiagnosis and inequity — so the core clerkship skills are eliciting the patient's own explanatory model, using the Cultural Formulation Interview, working correctly with interpreters, and recognizing the disparities and biases that distort psychiatric care.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#cultural_psychiatry-pearl5:1@2

Source: `03_Core_Topics/Cultural_Psychiatry/cultural_psychiatry_inpatient_teaching.md` · page `cultural_psychiatry.md` · old `cultural_psychiatry_inpatient_teaching::pearl5@ord0` · GUID `J#~_WC[*wd` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "Minority patients are […] and under-diagnosed with mood disorders — a documented bias to guard against.",
  "oldBack": "Minority patients are over-diagnosed with schizophrenia and under-diagnosed with mood disorders — a documented bias to guard against.",
  "newFront": "Black (and some other minority) patients are […] and under-diagnosed with mood disorders — a documented bias to guard against.",
  "newBack": "Black (and some other minority) patients are over-diagnosed with schizophrenia and under-diagnosed with mood disorders — a documented bias to guard against.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#cultural_psychiatry-pearl5:2@2

Source: `03_Core_Topics/Cultural_Psychiatry/cultural_psychiatry_inpatient_teaching.md` · page `cultural_psychiatry.md` · old `cultural_psychiatry_inpatient_teaching::pearl5@ord1` · GUID `J#~_WC[*wd` / ordinal `1` · action `new-note-required`.

~~~json
{
  "oldFront": "Minority patients are over-diagnosed with schizophrenia and […] — a documented bias to guard against.",
  "oldBack": "Minority patients are over-diagnosed with schizophrenia and under-diagnosed with mood disorders — a documented bias to guard against.",
  "newFront": "Black (and some other minority) patients are over-diagnosed with schizophrenia and […] — a documented bias to guard against.",
  "newBack": "Black (and some other minority) patients are over-diagnosed with schizophrenia and under-diagnosed with mood disorders — a documented bias to guard against.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_dissociative-summary:1@2

Source: `03_Core_Topics/Dissociative/dissociative_disorders_inpatient_teaching.md` · page `t_dissociative.md` · old `dissociative_disorders_inpatient_teaching::oneline@ord0` · GUID `xWODOF#>o)` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "Dissociation is a disruption in the normal integration of memory, identity, perception, and awareness — usually trauma-linked — and on the unit your tasks are to rule out the medical and substance causes that mimic it, keep it separate from psychosis and malingering, and stabilize safety before doing any trauma work.",
  "newFront": "Dissociation is a disruption in the normal integration of […] — usually trauma-linked — and on the unit your tasks are to rule out the medical and substance causes that mimic it, keep it separate from psychosis and malingering, and stabilize safety before doing any trauma work.",
  "newBack": "Dissociation is a disruption in the normal integration of memory, identity, perception, and awareness — usually trauma-linked — and on the unit your tasks are to rule out the medical and substance causes that mimic it, keep it separate from psychosis and malingering, and stabilize safety before doing any trauma work.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_eating-pearl1:1@2

Source: `03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md` · page `t_eating.md` · old `eating_disorders_inpatient_teaching::pearl1@ord0` · GUID `rp_Gak/)!?` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "[…] = watch the phosphate — start low, go slow, replete phosphate, give thiamine; the most malnourished are the highest risk.",
  "oldBack": "Refeeding syndrome = watch the phosphate — start low, go slow, replete phosphate, give thiamine; the most malnourished are the highest risk.",
  "newFront": "[…] = watch the phosphate — risk tracks the degree of malnutrition, not the starting calories; most patients can start higher with daily phosphate/K/Mg checks, and the most malnourished or medically unstable start cautiously; give thiamine.",
  "newBack": "Refeeding syndrome = watch the phosphate — risk tracks the degree of malnutrition, not the starting calories; most patients can start higher with daily phosphate/K/Mg checks, and the most malnourished or medically unstable start cautiously; give thiamine.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#ethics_legal-summary:1@2

Source: `03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md` · page `ethics_legal.md` · old `ethics_law_confidentiality_inpatient_teaching::oneline@ord0` · GUID `F@O%|irbE` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "Psychiatry runs on confidentiality, but the exam and the ward turn on knowing its limits — when you must break it to protect a third party, when you must report abuse, and when you can treat or hold a patient against their will — always choosing the least restrictive option that keeps people safe.",
  "newFront": "Psychiatry runs on confidentiality, but the exam and the ward turn on knowing its limits — when you must break it to protect a third party, when you must report abuse, and when you can treat or hold a patient against their will — always choosing the […] option that keeps people safe.",
  "newBack": "Psychiatry runs on confidentiality, but the exam and the ward turn on knowing its limits — when you must break it to protect a third party, when you must report abuse, and when you can treat or hold a patient against their will — always choosing the least restrictive option that keeps people safe.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#ethics_legal-pearl1:1@2

Source: `03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md` · page `ethics_legal.md` · old `ethics_law_confidentiality_inpatient_teaching::pearl1@ord0` · GUID `GC$HiX]ZQk` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "A serious threat to an identifiable victim triggers a duty to protect ([…]) — confidentiality yields.",
  "oldBack": "A serious threat to an identifiable victim triggers a duty to protect (Tarasoff) — confidentiality yields.",
  "newFront": "A serious threat to an identifiable victim can trigger a duty to protect ([…]) — mandatory, permissive or absent depending on the state; where it applies, confidentiality yields.",
  "newBack": "A serious threat to an identifiable victim can trigger a duty to protect (Tarasoff) — mandatory, permissive or absent depending on the state; where it applies, confidentiality yields.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#ethics_legal-pearl2:1@2

Source: `03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md` · page `ethics_legal.md` · old `ethics_law_confidentiality_inpatient_teaching::pearl2@ord0` · GUID `ggiGk38}LU` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "Child and elder abuse are mandated reports on […]; good-faith reporters are protected.",
  "oldBack": "Child and elder abuse are mandated reports on reasonable suspicion; good-faith reporters are protected.",
  "newFront": "Child abuse is a mandated report on […]; elder/dependent-adult abuse is mandated in most states (check yours); good-faith reporters are protected.",
  "newBack": "Child abuse is a mandated report on reasonable suspicion; elder/dependent-adult abuse is mandated in most states (check yours); good-faith reporters are protected.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#ethics_legal-pearl4:1@2

Source: `03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md` · page `ethics_legal.md` · old `ethics_law_confidentiality_inpatient_teaching::pearl4@ord0` · GUID `nTKHz?9-s1` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "Recall the key point:",
  "oldBack": "The commitment standard of proof is clear and convincing evidence (Addington v. Texas); a non-dangerous patient who can survive safely in the community cannot be confined (O'Connor v. Donaldson).",
  "newFront": "The constitutional minimum standard of proof for commitment is […] (Addington v. Texas; some states require more); a non-dangerous patient who can survive safely in the community cannot be confined (O'Connor v. Donaldson).",
  "newBack": "The constitutional minimum standard of proof for commitment is clear and convincing evidence (Addington v. Texas; some states require more); a non-dangerous patient who can survive safely in the community cannot be confined (O'Connor v. Donaldson).",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#ethics_legal-pearl5:1@2

Source: `03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md` · page `ethics_legal.md` · old `ethics_law_confidentiality_inpatient_teaching::pearl5@ord0` · GUID `FVX=M.q]+n` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "Recall the key point:",
  "oldBack": "Involuntary hospitalization ≠ involuntary medication; refusal stands absent an emergency or legal process.",
  "newFront": "[…]; refusal stands absent an emergency or legal process.",
  "newBack": "Involuntary hospitalization ≠ involuntary medication; refusal stands absent an emergency or legal process.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#ethics_legal-pearl6:1@2

Source: `03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md` · page `ethics_legal.md` · old `ethics_law_confidentiality_inpatient_teaching::pearl6@ord0` · GUID `Du!#H#C%uA` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "Recall the key point:",
  "oldBack": "Capacity is clinical and decision-specific; competence is a legal (court) determination.",
  "newFront": "Capacity is clinical and […]; competence is a legal (court) determination.",
  "newBack": "Capacity is clinical and decision-specific; competence is a legal (court) determination.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#ethics_legal-pearl7:1@2

Source: `03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md` · page `ethics_legal.md` · old `ethics_law_confidentiality_inpatient_teaching::pearl7@ord0` · GUID `OfaRquV?Z>` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "Recall the key point:",
  "oldBack": "Informed consent = capacity + disclosure + voluntariness; the emergency exception covers necessary urgent care.",
  "newFront": "Informed consent = […]; the emergency exception covers necessary urgent care.",
  "newBack": "Informed consent = capacity + disclosure + voluntariness; the emergency exception covers necessary urgent care.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#ethics_legal-pearl8:1@2

Source: `03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md` · page `ethics_legal.md` · old `ethics_law_confidentiality_inpatient_teaching::pearl8@ord0` · GUID `d81G*k0:)D` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "Recall the key point:",
  "oldBack": "Sexual contact with a patient is always an ethics violation.",
  "newFront": "Sexual contact with a patient is […].",
  "newBack": "Sexual contact with a patient is always an ethics violation.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_geri-summary:1@2

Source: `03_Core_Topics/Geriatric/geriatric_psychiatry_inpatient_teaching.md` · page `t_geri.md` · old `geriatric_psychiatry_inpatient_teaching::oneline@ord0` · GUID `Gth(,X2%x|` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "On the geriatric inpatient unit, your central job is to separate reversible from irreversible causes of cognitive and behavioral change, treat the treatable, and avoid iatrogenic harm from the very drugs meant to help.",
  "newFront": "On the geriatric inpatient unit, your central job is to separate […] causes of cognitive and behavioral change, treat the treatable, and avoid iatrogenic harm from the very drugs meant to help.",
  "newBack": "On the geriatric inpatient unit, your central job is to separate reversible from irreversible causes of cognitive and behavioral change, treat the treatable, and avoid iatrogenic harm from the very drugs meant to help.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_impulse-summary:1@2

Source: `03_Core_Topics/Impulse_Control/impulse_control_conduct_inpatient_teaching.md` · page `t_impulse.md` · old `impulse_control_conduct_inpatient_teaching::oneline@ord0` · GUID `i=DAW=r%!E` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "This group is defined by problems with self-control of emotions and behavior that violate others' rights or bring the person into conflict with social norms — and the exam rewards you for the developmental thread: oppositional defiant disorder → conduct disorder → antisocial personality disorder, and for separating these from mania, substance use, and a treatable mood disorder underneath the behavior.",
  "newFront": "This group is defined by problems with self-control of emotions and behavior that violate others' rights or bring the person into conflict with social norms — and the exam rewards you for the developmental thread: […], and for separating these from mania, substance use, and a treatable mood disorder underneath the behavior.",
  "newBack": "This group is defined by problems with self-control of emotions and behavior that violate others' rights or bring the person into conflict with social norms — and the exam rewards you for the developmental thread: oppositional defiant disorder → conduct disorder → antisocial personality disorder, and for separating these from mania, substance use, and a treatable mood disorder underneath the behavior.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_mood-summary:1@2

Source: `03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md` · page `t_mood.md` · old `mood_disorders_inpatient_teaching::oneline@ord0` · GUID `M!L:A>&O^~` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "Inpatient mood work is about safety, getting the diagnosis right (especially separating unipolar from bipolar), and starting an effective, measured treatment while the milieu and sleep do half the work.",
  "newFront": "Inpatient mood work is about safety, getting the diagnosis right (especially separating […]), and starting an effective, measured treatment while the milieu and sleep do half the work.",
  "newBack": "Inpatient mood work is about safety, getting the diagnosis right (especially separating unipolar from bipolar), and starting an effective, measured treatment while the milieu and sleep do half the work.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_mood-pearl3:1@2

Source: `03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md` · page `t_mood.md` · old `mood_disorders_inpatient_teaching::pearl3@ord0` · GUID `f9v7OJXFv[` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "[…] is the mood stabilizer with anti-suicidal[^cipriani-2013-lithium-suicide] and best maintenance evidence — use it, and monitor it.",
  "oldBack": "Lithium is the mood stabilizer with anti-suicidal[^cipriani-2013-lithium-suicide] and best maintenance evidence — use it, and monitor it.",
  "newFront": "[…] is the mood stabilizer with anti-suicidal and best maintenance evidence — use it, and monitor it.",
  "newBack": "Lithium is the mood stabilizer with anti-suicidal and best maintenance evidence — use it, and monitor it.",
  "reason": "Citation markers removed from tested face; revision advanced; evidence links moved to reveal. FACULTY REVIEW REQUIRED"
}
~~~

Reveal-only evidence: `cipriani-2013-lithium-suicide` → https://doi.org/10.1136/bmj.f3646.

### t_mood-pearl6:1 (withdrawn)

Source: `03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md` · page `t_mood.md` · old `mood_disorders_inpatient_teaching::pearl6@ord0` · GUID `rLF.XB0WK7` / ordinal `0` · action `withdrawn`.

~~~json
{
  "oldFront": "Lithium runs a narrow therapeutic window (~[…]): check baseline and periodic renal and thyroid function (and an ECG in older/cardiac patients), and remember NSAIDs, ACE-inhibitors/ARBs, thiazides, and dehydration push levels toward toxicity.",
  "oldBack": "Lithium runs a narrow therapeutic window (~0.6–1.2 mEq/L): check baseline and periodic renal and thyroid function (and an ECG in older/cardiac patients), and remember NSAIDs, ACE-inhibitors/ARBs, thiazides, and dehydration push levels toward toxicity.",
  "newFront": null,
  "newBack": null,
  "reason": "Published target no longer occurs in current source; withdraw instead of substituting a changed clinical claim. FACULTY REVIEW REQUIRED."
}
~~~

### CONCEPT#t_mood-pearl7:1@2

Source: `03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md` · page `t_mood.md` · old `mood_disorders_inpatient_teaching::pearl7@ord0` · GUID `p9zE,=9@?%` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "For acute mania, first-line is lithium, valproate, or a second-generation antipsychotic[^canmat-isbd-bipolar-2018] — but […] in anyone who could become pregnant (teratogenic, including neural-tube defects); confirm before it is ordered.",
  "oldBack": "For acute mania, first-line is lithium, valproate, or a second-generation antipsychotic[^canmat-isbd-bipolar-2018] — but avoid valproate in anyone who could become pregnant (teratogenic, including neural-tube defects); confirm before it is ordered.",
  "newFront": "For acute mania, first-line is lithium, valproate, or a second-generation antipsychotic — but […] in anyone who could become pregnant (teratogenic, including neural-tube defects); confirm before it is ordered.",
  "newBack": "For acute mania, first-line is lithium, valproate, or a second-generation antipsychotic — but avoid valproate in anyone who could become pregnant (teratogenic, including neural-tube defects); confirm before it is ordered.",
  "reason": "Citation markers removed from tested face; revision advanced; evidence links moved to reveal. FACULTY REVIEW REQUIRED"
}
~~~

Reveal-only evidence: `canmat-isbd-bipolar-2018` → https://pubmed.ncbi.nlm.nih.gov/29536616/.

### CONCEPT#t_neurocog-summary:1@2

Source: `03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md` · page `t_neurocog.md` · old `neurocognitive_disorders_inpatient_teaching::oneline@ord0` · GUID `M!SJ/NrAgs` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "Dementia (DSM-5-TR: major neurocognitive disorder) is an acquired, usually progressive decline in one or more cognitive domains that impairs independence — and your first job on the unit is to separate it from delirium and from depression, rule out the reversible mimics, and identify the subtype, because subtype changes what you prescribe and what you must not.",
  "newFront": "Dementia (DSM-5-TR: major neurocognitive disorder) is an acquired, usually progressive decline in one or more cognitive domains that […] — and your first job on the unit is to separate it from delirium and from depression, rule out the reversible mimics, and identify the subtype, because subtype changes what you prescribe and what you must not.",
  "newBack": "Dementia (DSM-5-TR: major neurocognitive disorder) is an acquired, usually progressive decline in one or more cognitive domains that impairs independence — and your first job on the unit is to separate it from delirium and from depression, rule out the reversible mimics, and identify the subtype, because subtype changes what you prescribe and what you must not.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_neurocog-pearl2:1@2

Source: `03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md` · page `t_neurocog.md` · old `neurocognitive_disorders_inpatient_teaching::pearl2@ord0` · GUID `nKu5Di0?t.` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "Antipsychotics in dementia carry a black-box mortality warning[^schneider-2005-antipsychotic-dementia-mortality]; nonpharmacologic first, and avoid neuroleptics in […].",
  "oldBack": "Antipsychotics in dementia carry a black-box mortality warning[^schneider-2005-antipsychotic-dementia-mortality]; nonpharmacologic first, and avoid neuroleptics in Lewy body disease.",
  "newFront": "Antipsychotics in dementia carry a black-box mortality warning; nonpharmacologic first, and avoid neuroleptics in […].",
  "newBack": "Antipsychotics in dementia carry a black-box mortality warning; nonpharmacologic first, and avoid neuroleptics in Lewy body disease.",
  "reason": "Citation markers removed from tested face; revision advanced; evidence links moved to reveal. FACULTY REVIEW REQUIRED"
}
~~~

Reveal-only evidence: `schneider-2005-antipsychotic-dementia-mortality` → https://doi.org/10.1001/jama.294.15.1934.

### CONCEPT#t_neurocog-pearl3:1@2

Source: `03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md` · page `t_neurocog.md` · old `neurocognitive_disorders_inpatient_teaching::pearl3@ord0` · GUID `be%Lasq;W,` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "[…] core four = fluctuating cognition + visual hallucinations + REM sleep behavior disorder + parkinsonism. Severe neuroleptic sensitivity is a supportive feature — it doesn't make the diagnosis, but it decides what you must not prescribe.[^mckeith-2017-dlb-consensus]",
  "oldBack": "Lewy body core four = fluctuating cognition + visual hallucinations + REM sleep behavior disorder + parkinsonism. Severe neuroleptic sensitivity is a supportive feature — it doesn't make the diagnosis, but it decides what you must not prescribe.[^mckeith-2017-dlb-consensus]",
  "newFront": "[…] core four = fluctuating cognition + visual hallucinations + REM sleep behavior disorder + parkinsonism. Severe neuroleptic sensitivity is a supportive feature — it doesn't make the diagnosis, but it decides what you must not prescribe.",
  "newBack": "Lewy body core four = fluctuating cognition + visual hallucinations + REM sleep behavior disorder + parkinsonism. Severe neuroleptic sensitivity is a supportive feature — it doesn't make the diagnosis, but it decides what you must not prescribe.",
  "reason": "Citation markers removed from tested face; revision advanced; evidence links moved to reveal. FACULTY REVIEW REQUIRED"
}
~~~

Reveal-only evidence: `mckeith-2017-dlb-consensus` → https://doi.org/10.1212/WNL.0000000000004058.

### CONCEPT#t_neurocog-pearl6:1@2

Source: `03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md` · page `t_neurocog.md` · old `neurocognitive_disorders_inpatient_teaching::pearl6@ord0` · GUID `mTc=A79}9w` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "[…] beats MMSE for mild and executive impairment.[^nasreddine-2005-moca]",
  "oldBack": "MoCA beats MMSE for mild and executive impairment.[^nasreddine-2005-moca]",
  "newFront": "[…] beats MMSE for mild and executive impairment.",
  "newBack": "MoCA beats MMSE for mild and executive impairment.",
  "reason": "Citation markers removed from tested face; revision advanced; evidence links moved to reveal. FACULTY REVIEW REQUIRED"
}
~~~

Reveal-only evidence: `nasreddine-2005-moca` → https://doi.org/10.1111/j.1532-5415.2005.53221.x.

### CONCEPT#t_neurocog-pearl7:1@2

Source: `03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md` · page `t_neurocog.md` · old `neurocognitive_disorders_inpatient_teaching::pearl7@ord0` · GUID `O&3bn5*^ZA` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "[…] for mild–moderate; add memantine for moderate–severe.",
  "oldBack": "Cholinesterase inhibitors for mild–moderate; add memantine for moderate–severe.",
  "newFront": "[…] from mild disease onward (donepezil is approved through severe AD); add memantine for moderate–severe.",
  "newBack": "Cholinesterase inhibitors from mild disease onward (donepezil is approved through severe AD); add memantine for moderate–severe.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_neurocog-pearl7:2@2

Source: `03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md` · page `t_neurocog.md` · old `neurocognitive_disorders_inpatient_teaching::pearl7@ord1` · GUID `O&3bn5*^ZA` / ordinal `1` · action `new-note-required`.

~~~json
{
  "oldFront": "Cholinesterase inhibitors for mild–moderate; add […] for moderate–severe.",
  "oldBack": "Cholinesterase inhibitors for mild–moderate; add memantine for moderate–severe.",
  "newFront": "Cholinesterase inhibitors from mild disease onward (donepezil is approved through severe AD); add […] for moderate–severe.",
  "newBack": "Cholinesterase inhibitors from mild disease onward (donepezil is approved through severe AD); add memantine for moderate–severe.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_neurodev-summary:1@2

Source: `03_Core_Topics/Neurodevelopmental/neurodevelopmental_disorders_inpatient_teaching.md` · page `t_neurodev.md` · old `neurodevelopmental_disorders_inpatient_teaching::oneline@ord0` · GUID `v:}3:.C!Vi` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "On the unit, neurodevelopmental disorders — ADHD, autism spectrum disorder (ASD), and intellectual disability (ID) — are usually the context a patient arrives with, not the reason for admission; your job is to adapt how you communicate, treat the comorbidity that actually brought them in, and never write new symptoms off as \"just their baseline.\"",
  "newFront": "On the unit, neurodevelopmental disorders — ADHD, autism spectrum disorder (ASD), and intellectual developmental disorder (intellectual disability, ID) — are usually the context a patient arrives with, not the reason for admission; your job is to […], treat the comorbidity that actually brought them in, and never write new symptoms off as \"just their baseline.\"",
  "newBack": "On the unit, neurodevelopmental disorders — ADHD, autism spectrum disorder (ASD), and intellectual developmental disorder (intellectual disability, ID) — are usually the context a patient arrives with, not the reason for admission; your job is to adapt how you communicate, treat the comorbidity that actually brought them in, and never write new symptoms off as \"just their baseline.\"",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_perinatal-summary:1@2

Source: `03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md` · page `t_perinatal.md` · old `perinatal_psychiatry_inpatient_teaching::oneline@ord0` · GUID `p9gswOQ6|l` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "Inpatient perinatal work means treating two patients at once: rapidly distinguishing a postpartum mood or anxiety disorder from postpartum psychosis (an emergency), making every medication decision an explicit risk-benefit conversation, and protecting sleep while you do it.",
  "newFront": "Inpatient perinatal work means treating two patients at once: rapidly distinguishing a postpartum mood or anxiety disorder from […] (an emergency), making every medication decision an explicit risk-benefit conversation, and protecting sleep while you do it.",
  "newBack": "Inpatient perinatal work means treating two patients at once: rapidly distinguishing a postpartum mood or anxiety disorder from postpartum psychosis (an emergency), making every medication decision an explicit risk-benefit conversation, and protecting sleep while you do it.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_perinatal-pearl1:1@2

Source: `03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md` · page `t_perinatal.md` · old `perinatal_psychiatry_inpatient_teaching::pearl1@ord0` · GUID `M9nv-sR5_T` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "[…] is an emergency and is bipolar-spectrum until proven otherwise — screen for mania and admit. Reported incidence across population studies is ~0.9–2.6 per 1,000 women[^vanderkruik-2017-postpartum-psychosis-prevalence], usually within the first 1–4 weeks. In women with a prior postpartum psychosis, ~29% have a severe episode after a subsequent delivery; for women with both bipolar disorder and a prior postpartum episode the pooled data are insufficient to quote a number at all[^wesseloo-2016-postpartum-relapse] — so future pregnancies warrant advance planning either way.",
  "oldBack": "Postpartum psychosis is an emergency and is bipolar-spectrum until proven otherwise — screen for mania and admit. Reported incidence across population studies is ~0.9–2.6 per 1,000 women[^vanderkruik-2017-postpartum-psychosis-prevalence], usually within the first 1–4 weeks. In women with a prior postpartum psychosis, ~29% have a severe episode after a subsequent delivery; for women with both bipolar disorder and a prior postpartum episode the pooled data are insufficient to quote a number at all[^wesseloo-2016-postpartum-relapse] — so future pregnancies warrant advance planning either way.",
  "newFront": "[…] is an emergency and is bipolar-spectrum until proven otherwise — screen for mania and admit. Reported incidence across population studies is ~0.9–2.6 per 1,000 women, usually within the first 1–4 weeks. In women with a prior postpartum psychosis, ~29% have a severe episode after a subsequent delivery; for women with both bipolar disorder and a prior postpartum episode the pooled data are insufficient to quote a number at all — so future pregnancies warrant advance planning either way.",
  "newBack": "Postpartum psychosis is an emergency and is bipolar-spectrum until proven otherwise — screen for mania and admit. Reported incidence across population studies is ~0.9–2.6 per 1,000 women, usually within the first 1–4 weeks. In women with a prior postpartum psychosis, ~29% have a severe episode after a subsequent delivery; for women with both bipolar disorder and a prior postpartum episode the pooled data are insufficient to quote a number at all — so future pregnancies warrant advance planning either way.",
  "reason": "Citation markers removed from tested face; revision advanced; evidence links moved to reveal. FACULTY REVIEW REQUIRED"
}
~~~

Reveal-only evidence: `vanderkruik-2017-postpartum-psychosis-prevalence` → https://doi.org/10.1186/s12888-017-1427-7, `wesseloo-2016-postpartum-relapse` → https://doi.org/10.1176/appi.ajp.2015.15010124.

### CONCEPT#t_perinatal-pearl1:2@2

Source: `03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md` · page `t_perinatal.md` · old `perinatal_psychiatry_inpatient_teaching::pearl1@ord1` · GUID `M9nv-sR5_T` / ordinal `1` · action `new-note-required`.

~~~json
{
  "oldFront": "Postpartum psychosis is an emergency and is […] until proven otherwise — screen for mania and admit. Reported incidence across population studies is ~0.9–2.6 per 1,000 women[^vanderkruik-2017-postpartum-psychosis-prevalence], usually within the first 1–4 weeks. In women with a prior postpartum psychosis, ~29% have a severe episode after a subsequent delivery; for women with both bipolar disorder and a prior postpartum episode the pooled data are insufficient to quote a number at all[^wesseloo-2016-postpartum-relapse] — so future pregnancies warrant advance planning either way.",
  "oldBack": "Postpartum psychosis is an emergency and is bipolar-spectrum until proven otherwise — screen for mania and admit. Reported incidence across population studies is ~0.9–2.6 per 1,000 women[^vanderkruik-2017-postpartum-psychosis-prevalence], usually within the first 1–4 weeks. In women with a prior postpartum psychosis, ~29% have a severe episode after a subsequent delivery; for women with both bipolar disorder and a prior postpartum episode the pooled data are insufficient to quote a number at all[^wesseloo-2016-postpartum-relapse] — so future pregnancies warrant advance planning either way.",
  "newFront": "Postpartum psychosis is an emergency and is […] until proven otherwise — screen for mania and admit. Reported incidence across population studies is ~0.9–2.6 per 1,000 women, usually within the first 1–4 weeks. In women with a prior postpartum psychosis, ~29% have a severe episode after a subsequent delivery; for women with both bipolar disorder and a prior postpartum episode the pooled data are insufficient to quote a number at all — so future pregnancies warrant advance planning either way.",
  "newBack": "Postpartum psychosis is an emergency and is bipolar-spectrum until proven otherwise — screen for mania and admit. Reported incidence across population studies is ~0.9–2.6 per 1,000 women, usually within the first 1–4 weeks. In women with a prior postpartum psychosis, ~29% have a severe episode after a subsequent delivery; for women with both bipolar disorder and a prior postpartum episode the pooled data are insufficient to quote a number at all — so future pregnancies warrant advance planning either way.",
  "reason": "Citation markers removed from tested face; revision advanced; evidence links moved to reveal. FACULTY REVIEW REQUIRED"
}
~~~

Reveal-only evidence: `vanderkruik-2017-postpartum-psychosis-prevalence` → https://doi.org/10.1186/s12888-017-1427-7, `wesseloo-2016-postpartum-relapse` → https://doi.org/10.1176/appi.ajp.2015.15010124.

### CONCEPT#t_personality-summary:1@2

Source: `03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md` · page `t_personality.md` · old `personality_disorders_inpatient_teaching::oneline@ord0` · GUID `F~E7}GLXk?` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "Personality pathology (most often borderline personality disorder, BPD) drives a large share of inpatient distress and crisis, and your job is to treat the acute problem while avoiding the iatrogenic harms of overlong, overmedicalized, or poorly coordinated care.",
  "newFront": "Personality pathology (most often borderline personality disorder, BPD) drives a large share of inpatient distress and crisis, and your job is to treat the acute problem while avoiding the iatrogenic harms of […].",
  "newBack": "Personality pathology (most often borderline personality disorder, BPD) drives a large share of inpatient distress and crisis, and your job is to treat the acute problem while avoiding the iatrogenic harms of overlong, overmedicalized, or poorly coordinated care.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_psychosis-summary:1@2

Source: `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md` · page `t_psychosis.md` · old `psychotic_disorders_inpatient_teaching::oneline@ord0` · GUID `v<,N9CiKCX` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "Psychosis is a syndrome, not a diagnosis; your job on the unit is to rule out a medical or substance cause, stabilize safety, start an antipsychotic chosen to fit the patient, and — especially in first-episode illness — build the engagement and family scaffolding that determines long-term trajectory.",
  "newFront": "Psychosis is a syndrome, not a diagnosis; your job on the unit is to rule out a […], stabilize safety, start an antipsychotic chosen to fit the patient, and — especially in first-episode illness — build the engagement and family scaffolding that determines long-term trajectory.",
  "newBack": "Psychosis is a syndrome, not a diagnosis; your job on the unit is to rule out a medical or substance cause, stabilize safety, start an antipsychotic chosen to fit the patient, and — especially in first-episode illness — build the engagement and family scaffolding that determines long-term trajectory.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_psychosis-pearl3:1@2

Source: `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md` · page `t_psychosis.md` · old `psychotic_disorders_inpatient_teaching::pearl3@ord0` · GUID `iTxRHKXKhv` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "Per CATIE, pick the antipsychotic by […]; \"newer\" is not automatically better.[^lieberman-2005-catie]",
  "oldBack": "Per CATIE, pick the antipsychotic by side-effect fit; \"newer\" is not automatically better.[^lieberman-2005-catie]",
  "newFront": "Per CATIE, pick the antipsychotic by […]; \"newer\" is not automatically better.",
  "newBack": "Per CATIE, pick the antipsychotic by side-effect fit; \"newer\" is not automatically better.",
  "reason": "Citation markers removed from tested face; revision advanced; evidence links moved to reveal. FACULTY REVIEW REQUIRED"
}
~~~

Reveal-only evidence: `lieberman-2005-catie` → https://doi.org/10.1056/nejmoa051688.

### CONCEPT#t_psychosis-pearl5:1@3

Source: `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md` · page `t_psychosis.md` · old `psychotic_disorders_inpatient_teaching::pearl5@ord0` · GUID `o{4|Y5x!i&` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "Two failed adequate antipsychotic trials means consider […], with recommended ANC monitoring per the prescribing information (the FDA eliminated the clozapine REMS in 2025; ANC monitoring continues per the prescribing information — FDA, 2025).[^clozapine-rems]",
  "oldBack": "Two failed adequate antipsychotic trials means consider clozapine, with recommended ANC monitoring per the prescribing information (the FDA eliminated the clozapine REMS in 2025; ANC monitoring continues per the prescribing information — FDA, 2025).[^clozapine-rems]",
  "newFront": "Two failed adequate antipsychotic trials means […], with recommended ANC monitoring per the prescribing information (the FDA eliminated the clozapine REMS in 2025; ANC monitoring continues per the prescribing information — FDA, 2025).",
  "newBack": "Two failed adequate antipsychotic trials means consider clozapine, with recommended ANC monitoring per the prescribing information (the FDA eliminated the clozapine REMS in 2025; ANC monitoring continues per the prescribing information — FDA, 2025).",
  "reason": "Citation markers removed from tested face; revision advanced; evidence links moved to reveal. FACULTY REVIEW REQUIRED"
}
~~~

Reveal-only evidence: `clozapine-rems` → https://www.fda.gov/drugs/drug-safety-communications/fda-removes-risk-evaluation-and-mitigation-strategy-rems-program-antipsychotic-drug-clozapine.

### CONCEPT#t_psychosis-pearl7:1@2

Source: `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md` · page `t_psychosis.md` · old `psychotic_disorders_inpatient_teaching::pearl7@ord0` · GUID `euk(=^V/|6` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "[…] (fever, lead-pipe rigidity, autonomic instability, elevated CK) is the can't-miss antipsychotic emergency — stop the antipsychotic and treat supportively; consider dantrolene/bromocriptine in severe cases.[^strawn-2007-neuroleptic-malignant-syndrome]",
  "oldBack": "Neuroleptic malignant syndrome (fever, lead-pipe rigidity, autonomic instability, elevated CK) is the can't-miss antipsychotic emergency — stop the antipsychotic and treat supportively; consider dantrolene/bromocriptine in severe cases.[^strawn-2007-neuroleptic-malignant-syndrome]",
  "newFront": "[…] (fever, lead-pipe rigidity, autonomic instability, elevated CK) is the can't-miss antipsychotic emergency — stop the antipsychotic and treat supportively; consider dantrolene/bromocriptine in severe cases.",
  "newBack": "Neuroleptic malignant syndrome (fever, lead-pipe rigidity, autonomic instability, elevated CK) is the can't-miss antipsychotic emergency — stop the antipsychotic and treat supportively; consider dantrolene/bromocriptine in severe cases.",
  "reason": "Citation markers removed from tested face; revision advanced; evidence links moved to reveal. FACULTY REVIEW REQUIRED"
}
~~~

Reveal-only evidence: `strawn-2007-neuroleptic-malignant-syndrome` → https://doi.org/10.1176/ajp.2007.164.6.870.

### CONCEPT#t_psychosis-pearl8:1@2

Source: `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md` · page `t_psychosis.md` · old `psychotic_disorders_inpatient_teaching::pearl8@ord0` · GUID `DKkUSBhBW1` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "NMS vs. serotonin syndrome: the key discriminator is the reflex exam — […] → NMS; clonus + hyperreflexia (especially ankle clonus) → SS.[^boyer-shannon-2005-serotonin-syndrome] Onset timeline and offending agent (dopamine blocker vs. serotonergic drug) also direct the diagnosis.",
  "oldBack": "NMS vs. serotonin syndrome: the key discriminator is the reflex exam — lead-pipe rigidity + hyporeflexia → NMS; clonus + hyperreflexia (especially ankle clonus) → SS.[^boyer-shannon-2005-serotonin-syndrome] Onset timeline and offending agent (dopamine blocker vs. serotonergic drug) also direct the diagnosis.",
  "newFront": "NMS vs. serotonin syndrome: the key discriminator is the reflex exam — […] → NMS; clonus + hyperreflexia (especially ankle clonus) → SS. Onset timeline and offending agent (dopamine blocker vs. serotonergic drug) also direct the diagnosis.",
  "newBack": "NMS vs. serotonin syndrome: the key discriminator is the reflex exam — lead-pipe rigidity + hyporeflexia → NMS; clonus + hyperreflexia (especially ankle clonus) → SS. Onset timeline and offending agent (dopamine blocker vs. serotonergic drug) also direct the diagnosis.",
  "reason": "Citation markers removed from tested face; revision advanced; evidence links moved to reveal. FACULTY REVIEW REQUIRED"
}
~~~

Reveal-only evidence: `boyer-shannon-2005-serotonin-syndrome` → https://doi.org/10.1056/NEJMra041867.

### CONCEPT#t_psychosis-pearl8:2@2

Source: `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md` · page `t_psychosis.md` · old `psychotic_disorders_inpatient_teaching::pearl8@ord1` · GUID `DKkUSBhBW1` / ordinal `1` · action `new-note-required`.

~~~json
{
  "oldFront": "NMS vs. serotonin syndrome: the key discriminator is the reflex exam — lead-pipe rigidity + hyporeflexia → NMS; […] (especially ankle clonus) → SS.[^boyer-shannon-2005-serotonin-syndrome] Onset timeline and offending agent (dopamine blocker vs. serotonergic drug) also direct the diagnosis.",
  "oldBack": "NMS vs. serotonin syndrome: the key discriminator is the reflex exam — lead-pipe rigidity + hyporeflexia → NMS; clonus + hyperreflexia (especially ankle clonus) → SS.[^boyer-shannon-2005-serotonin-syndrome] Onset timeline and offending agent (dopamine blocker vs. serotonergic drug) also direct the diagnosis.",
  "newFront": "NMS vs. serotonin syndrome: the key discriminator is the reflex exam — lead-pipe rigidity + hyporeflexia → NMS; […] (especially ankle clonus) → SS. Onset timeline and offending agent (dopamine blocker vs. serotonergic drug) also direct the diagnosis.",
  "newBack": "NMS vs. serotonin syndrome: the key discriminator is the reflex exam — lead-pipe rigidity + hyporeflexia → NMS; clonus + hyperreflexia (especially ankle clonus) → SS. Onset timeline and offending agent (dopamine blocker vs. serotonergic drug) also direct the diagnosis.",
  "reason": "Citation markers removed from tested face; revision advanced; evidence links moved to reveal. FACULTY REVIEW REQUIRED"
}
~~~

Reveal-only evidence: `boyer-shannon-2005-serotonin-syndrome` → https://doi.org/10.1056/NEJMra041867.

### CONCEPT#t_sud-summary:1@2

Source: `03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md` · page `t_sud.md` · old `substance_use_inpatient_teaching::oneline@ord0` · GUID `FG*y]?XDUX` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "On the inpatient unit, substance use disorders show up as intoxication, withdrawal, or a confounder of every other psychiatric presentation, and your job is to keep the patient physiologically safe while engaging them, without judgment, in treatment that continues after discharge.",
  "newFront": "On the inpatient unit, substance use disorders show up as intoxication, withdrawal, or a confounder of every other psychiatric presentation, and your job is to keep the patient […] while engaging them, without judgment, in treatment that continues after discharge.",
  "newBack": "On the inpatient unit, substance use disorders show up as intoxication, withdrawal, or a confounder of every other psychiatric presentation, and your job is to keep the patient physiologically safe while engaging them, without judgment, in treatment that continues after discharge.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_sud-pearl4:1@2

Source: `03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md` · page `t_sud.md` · old `substance_use_inpatient_teaching::pearl4@ord0` · GUID `PKwx[r75rI` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "Do not start buprenorphine until […] is on board (COWS roughly greater than or equal to 8 to 12) or you may precipitate withdrawal.",
  "oldBack": "Do not start buprenorphine until objective withdrawal is on board (COWS roughly greater than or equal to 8 to 12) or you may precipitate withdrawal.",
  "newFront": "Do not start buprenorphine until […] is on board (COWS roughly greater than or equal to 8 to 12) or you may precipitate withdrawal. With fentanyl, precipitated withdrawal is uncommon; the first treatment is more buprenorphine. Low-dose and high-dose initiation are recognised alternatives your team may use.",
  "newBack": "Do not start buprenorphine until objective withdrawal is on board (COWS roughly greater than or equal to 8 to 12) or you may precipitate withdrawal. With fentanyl, precipitated withdrawal is uncommon; the first treatment is more buprenorphine. Low-dose and high-dose initiation are recognised alternatives your team may use.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_sexual-summary:1@2

Source: `03_Core_Topics/Sexual_Gender/sexual_paraphilic_gender_inpatient_teaching.md` · page `t_sexual.md` · old `sexual_paraphilic_gender_inpatient_teaching::oneline@ord0` · GUID `v@LT223~l#` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "Three distinct topics grouped by the blueprint: sexual dysfunctions (where your first move is to check medications and medical causes), paraphilic disorders (where the diagnosis turns on distress/impairment or non-consent, not on the interest itself), and gender dysphoria (distress from gender incongruence — where being transgender is not a disorder and affirming, respectful care is the standard).",
  "newFront": "Three distinct topics grouped by the blueprint: sexual dysfunctions (where your first move is to check medications and medical causes), paraphilic disorders (where the diagnosis turns on […], not on the interest itself), and gender dysphoria (distress from gender incongruence — where being transgender is not a disorder and affirming, respectful care is the standard).",
  "newBack": "Three distinct topics grouped by the blueprint: sexual dysfunctions (where your first move is to check medications and medical causes), paraphilic disorders (where the diagnosis turns on distress/impairment or non-consent, not on the interest itself), and gender dysphoria (distress from gender incongruence — where being transgender is not a disorder and affirming, respectful care is the standard).",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### t_sexual-pearl3:1 (withdrawn)

Source: `03_Core_Topics/Sexual_Gender/sexual_paraphilic_gender_inpatient_teaching.md` · page `t_sexual.md` · old `sexual_paraphilic_gender_inpatient_teaching::pearl3@ord0` · GUID `c;+/#kk_,D` / ordinal `0` · action `withdrawn`.

~~~json
{
  "oldFront": "Non-consenting paraphilic behavior triggers […].",
  "oldBack": "Non-consenting paraphilic behavior triggers safety and reporting duties.",
  "newFront": null,
  "newBack": null,
  "reason": "Published target no longer occurs in current source; withdraw instead of substituting a changed clinical claim. FACULTY REVIEW REQUIRED."
}
~~~

### CONCEPT#t_sleep-summary:1@2

Source: `03_Core_Topics/Sleep/sleep_wake_disorders_inpatient_teaching.md` · page `t_sleep.md` · old `sleep_wake_disorders_inpatient_teaching::oneline@ord0` · GUID `t$?hnx%{Xl` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "Sleep is both a driver and a mirror of psychiatric illness — restoring the sleep-wake cycle is one of the highest-leverage things you do on the unit, and the exam rewards you for choosing CBT-I over hypnotics, screening OSA in treatment-resistant depression, and not reaching for benzodiazepines or antihistamines in older inpatients.",
  "newFront": "Sleep is both a driver and a mirror of psychiatric illness — restoring the sleep-wake cycle is one of the highest-leverage things you do on the unit, and the exam rewards you for choosing […], screening OSA in treatment-resistant depression, and not reaching for benzodiazepines or antihistamines in older inpatients.",
  "newBack": "Sleep is both a driver and a mirror of psychiatric illness — restoring the sleep-wake cycle is one of the highest-leverage things you do on the unit, and the exam rewards you for choosing CBT-I over hypnotics, screening OSA in treatment-resistant depression, and not reaching for benzodiazepines or antihistamines in older inpatients.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_somatic-summary:1@2

Source: `03_Core_Topics/Somatic/somatic_symptom_disorders_inpatient_teaching.md` · page `t_somatic.md` · old `somatic_symptom_disorders_inpatient_teaching::oneline@ord0` · GUID `uN^]?swIyZ` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "This family is about distress and disability driven by bodily symptoms and health worry — the diagnosis rests on the excessive thoughts, feelings, and behaviors around the symptoms, not on whether the symptoms are \"medically explained,\" and your job is to treat the suffering without chasing endless workups or telling the patient \"it's all in your head.\"",
  "newFront": "This family is about distress and disability driven by bodily symptoms and health worry — the diagnosis rests on the […] around the symptoms, not on whether the symptoms are \"medically explained,\" and your job is to treat the suffering without chasing endless workups or telling the patient \"it's all in your head.\"",
  "newBack": "This family is about distress and disability driven by bodily symptoms and health worry — the diagnosis rests on the excessive thoughts, feelings, and behaviors around the symptoms, not on whether the symptoms are \"medically explained,\" and your job is to treat the suffering without chasing endless workups or telling the patient \"it's all in your head.\"",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#t_somatic-pearl1:1@2

Source: `03_Core_Topics/Somatic/somatic_symptom_disorders_inpatient_teaching.md` · page `t_somatic.md` · old `somatic_symptom_disorders_inpatient_teaching::pearl1@ord0` · GUID `KHiPsh3)H&` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "SSD is defined by the […] to symptoms, not by whether they're medically explained (a key DSM-5-TR shift from \"medically unexplained\").",
  "oldBack": "SSD is defined by the excessive response to symptoms, not by whether they're medically explained (a key DSM-5-TR shift from \"medically unexplained\").",
  "newFront": "SSD is defined by the […] to symptoms, not by whether they're medically explained (a key DSM-5 shift, retained in DSM-5-TR, from \"medically unexplained\").",
  "newBack": "SSD is defined by the excessive response to symptoms, not by whether they're medically explained (a key DSM-5 shift, retained in DSM-5-TR, from \"medically unexplained\").",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#ect_neuromodulation-summary:1@2

Source: `05_Psychopharmacology/ECT_Neuromodulation/ect_neuromodulation_inpatient_teaching.md` · page `ect_neuromodulation.md` · old `ect_neuromodulation_inpatient_teaching::oneline@ord0` · GUID `t:I1};h!k[` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "Brain-based treatments are core clerkship content and a common blind spot: ECT is the most effective treatment for severe, psychotic, or catatonic depression and is safe in pregnancy and the medically fragile when indicated — and you should be able to name its indications, workup, and side effects, and place TMS, VNS, esketamine/ketamine, and bright light therapy alongside it.",
  "newFront": "Brain-based treatments are core clerkship content and a common blind spot: […] is the most effective treatment for severe, psychotic, or catatonic depression and is safe in pregnancy and the medically fragile when indicated — and you should be able to name its indications, workup, and side effects, and place TMS, VNS, esketamine/ketamine, and bright light therapy alongside it.",
  "newBack": "Brain-based treatments are core clerkship content and a common blind spot: ECT is the most effective treatment for severe, psychotic, or catatonic depression and is safe in pregnancy and the medically fragile when indicated — and you should be able to name its indications, workup, and side effects, and place TMS, VNS, esketamine/ketamine, and bright light therapy alongside it.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### ect_neuromodulation-pearl3:1 (withdrawn)

Source: `05_Psychopharmacology/ECT_Neuromodulation/ect_neuromodulation_inpatient_teaching.md` · page `ect_neuromodulation.md` · old `ect_neuromodulation_inpatient_teaching::pearl3@ord0` · GUID `s8DV}`A/NI` / ordinal `0` · action `withdrawn`.

~~~json
{
  "oldFront": "Hold […] before ECT (they blunt the seizure).",
  "oldBack": "Hold benzodiazepines/anticonvulsants before ECT (they blunt the seizure).",
  "newFront": null,
  "newBack": null,
  "reason": "Published target no longer occurs in current source; withdraw instead of substituting a changed clinical claim. FACULTY REVIEW REQUIRED."
}
~~~

### CONCEPT#collateral_workflow-summary:1@2

Source: `06_Family_and_Relational/collateral_micro_workflow.md` · page `collateral_workflow.md` · old `collateral_micro_workflow::oneline@ord0` · GUID `bc:y?BMV.u` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "Collateral is clinical data, not gossip: get permission when possible, ask only what changes diagnosis/risk/treatment/discharge, share the minimum necessary, and bring one clear update back to the team.",
  "newFront": "Collateral is clinical data, not gossip: get permission when possible, ask only what changes diagnosis/risk/treatment/discharge, […], and bring one clear update back to the team.",
  "newBack": "Collateral is clinical data, not gossip: get permission when possible, ask only what changes diagnosis/risk/treatment/discharge, share the minimum necessary, and bring one clear update back to the team.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

### CONCEPT#family_playbook-summary:1@2

Source: `06_Family_and_Relational/family_meeting_playbook_90min.md` · page `family_playbook.md` · old `family_meeting_playbook_90min::oneline@ord0` · GUID `N_$e.~eOo{` / ordinal `0` · action `new-note-required`.

~~~json
{
  "oldFront": "In one line?",
  "oldBack": "A structured 90-minute inpatient family meeting: prepare deliberately, join the family, share the picture in plain language, surface and de-shame expressed emotion, then build a concrete plan together. Use it as a scaffold, not a script — the family's needs set the pace.",
  "newFront": "A structured 90-minute inpatient family meeting: prepare deliberately, join the family, share the picture in plain language, surface and de-shame […], then build a concrete plan together. Use it as a scaffold, not a script — the family's needs set the pace.",
  "newBack": "A structured 90-minute inpatient family meeting: prepare deliberately, join the family, share the picture in plain language, surface and de-shame expressed emotion, then build a concrete plan together. Use it as a scaffold, not a script — the family's needs set the pace.",
  "reason": "Changed source wording or proposed exact recall target; FACULTY REVIEW REQUIRED"
}
~~~

## Withdrawals and exclusions

### Four published cards withdrawn because the prior target is absent from the current source

| Old rendered ID | Old GUID / ordinal | Source | Current excluded pearl excerpt |
|---|---|---|---|
| <code>anxiety_trauma_ocd_inpatient_teaching::pearl4@ord0</code> | <code>g*W7SZUGQc</code> / 0 | <code>03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md</code> | SSRIs are first-line (SNRIs also for anxiety disorders, venlafaxine for PTSD, not OCD); benzodiazepines are a liability on the unit, not a maintenance plan. |
| <code>mood_disorders_inpatient_teaching::pearl6@ord0</code> | <code>rLF.XB0WK7</code> / 0 | <code>03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md</code> | Lithium runs a narrow therapeutic window (acute ~0.8–1.2 mEq/L; maintenance ~0.6–0.8, lower in older adults)[^nolen-2019-lithium-levels]: check baseline and periodic renal, thyroid and calcium (parathyroid) function (and an ECG in older/cardiac patients), and remember NSAIDs, ACE-inhibitors/ARBs, thiazides, and dehydration push levels toward toxicity. |
| <code>sexual_paraphilic_gender_inpatient_teaching::pearl3@ord0</code> | <code>c;+/#kk_,D</code> / 0 | <code>03_Core_Topics/Sexual_Gender/sexual_paraphilic_gender_inpatient_teaching.md</code> | A child (or, in most states, an elder or dependent adult) at risk triggers protective-services reporting; other non-consenting paraphilic behavior triggers a safety assessment and, only for a credible threat to an identifiable person, your state's duty-to-protect rules. |
| <code>ect_neuromodulation_inpatient_teaching::pearl3@ord0</code> | <code>s8DV}`A/NI</code> / 0 | <code>05_Psychopharmacology/ECT_Neuromodulation/ect_neuromodulation_inpatient_teaching.md</code> | Minimise or time benzodiazepines and mood-stabilising anticonvulsants before ECT (they blunt the seizure) — but continue antiepileptics given for epilepsy. |

Each withdrawal's prior front/back and null new face are recorded above. The exclusion reason in the tracked candidate says the published target no longer occurs in the current source; it does not propose replacement wording.

### Five newly discovered Brief Psychotherapy pearls deferred from the first candidate

1. Source `02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md`; excerpt: "Match the skill to the mechanism; the modality matters less than the fit (no clear winner across schools)."
   - Candidate reason: Newly discovered heading-form pearl omitted by the legacy exporter; deferred until a source-exact target is reviewed. FACULTY REVIEW REQUIRED for this exclusion.
2. Source `02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md`; excerpt: "Behavioral activation is the highest-yield, lowest-effort inpatient move for the shut-down, depressed patient."
   - Candidate reason: Newly discovered heading-form pearl omitted by the legacy exporter; deferred until a source-exact target is reviewed. FACULTY REVIEW REQUIRED for this exclusion.
3. Source `02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md`; excerpt: "Psychoeducation is among the best-supported inpatient psychological interventions, and it's free — but the readmission NNT of 5 rests on 206 participants in what the Cochrane reviewers (Xia et al., 2011) called \"hospital-based studies of limited quality.\" Do it anyway; don't quote the number as though it were precise. (Therapy on the Unit carries the full figures and the caveat.)"
   - Candidate reason: Newly discovered heading-form pearl omitted by the legacy exporter; deferred until a source-exact target is reviewed. FACULTY REVIEW REQUIRED for this exclusion.
4. Source `02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md`; excerpt: "Chain analysis replaces a punitive response to self-harm — understand the behavior, don't just document it."
   - Candidate reason: Newly discovered heading-form pearl omitted by the legacy exporter; deferred until a source-exact target is reviewed. FACULTY REVIEW REQUIRED for this exclusion.
5. Source `02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md`; excerpt: "Safety planning with follow-up beats a \"contract for safety,\" which has no evidence and can create false reassurance."
   - Candidate reason: Newly discovered heading-form pearl omitted by the legacy exporter; deferred until a source-exact target is reviewed. FACULTY REVIEW REQUIRED for this exclusion.

### Sixteen entire sources excluded from the first candidate

| Source | Page | Title | Candidate reason |
|---|---|---|---|
| <code>02_Clinical_Skills/Case_Formulation/case_formulation_inpatient_teaching.md</code> | <code>case_formulation.md</code> | Case Formulation | No published legacy Concepts note; first release migrates the existing deck before expanding coverage. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>02_Clinical_Skills/Psychotherapy/psychotherapy_inpatient_teaching.md</code> | <code>psychotherapy.md</code> | Psychotherapies at a Glance | No published legacy Concepts note; first release migrates the existing deck before expanding coverage. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>03_Core_Topics/Medical_Workup/medical_workup_inpatient_teaching.md</code> | <code>medical_workup.md</code> | Medical Workup &amp; Mimics | No published legacy Concepts note; first release migrates the existing deck before expanding coverage. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>04_Acute_and_Safety/Agitation_and_Restraint/agitation_restraint_inpatient_teaching.md</code> | <code>agitation.md</code> | Agitation &amp; Restraint | No published legacy Concepts note; first release migrates the existing deck before expanding coverage. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>04_Acute_and_Safety/Catatonia/catatonia_inpatient_teaching.md</code> | <code>catatonia.md</code> | Catatonia | No published legacy Concepts note; first release migrates the existing deck before expanding coverage. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>04_Acute_and_Safety/Delirium/delirium_inpatient_teaching.md</code> | <code>delirium.md</code> | Delirium | No published legacy Concepts note; first release migrates the existing deck before expanding coverage. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/suicide_risk_safety_planning_inpatient_teaching.md</code> | <code>suicide.md</code> | Suicide Risk &amp; Safety Planning | No published legacy Concepts note; first release migrates the existing deck before expanding coverage. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>04_Acute_and_Safety/Toxidromes/hyperthermia_toxidromes_inpatient_teaching.md</code> | <code>toxidromes.md</code> | Hyperthermia &amp; Toxidromes | No published legacy Concepts note; first release migrates the existing deck before expanding coverage. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>04_Acute_and_Safety/Violence_Risk/violence_risk_inpatient_teaching.md</code> | <code>violence.md</code> | Violence Risk | No published legacy Concepts note; first release migrates the existing deck before expanding coverage. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>05_Psychopharmacology/Monitoring_and_Labs/medication_monitoring_inpatient_teaching.md</code> | <code>med_monitoring.md</code> | Medication Monitoring &amp; Labs | No published legacy Concepts note; first release migrates the existing deck before expanding coverage. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md</code> | <code>psychopharm_primer.md</code> | Psychopharmacology Primer | No published legacy Concepts note; first release migrates the existing deck before expanding coverage. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>09_Exam_Prep/anki_export/anki.md</code> | <code>anki.md</code> | Anki Flashcard Decks | Download instructions are operational guidance; excluded from the initial clinical Concepts deck. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>14_Tracks/Resident/adv_psychopharmacology.md</code> | <code>adv_psychopharm.md</code> | Advanced Psychopharmacology | Outside the initial shared legacy Concepts scope; audience-specific teaching requires a separately reviewed card map. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>14_Tracks/Resident/resident_curriculum.md</code> | <code>rotation.md</code> | 4-Week Rotation Plan | Outside the initial shared legacy Concepts scope; audience-specific teaching requires a separately reviewed card map. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>14_Tracks/Resident/supervision_teaching.md</code> | <code>supervision_teaching.md</code> | Supervision, EPAs &amp; Teaching | Outside the initial shared legacy Concepts scope; audience-specific teaching requires a separately reviewed card map. FACULTY REVIEW REQUIRED for this exclusion. |
| <code>14_Tracks/Resident/systems_medlegal.md</code> | <code>systems_medlegal.md</code> | Inpatient Systems &amp; Med-Legal | Outside the initial shared legacy Concepts scope; audience-specific teaching requires a separately reviewed card map. FACULTY REVIEW REQUIRED for this exclusion. |

The tracked candidate has **25 exclusions** total: these 16 whole sources, the five newly discovered Brief Psychotherapy pearls, and the four source pearls corresponding to withdrawals.

## Qbank: checked-in package snapshot

- Combined package `09_Exam_Prep/anki_export/psychiatry_clerkship_library_ALL.apkg`, SHA-256 `f6724dee6da71ee0d923e0f7774ee39cd171cb8634c2b818318e1fdb1586485f`. Its legacy Qbank model has **144 primary cards, 133 uniquely-longest keyed options, and 24 tier-two cards with empty Evidence and Link fields**.
- The next two tables were derived by parsing the pinned package’s ZIP/SQLite notes and checking every option and key using the reproduction method below. Character lengths are for displayed option text after HTML decoding and surrounding-whitespace stripping.

### Packaged primary cues (133 of 144)
Lengths are Unicode character counts of displayed option text after HTML decoding and surrounding-whitespace stripping, matching `bin/check_qbank_length_cue.py`'s `len(t.strip())` rule. A cue requires the key to be strictly longer than each distractor; ties do not count. `Now` is current `question_bank.json` status, not the packaged tag.

| Packaged note ID | Key | A | B | C | D | Margin | Now |
|---|:---:|---:|---:|---:|---:|---:|:---:|
| `qb_anx_001` | D | 69 | 73 | 86 | 109 | +23 | attested |
| `qb_anx_004` | B | 120 | 217 | 98 | 96 | +97 | attested |
| `qb_anx_005` | C | 114 | 102 | 206 | 116 | +90 | attested |
| `qb_anx_006` | D | 144 | 118 | 146 | 187 | +41 | attested |
| `qb_anx_007` | A | 206 | 159 | 134 | 127 | +47 | attested |
| `qb_anx_008` | B | 184 | 273 | 178 | 187 | +86 | attested |
| `qb_anx_009` | C | 114 | 128 | 209 | 119 | +81 | attested |
| `qb_anx_010` | D | 107 | 94 | 122 | 227 | +105 | attested |
| `qb_anx_011` | C | 119 | 132 | 228 | 149 | +79 | attested |
| `qb_anx_012` | C | 86 | 214 | 260 | 180 | +46 | attested |
| `qb_anx_016` | A | 66 | 65 | 39 | 41 | +1 | attested |
| `qb_cdev_001` | B | 85 | 299 | 103 | 139 | +160 | attested |
| `qb_cdev_002` | C | 162 | 175 | 242 | 164 | +67 | attested |
| `qb_cdev_003` | D | 98 | 82 | 182 | 286 | +104 | attested |
| `qb_cdev_004` | D | 127 | 113 | 121 | 207 | +80 | attested |
| `qb_chd_001` | A | 135 | 118 | 76 | 98 | +17 | attested |
| `qb_cog_001` | C | 63 | 42 | 82 | 63 | +19 | attested |
| `qb_cog_002` | A | 95 | 81 | 70 | 74 | +14 | draft |
| `qb_cog_003` | B | 100 | 203 | 104 | 133 | +70 | attested |
| `qb_cog_004` | D | 143 | 123 | 113 | 221 | +78 | attested |
| `qb_cog_005` | A | 196 | 126 | 107 | 107 | +70 | attested |
| `qb_cog_006` | C | 123 | 101 | 182 | 108 | +59 | attested |
| `qb_cog_007` | B | 102 | 173 | 101 | 107 | +66 | attested |
| `qb_cog_008` | D | 159 | 152 | 179 | 227 | +48 | attested |
| `qb_cog_009` | A | 137 | 131 | 124 | 89 | +6 | attested |
| `qb_cog_010` | C | 130 | 118 | 175 | 129 | +45 | attested |
| `qb_cog_011` | B | 114 | 219 | 109 | 157 | +62 | attested |
| `qb_cog_012` | D | 137 | 124 | 82 | 232 | +95 | attested |
| `qb_cog_013` | A | 200 | 137 | 149 | 118 | +51 | attested |
| `qb_cog_014` | C | 155 | 134 | 234 | 118 | +79 | draft |
| `qb_cog_015` | B | 164 | 169 | 112 | 109 | +5 | attested |
| `qb_cog_016` | D | 115 | 129 | 150 | 262 | +112 | attested |
| `qb_eth_001` | A | 127 | 117 | 106 | 77 | +10 | attested |
| `qb_eth_002` | C | 135 | 86 | 162 | 109 | +27 | attested |
| `qb_eth_003` | C | 129 | 156 | 218 | 153 | +62 | attested |
| `qb_eth_005` | D | 98 | 99 | 196 | 319 | +123 | attested |
| `qb_eth_006` | B | 134 | 226 | 108 | 159 | +67 | attested |
| `qb_eth_007` | A | 218 | 122 | 105 | 157 | +61 | draft |
| `qb_eth_008` | B | 152 | 184 | 174 | 128 | +10 | attested |
| `qb_mood_001` | B | 108 | 125 | 82 | 88 | +17 | attested |
| `qb_mood_003` | C | 127 | 125 | 220 | 133 | +87 | attested |
| `qb_mood_004` | B | 104 | 168 | 115 | 139 | +29 | attested |
| `qb_mood_005` | C | 124 | 108 | 169 | 151 | +18 | attested |
| `qb_mood_006` | D | 119 | 106 | 115 | 200 | +81 | attested |
| `qb_mood_007` | A | 189 | 112 | 107 | 127 | +62 | attested |
| `qb_mood_008` | B | 164 | 168 | 107 | 120 | +4 | attested |
| `qb_mood_009` | C | 92 | 94 | 182 | 118 | +64 | attested |
| `qb_mood_010` | D | 125 | 125 | 104 | 162 | +37 | attested |
| `qb_mood_011` | A | 166 | 99 | 149 | 90 | +17 | attested |
| `qb_mood_012` | B | 102 | 191 | 119 | 86 | +72 | attested |
| `qb_mood_013` | C | 88 | 107 | 183 | 97 | +76 | draft |
| `qb_mood_014` | D | 150 | 109 | 134 | 239 | +89 | attested |
| `qb_mood_015` | A | 232 | 124 | 105 | 96 | +108 | attested |
| `qb_mood_016` | C | 103 | 135 | 233 | 127 | +98 | attested |
| `qb_oth_001` | D | 126 | 146 | 156 | 205 | +49 | attested |
| `qb_oth_002` | B | 200 | 229 | 170 | 179 | +29 | attested |
| `qb_otherdx_001` | A | 244 | 177 | 142 | 100 | +67 | draft |
| `qb_otherdx_002` | C | 113 | 116 | 177 | 150 | +27 | attested |
| `qb_otherdx_003` | C | 97 | 111 | 215 | 101 | +104 | attested |
| `qb_otherdx_004` | D | 167 | 104 | 161 | 287 | +120 | attested |
| `qb_otherdx_005` | A | 190 | 141 | 139 | 120 | +49 | attested |
| `qb_otherdx_006` | D | 95 | 144 | 109 | 212 | +68 | attested |
| `qb_otherdx_007` | C | 121 | 103 | 263 | 112 | +142 | attested |
| `qb_otherdx_008` | D | 117 | 165 | 147 | 251 | +86 | attested |
| `qb_otherdx_009` | C | 69 | 112 | 240 | 110 | +128 | attested |
| `qb_per_001` | B | 100 | 128 | 103 | 105 | +23 | attested |
| `qb_per_002` | D | 81 | 77 | 143 | 156 | +13 | attested |
| `qb_per_003` | B | 128 | 204 | 136 | 113 | +68 | attested |
| `qb_per_004` | D | 99 | 82 | 216 | 244 | +28 | attested |
| `qb_per_005` | A | 243 | 140 | 144 | 109 | +99 | attested |
| `qb_per_006` | B | 156 | 179 | 159 | 123 | +20 | attested |
| `qb_pha_001` | D | 77 | 74 | 70 | 131 | +54 | attested |
| `qb_pha_003` | B | 141 | 210 | 111 | 136 | +69 | attested |
| `qb_pha_004` | D | 89 | 94 | 118 | 156 | +38 | attested |
| `qb_pha_005` | A | 229 | 149 | 142 | 133 | +80 | draft |
| `qb_pha_006` | C | 114 | 130 | 221 | 97 | +91 | attested |
| `qb_pha_007` | B | 100 | 216 | 116 | 127 | +89 | draft |
| `qb_pha_008` | D | 118 | 80 | 132 | 179 | +47 | attested |
| `qb_pha_009` | A | 230 | 100 | 102 | 101 | +128 | draft |
| `qb_pha_010` | C | 137 | 155 | 247 | 133 | +92 | attested |
| `qb_pha_013` | A | 169 | 103 | 131 | 116 | +38 | attested |
| `qb_pha_014` | B | 166 | 208 | 139 | 130 | +42 | draft |
| `qb_pha_015` | C | 106 | 117 | 177 | 104 | +60 | attested |
| `qb_pha_016` | D | 121 | 86 | 97 | 224 | +103 | attested |
| `qb_psy_001` | A | 150 | 105 | 103 | 124 | +26 | attested |
| `qb_psy_003` | D | 104 | 147 | 131 | 193 | +46 | attested |
| `qb_psy_004` | A | 268 | 126 | 133 | 102 | +135 | attested |
| `qb_psy_005` | B | 135 | 162 | 147 | 124 | +15 | attested |
| `qb_psy_006` | B | 140 | 219 | 161 | 147 | +58 | attested |
| `qb_psy_007` | D | 130 | 121 | 94 | 192 | +62 | attested |
| `qb_psy_008` | A | 165 | 134 | 142 | 94 | +23 | attested |
| `qb_psy_009` | B | 125 | 224 | 152 | 112 | +72 | attested |
| `qb_psy_010` | C | 170 | 132 | 241 | 162 | +71 | attested |
| `qb_psy_011` | D | 127 | 142 | 110 | 181 | +39 | attested |
| `qb_psy_012` | A | 166 | 119 | 115 | 110 | +47 | attested |
| `qb_psy_013` | B | 108 | 175 | 108 | 122 | +53 | attested |
| `qb_psy_014` | C | 113 | 126 | 186 | 137 | +49 | attested |
| `qb_rel_001` | A | 196 | 131 | 102 | 92 | +65 | attested |
| `qb_rel_002` | D | 119 | 124 | 111 | 179 | +55 | attested |
| `qb_rel_003` | A | 262 | 180 | 131 | 144 | +82 | attested |
| `qb_rel_004` | C | 124 | 129 | 314 | 128 | +185 | attested |
| `qb_rel_005` | A | 141 | 138 | 129 | 136 | +3 | attested |
| `qb_rel_006` | D | 97 | 121 | 119 | 305 | +184 | attested |
| `qb_rel_007` | C | 126 | 125 | 208 | 112 | +82 | attested |
| `qb_rel_008` | A | 170 | 112 | 95 | 135 | +35 | attested |
| `qb_rel_009` | B | 138 | 230 | 143 | 125 | +87 | attested |
| `qb_rel_010` | C | 122 | 122 | 222 | 136 | +86 | attested |
| `qb_rel_011` | D | 173 | 112 | 194 | 259 | +65 | attested |
| `qb_rel_012` | A | 233 | 138 | 167 | 143 | +66 | attested |
| `qb_rel_013` | B | 77 | 167 | 103 | 76 | +64 | attested |
| `qb_saf_001` | C | 96 | 90 | 136 | 90 | +40 | attested |
| `qb_saf_002` | A | 295 | 97 | 81 | 73 | +198 | attested |
| `qb_saf_003` | B | 132 | 172 | 106 | 108 | +40 | attested |
| `qb_saf_004` | D | 135 | 130 | 125 | 218 | +83 | attested |
| `qb_saf_005` | B | 117 | 198 | 142 | 152 | +46 | draft |
| `qb_saf_006` | C | 125 | 41 | 309 | 110 | +184 | draft |
| `qb_saf_007` | A | 196 | 131 | 97 | 149 | +47 | attested |
| `qb_saf_009` | B | 116 | 202 | 106 | 96 | +86 | attested |
| `qb_saf_010` | C | 167 | 148 | 172 | 114 | +5 | attested |
| `qb_saf_011` | A | 265 | 131 | 99 | 95 | +134 | attested |
| `qb_saf_012` | D | 146 | 113 | 104 | 238 | +92 | attested |
| `qb_sud_001` | B | 61 | 112 | 56 | 77 | +35 | attested |
| `qb_sud_003` | C | 131 | 83 | 171 | 103 | +40 | attested |
| `qb_sud_004` | A | 182 | 134 | 103 | 159 | +23 | attested |
| `qb_sud_005` | B | 148 | 163 | 125 | 101 | +15 | draft |
| `qb_sud_006` | D | 119 | 133 | 83 | 189 | +56 | attested |
| `qb_sud_007` | B | 139 | 195 | 131 | 111 | +56 | draft |
| `qb_sud_008` | C | 117 | 108 | 134 | 123 | +11 | attested |
| `qb_sud_009` | A | 151 | 116 | 117 | 102 | +34 | attested |
| `qb_sud_011` | C | 98 | 145 | 212 | 126 | +67 | attested |
| `qb_sud_012` | B | 101 | 206 | 100 | 115 | +91 | attested |
| `qb_sud_013` | A | 261 | 134 | 141 | 121 | +120 | draft |
| `qb_sud_014` | D | 135 | 136 | 141 | 274 | +133 | draft |

- Remaining 11 packaged primary IDs (not uniquely-longest): `qb_anx_002`, `qb_anx_003`, `qb_chd_002`, `qb_eth_004`, `qb_mood_002`, `qb_pha_002`, `qb_psy_002`, `qb_saf_008`, `qb_saf_016`, `qb_sud_002`, `qb_sud_010`.

## Packaged tier-two notes with empty Evidence and Link fields (24 of 24)

The package note model has nine fields: UID, Question, Options, Answer, Why, Pearl, Evidence, Link, Meta. Every tier-two note has empty fields 7 and 8 (Evidence and Link); the parent item may still have source-page tags. Four parent items are now `draft` in the current source.

| Packaged tier-two note ID | Current parent status |
|---|:---:|
| `qb_anx_008::t2` | attested |
| `qb_anx_012::t2` | attested |
| `qb_cog_006::t2` | attested |
| `qb_cog_010::t2` | attested |
| `qb_cog_014::t2` | draft |
| `qb_eth_002::t2` | attested |
| `qb_mood_002::t2` | attested |
| `qb_mood_007::t2` | attested |
| `qb_mood_012::t2` | attested |
| `qb_mood_016::t2` | attested |
| `qb_otherdx_001::t2` | draft |
| `qb_otherdx_003::t2` | attested |
| `qb_otherdx_005::t2` | attested |
| `qb_otherdx_006::t2` | attested |
| `qb_otherdx_007::t2` | attested |
| `qb_otherdx_009::t2` | attested |
| `qb_pha_001::t2` | attested |
| `qb_pha_005::t2` | draft |
| `qb_psy_007::t2` | attested |
| `qb_psy_013::t2` | attested |
| `qb_saf_012::t2` | attested |
| `qb_sud_001::t2` | attested |
| `qb_sud_011::t2` | attested |
| `qb_sud_014::t2` | draft |

## Qbank: current canonical source snapshot

- Current `question_bank.json`, SHA-256 `a2bf3676ff2d1b10c8696e69c6c7d6d5d20408e61db139747f3743ea2e3412a9`: **150 attested items, 110 uniquely-longest keyed options, 20 attested tier-two items**. It is a different snapshot from the packaged deck.
- Of the 144 packaged primary IDs, **16 are now draft** in the source. The package is missing **22 now-attested IDs**. These membership lists compare the package UID field with current `question_bank.json` IDs and statuses.
- Packaged IDs now draft: `qb_cog_002`, `qb_cog_014`, `qb_eth_007`, `qb_mood_013`, `qb_otherdx_001`, `qb_pha_002`, `qb_pha_005`, `qb_pha_007`, `qb_pha_009`, `qb_pha_014`, `qb_saf_005`, `qb_saf_006`, `qb_sud_005`, `qb_sud_007`, `qb_sud_013`, `qb_sud_014`.
- Current-source attested IDs absent from package: `qb_anx_013`, `qb_cdev_006`, `qb_cdev_007`, `qb_cdev_008`, `qb_cdev_009`, `qb_cdev_010`, `qb_cdev_011`, `qb_cdev_012`, `qb_cdev_013`, `qb_cdev_014`, `qb_eth_009`, `qb_eth_011`, `qb_eth_015`, `qb_otherdx_011`, `qb_otherdx_014`, `qb_per_007`, `qb_per_008`, `qb_per_015`, `qb_per_016`, `qb_psy_016`, `qb_rel_014`, `qb_saf_015`.

### Current-source primary cues (110 of 150 attested)

This table measures `question_bank.json` directly using the same strict longest-option rule. It is not a table of package cards.

| Current item ID | Key | A | B | C | D | Margin |
|---|:---:|---:|---:|---:|---:|---:|
| `qb_anx_001` | D | 69 | 73 | 86 | 109 | +23 |
| `qb_anx_004` | B | 120 | 217 | 98 | 96 | +97 |
| `qb_anx_005` | C | 114 | 102 | 206 | 116 | +90 |
| `qb_anx_006` | D | 144 | 118 | 146 | 187 | +41 |
| `qb_anx_007` | A | 206 | 159 | 134 | 127 | +47 |
| `qb_anx_008` | B | 184 | 273 | 178 | 187 | +86 |
| `qb_anx_009` | C | 114 | 128 | 209 | 119 | +81 |
| `qb_anx_010` | D | 107 | 94 | 122 | 227 | +105 |
| `qb_anx_011` | C | 119 | 132 | 228 | 149 | +79 |
| `qb_anx_012` | C | 86 | 214 | 260 | 180 | +46 |
| `qb_anx_016` | A | 66 | 65 | 39 | 41 | +1 |
| `qb_cdev_001` | B | 85 | 299 | 103 | 139 | +160 |
| `qb_cdev_003` | D | 98 | 82 | 182 | 286 | +104 |
| `qb_cdev_004` | D | 127 | 113 | 121 | 207 | +80 |
| `qb_chd_001` | A | 135 | 118 | 76 | 98 | +17 |
| `qb_cog_001` | C | 63 | 42 | 82 | 63 | +19 |
| `qb_cog_003` | B | 100 | 203 | 104 | 133 | +70 |
| `qb_cog_004` | D | 143 | 123 | 113 | 221 | +78 |
| `qb_cog_005` | A | 196 | 126 | 107 | 107 | +70 |
| `qb_cog_006` | C | 123 | 101 | 182 | 108 | +59 |
| `qb_cog_007` | B | 102 | 173 | 101 | 107 | +66 |
| `qb_cog_008` | D | 159 | 152 | 179 | 227 | +48 |
| `qb_cog_009` | A | 137 | 131 | 124 | 89 | +6 |
| `qb_cog_010` | C | 130 | 118 | 175 | 129 | +45 |
| `qb_cog_011` | B | 114 | 219 | 109 | 157 | +62 |
| `qb_cog_012` | D | 137 | 124 | 82 | 232 | +95 |
| `qb_cog_013` | A | 200 | 137 | 149 | 118 | +51 |
| `qb_cog_015` | B | 164 | 169 | 112 | 109 | +5 |
| `qb_cog_016` | D | 115 | 129 | 150 | 262 | +112 |
| `qb_eth_001` | A | 127 | 117 | 106 | 77 | +10 |
| `qb_eth_002` | C | 135 | 86 | 162 | 109 | +27 |
| `qb_eth_003` | C | 129 | 156 | 218 | 153 | +62 |
| `qb_eth_005` | D | 98 | 99 | 196 | 319 | +123 |
| `qb_eth_006` | B | 134 | 226 | 108 | 159 | +67 |
| `qb_eth_008` | B | 152 | 184 | 174 | 128 | +10 |
| `qb_mood_001` | B | 108 | 125 | 82 | 88 | +17 |
| `qb_mood_003` | C | 127 | 125 | 220 | 133 | +87 |
| `qb_mood_004` | B | 104 | 168 | 115 | 139 | +29 |
| `qb_mood_005` | C | 124 | 108 | 169 | 151 | +18 |
| `qb_mood_006` | D | 119 | 106 | 115 | 200 | +81 |
| `qb_mood_007` | A | 189 | 112 | 107 | 127 | +62 |
| `qb_mood_008` | B | 164 | 168 | 107 | 120 | +4 |
| `qb_mood_009` | C | 92 | 94 | 182 | 118 | +64 |
| `qb_mood_010` | D | 125 | 125 | 104 | 162 | +37 |
| `qb_mood_011` | A | 166 | 99 | 149 | 90 | +17 |
| `qb_mood_012` | B | 102 | 191 | 119 | 86 | +72 |
| `qb_mood_014` | D | 150 | 109 | 134 | 239 | +89 |
| `qb_mood_015` | A | 232 | 124 | 105 | 96 | +108 |
| `qb_mood_016` | C | 103 | 135 | 233 | 127 | +98 |
| `qb_oth_002` | B | 200 | 229 | 170 | 179 | +29 |
| `qb_otherdx_002` | C | 113 | 116 | 177 | 150 | +27 |
| `qb_otherdx_003` | C | 97 | 111 | 215 | 101 | +104 |
| `qb_otherdx_004` | D | 167 | 104 | 161 | 287 | +120 |
| `qb_otherdx_005` | A | 190 | 141 | 139 | 120 | +49 |
| `qb_otherdx_006` | D | 95 | 144 | 109 | 212 | +68 |
| `qb_otherdx_007` | C | 121 | 103 | 263 | 112 | +142 |
| `qb_otherdx_009` | C | 69 | 112 | 240 | 110 | +128 |
| `qb_per_001` | B | 100 | 128 | 103 | 105 | +23 |
| `qb_per_003` | B | 128 | 204 | 136 | 113 | +68 |
| `qb_per_004` | D | 99 | 82 | 216 | 244 | +28 |
| `qb_per_006` | B | 156 | 179 | 159 | 123 | +20 |
| `qb_pha_001` | D | 77 | 74 | 70 | 131 | +54 |
| `qb_pha_003` | B | 141 | 210 | 111 | 136 | +69 |
| `qb_pha_004` | D | 89 | 94 | 118 | 156 | +38 |
| `qb_pha_008` | D | 118 | 80 | 132 | 179 | +47 |
| `qb_pha_010` | C | 137 | 155 | 247 | 133 | +92 |
| `qb_pha_015` | C | 106 | 117 | 177 | 104 | +60 |
| `qb_pha_016` | D | 121 | 86 | 97 | 224 | +103 |
| `qb_psy_001` | A | 150 | 105 | 103 | 124 | +26 |
| `qb_psy_003` | D | 104 | 147 | 131 | 193 | +46 |
| `qb_psy_004` | A | 268 | 126 | 133 | 102 | +135 |
| `qb_psy_005` | B | 135 | 162 | 147 | 124 | +15 |
| `qb_psy_006` | B | 140 | 219 | 161 | 147 | +58 |
| `qb_psy_007` | D | 130 | 121 | 94 | 192 | +62 |
| `qb_psy_008` | A | 165 | 134 | 142 | 94 | +23 |
| `qb_psy_009` | B | 125 | 224 | 152 | 112 | +72 |
| `qb_psy_010` | C | 170 | 132 | 241 | 162 | +71 |
| `qb_psy_011` | D | 127 | 142 | 110 | 181 | +39 |
| `qb_psy_012` | A | 166 | 119 | 115 | 110 | +47 |
| `qb_psy_013` | B | 108 | 175 | 108 | 122 | +53 |
| `qb_psy_014` | C | 113 | 126 | 186 | 137 | +49 |
| `qb_rel_001` | A | 196 | 131 | 102 | 92 | +65 |
| `qb_rel_002` | D | 119 | 124 | 111 | 179 | +55 |
| `qb_rel_003` | A | 262 | 180 | 131 | 144 | +82 |
| `qb_rel_004` | C | 124 | 129 | 314 | 128 | +185 |
| `qb_rel_005` | A | 141 | 138 | 129 | 136 | +3 |
| `qb_rel_006` | D | 97 | 121 | 119 | 305 | +184 |
| `qb_rel_007` | C | 126 | 125 | 208 | 112 | +82 |
| `qb_rel_008` | A | 170 | 112 | 95 | 135 | +35 |
| `qb_rel_009` | B | 138 | 230 | 143 | 125 | +87 |
| `qb_rel_010` | C | 122 | 122 | 222 | 136 | +86 |
| `qb_rel_011` | D | 173 | 112 | 194 | 259 | +65 |
| `qb_rel_012` | A | 233 | 138 | 167 | 143 | +66 |
| `qb_rel_013` | B | 77 | 167 | 103 | 76 | +64 |
| `qb_saf_001` | C | 96 | 90 | 136 | 90 | +40 |
| `qb_saf_002` | A | 295 | 97 | 81 | 73 | +198 |
| `qb_saf_003` | B | 132 | 172 | 106 | 108 | +40 |
| `qb_saf_004` | D | 135 | 130 | 125 | 218 | +83 |
| `qb_saf_007` | A | 196 | 131 | 97 | 149 | +47 |
| `qb_saf_009` | B | 116 | 202 | 106 | 96 | +86 |
| `qb_saf_011` | A | 265 | 131 | 99 | 95 | +134 |
| `qb_saf_012` | D | 146 | 113 | 104 | 238 | +92 |
| `qb_sud_001` | B | 61 | 112 | 56 | 77 | +35 |
| `qb_sud_003` | C | 131 | 83 | 171 | 103 | +40 |
| `qb_sud_004` | A | 182 | 134 | 103 | 159 | +23 |
| `qb_sud_006` | D | 119 | 133 | 83 | 189 | +56 |
| `qb_sud_008` | C | 117 | 108 | 134 | 123 | +11 |
| `qb_sud_009` | A | 151 | 116 | 117 | 102 | +34 |
| `qb_sud_011` | C | 98 | 145 | 212 | 126 | +67 |
| `qb_sud_012` | B | 101 | 206 | 100 | 115 | +91 |

- Current attested tier-two IDs (20): `qb_anx_008::t2`, `qb_anx_012::t2`, `qb_cog_006::t2`, `qb_cog_010::t2`, `qb_eth_002::t2`, `qb_mood_002::t2`, `qb_mood_007::t2`, `qb_mood_012::t2`, `qb_mood_016::t2`, `qb_otherdx_003::t2`, `qb_otherdx_005::t2`, `qb_otherdx_006::t2`, `qb_otherdx_007::t2`, `qb_otherdx_009::t2`, `qb_pha_001::t2`, `qb_psy_007::t2`, `qb_psy_013::t2`, `qb_saf_012::t2`, `qb_sud_001::t2`, `qb_sud_011::t2`.

## Reproduction, uncertainty, and missing data

- Concept inventory: `python3 13_Faculty_Resources/_automation/site_build/concept_cards.py --site ms3`; the current local candidate projects 154 cards for each site. This is a local projection, not a production package receipt.
- Qbank source measure: `python3 bin/check_qbank_length_cue.py --detail`; it reports 110/150 attested and 114/189 live at this snapshot. Package measure uses the pinned package SHA above and the ZIP/SQLite procedure below.
- Qbank package reproduction: unzip `collection.anki2`, open it with SQLite, and select `notes` with model ID `1607392901`. Split `flds` on `\x1f` into UID, Question, Options, Answer, Why, Pearl, Evidence, Link, Meta. Primary UIDs have no `::t2` suffix. Parse the four `<li>` option texts in Question and the single `<li class="answer">` in Answer to identify the key. Decode HTML entities, remove markup and trim surrounding whitespace, then count Unicode characters with Python `len`. Count a cue only when the keyed length is strictly greater than all three distractors. Require exactly four options and one key for every primary (144/144 historically); missing/ambiguous parsing must fail rather than shrink the denominator. For tier two inspect the Evidence and Link fields (zero-based indices 6 and 7), accounting for all 24 historical or 20 staged UIDs. Compare primary UID sets with current source IDs filtered by `status == "attested"` to reproduce membership differences. `check_anki_parity.py` independently verifies the staged fields against the current exporter.
- Package identities were verified by reading `collection.anki2` in the Concepts APKG and comparing all `(notes.guid, cards.ord)` pairs with the crosswalk. New proposed IDs and faces were derived from candidate targets and compared with the crosswalk. Source/page mappings were checked against `shipped_pages.json`.
- The initial inventory predated package generation. The staged receipt below now supplies assigned GUIDs and semantic comparisons. Browser checks and full gate outcomes are recorded in the Task 6 verification section; none establish clinical correctness or source-citation sufficiency.


## Staged Anki package receipt — 2026-09-27

Historical Task 3 support inspection of the staged APKG SQLite collections and checked-in Concepts APKG. That read-only inspection changed no files. Task 6 has since regenerated outputs and added this tracked audit; its fresh receipt appears below. These are technical identity/content checks, not faculty approval.

## Package inventory

| Site | Package | SHA-256 | Notes | Rendered cards |
|---|---|---|---:|---:|
| ms3 | `psychiatry_clerkship_concepts.apkg` | `24e7b70afb15daf353447e1d054da500b3d8199ad11ee5202a64d92af7e54576` | 138 | 154 |
| ms3 | `psychiatry_clerkship_library.apkg` | `8848860cd0c6e6a00aaa6ab33ddeea09a3bd2dc59fcb2cd2861ebf3d4ca99340` | 170 | 170 |
| ms3 | `psychiatry_clerkship_library_ALL.apkg` | `8211b7336b30227c764ce87542c381535b05fc9c37cfc9c792f96c4e640a8c73` | 308 | 324 |
| res | `psychiatry_clerkship_concepts.apkg` | `4a957eea2696a853ff759e09817fe4014b7ff2318a4d96fe92de49cc2699d4ea` | 138 | 154 |
| res | `psychiatry_clerkship_library.apkg` | `2fd6d386bd8462a5c6d4817cd5a30623cc8de8b6df5b0d9e7ae2c1b9fc6d4a7e` | 170 | 170 |
| res | `psychiatry_clerkship_library_ALL.apkg` | `ce829aba2936fc737ce5172fb73994debd522f53ab4b5c780dc67b61b672342f` | 308 | 324 |

Historical Concepts: SHA-256 `c8f919209ec8cbaa2b6875e90906f53594abc4ff39be8a0d80eb280045a0c85c` (matches the crosswalk's `packageSha256`), 142 notes and 158 rendered cards.

## Historical Task 3 crosswalk accounting

| Site | Preserved old GUID and ordinal | Changed face with new GUID | Withdrawn old card absent | Current Concepts |
|---|---:|---:|---:|---:|
| ms3 | 118 | 36 | 4 | 138 notes / 154 cards |
| res | 118 | 36 | 4 | 138 notes / 154 cards |

Every one of the 158 historical `(GUID, cards.ord)` pairs was found. All 154 released editorial IDs map to exactly the 154 staged rendered cards; no extra Concepts card appears. The four withdrawn IDs are absent. Both sites have identical feed card records and identical Concepts note/card semantics, although APKG byte hashes differ. Each combined package contains the same Concepts notes and `(GUID, ordinal)` cards as its site’s standalone Concepts package.

## Final candidate GUID assignments (47)

Deterministic exporter assignments from the final catalog/crosswalk; the final build parity checks compare these with the staged SQLite cards on both sites.

| Editorial ID | Note ID | Old GUID / ord | New GUID / ord |
|---|---|---|---|
| <code>brief_psychotherapy-summary:1</code> | <code>brief_psychotherapy-summary</code> | <code>Ns[e&lt;#Yc7]</code> / 0 | <code>oU3P7k:U61</code> / 0 |
| <code>t_adjustment-summary:1</code> | <code>t_adjustment-summary</code> | <code>f%/3YNlKJ?</code> / 0 | <code>sz.rg_&amp;%Xl</code> / 0 |
| <code>t_anxiety-summary:1</code> | <code>t_anxiety-summary</code> | <code>zUJY)F){4&lt;</code> / 0 | <code>z;6Mc3T_Ly</code> / 0 |
| <code>cultural_psychiatry-summary:1</code> | <code>cultural_psychiatry-summary</code> | <code>kQ2u}SV&gt;UN</code> / 0 | <code>J;yLOE/WZ^</code> / 0 |
| <code>cultural_psychiatry-pearl5:1</code> | <code>cultural_psychiatry-pearl5</code> | <code>J#~_WC[*wd</code> / 0 | <code>J)dOgzP~Q5</code> / 0 |
| <code>cultural_psychiatry-pearl5:2</code> | <code>cultural_psychiatry-pearl5</code> | <code>J#~_WC[*wd</code> / 1 | <code>J)dOgzP~Q5</code> / 1 |
| <code>t_dissociative-summary:1</code> | <code>t_dissociative-summary</code> | <code>xWODOF#&gt;o)</code> / 0 | <code>x4&lt;r[bH@d^</code> / 0 |
| <code>t_eating-pearl1:1</code> | <code>t_eating-pearl1</code> | <code>rp_Gak/)!?</code> / 0 | <code>xp.8z!I9%p</code> / 0 |
| <code>ethics_legal-summary:1</code> | <code>ethics_legal-summary</code> | <code>F@O%&#124;irbE</code> / 0 | <code>uX{WAtSP~,</code> / 0 |
| <code>ethics_legal-pearl1:1</code> | <code>ethics_legal-pearl1</code> | <code>GC$HiX]ZQk</code> / 0 | <code>N08Hjj(jOS</code> / 0 |
| <code>ethics_legal-pearl2:1</code> | <code>ethics_legal-pearl2</code> | <code>ggiGk38}LU</code> / 0 | <code>nWzen?WYsF</code> / 0 |
| <code>ethics_legal-pearl4:1</code> | <code>ethics_legal-pearl4</code> | <code>nTKHz?9-s1</code> / 0 | <code>yzNkwcgg2Q</code> / 0 |
| <code>ethics_legal-pearl5:1</code> | <code>ethics_legal-pearl5</code> | <code>FVX=M.q]+n</code> / 0 | <code>PoK9h4pk.y</code> / 0 |
| <code>ethics_legal-pearl6:1</code> | <code>ethics_legal-pearl6</code> | <code>Du!#H#C%uA</code> / 0 | <code>K-^nt]&lt;sq&#124;</code> / 0 |
| <code>ethics_legal-pearl7:1</code> | <code>ethics_legal-pearl7</code> | <code>OfaRquV?Z&gt;</code> / 0 | <code>rnClV~]/`!</code> / 0 |
| <code>ethics_legal-pearl8:1</code> | <code>ethics_legal-pearl8</code> | <code>d81G*k0:)D</code> / 0 | <code>nJNK2WuCob</code> / 0 |
| <code>t_geri-summary:1</code> | <code>t_geri-summary</code> | <code>Gth(,X2%x&#124;</code> / 0 | <code>jBH}g&gt;lz{2</code> / 0 |
| <code>t_impulse-summary:1</code> | <code>t_impulse-summary</code> | <code>i=DAW=r%!E</code> / 0 | <code>q&amp;N9d/:P/K</code> / 0 |
| <code>t_mood-summary:1</code> | <code>t_mood-summary</code> | <code>M!L:A&gt;&amp;O^~</code> / 0 | <code>lp?iY~YiGg</code> / 0 |
| <code>t_mood-pearl3:1</code> | <code>t_mood-pearl3</code> | <code>f9v7OJXFv[</code> / 0 | <code>J#*U%Fi0Or</code> / 0 |
| <code>t_mood-pearl7:1</code> | <code>t_mood-pearl7</code> | <code>p9zE,=9@?%</code> / 0 | <code>JNs%{Q}t8h</code> / 0 |
| <code>t_neurocog-summary:1</code> | <code>t_neurocog-summary</code> | <code>M!SJ/NrAgs</code> / 0 | <code>gz9~QZt,Eg</code> / 0 |
| <code>t_neurocog-pearl2:1</code> | <code>t_neurocog-pearl2</code> | <code>nKu5Di0?t.</code> / 0 | <code>dHS(&amp;JdLx1</code> / 0 |
| <code>t_neurocog-pearl3:1</code> | <code>t_neurocog-pearl3</code> | <code>be%Lasq;W,</code> / 0 | <code>qF`=+!sJ93</code> / 0 |
| <code>t_neurocog-pearl6:1</code> | <code>t_neurocog-pearl6</code> | <code>mTc=A79}9w</code> / 0 | <code>ug^hKc`%),</code> / 0 |
| <code>t_neurocog-pearl7:1</code> | <code>t_neurocog-pearl7</code> | <code>O&amp;3bn5*^ZA</code> / 0 | <code>cZi+TAE+=I</code> / 0 |
| <code>t_neurocog-pearl7:2</code> | <code>t_neurocog-pearl7</code> | <code>O&amp;3bn5*^ZA</code> / 1 | <code>cZi+TAE+=I</code> / 1 |
| <code>t_neurodev-summary:1</code> | <code>t_neurodev-summary</code> | <code>v:}3:.C!Vi</code> / 0 | <code>k4!l&amp;`A3&amp;?</code> / 0 |
| <code>t_perinatal-summary:1</code> | <code>t_perinatal-summary</code> | <code>p9gswOQ6&#124;l</code> / 0 | <code>L/?=pgw}+4</code> / 0 |
| <code>t_perinatal-pearl1:1</code> | <code>t_perinatal-pearl1</code> | <code>M9nv-sR5_T</code> / 0 | <code>ebd-fu&gt;U*f</code> / 0 |
| <code>t_perinatal-pearl1:2</code> | <code>t_perinatal-pearl1</code> | <code>M9nv-sR5_T</code> / 1 | <code>ebd-fu&gt;U*f</code> / 1 |
| <code>t_personality-summary:1</code> | <code>t_personality-summary</code> | <code>F~E7}GLXk?</code> / 0 | <code>pc0o^I*$VG</code> / 0 |
| <code>t_psychosis-summary:1</code> | <code>t_psychosis-summary</code> | <code>v&lt;,N9CiKCX</code> / 0 | <code>k6t(kF208g</code> / 0 |
| <code>t_psychosis-pearl3:1</code> | <code>t_psychosis-pearl3</code> | <code>iTxRHKXKhv</code> / 0 | <code>KoZZ[a5lOC</code> / 0 |
| <code>t_psychosis-pearl5:1</code> | <code>t_psychosis-pearl5</code> | <code>o{4&#124;Y5x!i&amp;</code> / 0 | <code>vjaP&gt;3^CG*</code> / 0 |
| <code>t_psychosis-pearl7:1</code> | <code>t_psychosis-pearl7</code> | <code>euk(=^V/&#124;6</code> / 0 | <code>o8vXq6HB,b</code> / 0 |
| <code>t_psychosis-pearl8:1</code> | <code>t_psychosis-pearl8</code> | <code>DKkUSBhBW1</code> / 0 | <code>AnLlLf0kCz</code> / 0 |
| <code>t_psychosis-pearl8:2</code> | <code>t_psychosis-pearl8</code> | <code>DKkUSBhBW1</code> / 1 | <code>AnLlLf0kCz</code> / 1 |
| <code>t_sud-summary:1</code> | <code>t_sud-summary</code> | <code>FG*y]?XDUX</code> / 0 | <code>Q^xRhsClah</code> / 0 |
| <code>t_sud-pearl4:1</code> | <code>t_sud-pearl4</code> | <code>PKwx[r75rI</code> / 0 | <code>H~$5+Y#g-v</code> / 0 |
| <code>t_sexual-summary:1</code> | <code>t_sexual-summary</code> | <code>v@LT223~l#</code> / 0 | <code>POCd7=@9Lu</code> / 0 |
| <code>t_sleep-summary:1</code> | <code>t_sleep-summary</code> | <code>t$?hnx%{Xl</code> / 0 | <code>y*hX+mQ2Jj</code> / 0 |
| <code>t_somatic-summary:1</code> | <code>t_somatic-summary</code> | <code>uN^]?swIyZ</code> / 0 | <code>jOSm#kQA4l</code> / 0 |
| <code>t_somatic-pearl1:1</code> | <code>t_somatic-pearl1</code> | <code>KHiPsh3)H&amp;</code> / 0 | <code>mZVS)]T!dw</code> / 0 |
| <code>ect_neuromodulation-summary:1</code> | <code>ect_neuromodulation-summary</code> | <code>t:I1};h!k[</code> / 0 | <code>iT:Cll/{nz</code> / 0 |
| <code>collateral_workflow-summary:1</code> | <code>collateral_workflow-summary</code> | <code>bc:y?BMV.u</code> / 0 | <code>dA`z4YTW[w</code> / 0 |
| <code>family_playbook-summary:1</code> | <code>family_playbook-summary</code> | <code>N_$e.~eOo{</code> / 0 | <code>mM/]AUZ9,5</code> / 0 |

Grouped sibling GUID changes: `cultural_psychiatry-pearl5`, `t_neurocog-pearl7`, `t_perinatal-pearl1`, and `t_psychosis-pearl8`. Each pair retains ordinals 0/1 and shares its new GUID. In total, 14 current notes have multiple clozes.

## Historical Task 3 scope and limit

The direct SQLite comparison above covers crosswalk identity, withdrawal, card membership, source feed membership, site-to-site semantic equality, and the combined Concepts subdeck. It does not establish faculty review of changed faces. An attempted run of `check_anki_parity.py` for each site exited before inspection because the system `python3` lacked `genanki` (`ModuleNotFoundError`). That initial support pass did not confirm the CLI’s current-Qbank rendering check; Task 6 passed it for both sites with the pinned dependency environment (see verification below). The standalone Qbank and combined package counts/SHA-256 above were measured directly.

Historical Task 3 summary: both sites carried 154 Concepts cards, with 118 preserved, 36 edited, and four withdrawn identities. The final citation-cleanup counts supersede that identity accounting: 107 preserved, 47 changed, four withdrawn.

Task 6 follow-up completed: both per-site parity CLI checks passed with `genanki==0.13.1`; retained logs accompany `.superpowers/sdd/2026-09-26-native-flashcards/task-6-report.md`; final-wave evidence is recorded in `.superpowers/sdd/2026-09-26-native-flashcards/final-fix-report.md`. The exact rebuild/parity commands and SQLite reproduction below remain usable independently of these local reports.

Potential later idea: publish a faculty-facing identity diff that groups sibling clozes and links each changed GUID to its exact source sentence.


## Qbank Anki back-template preview — proposed layout only

This is a **nonclinical layout proposal**, not implemented code or a rewrite of any stem, option, keyed answer, trap feedback, rationale, pearl, evidence, or source reference. It addresses the duplicate option list identified in [design §7](../superpowers/specs/2026-09-26-native-flashcards-design.md) without changing what an answer explains.

## Current rendering

In `13_Faculty_Resources/_automation/site_build/export_anki.py:92-101`, the card template places `{{Question}}{{Options}}` on both sides, then places `{{Answer}}` after the back's divider:

```python
"qfmt": '<div class="stem">{{Question}}</div>{{Options}}',
"afmt": (
    '<div class="stem">{{Question}}</div>{{Options}}'
    '<hr id="answer">'
    '{{Answer}}'
    '{{#Why}}<div class="why">{{Why}}</div>{{/Why}}'
    '{{#Pearl}}<div class="pearl">💡 {{Pearl}}</div>{{/Pearl}}'
    '{{#Evidence}}<div class="evidence">📄 {{Evidence}}</div>{{/Evidence}}'
    '{{#Link}}<div class="link">🔗 {{Link}}</div>{{/Link}}'
    '{{#Meta}}<div>{{Meta}}</div>{{/Meta}}'
),
```

The builder then folds the **unmarked** A–D options into `Question`, empties `Options`, and puts the **marked** A–D options plus “Best answer” into `Answer` (`export_anki.py:194-221`). Thus the current back faithfully renders:

```text
Question stem
A–D options, unmarked
──────────────────
A–D options again, with ✓ on the key and each distractor's Trap feedback
Best answer
Why · Pearl · Evidence · Link · Meta, when populated
```

`render_options()` constructs the marked key and named distractor feedback at `export_anki.py:113-141`. The tier-two builder also folds its unmarked options into `Question` and marked options into `Answer` (`export_anki.py:224-244`).

## Proposed back, with the same information shown once

```text
Question stem
──────────────────
A–D options once, with ✓ on the key and each distractor's Trap feedback
Best answer
Why · Pearl · Evidence · Link · Meta, when populated
```

To achieve this, keep the front template's `{{Question}}{{Options}}`, but populate `Question` with the stem **only**, `Options` with the unmarked list **only**, and `Answer` with the marked list plus Best answer. Apply the same field split to tier two. On the back template, omit only `{{Options}}` before the divider:

```python
"afmt": (
    '<div class="stem">{{Question}}</div>'
    '<hr id="answer">'
    '{{Answer}}'
    '{{#Why}}<div class="why">{{Why}}</div>{{/Why}}'
    '{{#Pearl}}<div class="pearl">💡 {{Pearl}}</div>{{/Pearl}}'
    '{{#Evidence}}<div class="evidence">📄 {{Evidence}}</div>{{/Evidence}}'
    '{{#Link}}<div class="link">🔗 {{Link}}</div>{{/Link}}'
    '{{#Meta}}<div>{{Meta}}</div>{{/Meta}}'
),
```

Removing `{{Options}}` from `afmt` alone is insufficient: the current `Question` field already contains the unmarked options. The field split is what removes the duplicate while retaining stem context, the keyed option, per-option feedback, rationale, pearl, and the optional evidence/source fields. Before adopting the proposal, compare the old and new rendered front/back and Anki note identities, including tier-two notes. No exporter or package was changed for this preview.


## Review decisions still required

Faculty must review the 47 changed faces, the neutral heading on all 154 Anki fronts, four withdrawals, 16 whole-source exclusions and five Brief Psychotherapy pearl exclusions. The five repaired ethics fronts and 21 summaries are included in the detailed changes above. The historical counts (133/144 primary cues and 24 tier-two omissions) and membership differences do not describe the staged new packages. Current staged risks persist: 110/150 primary items have the strict longest-option cue and all 20 current tier-two notes have empty Evidence/Link fields. Option length is a cue risk, not a medical-error verdict. The back-template proposal is not implemented. Committed APKG baselines remain unchanged.

Concrete next step: review these exact faces alongside both local site previews before approving replacement downloads. A later improvement could provide a faculty review screen pairing each card face with its source revision and Anki identity.


## Staged current Qbank field audit

Direct inspection of the generated resident Qbank package finds 20 notes with empty Evidence or Link fields: `qb_sud_001::t2`, `qb_mood_002::t2`, `qb_pha_001::t2`, `qb_eth_002::t2`, `qb_cog_006::t2`, `qb_cog_010::t2`, `qb_saf_012::t2`, `qb_sud_011::t2`, `qb_mood_007::t2`, `qb_mood_012::t2`, `qb_mood_016::t2`, `qb_psy_007::t2`, `qb_psy_013::t2`, `qb_anx_008::t2`, `qb_anx_012::t2`, `qb_otherdx_003::t2`, `qb_otherdx_005::t2`, `qb_otherdx_006::t2`, `qb_otherdx_007::t2`, `qb_otherdx_009::t2`. These are the 20 current attested tier-two cards. The current primary cue table above applies to the staged 150-primary set, verified by semantic parity; the historical 133/144 result applies only to the checked-in package. No clinical wording or evidence was rewritten.

## Task 6 first rebuilt artifact receipt

The earlier staged receipt above is a historical Task 3 measurement. Task 6 regenerated packages on 2026-09-27 and passed the full semantic CLI for each site immediately after its build (154 Concepts / 170 Qbank / 324 combined). APKG ZIP/SQLite bytes can differ across builds; identity and rendered-card semantics are the acceptance rule. The resident rebuild also recreates `_build/ms3`, so its intermediate MS3 tree is not a replacement for the MS3 gate receipt.

| First rebuilt output snapshot | SHA-256 | Cards |
|---|---|---:|
| `res/psychiatry_clerkship_concepts.apkg` | `29e5b6ad740b0d18b8d94a295e9ae2b9d72088a80345064a7a4b42abec155755` | 154 |
| `res/psychiatry_clerkship_library.apkg` | `3ee5adea6009abc4e71424e1e60b6848d5c606ef030dc33021ed5e2080ffe7f4` | 170 |
| `res/psychiatry_clerkship_library_ALL.apkg` | `9e4249aeb8076e0390bbb01ff7c44da7af2f67a645c8f48e77ac7493990cd4d4` | 324 |


## Historical Task 6 review fixes and governance boundary (before final fix wave)

The exporter now rejects `preserve-guid` when either historical front or back differs from the current rendered face. Regression mutations proved the old exporter accepted that inconsistent identity; that Task 6 catalog preserved 118 unchanged identities. Task 6 did not change the committed packages or crosswalk. The later final fix wave changed the crosswalk and 12 target revisions: the current counts are 107 preserved, 47 changed, and four withdrawn; committed APKG baselines remain untouched.

An independent browser audit found four concrete learner issues. The prior concept strip could disclose the next sibling cloze target; it is now absent while a card is unrevealed and returns after reveal or on the receipt. The topic chip could name a hidden target such as ECT; unrevealed Concepts now use the neutral label “Concepts”. Completion now updates a persistent live region and moves focus to the receipt’s dashboard action. A Concepts request now has a 10-second bound; after timeout it visibly reports incomplete Concepts coverage and lets the other loaded Daily Review sources start.

The authored `anki.md` edit and Daily Review implementation are effectively pending due to content-hash drift. The faculty ledger remains unchanged. Local technical passes do not establish CI, Netlify installation, deploy state, clinical approval or learner readiness. The Netlify dependency review found the root requirements pin appropriate for a repository-root Base setting, but did not verify the live UI Base setting or a build installing this new pin. Exact-commit previews for both sites must verify that separately. Native VoiceOver and Ubuntu visual-baseline parity remain untested.


## Historical Task 6 local verification — pre-fix source

On 2026-09-27, `PATH=/tmp/pcl-native-task3-venv/bin:$PATH bash bin/verify.sh` exited 0 with **ALL CHECKS PASSED**, including both full `build_and_check.sh` gates and all three newly wired concept Python suites. The independent focused concept suites passed 25 tests; focused Daily Review/Concepts/receipt Node tests passed 49. A post-gate resident package check confirmed **154 Concepts / 170 Qbank / 324 combined**. MS3 passed its own semantic package check within its full build before the resident rebuild.

Browser coverage: 18 cases passed in the expanded run, then both sibling cases passed after correcting their browser-storage fixture setup (20 scoped cases verified across those runs). Both audiences cover phone keyboard recall, source navigation, Path context, visible feed failure, timed receipt, sibling-answer privacy, completion focus/live announcement, ECT topic privacy, 10-second stalled-fetch recovery, hostile-edition regressions and offline missing-feed handling. These are automated Chromium checks; native VoiceOver was not exercised.

Host runtime was Node 25.9.0, Python 3.13.7 and Bash 3.2.57. The declared runtime-contract check passed, but this host run is not the Node 22/Python 3.11/Bash 5 container. Initial root testing skipped six analytics-enabled branches because analytics was off, and the disk/git blob comparison because authored files were modified. The full gate’s span-audit PASS means at/below its recorded baseline (83 clean, 11 flagged, including 9 TRUNCATED and 6 EDITED classifications; zero uncached), not zero findings. Qbank coherence found zero contradicting pairs in 189 live items. No ratchet baseline was changed.

No CI or deploy was run by this task. Faculty review, replacement of checked-in APKG baselines and learner readiness remain outstanding.


## Final fix-wave source and verification receipt

This section supersedes the historical Task 3/Task 6 current-state claims above. The final source has 154 Concepts cards (138 notes), with 107 preserved card identities, 47 changed identities and four withdrawals. Twelve citation-bearing faces have marker-free prompts/reveals and new revisions; all 154 Anki fronts use the neutral heading. Full final gate evidence is recorded after the frozen-source run below.

The attested citation input is `13_Faculty_Resources/_automation/site_build/concept_evidence_links.json`: exactly the 11 selected registry IDs and canonical HTTPS URLs, without internal registry notes. Regenerate deliberately with `python3 13_Faculty_Resources/_automation/site_build/concept_cards.py --write-evidence-links`; build validation fails for missing/extra IDs, unsafe URLs, or a URL differing from its unique canonical registry row. Daily Review hashes this selected map with the candidate, rather than unrelated registry metadata. The released feed has the same digest on both sites and omits excluded clinical excerpts.

**Current staged Qbank still has 20 tier-two cards with empty Evidence and Link; the historical committed Qbank package has 24.** No Qbank text, field, template or identity was changed in this wave. Reproduce the snapshot distinction after building the resident site. Run this in an activated Python virtual environment with `python3 -m pip install -r requirements.txt` completed; the pinned `genanki` dependency is required by the package reader and may be absent from system Python:

```bash
python3 - <<'PYCODE'
from pathlib import Path
import sys
sys.path.insert(0, '13_Faculty_Resources/_automation/site_build')
from check_anki_parity import read_cards
for label, path in [
    ('historical', Path('09_Exam_Prep/anki_export/psychiatry_clerkship_library.apkg')),
    ('current staged', Path('_build/res/anki/psychiatry_clerkship_library.apkg')),
]:
    rows = read_cards(path)
    tier_two = [r for r in rows if r['fields'][0].endswith('::t2')]
    missing = [r['fields'][0] for r in tier_two if not r['fields'][6] or not r['fields'][7]]
    print(label, 'all cards:', len(rows), 'tier two:', len(tier_two), 'missing evidence/link:', len(missing))
    print(', '.join(missing))
PYCODE
```

The governance gate exposed that earlier test wiring edited governance files together with learner content. Corrective commit `585b9a5` restored the three governance files to origin/main and runs all three Python Concept suites directly inside the existing `build_and_check.sh` gate for both audiences. Its committed HEAD passes governance separation; no exemption or guard was weakened.


### Final frozen-source gate and staged package receipt — 2026-09-27

`PATH=/tmp/pcl-native-task3-venv/bin:$PATH bash bin/verify.sh` exited **0: ALL CHECKS PASSED**, including both full site builds and the relocated Python Concept suites. The diagnostic governance/editorial-leak failures are resolved without exemptions or baseline changes. Focused Python: **32 tests OK**; focused Node: **44 passed**; browser: **22 passed** across both audiences and offline projects. The five initially stale-build governance tests were rerun after the final builds: **five passed, zero skipped**. Browser client code and deterministic feed bytes remained unchanged when the selected-link dependency replaced the raw registry dependency.

MS3 semantic parity was checked immediately after its final gate and before the resident rebuild; resident parity was checked after the full gate. Both report **154 Concepts / 170 Qbank / 324 combined**, with the following exact artifact bytes. Different APKG bytes across builds/sites do not imply semantic differences; the hard comparator validates identities, fields, ordinals, links, templates and the current Qbank separately.

| Final staged artifact | SHA-256 | Cards |
|---|---|---:|
| `ms3/psychiatry_clerkship_concepts.apkg` | `27ebf75fa72e08321228aadaf1c2d6b4284acffcdd7cfa95cfaf113fffe20f99` | 154 |
| `ms3/psychiatry_clerkship_library.apkg` | `63ae803190b9b0001594644ea79d1060ed4fef7f613ccd2d8c903ef2a291a9a2` | 170 |
| `ms3/psychiatry_clerkship_library_ALL.apkg` | `3ce7d7e6e5d9ac9ae25f99c8e7f91e384bcb489a8cd85778a3885cbacec6af15` | 324 |
| `res/psychiatry_clerkship_concepts.apkg` | `fa370ff237323ec26d551a2a7671243b3909c8c2515e39e53f4d72f72410ba04` | 154 |
| `res/psychiatry_clerkship_library.apkg` | `140e007bef21e51d64b9e8866cde020ead649cb4d05f0d2320e79c050e864e1a` | 170 |
| `res/psychiatry_clerkship_library_ALL.apkg` | `365250e940e2bc7d7426a399b35672d377bed975ffe5739b74e50208e43323a1` | 324 |

Both deterministic feed SHA-256 values: `e6b2a2e73edb7cb903aa40463563f298e27802c3fe08902dcd98cb8bd6472fc3`. Selected-link map SHA-256: `e17b24f099c9f1c5166f71c5fbf9e7a6bdc3284a4a473561e8c953b2a41ac06e`. Direct execution of the Qbank reproduction prints historical `168 / 24 / 24` and current staged `170 / 20 / 20` (all cards / tier-two cards / missing Evidence or Link).

This remains local technical evidence. No CI, deploy, served-production revision, Anki app import, native VoiceOver, faculty approval or learner-readiness claim is made. Committed APKG baselines and reviewed.json are unchanged. Exact command logs and corrective/final commit IDs are in `.superpowers/sdd/2026-09-26-native-flashcards/final-fix-report.md`.
