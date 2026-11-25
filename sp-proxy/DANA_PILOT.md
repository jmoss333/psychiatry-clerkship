# Dana’s supervised spoken pilot

Use Dana’s **Day 1 Admission Interview**. A supervisor enters a second voice code on the device and stays for the visit. The regular learner passcode still opens the typed room. A refresh clears the supervisor code. Use fictional learner questions and keep the faculty notes free of dialogue or recordings.

## Before opening the room

- Choose the supervising faculty member, the device, and a short window with an exact end time. Start with a faculty audition. Invite a supervised learner only after faculty accepts Dana’s voice, clinical portrayal, and handling of a direct safety question.
- Confirm the OpenAI project that will pay for speech, model access, balance, and approved provider retention and tracing settings. Confirm that the consent screen describes those settings. Set the intended provider spend control with the project owner. Enforcement can lag, and an alert alone permits more requests. [Provider spend controls](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform) · [Realtime data controls](https://developers.openai.com/api/docs/guides/your-data)
- Pick the model and dollar allowance. One proposed comparison uses the same Dana admission case, Marin voice, and five-minute limit twice, once on each model. The current reservation calculation yields about $0.21 on `gpt-realtime-2.1-mini` and $0.57 on `gpt-realtime-2.1`. These figures are estimates from the app, and provider billing follows actual use. [Provider prices](https://developers.openai.com/api/docs/pricing)
- Publish the reviewed proxy revision to its Netlify site and the matching learner interface through the normal release train. Keep voice disabled while checking both learner sites for the optional **Supervised voice pilot** field. Deploy previews keep speech disabled.

## Operator settings

Use the production **Functions** scope of `sp-interview-proxy`. Enter secrets in the hosting dashboard. Keep the supervisor code out of links, chat, Git, and screenshots.

| Setting | Pilot value |
| --- | --- |
| `SP_REALTIME_PILOT_PASSCODE` | A private supervisor secret of at least 16 characters, distinct from the learner and operations codes |
| `OPENAI_API_KEY` | Server-side key belonging to the owner-approved OpenAI project |
| `SP_REALTIME_MODEL` | One approved speech model per deployment |
| `SP_REALTIME_TRANSCRIPTION_MODEL` | `gpt-4o-mini-transcribe` for this comparison |
| `SP_REALTIME_MAX_SESSION_MINUTES` | The approved duration, e.g. `5` |
| `SP_REALTIME_STARTS_PER_DAY`, `SP_REALTIME_STARTS_PER_HALF_HOUR` | The approved number of starts, e.g. `2` for each in one sitting within one UTC day |
| `SP_REALTIME_ROTATION_CAP_USD` | The approved reservation allowance, e.g. `2` for the comparison |
| `SP_REALTIME_PILOT_ENDS_AT` | The agreed cutoff in UTC, including milliseconds, formatted as `YYYY-MM-DDTHH:mm:ss.000Z` |
| `SP_REALTIME_ENABLED` | Set to `dana-pilot` and redeploy only after the owner authorizes the scheduled audition |

Use the existing reviewed pack, allowed learner origins, rotation, operations credential, and receipt-signing secret. Retain the same rotation and ledger limits between audition passes so both draws use one allowance. A supervisor secret blocks the broad `true` setting in the pilot revision. Verify the running proxy revision before changing this switch.

## At the device

1. Open the [MS3 room](https://une-ms3-psychiatry.netlify.app/?tool=sp-interview.html) or [Resident room](https://mmc-psychiatry-residents-sanford.netlify.app/?tool=sp-interview.html). In setup enter the learner passcode. Check that the learner code alone cannot open speech and that the typed room is available.
2. Open **Supervised voice pilot (optional)**, enter the supervisor code, and select **Save & test connection**. Confirm the pilot unlocks Dana and only Dana’s admission case offers spoken entry. Health is a configuration check. The first exchange on the actual microphone verifies voice delivery.
3. Start a supported encounter and accept the spoken consent. For a blind model comparison, the supervisor sets each model between calls and withholds its identity until ratings are recorded. Use the same device, audio setup, short opening question, interruption, and direct safety question in both passes. Listen for whether Dana stays in character, lets the learner finish, and discloses facts at the point the reviewed case intends. Record the preference and any reason to stop. Use a separate supervised learner session to compare headset and speakers and to try the typed fallback.
4. End each call explicitly. Check operations usage for zero active calls before repinning a model, changing ledger limits, or disabling the pilot. The cutoff closes new starts and bounds every issued session deadline. The existing five-minute cleanup job handles abandoned calls. If the encounter fails or Dana’s portrayal needs correction, end speech and finish in the typed room.
5. At the end, set `SP_REALTIME_ENABLED=false`, redeploy, and check that spoken entry is closed and typed access works. Clear the passcodes on the pilot device. A new pilot window requires another owner decision.
