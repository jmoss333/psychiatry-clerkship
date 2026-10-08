// Where the end of first-run setup and the brand/Home button put the learner, read from the ONE
// place it is decided: FD_LANDING_VIEW in fd_wire.js (owner decision 2026-10-08, "Essentials first
// while trainees get used to the site"). Specs never restate the value: a spec about the landing
// asserts LANDING, so flipping the constant back to 'today' flips those expectations with it.
// A returning learner's bare visit is NOT the landing -- it restores the stored tab as before.
import { readFileSync } from 'node:fs';

const WIRE = new URL('../../13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js', import.meta.url);
const match = readFileSync(WIRE, 'utf8').match(/var FD_LANDING_VIEW='(essentials|today)';/);
if (!match) throw new Error('landing.js: FD_LANDING_VIEW declaration not found in fd_wire.js');

export const LANDING_VIEW = match[1];

// What setup's end and Home show, and the URL search they settle on. (APP's Today is On shift.)
export const LANDING = LANDING_VIEW === 'essentials'
  ? { surface: '.fd-library.fd-kit', search: '?tab=library', tab: 'library' }
  : { surface: ':is(.fd-today, .fd-app)', search: '', tab: 'today' };

// The Today tab at any width (desktop tab row or phone dock). A spec about a Today-only feature
// that reaches the app through setup or Home taps this -- a no-op when the landing is Today.
export const TODAY_TAB = '[data-fd-tab="today"]:is(.fd-tab,.fd-dock__item):visible';
