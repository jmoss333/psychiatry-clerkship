// intro-video.jsx — "Welcome to the Clerkship Hub" trailer (78s, 1920×1080)
// Composes Stage/Sprite from animations.jsx (loaded first via x-import).

const { Stage, Sprite, useTime, useSprite, Easing, interpolate, clamp } = window;

const SERIF = '"Source Serif 4", Georgia, serif';
const SANS = '"Source Sans 3", "Segoe UI", system-ui, sans-serif';

const C = {
  bg: '#f6f3ee', bgAlt: '#faf6f0', ink: '#2f2924', surface: '#ffffff', border: '#ddd3c6',
  terra: '#c25a3c', terraDark: '#a84830', terraLight: '#f3ebe5',
  teal: '#2a6b5e', tealDark: '#1e5248', tealLight: '#edf4f2',
  gold: '#7a6234', goldLight: '#f5efe2',
  success: '#357160', successLight: '#e7f1ed',
  mid: '#51473d', light: '#665a4f',
};

// ── generic timed item (scene-local clock) ──────────────────────────────────
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

// ── data-screen-label sync (t=Ns) ───────────────────────────────────────────
function LabelSync() {
  const s = Math.floor(useTime());
  React.useEffect(() => {
    const el = document.getElementById('cw-video-root');
    if (el) el.setAttribute('data-screen-label', 't=' + s + 's');
  }, [s]);
  return null;
}

// ═════════════════════════════ SCENE 1 · Hook (0–9.2) ═══════════════════════
function Scene1() {
  const { localTime: lt } = useSprite();
  const bgO = interpolate([0, 8.2, 9.2], [1, 1, 0])(lt);
  const gx = 960 + Math.sin(lt * 0.5) * 130;
  const gy = 470 + Math.cos(lt * 0.34) * 70;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: bgO }}>
      <div style={{ position: 'absolute', inset: 0, background: C.ink }} />
      <div style={{ position: 'absolute', left: gx - 520, top: gy - 400, width: 1040, height: 800, borderRadius: '50%', background: 'radial-gradient(circle, rgba(42,107,94,0.17), transparent 65%)' }} />
      <Item at={0.6} until={7.5} style={{ left: 0, right: 0, top: 372, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 24, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#c9a86a' }}>
          7:02 am · your first morning on the unit
        </div>
      </Item>
      <Item at={1.8} until={7.7} style={{ left: 0, right: 0, top: 448, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 88, fontWeight: 600, color: '#f6f3ee', lineHeight: 1.12, letterSpacing: '-0.01em' }}>
          Day one of<br />inpatient psychiatry.
        </div>
      </Item>
      <Item at={5.0} until={7.9} style={{ left: 0, right: 0, top: 718, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 34, fontWeight: 500, color: '#e2a68e' }}>
          Where do you even start?
        </div>
      </Item>
    </div>
  );
}

// ═════════════════════ SCENE 2 · Scatter → one hub (9–18.2) ═════════════════
const SCATTER = [
  { label: '17 open UpToDate tabs',    x: 340,  y: 340, r: -7, from: [-320, 250],  d: 0.0 },
  { label: 'PDF from your attending',  x: 1500, y: 320, r: 6,  from: [2260, 250],  d: 0.15 },
  { label: 'Qbank subscription',       x: 310,  y: 790, r: 5,  from: [-280, 880],  d: 0.3 },
  { label: 'Photo of a pocket card',   x: 1540, y: 780, r: -5, from: [2280, 840],  d: 0.45 },
  { label: 'Group-chat advice',        x: 650,  y: 950, r: -3, from: [540, 1290],  d: 0.6 },
  { label: 'A YouTube rabbit hole',    x: 1230, y: 960, r: 4,  from: [1350, 1300], d: 0.75 },
];

function ScatterCard({ s, i, lt }) {
  const enterT = 0.8 + s.d;
  const e = Easing.easeOutCubic(clamp((lt - enterT) / 0.85, 0, 1));
  if (e <= 0) return null;
  const cv = Easing.easeInCubic(clamp((lt - 3.4 - s.d * 0.1) / 0.8, 0, 1));
  let X = s.from[0] + (s.x - s.from[0]) * e;
  let Y = s.from[1] + (s.y - s.from[1]) * e;
  const wob = e >= 1 ? 1 - cv : 0;
  Y += Math.sin(lt * 1.5 + i * 1.7) * 7 * wob;
  const rot = s.r * (1 - cv) + Math.sin(lt * 1.2 + i) * 1.5 * wob;
  X += (960 - X) * cv;
  Y += (600 - Y) * cv;
  const op = clamp((lt - enterT) / 0.4, 0, 1) * (1 - cv);
  const sc = 1 - 0.55 * cv;
  return (
    <div style={{ position: 'absolute', left: X, top: Y, transform: `translate(-50%,-50%) rotate(${rot}deg) scale(${sc})`, opacity: op, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 6px 24px rgba(47,41,36,0.09)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 10, height: 10, borderRadius: 6, background: [C.terra, C.teal, C.gold][i % 3], flex: '0 0 auto' }} />
      <span style={{ fontFamily: SANS, fontSize: 19, color: C.mid, whiteSpace: 'nowrap' }}>{s.label}</span>
    </div>
  );
}

const HUB_ROWS = [
  ['Six-week guided curriculum', C.teal],
  ['15 interactive bedside tools', C.terra],
  ['50 landmark trials on audio', C.gold],
  ['Shelf, COMAT & OSCE prep', C.teal],
];

function Scene2() {
  const { localTime: lt } = useSprite();
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Item at={0.35} until={3.2} style={{ left: 0, right: 0, top: 186, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 500, color: C.mid }}>Day one usually looks like this:</div>
      </Item>
      {SCATTER.map((s, i) => <ScatterCard key={i} s={s} i={i} lt={lt} />)}
      <Item at={5.2} until={8.4} style={{ left: 0, right: 0, top: 170, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 58, fontWeight: 600, color: C.ink, letterSpacing: '-0.01em' }}>Now it all lives in one place.</div>
      </Item>
      <Item at={6.0} until={8.4} style={{ left: 0, right: 0, top: 262, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 23, color: C.mid }}>Guides · bedside tools · audio · exam prep — built for this rotation.</div>
      </Item>
      {/* hub mini-card */}
      <Item at={4.1} until={8.5} pop entry={0.6} style={{ left: 650, top: 396, width: 620 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: '0 24px 70px rgba(47,41,36,0.16)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '14px 18px', background: C.bgAlt, borderBottom: `1px solid ${C.border}` }}>
            {['#e0b4a4', '#d9c08e', '#a9c4bb'].map((c, i) => <span key={i} style={{ width: 11, height: 11, borderRadius: 6, background: c }} />)}
          </div>
          <div style={{ padding: '24px 28px 26px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
              <div style={{ width: 52, height: 52, borderRadius: 13, background: C.terra, color: '#fff', fontFamily: SERIF, fontSize: 30, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Ψ</div>
              <div>
                <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: C.ink }}>Inpatient Psychiatry</div>
                <div style={{ fontFamily: SANS, fontSize: 15, color: C.light }}>MS3 Clerkship Hub · works on your phone</div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {HUB_ROWS.map(([txt, col], i) => (
                <Item key={i} at={4.6 + i * 0.22} entry={0.45} style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 16px' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 5, background: col }} />
                    <span style={{ fontFamily: SANS, fontSize: 18, fontWeight: 600, color: C.mid }}>{txt}</span>
                  </div>
                </Item>
              ))}
            </div>
          </div>
        </div>
      </Item>
    </div>
  );
}

// ═══════════════════ SCENE 3 · Six-week arc (18–30.2) ═══════════════════════
const WEEKS = [
  { n: 1, t: 'Foundations',                 d: ['Interview & MSE', 'Capacity · admission note'], c: C.teal },
  { n: 2, t: 'Mood, Psychosis & Pharm',     d: ['The major diagnoses', 'Choosing medications'],  c: C.terra },
  { n: 3, t: 'Psychotherapy & Personality', d: ['Therapeutic relationship', 'DBT-informed care'], c: C.gold },
  { n: 4, t: 'Family & Systems',            d: ['Family meetings', 'Expressed emotion'],          c: C.terra, badge: 'Signature focus' },
  { n: 5, t: 'Acute & Emergency',           d: ['Agitation · delirium', 'Catatonia · withdrawal'], c: C.teal },
  { n: 6, t: 'Integration & Exam',          d: ['Disposition planning', 'Shelf + OSCE prep'],      c: C.gold },
];

function Scene3() {
  const { localTime: lt } = useSprite();
  const uw = interpolate([0.9, 1.7], [0, 260], Easing.easeOutCubic)(lt);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Item at={0.5} until={11.5} style={{ left: 0, right: 0, top: 146, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 54, fontWeight: 600, color: C.ink, letterSpacing: '-0.01em' }}>Built as a six-week arc.</div>
      </Item>
      <div style={{ position: 'absolute', left: 960 - uw / 2, top: 222, width: uw, height: 4, borderRadius: 2, background: C.terra }} />
      <Item at={1.2} until={11.4} style={{ left: 0, right: 0, top: 250, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 23, color: C.mid }}>Each week has its goals, readings, skills — and the tools to practice them.</div>
      </Item>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + lt * 0.0035})`, transformOrigin: '960px 520px' }}>
        {WEEKS.map((w, i) => (
          <Item key={i} at={1.7 + i * 0.32} until={11.2} entry={0.65} rise={48} style={{ left: 108 + i * 288, top: 330, width: 264 }}>
            <div style={{ position: 'relative', background: C.surface, border: `1px solid ${C.border}`, borderTop: `4px solid ${w.c}`, borderRadius: 14, boxShadow: '0 10px 34px rgba(47,41,36,0.08)', padding: '22px 22px 20px', height: 356, boxSizing: 'border-box' }}>
              {w.badge && (
                <Item at={5.6} entry={0.5} pop style={{ top: -16, right: 12 }}>
                  <div style={{ background: C.gold, color: '#fff', fontFamily: SANS, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 999, padding: '5px 12px', whiteSpace: 'nowrap' }}>{w.badge}</div>
                </Item>
              )}
              <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.light }}>Week</div>
              <div style={{ fontFamily: SERIF, fontSize: 68, fontWeight: 600, color: w.c, lineHeight: 1, margin: '4px 0 10px' }}>{w.n}</div>
              <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 600, color: C.ink, lineHeight: 1.25, minHeight: 78 }}>{w.t}</div>
              <div style={{ height: 1, background: C.border, margin: '12px 0 14px' }} />
              {w.d.map((d, j) => (
                <div key={j} style={{ display: 'flex', alignItems: 'baseline', gap: 9, margin: '7px 0' }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: w.c, flex: '0 0 auto', transform: 'translateY(-2px)' }} />
                  <span style={{ fontFamily: SANS, fontSize: 15.5, color: C.mid, lineHeight: 1.35 }}>{d}</span>
                </div>
              ))}
            </div>
          </Item>
        ))}
      </div>
      <Item at={7.5} until={11.3} style={{ left: 0, right: 0, top: 796, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 28, fontWeight: 500, color: C.mid }}>The same strong foundation, wherever you are in the year.</div>
      </Item>
    </div>
  );
}

// ═══════════════════ SCENE 4 · Guided UI tour (30–52.2) ═════════════════════
// Browser at (180,90) 1560×920. Sidebar 180→500, content 500→1740.

const NAV = [
  { h: 'Start here', items: [['Welcome to the Rotation'], ['Core Reading List'], ['Orientation Packet']] },
  { h: 'Six-week curriculum', items: [['Week 1 — Foundations'], ['Week 2 — Mood · Psychosis · Pharm'], ['Week 3 — Psychotherapy'], ['Week 4 — Family & Systems'], ['Week 5 — Acute & Emergency'], ['Week 6 — Integration & Exam']] },
  { h: 'Interactive tools', items: [['Mental Status Exam', 1], ['The Interview Circle', 1], ['Columbia C-SSRS', 1], ['Decisional Capacity', 1], ['Withdrawal: CIWA-Ar / COWS', 1]] },
  { h: 'Evidence & reading', items: [['Landmark Trials — Listen & Test'], ['COMAT & Shelf Review']] },
];
const ROW_H = 30;
let __y = 292;
const NAV_POS = NAV.map(sec => {
  const hy = __y; __y += 34;
  const iys = sec.items.map(() => { const v = __y; __y += ROW_H; return v; });
  __y += 10;
  return { hy, iys };
});
// click targets
const T_WEEK1 = { x: 340, y: NAV_POS[1].iys[0] + 15 };   // Week 1 row
const T_MSE   = { x: 340, y: NAV_POS[2].iys[0] + 15 };   // MSE tool row
const T_CHIP  = { x: 883, y: 372 };                      // "guarded" chip in tool
const CLICK_W1 = 35.8, CLICK_MSE = 43.6, CLICK_CHIP = 47.2;

function xfade(t, tIn, tOut) {
  const a = tIn == null ? 1 : clamp((t - tIn) / 0.4, 0, 1);
  const b = tOut == null ? 1 : 1 - clamp((t - tOut) / 0.4, 0, 1);
  return Math.min(a, b);
}

function NavRow({ label, tool, y, state }) {
  // state: 'off' | 'hover' | 'on'
  const bg = state === 'on' ? C.teal : state === 'hover' ? C.terraLight : 'transparent';
  const col = state === 'on' ? '#fff' : C.ink;
  return (
    <div style={{ position: 'absolute', left: 22, top: y, width: 276, height: ROW_H - 4, borderRadius: 6, background: bg, color: col, display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px', boxSizing: 'border-box', fontFamily: SANS, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {tool && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', background: state === 'on' ? '#fff' : C.tealDark, color: state === 'on' ? C.tealDark : '#fff', borderRadius: 999, padding: '1.5px 7px', flex: '0 0 auto' }}>tool</span>}
    </div>
  );
}

function Sidebar({ t }) {
  const activeKey = t < CLICK_W1 ? '0-0' : t < CLICK_MSE ? '1-0' : '2-0';
  const hoverKey = (t >= 35.2 && t < CLICK_W1) ? '1-0' : (t >= 43.0 && t < CLICK_MSE) ? '2-0' : null;
  return (
    <div style={{ position: 'absolute', left: 180, top: 154, width: 320, height: 856, background: C.bgAlt, borderRight: `1px solid ${C.border}`, borderRadius: '0 0 0 18px' }}>
      <div style={{ position: 'absolute', left: 22, top: 16, fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: C.terra }}>Inpatient Psychiatry</div>
      <div style={{ position: 'absolute', left: 22, top: 46, fontFamily: SANS, fontSize: 13, color: C.light }}>MS3 clerkship · Joshua Moss, MD</div>
      <div style={{ position: 'absolute', left: 22, top: 78, width: 276, height: 34, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 12px', boxSizing: 'border-box', fontFamily: SANS, fontSize: 13.5, color: C.light }}>Search the library…</div>
      {NAV.map((sec, si) => (
        <React.Fragment key={si}>
          <div style={{ position: 'absolute', left: 28, top: NAV_POS[si].hy - 154 + 6, fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.light }}>{sec.h}</div>
          {sec.items.map(([label, tool], ii) => {
            const key = si + '-' + ii;
            const state = key === activeKey ? 'on' : key === hoverKey ? 'hover' : 'off';
            return <NavRowShifted key={key} label={label} tool={tool} y={NAV_POS[si].iys[ii] - 154} state={state} />;
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
// rows positioned relative to sidebar top (154)
function NavRowShifted(props) { return <NavRow {...props} />; }

function ChipRow({ items, y, extraSelected }) {
  let x = 540;
  return (
    <React.Fragment>
      {items.map(([label, w, sel], i) => {
        const left = x; x += w + 12;
        const isSel = sel || (extraSelected && extraSelected.i === i && extraSelected.on);
        return (
          <div key={i} style={{ position: 'absolute', left, top: y, width: w, height: 42, borderRadius: 999, border: `1.5px solid ${isSel ? C.teal : C.border}`, background: isSel ? C.teal : C.surface, color: isSel ? '#fff' : C.mid, fontFamily: SANS, fontSize: 15.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
            {label}
          </div>
        );
      })}
    </React.Fragment>
  );
}

function PaneWelcome() {
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', left: 540, top: 196, fontFamily: SERIF, fontSize: 36, fontWeight: 600, color: C.terra }}>Welcome to the Rotation</div>
      <div style={{ position: 'absolute', left: 540, top: 252, fontFamily: SANS, fontSize: 16, color: C.light }}>UNE COM third-year clerkship · Maine Medical Center – Sanford · Joshua Moss, MD</div>
      <div style={{ position: 'absolute', left: 540, top: 300, width: 1060, fontFamily: SANS, fontSize: 17, lineHeight: 1.65, color: C.mid }}>
        This rotation is built as a structured six-week arc — so wherever you are in the year, you get the
        same strong foundation in inpatient psychiatry, and leave ready for the shelf and your sub-internship.
      </div>
      <div style={{ position: 'absolute', left: 540, top: 396, width: 1060, fontFamily: SANS, fontSize: 17, lineHeight: 1.65, color: C.mid }}>
        You'll work as part of the treatment team: interview and follow patients, build differentials and
        formulations, present on rounds, and practice safe, evidence-based management under supervision.
      </div>
      <div style={{ position: 'absolute', left: 540, top: 508, width: 1060, background: C.tealLight, borderLeft: `4px solid ${C.teal}`, borderRadius: '0 10px 10px 0', padding: '18px 22px', boxSizing: 'border-box' }}>
        <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.tealDark, marginBottom: 6 }}>Start here</div>
        <div style={{ fontFamily: SERIF, fontSize: 20, color: C.ink, lineHeight: 1.45 }}>Move through the rotation by week, topic, or tool. Nothing is required reading — it's all here whenever it's useful.</div>
      </div>
    </React.Fragment>
  );
}

function PaneWeek1() {
  const checks = ['Observe a full intake interview, then lead one', 'Present one patient on rounds every day', 'Draft your first admission note by Friday'];
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', left: 540, top: 196, fontFamily: SERIF, fontSize: 36, fontWeight: 600, color: C.terra }}>Week 1 — Foundations</div>
      <ChipRow y={258} items={[['Interview', 118, 0], ['MSE', 84, 0], ['Capacity', 118, 0], ['Admission note', 172, 0]].map(([l, w]) => [l, w, false])} />
      <div style={{ position: 'absolute', left: 540, top: 330, width: 1060, background: C.tealLight, borderLeft: `4px solid ${C.teal}`, borderRadius: '0 10px 10px 0', padding: '18px 22px', boxSizing: 'border-box' }}>
        <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.tealDark, marginBottom: 6 }}>In 30 seconds</div>
        <div style={{ fontFamily: SERIF, fontSize: 21, color: C.ink, lineHeight: 1.4 }}>Learn to run a psychiatric interview, document the mental status exam, and write an admission note that holds up on rounds.</div>
      </div>
      {checks.map((c, i) => (
        <div key={i} style={{ position: 'absolute', left: 540, top: 476 + i * 44, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 24, height: 24, borderRadius: 12, background: C.successLight, border: `1.5px solid ${C.success}`, color: C.success, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS }}>✓</span>
          <span style={{ fontFamily: SANS, fontSize: 17.5, color: C.mid }}>{c}</span>
        </div>
      ))}
      <div style={{ position: 'absolute', left: 540, top: 626, display: 'flex', alignItems: 'center', gap: 12, fontFamily: SANS }}>
        <span style={{ fontSize: 15.5, fontWeight: 700, color: C.light }}>This week's tools:</span>
        {['MSE builder', 'Capacity assessor'].map((tl, i) => (
          <span key={i} style={{ background: C.surface, border: `1.5px solid ${C.teal}`, color: C.tealDark, borderRadius: 999, padding: '7px 16px', fontSize: 15, fontWeight: 600 }}>{tl} ↗</span>
        ))}
      </div>
    </React.Fragment>
  );
}

function PaneMSE({ t }) {
  const guardedOn = t >= CLICK_CHIP;
  const noteExtraO = clamp((t - CLICK_CHIP - 0.25) / 0.4, 0, 1);
  const label = (txt, y) => (
    <div style={{ position: 'absolute', left: 540, top: y, fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.light }}>{txt}</div>
  );
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', left: 540, top: 196, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 600, color: C.terra }}>Mental Status Exam</span>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: C.tealDark, color: '#fff', borderRadius: 999, padding: '4px 12px', fontFamily: SANS }}>tool</span>
      </div>
      <div style={{ position: 'absolute', left: 540, top: 252, fontFamily: SANS, fontSize: 16, color: C.light }}>Tap through the exam — it writes the note for you.</div>
      {label('Appearance & behavior', 320)}
      <ChipRow y={350} items={[['calm', 100, true], ['cooperative', 158, true], ['guarded', 122, guardedOn], ['disheveled', 142, false]]} />
      {label('Speech', 430)}
      <ChipRow y={460} items={[['normal rate', 150, true], ['pressured', 130, false], ['latent', 100, false], ['monotone', 134, false]]} />
      {label('Thought process', 540)}
      <ChipRow y={570} items={[['linear', 100, true], ['circumstantial', 172, false], ['tangential', 144, false], ['loose associations', 208, false]]} />
      <div style={{ position: 'absolute', left: 540, top: 654, width: 1160, background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', boxSizing: 'border-box' }}>
        <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.light, marginBottom: 8 }}>Generated note</div>
        <div style={{ fontFamily: SANS, fontSize: 17.5, lineHeight: 1.55, color: C.ink }}>
          Calm and cooperative, no psychomotor abnormality. Speech normal in rate and tone. Thought process linear and goal-directed.
          <span style={{ opacity: noteExtraO, color: C.tealDark }}> Mildly guarded on initial approach.</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 540, top: 806, width: 170, height: 46, background: C.teal, color: '#fff', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontSize: 16, fontWeight: 700 }}>Copy to note</div>
    </React.Fragment>
  );
}

function Browser({ t }) {
  const wO = xfade(t, null, CLICK_W1 + 0.1);
  const w1O = xfade(t, CLICK_W1 + 0.25, CLICK_MSE + 0.1);
  const mO = xfade(t, CLICK_MSE + 0.25, null);
  return (
    <div style={{ position: 'absolute', left: 180, top: 90, width: 1560, height: 920, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: '0 30px 90px rgba(47,41,36,0.18)' }}>
      {/* chrome */}
      <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 64, background: C.bgAlt, borderBottom: `1px solid ${C.border}`, borderRadius: '18px 18px 0 0' }}>
        <div style={{ position: 'absolute', left: 24, top: 26, display: 'flex', gap: 8 }}>
          {['#e0b4a4', '#d9c08e', '#a9c4bb'].map((c, i) => <span key={i} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}
        </div>
        <div style={{ position: 'absolute', left: 700, top: 15, width: 520, height: 34, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: SANS, fontSize: 14, color: C.light }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: C.success }} />
          psych-clerkship · private hub · no login
        </div>
      </div>
      {/* body clip */}
      <div style={{ position: 'absolute', left: 0, top: 64, right: 0, bottom: 0, overflow: 'hidden', borderRadius: '0 0 18px 18px' }}>
        <div style={{ position: 'absolute', left: -180, top: -154, width: 1920, height: 1080 }}>
          {/* content bg */}
          <div style={{ position: 'absolute', left: 500, top: 154, width: 1240, height: 856, background: C.surface }} />
          <Sidebar t={t} />
          <div style={{ position: 'absolute', inset: 0, opacity: wO, transform: `translateY(${(1 - wO) * 10}px)` }}>{wO > 0 && <PaneWelcome />}</div>
          <div style={{ position: 'absolute', inset: 0, opacity: w1O, transform: `translateY(${(1 - w1O) * 10}px)` }}>{w1O > 0 && <PaneWeek1 />}</div>
          <div style={{ position: 'absolute', inset: 0, opacity: mO, transform: `translateY(${(1 - mO) * 10}px)` }}>{mO > 0 && <PaneMSE t={t} />}</div>
        </div>
      </div>
    </div>
  );
}

// cursor + ripples
const WAYPOINTS = [
  [33.0, 1250, 980], [34.2, 640, 700], [35.3, T_WEEK1.x, T_WEEK1.y + 2], [36.4, T_WEEK1.x, T_WEEK1.y + 2],
  [37.8, 820, 420], [40.0, 900, 620], [42.0, 620, 760], [43.0, T_MSE.x, T_MSE.y + 2], [44.4, T_MSE.x, T_MSE.y + 2],
  [45.6, 700, 520], [46.7, T_CHIP.x, T_CHIP.y], [48.0, T_CHIP.x, T_CHIP.y], [49.2, 1240, 760], [51.0, 1880, 1140],
];
const WT = WAYPOINTS.map(w => w[0]);
const WX = WAYPOINTS.map(w => w[1]);
const WY = WAYPOINTS.map(w => w[2]);
const CLICKS = [
  [CLICK_W1, T_WEEK1.x, T_WEEK1.y], [CLICK_MSE, T_MSE.x, T_MSE.y], [CLICK_CHIP, T_CHIP.x, T_CHIP.y],
];

function Cursor({ t }) {
  if (t < 32.8 || t > 51.4) return null;
  const x = interpolate(WT, WX, Easing.easeInOutCubic)(t);
  const y = interpolate(WT, WY, Easing.easeInOutCubic)(t);
  const opacity = Math.min(clamp((t - 33) / 0.5, 0, 1), clamp((51.2 - t) / 0.5, 0, 1));
  let bump = 0;
  for (const [ct] of CLICKS) {
    const dt = Math.abs(t - ct);
    if (dt < 0.2) bump = Math.max(bump, 1 - dt / 0.2);
  }
  const scale = 1 - 0.18 * bump;
  return (
    <React.Fragment>
      {CLICKS.map(([ct, cx, cy], i) => {
        const rp = (t - ct) / 0.55;
        if (rp <= 0 || rp >= 1) return null;
        const r = 12 + rp * 64;
        return <div key={i} style={{ position: 'absolute', left: cx - r / 2, top: cy - r / 2, width: r, height: r, borderRadius: '50%', border: `3px solid ${C.teal}`, opacity: (1 - rp) * 0.8 }} />;
      })}
      <svg width="34" height="34" viewBox="0 0 24 24" style={{ position: 'absolute', left: x - 5, top: y - 4, opacity, transform: `scale(${scale})`, transformOrigin: '5px 4px', filter: 'drop-shadow(0 2px 5px rgba(47,41,36,0.35))' }}>
        <path d="M5 3l7 16 2.2-6.2L20 10.5z" fill="#2f2924" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </React.Fragment>
  );
}

function Pill({ t, t0, t1, x, y, text }) {
  const pIn = Easing.easeOutBack(clamp((t - t0) / 0.5, 0, 1));
  const pOut = 1 - clamp((t - t1) / 0.35, 0, 1);
  const opacity = Math.min(clamp((t - t0) / 0.35, 0, 1), pOut);
  if (opacity <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%,-50%)' }}>
      <div style={{ transform: `scale(${0.8 + 0.2 * pIn})`, opacity, background: 'rgba(47,41,36,0.93)', color: '#f6f3ee', fontFamily: SANS, fontSize: 21, fontWeight: 600, borderRadius: 999, padding: '13px 26px', whiteSpace: 'nowrap', boxShadow: '0 10px 30px rgba(47,41,36,0.25)' }}>{text}</div>
    </div>
  );
}

function Scene4() {
  const t = useTime();
  const { localTime: lt } = useSprite();
  const K = [33, 34.4, 37.3, 38.8, 41.3, 42.4, 44.6, 46, 48.8, 50.2];
  const fx = interpolate(K, [960, 510, 510, 1080, 1080, 510, 510, 1080, 1080, 960], Easing.easeInOutCubic)(t);
  const fy = interpolate(K, [540, 505, 505, 470, 470, 700, 700, 518, 518, 540], Easing.easeInOutCubic)(t);
  const z = interpolate([30, ...K], [0.99, 1.03, 1.75, 1.75, 1.5, 1.5, 1.75, 1.75, 1.62, 1.62, 1], Easing.easeInOutCubic)(t);
  const frameIn = Easing.easeOutCubic(clamp((lt - 0.3) / 0.9, 0, 1));
  const frameOut = clamp((52 - t) / 1.1, 0, 1);
  const opacity = Math.min(frameIn, Easing.easeOutQuad(frameOut));
  if (opacity <= 0) return null;
  const scale = 0.955 + 0.045 * frameIn;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${960 - fx * z}px, ${540 - fy * z}px) scale(${z})`, transformOrigin: '0 0' }}>
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${scale})`, transformOrigin: '960px 550px' }}>
          <Browser t={t} />
          <Pill t={t} t0={31.6} t1={33.2} x={960} y={1000} text="The whole rotation · one private hub" />
          <Pill t={t} t0={38.9} t1={41.4} x={1080} y={790} text="Each week: goals · readings · skills · tools" />
          <Pill t={t} t0={46.3} t1={49.1} x={1080} y={820} text="15 interactive tools, built for the bedside" />
        </div>
        <Cursor t={t} />
      </div>
    </div>
  );
}

// ═══════════════ SCENE 5 · Listen & test (52–63.2) ══════════════════════════
const BAR_SEED = Array.from({ length: 44 }, (_, i) => 0.35 + 0.65 * Math.abs(Math.sin(i * 2.7 + 1.3)));

function AudioCard() {
  const { localTime: lt } = useSprite();
  const playFrac = clamp((lt - 2.2) / 8.6, 0, 1);
  const secs = Math.floor(playFrac * 110);
  const mmss = `0:${String(secs).padStart(2, '0')}`;
  const pulse = 1 + 0.04 * Math.sin(lt * 3.4);
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: '0 14px 44px rgba(47,41,36,0.10)', padding: '26px 30px', width: 640, height: 430, boxSizing: 'border-box' }}>
      <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: C.tealLight, color: C.tealDark, border: `1px solid ${C.teal}`, borderRadius: 999, padding: '5px 13px' }}>Landmark trials · listen & test</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 26 }}>
        <div style={{ width: 64, height: 64, borderRadius: 32, background: C.teal, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${pulse})`, boxShadow: '0 6px 18px rgba(42,107,94,0.35)' }}>
          <svg width="22" height="22" viewBox="0 0 14 14"><path d="M3.5 2l9 5-9 5V2z" fill="#fff" /></svg>
        </div>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 23, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>Kane 1988 — Clozapine in treatment-resistant schizophrenia</div>
          <div style={{ fontFamily: SANS, fontSize: 15, color: C.light, marginTop: 4 }}>Episode 4 of 50 · 1:50</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: 78, marginTop: 28 }}>
        {BAR_SEED.map((h, i) => {
          const wobble = 0.75 + 0.25 * Math.sin(lt * 3 + i * 0.55);
          const played = i / 44 < playFrac;
          return <div key={i} style={{ width: 6, height: Math.max(8, 78 * h * wobble), borderRadius: 3, background: played ? C.teal : '#e3dbcf' }} />;
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SANS, fontSize: 14, color: C.light, marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>
        <span>{mmss}</span><span>1:50</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 16, color: C.mid, marginTop: 18, lineHeight: 1.5 }}>Fifty landmark trials, each summarized in about two minutes — with a quiz to lock it in.</div>
    </div>
  );
}

function ShelfCard() {
  const { localTime: lt } = useSprite();
  const revealed = lt >= 6.2;
  const opts = [['A', 'Augment with lithium'], ['B', 'Switch to haloperidol'], ['C', 'Start clozapine'], ['D', 'Add cognitive remediation']];
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: '0 14px 44px rgba(47,41,36,0.10)', padding: '26px 30px', width: 640, height: 430, boxSizing: 'border-box' }}>
      <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: C.goldLight, color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 999, padding: '5px 13px' }}>Shelf mode · exam simulation</span>
      <div style={{ fontFamily: SANS, fontSize: 18.5, color: C.ink, lineHeight: 1.45, marginTop: 22 }}>
        After adequate trials of risperidone and olanzapine, a 34-year-old man's psychosis persists. Best next step?
      </div>
      <div style={{ display: 'grid', gap: 9, marginTop: 18 }}>
        {opts.map(([k, txt], i) => {
          const isC = k === 'C';
          const on = revealed && isC;
          const dim = revealed && !isC;
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1.5px solid ${on ? C.success : C.border}`, background: on ? C.successLight : C.surface, borderRadius: 10, padding: '9px 14px', opacity: dim ? 0.45 : 1 }}>
              <span style={{ width: 26, height: 26, borderRadius: 13, background: on ? C.success : C.bgAlt, color: on ? '#fff' : C.mid, border: on ? 'none' : `1px solid ${C.border}`, fontFamily: SANS, fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on ? '✓' : k}</span>
              <span style={{ fontFamily: SANS, fontSize: 16.5, fontWeight: on ? 700 : 400, color: C.ink }}>{txt}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 15, color: C.light, marginTop: 16 }}>Every explanation links back to the trial you just heard.</div>
    </div>
  );
}

function Scene5() {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Item at={0.6} until={9.9} style={{ left: 0, right: 0, top: 148, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 600, color: C.ink, letterSpacing: '-0.01em' }}>For the gaps in your day.</div>
      </Item>
      <Item at={1.2} until={9.9} style={{ left: 0, right: 0, top: 226, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 22, color: C.mid }}>Pre-rounds coffee. The drive home. The night before the shelf.</div>
      </Item>
      <Item at={1.8} until={10.3} entry={0.65} rise={40} style={{ left: 250, top: 306 }}><AudioCard /></Item>
      <Item at={2.4} until={10.3} entry={0.65} rise={40} style={{ left: 1030, top: 306 }}><ShelfCard /></Item>
    </div>
  );
}

// ═══════════════ SCENE 6 · Close + CTA (62.8–78) ════════════════════════════
function Scene6() {
  const { localTime: lt } = useSprite();
  const bgO = interpolate([0, 1.3], [0, 1])(lt);
  const gx = 960 + Math.sin(lt * 0.4) * 140;
  const gy = 520 + Math.cos(lt * 0.3) * 80;
  const ctaPulse = 1 + 0.015 * Math.sin(lt * 2.2);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: C.ink, opacity: bgO }} />
      <div style={{ position: 'absolute', left: gx - 520, top: gy - 400, width: 1040, height: 800, borderRadius: '50%', background: 'radial-gradient(circle, rgba(194,90,60,0.13), transparent 65%)', opacity: bgO }} />
      <Item at={1.6} until={6.3} style={{ left: 0, right: 0, top: 448, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 62, fontWeight: 600, color: '#f6f3ee', letterSpacing: '-0.01em' }}>Nothing here is required reading.</div>
      </Item>
      <Item at={3.4} until={6.4} style={{ left: 0, right: 0, top: 552, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 27, color: '#a9c4bb' }}>It's all here the moment you need it.</div>
      </Item>
      <Item at={7.0} style={{ left: 0, right: 0, top: 316, textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 92, height: 92, borderRadius: 22, background: C.terra, color: '#fff', fontFamily: SERIF, fontSize: 52, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 40px rgba(194,90,60,0.35)' }}>Ψ</div>
          <div style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 600, color: '#f6f3ee', marginTop: 26 }}>Inpatient Psychiatry</div>
          <div style={{ fontFamily: SANS, fontSize: 22, color: '#d8cec3', marginTop: 8 }}>The MS3 Clerkship Hub</div>
          <div style={{ fontFamily: SANS, fontSize: 17, color: '#a99c8d', marginTop: 18 }}>UNE COM · Maine Medical Center – Sanford · Joshua Moss, MD</div>
        </div>
      </Item>
      <Item at={10.0} pop entry={0.55} style={{ left: 0, right: 0, top: 748, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', transform: `scale(${ctaPulse})`, background: C.terra, color: '#fff', fontFamily: SANS, fontSize: 26, fontWeight: 700, borderRadius: 999, padding: '20px 46px', boxShadow: '0 14px 40px rgba(194,90,60,0.4)' }}>
          Start with Week 1 →
        </div>
      </Item>
      <Item at={11.5} style={{ left: 0, right: 0, top: 862, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 15, color: '#8b7f72' }}>Linked in your orientation email · works on any phone</div>
      </Item>
    </div>
  );
}

// ═════════════════════════════ ROOT ═════════════════════════════════════════
function ClerkshipIntroVideo(props) {
  return (
    <Stage width={1920} height={1080} duration={78} background="#f6f3ee" autoplay={props.autoplay} loop={props.loop} persistKey="cw-intro">
      <LabelSync />
      <Sprite start={0} end={9.2}><Scene1 /></Sprite>
      <Sprite start={9} end={18.2}><Scene2 /></Sprite>
      <Sprite start={18} end={30.2}><Scene3 /></Sprite>
      <Sprite start={30} end={52.2}><Scene4 /></Sprite>
      <Sprite start={52} end={63.2}><Scene5 /></Sprite>
      <Sprite start={62.8} end={78.01}><Scene6 /></Sprite>
    </Stage>
  );
}

window.ClerkshipIntroVideo = ClerkshipIntroVideo;
