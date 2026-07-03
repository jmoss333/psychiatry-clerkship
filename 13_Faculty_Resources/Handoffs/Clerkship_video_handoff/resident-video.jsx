// resident-video.jsx — "Yours to Run." Resident onboarding trailer (≈86.5s, 1920×1080)
// Distinct from the MS3 trailer: same brand system, resident-specific narrative —
// the shift to ownership, the deeper hub sections, and the flagship Agitation Ladder drill.
// Uses Stage/Sprite from animations.jsx and ChromeWindow from browser-window.jsx.

const { Stage, Sprite, useTime, useSprite, Easing, clamp } = window;

const SERIF = '"Source Serif 4", Georgia, serif';
const SANS = '"Source Sans 3", "Segoe UI", system-ui, sans-serif';

const C = {
  bg: '#f6f3ee', bgAlt: '#faf6f0', surface: '#ffffff', border: '#ddd3c6', ink: '#3b332c',
  primary: '#c25a3c', primaryDark: '#a84830', primaryLight: '#f3ebe5',
  accent: '#2a6b5e', accentDark: '#1e5248', accentLight: '#edf4f2',
  success: '#357160', successLight: '#e7f1ed',
  warning: '#7a6234', warningLight: '#f5efe2',
  danger: '#a34132', dangerLight: '#fbece9',
  info: '#41618a', infoLight: '#eaf0f6',
  mid: '#64574b', light: '#665a4f',
};
const ACCENTS = {
  teal:  { text: '#8fc9ba', glow: 'rgba(42,107,94,0.32)' },
  terra: { text: '#e2a68e', glow: 'rgba(194,90,60,0.32)' },
  gold:  { text: '#d9b45c', glow: 'rgba(217,160,60,0.28)' },
};
const TONE = {
  accent: { bg: C.accentLight, border: C.accent, text: C.accentDark },
  primary: { bg: C.primaryLight, border: C.primary, text: C.primaryDark },
  danger: { bg: C.dangerLight, border: C.danger, text: C.danger },
  warning: { bg: C.warningLight, border: C.warning, text: C.warning },
  info: { bg: C.infoLight, border: C.info, text: C.info },
  success: { bg: C.successLight, border: C.success, text: C.success },
  neutral: { bg: C.bgAlt, border: C.border, text: C.mid },
};

function LabelSync() {
  const s = Math.floor(useTime());
  React.useEffect(() => {
    const el = document.getElementById('cw-resident-root');
    if (el) el.setAttribute('data-screen-label', 't=' + s + 's');
  }, [s]);
  return null;
}

// ── generic timed item (scene-local clock) ──────────────────────────────────
function Item({ at = 0, until = Infinity, entry = 0.7, exit = 0.45, rise = 22, pop = false, style, children }) {
  const { localTime: lt } = useSprite();
  const pIn = clamp((lt - at) / entry, 0, 1);
  const pOut = until === Infinity ? 1 : clamp((until - lt) / exit, 0, 1);
  if (pIn <= 0 || pOut <= 0) return null;
  const e = pop ? Easing.easeOutBack(pIn) : Easing.easeOutCubic(pIn);
  const opacity = Math.min(Easing.easeOutQuad(pIn), pOut);
  const transform = pop ? `scale(${0.82 + 0.18 * e})` : `translateY(${(1 - e) * rise}px)`;
  return <div style={{ position: 'absolute', opacity, transform, willChange: 'transform,opacity', ...style }}>{children}</div>;
}
function bump(lt, at, dur = 0.35) { return Easing.easeOutBack(clamp((lt - at) / dur, 0, 1)); }
function Chip({ text, tone = 'neutral', style }) {
  const t = TONE[tone];
  return <span style={{ display: 'inline-block', fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: t.text, background: t.bg, border: `1.5px solid ${t.border}`, borderRadius: 999, padding: '7px 15px', whiteSpace: 'nowrap', ...style }}>{text}</span>;
}

// ═══════════════ S0 · Cold open (0–8.1) ══════════════════════════════════════
function SceneOpen() {
  const { localTime: lt } = useSprite();
  const bgO = Math.min(1, lt / 0.6);
  const gx = 960 + Math.sin(lt * 0.42) * 120;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: bgO }}>
      <div style={{ position: 'absolute', inset: 0, background: '#2f2924' }} />
      <div style={{ position: 'absolute', left: gx - 500, top: 130, width: 1000, height: 780, borderRadius: '50%', background: `radial-gradient(circle, ${ACCENTS.teal.glow}, transparent 65%)` }} />
      <Item at={0.6} until={7.5} style={{ left: 0, right: 0, top: 372, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 24, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#c9a86a' }}>PGY-1 · Week 1 of the inpatient block</div>
      </Item>
      <Item at={1.8} until={7.7} style={{ left: 0, right: 0, top: 448, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 84, fontWeight: 600, color: '#f6f3ee', lineHeight: 1.14, letterSpacing: '-0.01em' }}>The chart has your name<br />on it now.</div>
      </Item>
      <Item at={5.0} until={7.9} style={{ left: 0, right: 0, top: 700, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 32, fontWeight: 500, color: '#e2a68e' }}>Same unit. Different weight.</div>
      </Item>
    </div>
  );
}

// ═══════════════ S1 · What changes on day one (7.5–26.6) ════════════════════
const SHIFTS = [
  ['Observe the plan', 'Own the plan'],
  ['Shadow rounds', 'Lead rounds'],
  ['Learn from the team', 'Teach the student behind you'],
];
function ShiftRow({ before, after, i }) {
  const { localTime: lt } = useSprite();
  const at = 1.8 + i * 1.9;
  const pIn = clamp((lt - at) / 0.55, 0, 1);
  const e = Easing.easeOutCubic(pIn);
  const opacity = Easing.easeOutQuad(pIn);
  const arrowPop = bump(lt, at + 0.28, 0.35);
  const afterPop = bump(lt, at + 0.45, 0.4);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 26, opacity, transform: `translateY(${(1 - e) * 18}px)` }}>
      <div style={{ width: 460, textAlign: 'right', fontFamily: SANS, fontSize: 23, color: C.light }}>
        <span style={{ textDecoration: 'line-through', textDecorationColor: C.border, textDecorationThickness: '2px' }}>{before}</span>
      </div>
      <div style={{ width: 44, textAlign: 'center', fontSize: 28, color: C.accent, transform: `scale(${0.5 + 0.5 * arrowPop})` }}>→</div>
      <div style={{ width: 460, fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: C.ink, transform: `scale(${0.85 + 0.15 * afterPop})`, transformOrigin: 'left center', borderBottom: `3px solid ${C.accent}`, paddingBottom: 6, display: 'inline-block' }}>{after}</div>
    </div>
  );
}
function Scene1() {
  const { localTime: lt, duration } = useSprite();
  const sceneO = Math.min(Easing.easeOutQuad(clamp(lt / 0.5, 0, 1)), clamp((duration - lt) / 0.6, 0, 1));
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: sceneO }}>
      <div style={{ position: 'absolute', inset: 0, background: C.bg }} />
      <Item at={0.4} style={{ left: 0, right: 0, top: 128, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>What changes on day one.</div>
      </Item>
      <Item at={0.9} style={{ left: 0, right: 0, top: 210, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 23, color: C.mid }}>You already know the material. Now you carry it.</div>
      </Item>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 340, display: 'flex', flexDirection: 'column', gap: 46, alignItems: 'center' }}>
        {SHIFTS.map(([b, a], i) => <ShiftRow key={i} before={b} after={a} i={i} />)}
      </div>
    </div>
  );
}

// ═══════════════ S2 · Same hub, more depth (26–46.6) ═════════════════════════
const DEPTH_ITEMS = ['Advanced Psychopharmacology', 'Inpatient Systems & Med-Legal', 'Supervision, EPAs & Teaching', 'The Psychiatry Canon (200)'];
const BEDSIDE_TOOLS = ['C-SSRS', 'CIWA-Ar / COWS', 'Violence (FRST)', 'Decisional Capacity', 'Bush-Francis'];

function NavCard() {
  const { localTime: lt } = useSprite();
  const cardE = Easing.easeOutBack(clamp((lt - 1.6) / 0.55, 0, 1));
  return (
    <div style={{ position: 'absolute', left: 250, top: 358, width: 620, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: '0 24px 60px rgba(59,51,44,0.12)', padding: '26px 30px', boxSizing: 'border-box', opacity: Math.min(1, cardE + 0.3), transform: `translateY(${(1 - Math.min(1, cardE)) * 24}px)` }}>
      <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.warning }}>New · Resident depth</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 16 }}>
        {DEPTH_ITEMS.map((t, i) => {
          const at = 2.1 + i * 0.28;
          const p = clamp((lt - at) / 0.4, 0, 1);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 10, background: i === 0 ? C.warningLight : 'transparent', opacity: Easing.easeOutQuad(p), transform: `translateX(${(1 - Easing.easeOutCubic(p)) * -14}px)` }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: C.warning, flex: '0 0 auto' }} />
              <span style={{ fontFamily: SANS, fontSize: 17.5, fontWeight: 600, color: C.ink }}>{t}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function ToolsCard() {
  const { localTime: lt } = useSprite();
  const cardE = Easing.easeOutBack(clamp((lt - 1.9) / 0.55, 0, 1));
  return (
    <div style={{ position: 'absolute', left: 250, top: 700, width: 1420, textAlign: 'center', opacity: Math.min(1, cardE + 0.3), transform: `translateY(${(1 - Math.min(1, cardE)) * 18}px)` }}>
      <div style={{ fontFamily: SANS, fontSize: 19, color: C.mid, marginBottom: 16 }}>Same bedside tools you know — <b style={{ color: C.ink }}>now yours to run under your own name.</b></div>
      <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 12 }}>
        {BEDSIDE_TOOLS.map((t, i) => {
          const at = 2.4 + i * 0.14;
          return <Chip key={i} text={t} tone="accent" style={{ opacity: Easing.easeOutQuad(clamp((lt - at) / 0.4, 0, 1)), transform: `scale(${0.7 + 0.3 * bump(lt, at, 0.4)})` }} />;
        })}
      </div>
    </div>
  );
}
function Scene2() {
  const { localTime: lt, duration } = useSprite();
  const sceneO = Math.min(Easing.easeOutQuad(clamp(lt / 0.5, 0, 1)), clamp((duration - lt) / 0.6, 0, 1));
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: sceneO }}>
      <div style={{ position: 'absolute', inset: 0, background: C.bg }} />
      <Item at={0.4} style={{ left: 0, right: 0, top: 138, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>Same hub. More depth.</div>
      </Item>
      <Item at={0.9} style={{ left: 0, right: 0, top: 220, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 22, color: C.mid, maxWidth: 900, margin: '0 auto' }}>The clinical spine you already know — built out for fluency, not fundamentals.</div>
      </Item>
      <NavCard />
      <ToolsCard />
    </div>
  );
}

// ═══════════════ S3 · Signature tool: Agitation Ladder drill (46–70.6) ═══════
const RUNGS = ['Verbal de-escalation & environment', 'Offer oral medication', 'Reduce stimulation / 1:1', 'IM medication (involuntary)', 'Seclusion / restraint — last resort'];
const T = { vignette: 0.6, decision: 3.0, select: 4.4, feedback: 5.4, rung1: 6.8, partial: 7.4, stop: 10.0, resolve: 13.2, debrief: 16.2 };
const DRIVERS = ['Delirium', 'Intox / withdrawal', 'Psychosis / mania', 'Akathisia', 'Pain / fear'];

function rungVisual(i, lt) {
  if (i === 0) return lt >= T.rung1 ? 'done' : 'pending';
  if (i === 1) return lt >= T.resolve ? 'done' : (lt >= T.partial ? 'active' : 'pending');
  if (i === 3) return lt >= T.stop ? 'blocked' : 'pending';
  return 'na';
}
function LadderRail() {
  const { localTime: lt } = useSprite();
  return (
    <div style={{ position: 'absolute', left: 40, top: 40, width: 340 }}>
      <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a99c8d', marginBottom: 14 }}>Least-restrictive ladder</div>
      {RUNGS.map((r, i) => {
        const state = rungVisual(i, lt);
        const cfg = {
          done: { bg: 'rgba(143,201,186,0.14)', border: '#8fc9ba', dot: '#8fc9ba', text: '#f6f3ee', tag: 'resolved here', tagColor: '#8fc9ba' },
          active: { bg: 'rgba(143,201,186,0.08)', border: 'rgba(143,201,186,0.5)', dot: '#8fc9ba', text: '#f6f3ee', tag: 'now', tagColor: '#8fc9ba' },
          blocked: { bg: 'rgba(214,110,90,0.12)', border: '#d66e5a', dot: '#d66e5a', text: '#f6f3ee', tag: 'blocked', tagColor: '#d66e5a' },
          pending: { bg: 'transparent', border: 'rgba(246,243,238,0.16)', dot: 'rgba(246,243,238,0.3)', text: 'rgba(246,243,238,0.55)', tag: null },
          na: { bg: 'transparent', border: 'rgba(246,243,238,0.08)', dot: 'rgba(246,243,238,0.15)', text: 'rgba(246,243,238,0.28)', tag: null },
        }[state];
        const justChanged = Math.abs(lt - (i === 0 ? T.rung1 : i === 1 ? T.partial : i === 3 ? T.stop : 0)) < 0.35;
        return (
          <div key={i} style={{ position: 'relative', marginBottom: 10, padding: '13px 14px', borderRadius: 12, background: cfg.bg, border: `1.5px solid ${cfg.border}`, transform: justChanged ? `scale(${1 + 0.02 * bump(lt, lt)})` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 22, height: 22, borderRadius: 11, flex: '0 0 auto', background: state === 'done' ? cfg.dot : 'transparent', border: state === 'done' ? 'none' : `2px solid ${cfg.dot}`, color: '#1e2420', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {state === 'done' ? '✓' : state === 'blocked' ? '✕' : i + 1}
              </span>
              <span style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: state === 'pending' || state === 'na' ? 400 : 700, color: cfg.text, lineHeight: 1.3, textDecoration: state === 'blocked' ? 'line-through' : 'none' }}>{r}</span>
            </div>
            {cfg.tag && <div style={{ position: 'absolute', right: 10, top: -9, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#1e2420', background: cfg.tagColor, borderRadius: 999, padding: '3px 9px' }}>{cfg.tag}</div>}
          </div>
        );
      })}
      <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${lt >= T.stop && lt < T.resolve + 1.5 ? '#8fc9ba' : 'rgba(246,243,238,0.16)'}`, background: lt >= T.stop && lt < T.resolve + 1.5 ? 'rgba(143,201,186,0.1)' : 'transparent', transform: lt >= T.resolve && lt < T.resolve + 0.4 ? `scale(${1 + 0.03 * bump(lt, T.resolve)})` : 'none' }}>
        <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: '#f6f3ee' }}>📞 Call your senior</div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: '#a99c8d', marginTop: 2 }}>always available · scored correct</div>
      </div>
    </div>
  );
}

function AgitationDrillDemo() {
  const { localTime: lt } = useSprite();
  const driverRevealed = lt >= T.feedback;
  return (
    <div style={{ position: 'relative', width: 1560, height: 716, fontFamily: SANS }}>
      {/* header */}
      <div style={{ position: 'absolute', left: 420, top: 8, fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a99c8d' }}>Ψ Resident Rotation · Agitation Ladder — PRN Trainer</div>
      <div style={{ position: 'absolute', right: 40, top: 4, fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: '#a99c8d' }}>Drill mode · Scenario 4 of 12</div>

      {/* vignette card */}
      <div style={{ position: 'absolute', left: 420, top: 46, width: 1100, background: 'rgba(246,243,238,0.05)', border: '1px solid rgba(246,243,238,0.14)', borderRadius: 14, padding: '18px 22px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: '#f6f3ee' }}>"Room 12 is pulling at lines."</div>
          <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, borderRadius: 999, padding: '5px 13px', background: driverRevealed ? 'rgba(143,201,186,0.18)' : 'rgba(246,243,238,0.1)', color: driverRevealed ? '#8fc9ba' : '#a99c8d', transform: driverRevealed ? `scale(${1 + 0.06 * bump(lt, T.feedback)})` : 'none' }}>
            Driver — {driverRevealed ? 'Delirium ✓' : '?'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {['fluctuating attention', 'tremor', 'recent surgery'].map((c, i) => (
            <span key={i} style={{ fontFamily: SANS, fontSize: 13, color: '#cfc5b8', border: '1px solid rgba(246,243,238,0.18)', borderRadius: 999, padding: '5px 12px' }}>{c}</span>
          ))}
        </div>
      </div>

      {/* decision row (driver select) */}
      <Item at={T.decision} until={T.rung1 + 0.8} style={{ left: 420, top: 210, width: 1100 }}>
        <div style={{ fontFamily: SANS, fontSize: 15, color: '#cfc5b8', marginBottom: 10 }}>Decision 1 — likely driver?</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {DRIVERS.map((d, i) => {
            const selected = d === 'Delirium' && lt >= T.select;
            return (
              <span key={i} style={{ fontFamily: SANS, fontSize: 15, fontWeight: selected ? 700 : 500, padding: '10px 18px', borderRadius: 999, border: `1.5px solid ${selected ? '#8fc9ba' : 'rgba(246,243,238,0.2)'}`, background: selected ? 'rgba(143,201,186,0.16)' : 'transparent', color: selected ? '#8fc9ba' : '#cfc5b8', transform: selected ? `scale(${1 + 0.05 * bump(lt, T.select)})` : 'none' }}>{d}</span>
            );
          })}
        </div>
        <Item at={T.feedback} style={{ left: 0, top: 62 }}>
          <div style={{ fontFamily: SANS, fontSize: 15, color: '#8fc9ba' }}>✓ Fluctuating attention + recent surgery → delirium, not psychosis.</div>
        </Item>
      </Item>

      {/* partial-effect + hard stop + resolution, staged in same slot */}
      <Item at={T.partial} until={T.stop + 0.2} style={{ left: 420, top: 210, width: 1100 }}>
        <div style={{ fontFamily: SANS, fontSize: 16, color: '#f6f3ee', fontWeight: 600 }}>Verbal de-escalation + reorientation — partial effect. Patient still pulling at lines.</div>
      </Item>
      <Item at={T.stop} until={T.resolve + 0.3} entry={0.4} style={{ left: 420, top: 268, width: 1100 }}>
        <div style={{ background: 'rgba(214,110,90,0.14)', border: '1.5px solid #d66e5a', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#e8a396' }}>Considered: IM lorazepam</div>
          <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: '#f6f3ee', marginTop: 6 }}>STOP — benzodiazepines worsen delirium in older adults.</div>
        </div>
      </Item>
      <Item at={T.resolve} entry={0.4} style={{ left: 420, top: 268, width: 1100 }}>
        <div style={{ background: 'rgba(143,201,186,0.12)', border: '1.5px solid #8fc9ba', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8fc9ba' }}>Instead</div>
          <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: '#f6f3ee', marginTop: 6 }}>Low-dose antipsychotic if needed, reduce stimulation, sitter at bedside — and call your senior.</div>
        </div>
      </Item>

      {/* debrief */}
      <Item at={T.debrief} entry={0.5} rise={26} style={{ left: 420, top: 470, width: 1100 }}>
        <div style={{ background: 'rgba(217,160,60,0.1)', border: '1.5px solid #d9b45c', borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#d9b45c', marginBottom: 8 }}>Debrief</div>
          <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 600, color: '#f6f3ee' }}>Treat the driver — not the behavior.</div>
          <div style={{ fontFamily: SANS, fontSize: 14, color: '#cfc5b8', marginTop: 8 }}>Richmond 2012 · Project BETA verbal de-escalation</div>
        </div>
      </Item>

      <LadderRail />
    </div>
  );
}

function Scene3() {
  const { localTime: lt, duration } = useSprite();
  const sceneO = Math.min(Easing.easeOutQuad(clamp(lt / 0.5, 0, 1)), clamp((duration - lt) / 0.6, 0, 1));
  const winP = clamp((lt - 0.5) / 0.8, 0, 1);
  const winIn = Easing.easeOutCubic(winP);
  const zoom = 1 + 0.025 * clamp(lt / Math.max(0.1, duration - 1), 0, 1);
  const insP = clamp((lt - (duration - 2.2)) / 0.5, 0, 1);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: sceneO }}>
      <div style={{ position: 'absolute', inset: 0, background: '#2f2924' }} />
      <div style={{ position: 'absolute', left: 960 - 520, top: 30, width: 1040, height: 960, borderRadius: '50%', background: `radial-gradient(circle, ${ACCENTS.teal.glow}, transparent 65%)` }} />
      <div style={{ position: 'absolute', left: 96, top: 50, fontFamily: SANS, fontSize: 14, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(246,243,238,0.5)' }}>Ψ&nbsp;&nbsp;Resident Rotation</div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 50, textAlign: 'center', fontFamily: SANS, fontSize: 15, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8fc9ba' }}>The 2am call, before it happens</div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 82, textAlign: 'center', fontFamily: SERIF, fontSize: 40, fontWeight: 700, color: '#f6f3ee' }}>Agitation Ladder — PRN Trainer</div>
      <div style={{ position: 'absolute', left: 180, top: 160, width: 1560, height: 800, opacity: winIn, transform: `translateY(${(1 - winIn) * 40}px) scale(${zoom})`, transformOrigin: 'center top' }}>
        <window.ChromeWindow width={1560} height={800} url="resident-rotation/tools/rp-agitation">
          <div style={{ position: 'relative', width: 1560, height: 716, background: '#2f2924' }}><AgitationDrillDemo /></div>
        </window.ChromeWindow>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 992, textAlign: 'center', opacity: insP, transform: `translateY(${(1 - insP) * 14}px)` }}>
        <span style={{ display: 'inline-block', background: 'rgba(246,243,238,0.96)', color: '#2f2924', fontFamily: SERIF, fontStyle: 'italic', fontWeight: 600, fontSize: 22, borderRadius: 999, padding: '13px 30px', boxShadow: '0 14px 34px rgba(0,0,0,0.3)' }}>Practice the 2am call before you're in it.</span>
      </div>
    </div>
  );
}

// ═══════════════ S4 · Four weeks, real autonomy (70–78.6) ════════════════════
const WEEK_BEATS = ['Wk 1 — absorb the census', 'Wk 2 — carry more, lead a meeting', 'Wk 3 — run the list, supervise the student', 'Wk 4 — teach back, disposition'];
function Scene4() {
  const { localTime: lt, duration } = useSprite();
  const sceneO = Math.min(Easing.easeOutQuad(clamp(lt / 0.5, 0, 1)), clamp((duration - lt) / 0.6, 0, 1));
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: sceneO }}>
      <div style={{ position: 'absolute', inset: 0, background: C.bg }} />
      <Item at={0.4} style={{ left: 0, right: 0, top: 340, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 54, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>Four weeks. Real patients. Real autonomy.</div>
      </Item>
      <Item at={1.0} style={{ left: 0, right: 0, top: 424, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 22, color: C.mid }}>Feedback tied to ACGME milestones and EPAs — bring an agenda to supervision.</div>
      </Item>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 512, display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', padding: '0 260px' }}>
        {WEEK_BEATS.map((w, i) => {
          const at = 1.8 + i * 0.16;
          return <Chip key={i} text={w} tone="primary" style={{ fontSize: 15.5, opacity: Easing.easeOutQuad(clamp((lt - at) / 0.4, 0, 1)), transform: `scale(${0.7 + 0.3 * bump(lt, at, 0.4)})` }} />;
        })}
      </div>
    </div>
  );
}

// ═══════════════ S5 · Close (78–86.6) ════════════════════════════════════════
function SceneClose() {
  const { localTime: lt } = useSprite();
  const gx = 960 + Math.sin(lt * 0.38) * 120;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: '#2f2924' }} />
      <div style={{ position: 'absolute', left: gx - 500, top: 140, width: 1000, height: 760, borderRadius: '50%', background: `radial-gradient(circle, ${ACCENTS.gold.glow}, transparent 65%)` }} />
      <Item at={0.6} style={{ left: 0, right: 0, top: 400, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 76, fontWeight: 700, color: '#f6f3ee', letterSpacing: '-0.01em' }}>Yours to run.</div>
      </Item>
      <Item at={2.2} style={{ left: 0, right: 0, top: 524, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 26, color: '#d9c9a3' }}>Same evidence base. Graduated autonomy. A student watching how you do it.</div>
      </Item>
      <Item at={3.8} pop entry={0.55} style={{ left: 0, right: 0, top: 636, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 54, height: 54, borderRadius: 14, background: '#c25a3c', color: '#fff', fontFamily: SERIF, fontSize: 30, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>Ψ</span>
          <span style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 700, color: '#f6f3ee' }}>MMC Psychiatry · Resident Rotation</span>
        </div>
      </Item>
      <Item at={4.6} style={{ left: 0, right: 0, top: 716, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 17, color: '#a99c8d' }}>Sanford Behavioral Health Unit · Joshua Moss, MD</div>
      </Item>
    </div>
  );
}

// ═════════════════════════════ ROOT ═════════════════════════════════════════
// Single-segment export: pass segment={"Open"|"Shift"|"Hub"|"Drill"|"FourWeek"|"Close"|"All"}
// (or ?segment=FourWeek in the iframe's URL) to isolate one beat instead of the full reel.
const SEGMENTS = {
  Open: { Comp: SceneOpen, dur: 8.1 },
  Shift: { Comp: Scene1, dur: 19.1 },
  Hub: { Comp: Scene2, dur: 20.6 },
  Drill: { Comp: Scene3, dur: 24.6 },
  FourWeek: { Comp: Scene4, dur: 8.6 },
  Close: { Comp: SceneClose, dur: 8.7 },
};

function ResidentOnboardingVideo(props) {
  const key = props.segment && props.segment !== 'All' ? props.segment : null;
  const solo = key ? SEGMENTS[key] : null;

  if (solo) {
    const { Comp, dur } = solo;
    return (
      <Stage width={1920} height={1080} duration={dur} background="#f6f3ee" autoplay={props.autoplay} loop={props.loop} persistKey={'cw-resident-' + key}>
        <LabelSync />
        <Sprite start={0} end={dur}><Comp /></Sprite>
      </Stage>
    );
  }

  return (
    <Stage width={1920} height={1080} duration={86.7} background="#f6f3ee" autoplay={props.autoplay} loop={props.loop} persistKey="cw-resident">
      <LabelSync />
      <Sprite start={0} end={8.1}><SceneOpen /></Sprite>
      <Sprite start={7.5} end={26.6}><Scene1 /></Sprite>
      <Sprite start={26} end={46.6}><Scene2 /></Sprite>
      <Sprite start={46} end={70.6}><Scene3 /></Sprite>
      <Sprite start={70} end={78.6}><Scene4 /></Sprite>
      <Sprite start={78} end={86.7}><SceneClose /></Sprite>
    </Stage>
  );
}

window.ResidentOnboardingVideo = ResidentOnboardingVideo;
