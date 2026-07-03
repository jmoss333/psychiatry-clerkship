// day-video.jsx — "One Day on the Unit" (86s, 1920×1080)
// A day-in-the-life of the Clerkship Hub: five moments, five tools, one phone.
// Uses Stage/Sprite from animations.jsx and IOSDevice from ios-frame.jsx.

const { Stage, Sprite, useTime, useSprite, Easing, interpolate, clamp } = window;

const SERIF = '"Source Serif 4", Georgia, serif';
const SANS = '"Source Sans 3", "Segoe UI", system-ui, sans-serif';

const C = {
  bg: '#f6f3ee', bgAlt: '#faf6f0', ink: '#2f2924', surface: '#ffffff', border: '#ddd3c6',
  terra: '#c25a3c', terraDark: '#a84830', terraLight: '#f3ebe5',
  teal: '#2a6b5e', tealDark: '#1e5248', tealLight: '#edf4f2',
  gold: '#7a6234', goldLight: '#f5efe2',
  success: '#357160', successLight: '#e7f1ed',
  info: '#41618a', infoLight: '#eaf0f6',
  mid: '#51473d', light: '#665a4f',
};

// Phone placement (canvas coords)
const PX = 1129, PY = 103; // top-left of IOSDevice (402×874)

// ── shared helpers ──────────────────────────────────────────────────────────
function Item({ at = 0, until = Infinity, entry = 0.7, exit = 0.45, rise = 22, pop = false, style, children }) {
  const { localTime: lt } = useSprite();
  const pIn = clamp((lt - at) / entry, 0, 1);
  const pOut = until === Infinity ? 1 : clamp((until - lt) / exit, 0, 1);
  if (pIn <= 0 || pOut <= 0) return null;
  const e = pop ? Easing.easeOutBack(pIn) : Easing.easeOutCubic(pIn);
  const opacity = Math.min(Easing.easeOutQuad(pIn), pOut);
  const transform = pop ? `scale(${0.82 + 0.18 * e})` : `translateY(${(1 - e) * rise}px)`;
  return (
    <div style={{ position: 'absolute', opacity, transform, willChange: 'transform,opacity', ...style }}>
      {children}
    </div>
  );
}

function LabelSync() {
  const s = Math.floor(useTime());
  React.useEffect(() => {
    const el = document.getElementById('cw-day-root');
    if (el) el.setAttribute('data-screen-label', 't=' + s + 's');
  }, [s]);
  return null;
}

// ── left-column scene intro (time + caption + tool pill) ────────────────────
function SceneIntro({ time, ampm, caption, sub, tool, badge, dark }) {
  const inkCol = dark ? '#f6f3ee' : C.ink;
  const midCol = dark ? '#cfc5b8' : C.mid;
  const lightCol = dark ? '#a99c8d' : C.light;
  return (
    <React.Fragment>
      <Item at={0.5} until={13.9} style={{ left: 170, top: 262 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontFamily: SERIF, fontSize: 128, fontWeight: 600, color: inkCol, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{time}</span>
          <span style={{ fontFamily: SANS, fontSize: 32, fontWeight: 600, color: C.terra, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{ampm}</span>
        </div>
      </Item>
      <Item at={1.1} until={13.9} style={{ left: 174, top: 452, width: 640 }}>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 36, fontWeight: 500, color: inkCol, lineHeight: 1.25 }}>{caption}</div>
      </Item>
      <Item at={1.7} until={13.9} style={{ left: 174, top: 532, width: 620 }}>
        <div style={{ fontFamily: SANS, fontSize: 22, color: midCol, lineHeight: 1.55 }}>{sub}</div>
      </Item>
      <Item at={2.3} until={13.9} pop entry={0.5} style={{ left: 174, top: 646 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ background: dark ? 'rgba(246,243,238,0.1)' : C.surface, border: `1.5px solid ${C.teal}`, color: dark ? '#a9c4bb' : C.tealDark, fontFamily: SANS, fontSize: 18, fontWeight: 700, borderRadius: 999, padding: '10px 22px' }}>{tool}</span>
          {badge && <span style={{ background: C.gold, color: '#fff', fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', borderRadius: 999, padding: '7px 14px' }}>{badge}</span>}
        </div>
      </Item>
      <Item at={2.3} until={13.9} style={{ left: 174, top: 712 }}>
        <div style={{ fontFamily: SANS, fontSize: 15, color: lightCol, marginTop: 6 }}>from the Clerkship Hub</div>
      </Item>
    </React.Fragment>
  );
}

// ── camera for a phone scene ────────────────────────────────────────────────
function PhoneCamera({ children }) {
  const { localTime: lt, duration } = useSprite();
  const z = interpolate([4.2, 5.6, duration - 1.2], [1, 1.78, 1.86], Easing.easeInOutCubic)(lt);
  const fx = interpolate([4.2, 5.6], [960, 1330], Easing.easeInOutCubic)(lt);
  const fy = interpolate([4.2, 5.6], [540, 505], Easing.easeInOutCubic)(lt);
  const opacity = Math.min(clamp(lt / 0.5, 0, 1), clamp((duration - lt) / 0.6, 0, 1));
  return (
    <div style={{ position: 'absolute', inset: 0, opacity }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${960 - fx * z}px, ${540 - fy * z}px) scale(${z})`, transformOrigin: '0 0' }}>
        {children}
      </div>
    </div>
  );
}

// ── phone shell (enters by rising) ──────────────────────────────────────────
function PhoneShell({ time, dark, children }) {
  const { localTime: lt } = useSprite();
  const e = Easing.easeOutCubic(clamp((lt - 0.6) / 0.9, 0, 1));
  return (
    <div style={{ position: 'absolute', left: PX, top: PY, opacity: e, transform: `translateY(${(1 - e) * 70}px)` }}>
      <window.IOSDevice time={time} dark={dark}>
        <div style={{ position: 'relative', width: 402, height: 874, fontFamily: SANS }}>
          {children}
        </div>
      </window.IOSDevice>
    </div>
  );
}

// app header inside the phone screen
function AppHeader({ title, chip, chipColor, right, dark }) {
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', left: 26, top: 66, fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: dark ? '#a99c8d' : C.light }}>Ψ Clerkship Hub</div>
      <div style={{ position: 'absolute', left: 26, top: 86, fontFamily: SERIF, fontSize: 27, fontWeight: 700, color: dark ? '#f6f3ee' : C.ink }}>{title}</div>
      {chip && (
        <div style={{ position: 'absolute', left: 26, top: 132, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, background: (chipColor || C.tealLight), color: chipColor === C.goldLight ? C.gold : C.tealDark, borderRadius: 999, padding: '5px 12px' }}>{chip}</span>
          {right}
        </div>
      )}
    </React.Fragment>
  );
}

// ── tap finger + ripple ─────────────────────────────────────────────────────
function Finger({ moves, taps }) {
  const { localTime: lt } = useSprite();
  const t0 = moves[0][0], t1 = moves[moves.length - 1][0];
  if (lt < t0 - 0.2 || lt > t1 + 0.4) return null;
  const x = interpolate(moves.map(m => m[0]), moves.map(m => m[1]), Easing.easeInOutCubic)(lt);
  const y = interpolate(moves.map(m => m[0]), moves.map(m => m[2]), Easing.easeInOutCubic)(lt);
  const opacity = Math.min(clamp((lt - t0 + 0.2) / 0.4, 0, 1), clamp((t1 + 0.2 - lt) / 0.4, 0, 1)) * 0.9;
  let press = 0;
  for (const [ct] of taps) {
    const dt = Math.abs(lt - ct);
    if (dt < 0.18) press = Math.max(press, 1 - dt / 0.18);
  }
  return (
    <React.Fragment>
      {taps.map(([ct, cx, cy], i) => {
        const rp = (lt - ct) / 0.5;
        if (rp <= 0 || rp >= 1) return null;
        const r = 14 + rp * 56;
        return <div key={i} style={{ position: 'absolute', left: cx - r / 2, top: cy - r / 2, width: r, height: r, borderRadius: '50%', border: `3px solid ${C.teal}`, opacity: (1 - rp) * 0.85 }} />;
      })}
      <div style={{ position: 'absolute', left: x - 17, top: y - 17, width: 34, height: 34, borderRadius: 17, background: 'rgba(47,41,36,0.28)', border: '2.5px solid rgba(255,255,255,0.95)', boxShadow: '0 3px 10px rgba(47,41,36,0.3)', opacity, transform: `scale(${1 - 0.25 * press})` }} />
    </React.Fragment>
  );
}

// ── day progress strip (global) ─────────────────────────────────────────────
const STOPS = [
  { t: 7, label: '6:45' }, { t: 22, label: '9:10' }, { t: 37, label: '12:40' },
  { t: 52, label: '2:30' }, { t: 67, label: '7:15' },
];
function DayStrip() {
  const t = useTime();
  const { localTime: lt } = useSprite();
  const dark = t > 66.5;
  const opacity = Math.min(clamp(lt / 0.8, 0, 1), clamp((79.4 - t) / 0.6, 0, 1));
  const W = 660, X = 960 - W / 2, Y = 1006;
  const frac = interpolate(STOPS.map(s => s.t), STOPS.map((s, i) => i / (STOPS.length - 1)))(t);
  const line = dark ? 'rgba(246,243,238,0.22)' : '#ddd3c6';
  const txt = dark ? '#a99c8d' : C.light;
  return (
    <div style={{ position: 'absolute', left: X, top: Y, width: W, opacity }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 8, height: 2, background: line, borderRadius: 1 }} />
      <div style={{ position: 'absolute', left: 0, top: 8, width: frac * W, height: 2, background: C.terra, borderRadius: 1 }} />
      {STOPS.map((s, i) => {
        const on = t >= s.t - 0.2;
        const cur = frac * (STOPS.length - 1);
        const active = Math.abs(cur - i) < 0.5;
        return (
          <div key={i} style={{ position: 'absolute', left: (i / (STOPS.length - 1)) * W - 22, top: 0, width: 44, textAlign: 'center' }}>
            <div style={{ width: active ? 14 : 9, height: active ? 14 : 9, borderRadius: 7, background: on ? C.terra : line, margin: `${active ? 2 : 4.5}px auto 0`, transition: 'width 0.3s, height 0.3s' }} />
            <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: active ? 700 : 400, color: active ? (dark ? '#f6f3ee' : C.ink) : txt, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════ S0 · Cold open (0–7.4) ═════════════════════════════════════
function SceneOpen() {
  const { localTime: lt } = useSprite();
  const bgO = interpolate([0, 6.4, 7.4], [1, 1, 0])(lt);
  const gx = 960 + Math.sin(lt * 0.45) * 120;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: bgO }}>
      <div style={{ position: 'absolute', inset: 0, background: C.ink }} />
      <div style={{ position: 'absolute', left: gx - 500, top: 120, width: 1000, height: 780, borderRadius: '50%', background: 'radial-gradient(circle, rgba(122,98,52,0.18), transparent 65%)' }} />
      <Item at={0.6} until={6.2} style={{ left: 0, right: 0, top: 396, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 23, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#c9a86a' }}>Week 3 of the rotation · a Tuesday</div>
      </Item>
      <Item at={1.6} until={6.4} style={{ left: 0, right: 0, top: 462, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 92, fontWeight: 600, color: '#f6f3ee', letterSpacing: '-0.01em' }}>One day on the unit.</div>
      </Item>
      <Item at={3.2} until={6.4} style={{ left: 0, right: 0, top: 618, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 26, color: '#cfc5b8' }}>Five moments where the hub earns its place in your pocket.</div>
      </Item>
    </div>
  );
}

// ═══════════════ S1 · 6:45 — Daily Review (7–22) ════════════════════════════
function CardFace({ label, labelColor, text, hint, src }) {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '26px 26px', boxSizing: 'border-box' }}>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: labelColor }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontSize: 21.5, fontWeight: 600, color: C.ink, lineHeight: 1.42, marginTop: 14 }}>{text}</div>
      {hint && <div style={{ position: 'absolute', left: 26, bottom: 22, fontFamily: SANS, fontSize: 13.5, color: C.light }}>{hint}</div>}
      {src && <div style={{ position: 'absolute', left: 26, bottom: 22, fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: C.tealDark }}>{src}</div>}
    </div>
  );
}

function ScreenReview() {
  const { localTime: lt } = useSprite();
  const FLIP = 6.4, NEXT = 9.8;
  // flip: squeeze scaleX around FLIP
  const fp = clamp((lt - FLIP) / 0.5, 0, 1);
  const sx = fp === 0 ? 1 : Math.abs(1 - 2 * Easing.easeInOutQuad(fp));
  const showAnswer = fp >= 0.5;
  // advance: slide out, next in
  const np = Easing.easeInOutCubic(clamp((lt - NEXT) / 0.7, 0, 1));
  const dots = [1, 1, showAnswer || np > 0 ? 1 : 0.35, 0.35, 0.35];
  return (
    <React.Fragment>
      <AppHeader title="Daily Review" chip="Day 16 · 5 cards due" />
      <div style={{ position: 'absolute', left: 26, top: 182, display: 'flex', gap: 7 }}>
        {dots.map((o, i) => <span key={i} style={{ width: 30, height: 5, borderRadius: 3, background: C.teal, opacity: o }} />)}
      </div>
      {/* card 1 */}
      <div style={{ position: 'absolute', left: 26 - np * 440, top: 212, width: 350, height: 320, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, boxShadow: '0 10px 30px rgba(47,41,36,0.10)', transform: `scaleX(${sx})`, opacity: 1 - np }}>
        {!showAnswer
          ? <CardFace label="Psychopharm · Week 2" labelColor={C.gold} text="First-line for acute mania with severe agitation?" hint="tap to reveal" />
          : <CardFace label="Answer" labelColor={C.tealDark} text="An IM second-generation antipsychotic, ± a benzodiazepine. Lithium is the long game — cover the agitation now." src="→ Psychopharm primer · Week 2" />}
      </div>
      {/* card 2 slides in */}
      {np > 0 && (
        <div style={{ position: 'absolute', left: 26 + (1 - np) * 440, top: 212, width: 350, height: 320, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, boxShadow: '0 10px 30px rgba(47,41,36,0.10)' }}>
          <CardFace label="Landmark trials · Week 2" labelColor={C.gold} text="Kane 1988 enrolled which schizophrenia patients?" hint="tap to reveal" />
        </div>
      )}
      {/* buttons */}
      <div style={{ position: 'absolute', left: 26, top: 566, width: 158, height: 54, border: `1.5px solid ${C.border}`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontSize: 17, fontWeight: 700, color: C.mid, opacity: showAnswer && np === 0 ? 1 : 0.45 }}>Again</div>
      <div style={{ position: 'absolute', left: 200, top: 566, width: 176, height: 54, background: C.teal, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontSize: 17, fontWeight: 700, color: '#fff', opacity: showAnswer && np === 0 ? 1 : 0.45 }}>Got it ✓</div>
      <div style={{ position: 'absolute', left: 26, top: 660, fontFamily: SANS, fontSize: 14.5, color: C.light }}>Streak · 16 days &nbsp;·&nbsp; 4 min a day keeps Week 1 fresh</div>
    </React.Fragment>
  );
}

function Scene1() {
  const { localTime: lt } = useSprite();
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* dawn tint */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 20%, rgba(217,160,60,0.10), transparent 60%)', opacity: Math.min(1, lt / 1.5) }} />
      <PhoneCamera>
        <SceneIntro time="6:45" ampm="am" caption="Coffee's still brewing." sub="Three flashcards while you wait — spaced repetition keeps Week 1 fresh in Week 3." tool="Daily Review" />
        <PhoneShell time="6:45">
          <ScreenReview />
        </PhoneShell>
        <Finger
          moves={[[5.2, 1520, 850], [6.1, 1330, 470], [6.4, 1330, 470], [8.4, 1370, 600], [9.5, 1417, 696], [9.8, 1417, 696], [10.8, 1480, 780]]}
          taps={[[6.4, 1330, 470], [9.8, 1417, 696]]}
        />
      </PhoneCamera>
    </div>
  );
}

// ═══════════════ S2 · 9:10 — Rounding Prep (22–37) ══════════════════════════
const STEPS = ['One-liner: who, and why now', 'Overnight events', 'MSE — what changed', 'Plan, by problem', 'Ask: what am I missing?'];

function ScreenRounds() {
  const { localTime: lt } = useSprite();
  const START = 6.0;
  const running = lt >= START;
  const rt = Math.max(0, lt - START);
  const secs = Math.floor(rt * 14); // dramatized clock
  const mm = Math.floor(secs / 60), ss = secs % 60;
  const checkTimes = [6.8, 7.8, 8.8, 9.9, 11.0];
  const sweep = clamp(secs / 180, 0, 1);
  const R = 54, CIRC = 2 * Math.PI * R;
  return (
    <React.Fragment>
      <AppHeader title="Rounding Prep" chip="Bed 12 · new admission" />
      {STEPS.map((s, i) => {
        const done = lt >= checkTimes[i];
        const pop = Easing.easeOutBack(clamp((lt - checkTimes[i]) / 0.35, 0, 1));
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, position: 'absolute', left: 26, top: 186 + i * 57, width: 350 }}>
            <span style={{ width: 30, height: 30, borderRadius: 15, flex: '0 0 auto', background: done ? C.success : C.bgAlt, border: done ? 'none' : `1.5px solid ${C.border}`, color: done ? '#fff' : C.mid, fontFamily: SANS, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: done ? `scale(${0.7 + 0.3 * pop})` : 'none' }}>{done ? '✓' : i + 1}</span>
            <span style={{ fontFamily: SANS, fontSize: 16.5, fontWeight: done ? 600 : 400, color: done ? C.ink : C.mid }}>{s}</span>
          </div>
        );
      })}
      {/* timer ring */}
      <svg width="128" height="128" viewBox="0 0 128 128" style={{ position: 'absolute', left: 26, top: 500 }}>
        <circle cx="64" cy="64" r={R} fill="none" stroke={C.border} strokeWidth="9" />
        <circle cx="64" cy="64" r={R} fill="none" stroke={C.teal} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - sweep)} transform="rotate(-90 64 64)" />
      </svg>
      <div style={{ position: 'absolute', left: 26, top: 545, width: 128, textAlign: 'center', fontFamily: SANS, fontSize: 26, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{mm}:{String(ss).padStart(2, '0')}</div>
      <div style={{ position: 'absolute', left: 26, top: 580, width: 128, textAlign: 'center', fontFamily: SANS, fontSize: 12.5, color: C.light }}>target &lt; 3:00</div>
      <div style={{ position: 'absolute', left: 200, top: 536, width: 176, height: 54, background: running ? C.surface : C.teal, border: running ? `1.5px solid ${C.border}` : 'none', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontSize: 17, fontWeight: 700, color: running ? C.mid : '#fff' }}>{running ? 'Rehearsing…' : 'Start rehearsal'}</div>
      <div style={{ position: 'absolute', left: 26, top: 668, fontFamily: SANS, fontSize: 14.5, color: C.light, width: 350, lineHeight: 1.5 }}>Say it out loud once. Rounds will feel like the second take.</div>
    </React.Fragment>
  );
}

function Scene2() {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <PhoneCamera>
        <SceneIntro time="9:10" ampm="am" caption="Rounds in twenty minutes." sub="Rehearse the presentation once against the scaffold — and stay under three minutes." tool="Rounding Prep" />
        <PhoneShell time="9:10">
          <ScreenRounds />
        </PhoneShell>
        <Finger
          moves={[[5.0, 1560, 880], [5.8, 1417, 666], [6.0, 1417, 666], [7.2, 1460, 750], [8.4, 1470, 800]]}
          taps={[[6.0, 1417, 666]]}
        />
      </PhoneCamera>
    </div>
  );
}

// ═══════════════ S3 · 12:40 — C-SSRS (37–52) ════════════════════════════════
function ScreenCSSRS() {
  const { localTime: lt } = useSprite();
  const TAP = 6.2;
  const np = Easing.easeInOutCubic(clamp((lt - TAP - 0.15) / 0.6, 0, 1));
  const q2 = np > 0.5;
  return (
    <React.Fragment>
      <AppHeader title="Columbia C-SSRS" chip="Screener · past month"
        right={<span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: C.light }}>{q2 ? '2' : '1'} of 6</span>} />
      {/* question card */}
      <div style={{ position: 'absolute', left: 26 - np * 440, top: 196, width: 350, height: 250, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: '24px', boxSizing: 'border-box', opacity: 1 - np, boxShadow: '0 8px 26px rgba(47,41,36,0.08)' }}>
        <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.light }}>Item 1 · Ideation</div>
        <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: C.ink, lineHeight: 1.45, marginTop: 12 }}>Have you wished you were dead, or wished you could go to sleep and not wake up?</div>
      </div>
      {np > 0 && (
        <div style={{ position: 'absolute', left: 26 + (1 - np) * 440, top: 196, width: 350, height: 250, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: '24px', boxSizing: 'border-box', boxShadow: '0 8px 26px rgba(47,41,36,0.08)' }}>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.light }}>Item 2 · Ideation</div>
          <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: C.ink, lineHeight: 1.45, marginTop: 12 }}>Have you actually had any thoughts of killing yourself?</div>
        </div>
      )}
      {/* yes / no */}
      <div style={{ position: 'absolute', left: 26, top: 478, width: 168, height: 56, background: lt >= TAP && !q2 ? C.tealDark : C.teal, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontSize: 18, fontWeight: 700, color: '#fff' }}>Yes</div>
      <div style={{ position: 'absolute', left: 208, top: 478, width: 168, height: 56, border: `1.5px solid ${C.border}`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontSize: 18, fontWeight: 700, color: C.mid, background: C.surface }}>No</div>
      {/* protocol strip */}
      <div style={{ position: 'absolute', left: 26, top: 580, width: 350, background: C.infoLight, borderLeft: `4px solid ${C.info}`, borderRadius: '0 10px 10px 0', padding: '13px 16px', boxSizing: 'border-box' }}>
        <div style={{ fontFamily: SANS, fontSize: 14, color: C.ink, lineHeight: 1.5 }}>{q2 ? 'If yes on 2 → items 3–5 assess method, intent, and plan.' : 'Ask verbatim. The tool sequences items 2–6 for you.'}</div>
      </div>
      <div style={{ position: 'absolute', left: 26, top: 688, fontFamily: SANS, fontSize: 14.5, color: C.light, width: 350 }}>Any positive screen → notify your resident before you leave.</div>
    </React.Fragment>
  );
}

function Scene3() {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <PhoneCamera>
        <SceneIntro time="12:40" ampm="pm" caption="A new admission, and it's your interview." sub="Screen safety the right way — the actual Columbia protocol, item by item, at the bedside." tool="C-SSRS Screener" />
        <PhoneShell time="12:40">
          <ScreenCSSRS />
        </PhoneShell>
        <Finger
          moves={[[5.2, 1550, 860], [6.0, 1239, 609], [6.2, 1239, 609], [7.6, 1300, 680], [8.8, 1380, 760]]}
          taps={[[6.2, 1239, 609]]}
        />
      </PhoneCamera>
    </div>
  );
}

// ═══════════════ S4 · 2:30 — Family Meeting Playbook (52–67) ════════════════
const PHASES = [
  'Join — set the agenda together',
  "Hear the family's story first",
  'Name the pattern: expressed emotion',
  'One skill: requests without criticism',
  'Plan · teach-back · next steps',
];

function ScreenFamily() {
  const { localTime: lt } = useSprite();
  const TAP = 6.8;
  const advanced = lt >= TAP + 0.15;
  const activeIdx = advanced ? 3 : 2;
  return (
    <React.Fragment>
      <AppHeader title="Family Meeting Playbook" chip="90-minute structure" chipColor={C.goldLight}
        right={<span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: C.light }}>38 min in</span>} />
      {PHASES.map((p, i) => {
        const done = i < 2 || (i === 2 && advanced);
        const active = i === activeIdx;
        const pop = i === 2 ? Easing.easeOutBack(clamp((lt - TAP - 0.15) / 0.35, 0, 1)) : 1;
        return (
          <div key={i} style={{ position: 'absolute', left: 26, top: 190 + i * 88, width: 350, minHeight: 74, background: active ? C.terraLight : C.surface, border: `1.5px solid ${active ? C.terra : C.border}`, borderRadius: 16, padding: '14px 16px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 13, transition: 'background 0.3s, border 0.3s' }}>
            <span style={{ width: 30, height: 30, borderRadius: 15, flex: '0 0 auto', background: done ? C.success : active ? C.terra : C.bgAlt, border: done || active ? 'none' : `1.5px solid ${C.border}`, color: done || active ? '#fff' : C.mid, fontFamily: SANS, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: done && i === 2 ? `scale(${0.7 + 0.3 * pop})` : 'none' }}>{done ? '✓' : i + 1}</span>
            <div>
              <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: active || done ? 600 : 400, color: active || done ? C.ink : C.mid, lineHeight: 1.3 }}>{p}</div>
              {active && <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: C.terraDark, marginTop: 3, letterSpacing: '0.05em', textTransform: 'uppercase' }}>now</div>}
            </div>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 26, top: 640 + 12, fontFamily: SANS, fontSize: 14.5, color: C.light, width: 350 }}>From Week 4 — Family & Systems</div>
    </React.Fragment>
  );
}

function Scene4() {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <PhoneCamera>
        <SceneIntro time="2:30" ampm="pm" caption="The family meeting." sub="Run it with a structure, not a script — agenda, expressed emotion, one teachable skill." tool="Family Meeting Playbook" badge="Signature focus" />
        <PhoneShell time="2:30">
          <ScreenFamily />
        </PhoneShell>
        <Finger
          moves={[[5.4, 1540, 900], [6.6, 1330, 483], [6.8, 1330, 483], [8.2, 1360, 570], [9.4, 1420, 680]]}
          taps={[[6.8, 1330, 483]]}
        />
      </PhoneCamera>
    </div>
  );
}

// ═══════════════ S5 · 7:15 — Drive home, audio (67–79.4) ════════════════════
const BAR_SEED = Array.from({ length: 30 }, (_, i) => 0.3 + 0.7 * Math.abs(Math.sin(i * 2.3 + 0.7)));

function ScreenAudio() {
  const { localTime: lt } = useSprite();
  const PLAY = 4.6;
  const playing = lt >= PLAY;
  const pf = clamp((lt - PLAY) / 7.5, 0, 1) * 0.42;
  const secs = Math.floor(pf * 114);
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', left: 26, top: 66, fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a99c8d' }}>Ψ Clerkship Hub · Audio</div>
      {/* artwork */}
      <div style={{ position: 'absolute', left: 51, top: 116, width: 300, height: 300, borderRadius: 26, background: C.terra, boxShadow: '0 20px 50px rgba(194,90,60,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <span style={{ fontFamily: SERIF, fontSize: 96, fontWeight: 600, color: '#fff', lineHeight: 1 }}>Ψ</span>
        <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>Landmark trials</span>
      </div>
      <div style={{ position: 'absolute', left: 26, top: 452, width: 350, fontFamily: SANS, fontSize: 19.5, fontWeight: 700, color: '#f6f3ee', lineHeight: 1.35 }}>Linehan 1991 — Dialectical Behavior Therapy</div>
      <div style={{ position: 'absolute', left: 26, top: 512, fontFamily: SANS, fontSize: 14, color: '#a99c8d' }}>Episode 24 of 50 · 1:54</div>
      {/* waveform */}
      <div style={{ position: 'absolute', left: 26, top: 548, width: 350, height: 44, display: 'flex', alignItems: 'flex-end', gap: 5 }}>
        {BAR_SEED.map((h, i) => {
          const wob = playing ? 0.7 + 0.3 * Math.sin(lt * 3.2 + i * 0.6) : 0.85;
          const played = i / 30 < pf;
          return <div key={i} style={{ width: 6, height: Math.max(6, 44 * h * wob), borderRadius: 3, background: played ? '#e2a68e' : 'rgba(246,243,238,0.18)' }} />;
        })}
      </div>
      <div style={{ position: 'absolute', left: 26, top: 602, width: 350, display: 'flex', justifyContent: 'space-between', fontFamily: SANS, fontSize: 12.5, color: '#a99c8d', fontVariantNumeric: 'tabular-nums' }}>
        <span>0:{String(secs).padStart(2, '0')}</span><span>1:54</span>
      </div>
      {/* controls */}
      <div style={{ position: 'absolute', left: 0, top: 636, width: 402, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 34 }}>
        <svg width="26" height="26" viewBox="0 0 24 24"><path d="M19 4v16L8 12l11-8zM6 4h-2v16h2V4z" fill="#f6f3ee" opacity="0.8" /></svg>
        <div style={{ width: 72, height: 72, borderRadius: 36, background: '#f6f3ee', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {playing
            ? <svg width="24" height="24" viewBox="0 0 14 14"><rect x="3" y="2" width="3" height="10" fill="#2f2924" /><rect x="8" y="2" width="3" height="10" fill="#2f2924" /></svg>
            : <svg width="24" height="24" viewBox="0 0 14 14"><path d="M4 2l9 5-9 5V2z" fill="#2f2924" /></svg>}
        </div>
        <svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 4v16l11-8L5 4zm13 0h2v16h-2V4z" fill="#f6f3ee" opacity="0.8" /></svg>
      </div>
      <div style={{ position: 'absolute', left: 172, top: 730, width: 58, textAlign: 'center', fontFamily: SANS, fontSize: 13.5, fontWeight: 700, color: '#a9c4bb', border: '1.5px solid rgba(169,196,187,0.4)', borderRadius: 999, padding: '5px 0' }}>1.2×</div>
    </React.Fragment>
  );
}

function Scene5() {
  const { localTime: lt } = useSprite();
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: C.ink, opacity: Math.min(1, lt / 1) }} />
      <div style={{ position: 'absolute', left: 200, top: 100, width: 1100, height: 800, borderRadius: '50%', background: 'radial-gradient(circle, rgba(194,90,60,0.12), transparent 65%)', opacity: Math.min(1, lt / 1.5) }} />
      <PhoneCamera>
        <SceneIntro dark time="7:15" ampm="pm" caption="The drive home." sub="One landmark trial, door to driveway — tomorrow it comes back as a review card." tool="Landmark Trials · audio" />
        <PhoneShell time="7:15" dark>
          <ScreenAudio />
        </PhoneShell>
        <Finger
          moves={[[3.6, 1520, 950], [4.4, 1330, 775], [4.6, 1330, 775], [6.0, 1360, 820], [7.2, 1430, 880]]}
          taps={[[4.6, 1330, 775]]}
        />
      </PhoneCamera>
    </div>
  );
}

// ═══════════════ S6 · Close (79–86) ═════════════════════════════════════════
function SceneClose() {
  const { localTime: lt } = useSprite();
  const gx = 960 + Math.sin(lt * 0.4) * 120;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: C.ink }} />
      <div style={{ position: 'absolute', left: gx - 500, top: 140, width: 1000, height: 760, borderRadius: '50%', background: 'radial-gradient(circle, rgba(42,107,94,0.15), transparent 65%)' }} />
      <Item at={0.7} style={{ left: 0, right: 0, top: 400, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 72, fontWeight: 600, color: '#f6f3ee', letterSpacing: '-0.01em' }}>Six weeks of days like this.</div>
      </Item>
      <Item at={2.4} style={{ left: 0, right: 0, top: 524, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 27, color: '#a9c4bb' }}>Small tools, small habits — they add up faster than you'd think.</div>
      </Item>
      <Item at={4.0} pop entry={0.55} style={{ left: 0, right: 0, top: 636, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 54, height: 54, borderRadius: 14, background: C.terra, color: '#fff', fontFamily: SERIF, fontSize: 30, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>Ψ</span>
          <span style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 600, color: '#f6f3ee' }}>The MS3 Clerkship Hub</span>
        </div>
      </Item>
      <Item at={4.8} style={{ left: 0, right: 0, top: 716, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 17, color: '#a99c8d' }}>UNE COM · Maine Medical Center – Sanford · Joshua Moss, MD</div>
      </Item>
    </div>
  );
}

// ═════════════════════════════ ROOT ═════════════════════════════════════════
function ClerkshipDayVideo(props) {
  return (
    <Stage width={1920} height={1080} duration={86} background="#f6f3ee" autoplay={props.autoplay} loop={props.loop} persistKey="cw-day">
      <LabelSync />
      <Sprite start={0} end={7.5}><SceneOpen /></Sprite>
      <Sprite start={7} end={22}><Scene1 /></Sprite>
      <Sprite start={22} end={37}><Scene2 /></Sprite>
      <Sprite start={37} end={52}><Scene3 /></Sprite>
      <Sprite start={52} end={67}><Scene4 /></Sprite>
      <Sprite start={67} end={79.4}><Scene5 /></Sprite>
      <Sprite start={7} end={79.4}><DayStrip /></Sprite>
      <Sprite start={79} end={86.01}><SceneClose /></Sprite>
    </Stage>
  );
}

window.ClerkshipDayVideo = ClerkshipDayVideo;
