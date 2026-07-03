// toolspotlight-video.jsx — "Six tools, one tap away." Tool spotlight series (≈88s, 1920×1080)
// Recreates 6 real bedside tools inside a browser window, each with one live interaction.
// Uses Stage/Sprite from animations.jsx and ChromeWindow from browser-window.jsx.

const { Stage, Sprite, useTime, useSprite, Easing, animate, clamp } = window;

const SERIF = '"Source Serif 4", Georgia, serif';
const SANS = '"Source Sans 3", "Segoe UI", system-ui, sans-serif';
const INK = '#2f2924';

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

function LabelSync() {
  const s = Math.floor(useTime());
  React.useEffect(() => {
    const el = document.getElementById('cw-tools-root');
    if (el) el.setAttribute('data-screen-label', 't=' + s + 's');
  }, [s]);
  return null;
}

// ── shared micro-helpers ─────────────────────────────────────────────────────
function introStyle(lt, delay, dur = 0.5, rise = 16) {
  const p = clamp((lt - delay) / dur, 0, 1);
  const e = Easing.easeOutCubic(p);
  return { opacity: Easing.easeOutQuad(p), transform: `translateY(${(1 - e) * rise}px)` };
}
function bump(lt, at, dur = 0.35) {
  return Easing.easeOutBack(clamp((lt - at) / dur, 0, 1));
}
const TONE = {
  accent: { bg: C.accentLight, border: C.accent, text: C.accentDark },
  primary: { bg: C.primaryLight, border: C.primary, text: C.primaryDark },
  danger: { bg: C.dangerLight, border: C.danger, text: C.danger },
  warning: { bg: C.warningLight, border: C.warning, text: C.warning },
  info: { bg: C.infoLight, border: C.info, text: C.info },
  success: { bg: C.successLight, border: C.success, text: C.success },
  neutral: { bg: C.bgAlt, border: C.border, text: C.mid },
};
function Chip({ text, tone = 'neutral', style }) {
  const t = TONE[tone];
  return <span style={{ display: 'inline-block', fontFamily: SANS, fontSize: 15, fontWeight: 700, color: t.text, background: t.bg, border: `1.5px solid ${t.border}`, borderRadius: 999, padding: '7px 16px', whiteSpace: 'nowrap', ...style }}>{text}</span>;
}

// ═══════════════════════ 1 · The Interview Circle ═══════════════════════════
const IC_NODES = [
  { label: 'HPI — the story', tone: 'primary' },
  { label: 'Family & social', tone: 'accent' },
  { label: 'Safety & risk', tone: 'danger' },
  { label: 'Substances', tone: 'accent' },
  { label: 'Psychiatric hx', tone: 'accent' },
];
function InterviewCircleDemo() {
  const { localTime: lt } = useSprite();
  const cx = 390, cy = 350, R = 205;
  const pts = IC_NODES.map((n, i) => {
    const deg = i * 72 - 90;
    const rad = deg * Math.PI / 180;
    return { ...n, x: cx + R * Math.cos(rad), y: cy + R * Math.sin(rad) };
  });
  // traveling dot: hub -> Safety (index 2) -> hub
  const safety = pts[2];
  const segT = clamp((lt - 3.4) / 1.4, 0, 1);
  let dotX = null, dotY = null, dotOp = 0;
  if (segT > 0 && segT < 1) {
    const out = segT < 0.5;
    const local = Easing.easeInOutCubic(out ? segT / 0.5 : (segT - 0.5) / 0.5);
    dotX = out ? cx + (safety.x - cx) * local : safety.x + (cx - safety.x) * local;
    dotY = out ? cy + (safety.y - cy) * local : safety.y + (cy - safety.y) * local;
    dotOp = Math.sin(Math.PI * segT);
  }
  return (
    <div style={{ position: 'relative', width: 1560, height: 716, fontFamily: SANS }}>
      <svg width={780} height={716} style={{ position: 'absolute', left: 0, top: 0 }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.accent} strokeWidth="2" strokeDasharray="3 9" opacity="0.5" />
        {dotOp > 0 && <circle cx={dotX} cy={dotY} r="9" fill={C.accentDark} opacity={dotOp} />}
      </svg>
      <div style={{ position: 'absolute', left: cx, top: cy, width: 168, height: 168, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: C.accentLight, border: `2px solid ${C.accent}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', boxShadow: '0 6px 20px rgba(59,51,44,0.1)' }}>
        <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, color: C.accentDark, lineHeight: 1.15 }}>The<br />conversation</div>
        <div style={{ fontSize: 11, color: C.light, marginTop: 5, maxWidth: 120, lineHeight: 1.3 }}>follow the affect in the room</div>
      </div>
      {pts.map((n, i) => (
        <div key={i} style={{ position: 'absolute', left: n.x, top: n.y, width: 190, transform: `translate(-50%,-50%) scale(${0.7 + 0.3 * bump(lt, 0.9 + i * 0.22)})`, opacity: Easing.easeOutQuad(clamp((lt - 0.9 - i * 0.22) / 0.4, 0, 1)), background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${TONE[n.tone].border}`, borderRadius: 12, padding: '13px 14px', boxShadow: '0 6px 18px rgba(59,51,44,0.08)', fontSize: 14.5, fontWeight: 700, color: C.ink }}>
          {n.label}
        </div>
      ))}
      <div style={{ position: 'absolute', left: 860, top: 40, width: 660 }}>
        <div style={{ ...introStyle(lt, 0.3), fontFamily: SERIF, fontSize: 29, fontWeight: 700, color: C.ink, lineHeight: 1.25 }}>The interview is a circle, not a checklist.</div>
        <div style={{ ...introStyle(lt, 0.6), fontSize: 17, color: C.mid, lineHeight: 1.55, marginTop: 18 }}>Open where the patient opens a door, gather that arc, then return to center — but some domains you <b style={{ color: C.ink }}>never skip</b>.</div>
        <div style={{ ...introStyle(lt, 1.0), display: 'flex', flexDirection: 'column', gap: 10, marginTop: 26 }}>
          {[['Anchor — start with the story', 'primary'], ['Gather — the information arcs', 'accent'], ['Never skip — safety & risk', 'danger']].map(([t, tone], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: TONE[tone].border }} />
              <span style={{ fontSize: 15, color: C.mid }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════ 2 · Decisional Capacity ═════════════════════════════
const CAP_ROWS = [
  { name: '1 · Communicate a choice', def: 'Expresses and maintains a clear decision.', fixed: 'intact' },
  { name: '2 · Understand the information', def: 'Can paraphrase diagnosis, options, risks & benefits.', animAt: 2.0, to: 'intact' },
  { name: '3 · Appreciate the situation', def: 'Applies the diagnosis and consequences to self.', animAt: 4.0, to: 'impaired' },
  { name: '4 · Reason about options', def: 'Compares options with a consistent rationale.', fixed: 'na' },
];
function SegRow({ state }) {
  const opts = [['intact', 'Intact', C.success], ['impaired', 'Impaired', C.danger], ['na', 'N/A', C.light]];
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
      {opts.map(([k, label, col]) => (
        <div key={k} style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: SANS, background: state === k ? col : C.surface, color: state === k ? '#fff' : C.mid }}>{label}</div>
      ))}
    </div>
  );
}
function CapacityDemo() {
  const { localTime: lt } = useSprite();
  const verdictOn = lt >= 4.3;
  return (
    <div style={{ position: 'relative', width: 1560, height: 716, fontFamily: SANS }}>
      {CAP_ROWS.map((r, i) => {
        const y = 40 + i * 128;
        const state = r.fixed || (lt >= r.animAt ? r.to : 'pending');
        const justChanged = r.animAt && Math.abs(lt - r.animAt) < 0.35;
        return (
          <div key={i} style={{ position: 'absolute', left: 40, top: y, width: 760, minHeight: 112, background: C.surface, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.accent}`, borderRadius: 12, padding: '16px 20px', boxSizing: 'border-box', transform: justChanged ? `scale(${1 + 0.02 * bump(lt, r.animAt)})` : 'none' }}>
            <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, color: C.accentDark }}>{r.name}</div>
            <div style={{ fontSize: 13.5, color: C.mid, marginTop: 3 }}>{r.def}</div>
            <SegRow state={state} />
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 840, top: 40, width: 680, textAlign: 'center', background: verdictOn ? C.warningLight : C.bgAlt, border: `1.5px solid ${verdictOn ? C.warning : C.border}`, borderRadius: 12, padding: '16px 20px', boxSizing: 'border-box', fontFamily: SANS, fontSize: 18, fontWeight: 700, color: verdictOn ? C.warning : C.light, transform: `scale(${1 + 0.03 * bump(lt, 4.3)})` }}>
        {verdictOn ? 'Partial capacity — further evaluation needed' : 'Assessing…'}
      </div>
      <div style={{ position: 'absolute', left: 840, top: 128, width: 680, background: C.accentLight, border: `1px solid ${C.accent}`, borderRadius: 12, padding: '20px 24px', boxSizing: 'border-box', opacity: Easing.easeOutQuad(clamp((lt - 5.0) / 0.6, 0, 1)), transform: `translateY(${(1 - Easing.easeOutCubic(clamp((lt - 5.0) / 0.6, 0, 1))) * 16}px)` }}>
        <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.accentDark, marginBottom: 10 }}>Generated capacity note</div>
        <div style={{ fontFamily: SANS, fontSize: 16.5, lineHeight: 1.7, color: C.ink }}>
          Communicated a clear, consistent choice and paraphrased the relevant information accurately. Did not appreciate how the diagnosis and its consequences apply to his own situation. Recommend psychoeducation and re-assessment; consider psychiatry consult.
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════ 3 · Violence Risk (FRST) ════════════════════════════
const V_SIGNS = ['Escalating restlessness / pacing', 'Clenched fists or jaw', 'Invading personal space', 'Loud or threatening speech', 'Prolonged hostile staring', 'Direct verbal threats', 'Banging or throwing objects', 'Prior assault this admission'];
const V_CHECK_AT = { 0: 2.6, 1: 3.2, 5: 3.8 };
function ViolenceDemo() {
  const { localTime: lt } = useSprite();
  const checkedCount = Object.values(V_CHECK_AT).filter(t => lt >= t).length;
  const acting = checkedCount >= 3;
  return (
    <div style={{ position: 'relative', width: 1560, height: 716, fontFamily: SANS }}>
      <div style={{ position: 'absolute', left: 40, top: 40, width: 720, height: 190, background: C.infoLight, border: `1px solid ${C.info}`, borderTop: `4px solid ${C.info}`, borderRadius: 12, padding: '18px 22px', boxSizing: 'border-box' }}>
        <Chip text="Static — what rarely changes" tone="info" />
        <ul style={{ margin: '12px 0 0', padding: '0 0 0 20px', fontSize: 14.5, color: C.ink, lineHeight: 1.6 }}>
          <li><b>Prior violence</b> — the strongest predictor</li>
          <li>History of weapon use</li>
          <li>Childhood conduct problems</li>
        </ul>
      </div>
      <div style={{ position: 'absolute', left: 800, top: 40, width: 720, height: 190, background: C.accentLight, border: `1px solid ${C.accent}`, borderTop: `4px solid ${C.accent}`, borderRadius: 12, padding: '18px 22px', boxSizing: 'border-box' }}>
        <Chip text="Dynamic — what you can change now" tone="accent" />
        <ul style={{ margin: '12px 0 0', padding: '0 0 0 20px', fontSize: 14.5, color: C.ink, lineHeight: 1.6 }}>
          <li>Acute intoxication</li>
          <li>Untreated psychosis or mania</li>
          <li>Pain, fear, or perceived provocation</li>
        </ul>
      </div>
      <div style={{ position: 'absolute', left: 40, top: 254, fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.light }}>Imminent warning signs — tap what you observe</div>
      {V_SIGNS.map((s, i) => {
        const col = i % 2 === 0 ? 0 : 1;
        const row = Math.floor(i / 2);
        const checkedT = V_CHECK_AT[i];
        const on = checkedT != null && lt >= checkedT;
        return (
          <div key={i} style={{ position: 'absolute', left: 40 + col * 760, top: 288 + row * 62, width: 720, height: 50, display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${C.border}`, background: C.surface, borderRadius: 10, padding: '0 16px', boxSizing: 'border-box', transform: checkedT && Math.abs(lt - checkedT) < 0.3 ? `scale(${1 + 0.02 * bump(lt, checkedT)})` : 'none' }}>
            <span style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${C.accent}`, background: on ? C.accent : 'transparent', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{on ? '✓' : ''}</span>
            <span style={{ fontSize: 14.5, color: C.ink }}>{s}</span>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 40, top: 548, width: 1480, borderRadius: 12, padding: '18px 20px', textAlign: 'center', boxSizing: 'border-box', fontFamily: SANS, fontSize: 18, fontWeight: 700, background: acting ? C.dangerLight : C.successLight, color: acting ? C.danger : C.success, border: `1.5px solid ${acting ? C.danger : C.success}`, transform: `scale(${1 + 0.02 * bump(lt, 4.1)})` }}>
        {acting ? '3+ signs present — escalate now: notify charge nurse, ensure exit access, consider PRN.' : 'No acute action needed — continue routine monitoring.'}
      </div>
    </div>
  );
}

// ═══════════════════════ 4 · Withdrawal: CIWA-Ar / COWS ══════════════════════
function MiniBar({ val, max, w = 620 }) {
  const pct = clamp(val / max, 0, 1) * 100;
  const color = val >= max * 0.7 ? C.danger : val >= max * 0.4 ? C.warning : C.success;
  return (
    <div style={{ width: w, height: 8, background: C.bgAlt, borderRadius: 4, overflow: 'hidden', marginTop: 7 }}>
      <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: 4 }} />
    </div>
  );
}
function WithdrawalDemo() {
  const { localTime: lt } = useSprite();
  const tremor = animate({ from: 2, to: 5, start: 2.0, end: 3.2, ease: Easing.easeInOutCubic })(lt);
  const agitation = animate({ from: 1, to: 4, start: 3.6, end: 4.8, ease: Easing.easeInOutCubic })(lt);
  const items = [
    { label: 'Nausea / vomiting', val: 2 },
    { label: 'Tremor', val: tremor },
    { label: 'Paroxysmal sweats', val: 1 },
    { label: 'Anxiety', val: 2 },
    { label: 'Agitation', val: agitation },
  ];
  const score = Math.round(items.reduce((a, it) => a + it.val, 0) + 1); // +1 hidden baseline items
  const band = score < 10 ? { label: 'Low', tone: 'success' } : score < 19 ? { label: 'Moderate', tone: 'warning' } : { label: 'Severe', tone: 'danger' };
  const needlePct = clamp(score / 20, 0, 1) * 100;
  return (
    <div style={{ position: 'relative', width: 1560, height: 716, fontFamily: SANS }}>
      <div style={{ position: 'absolute', left: 40, top: 22, display: 'flex', gap: 4, borderBottom: `2px solid ${C.border}` }}>
        <div style={{ padding: '9px 18px', fontSize: 15, fontWeight: 700, color: C.primaryDark, borderBottom: `3px solid ${C.primaryDark}` }}>CIWA-Ar (alcohol)</div>
        <div style={{ padding: '9px 18px', fontSize: 15, fontWeight: 600, color: C.light }}>COWS (opioid)</div>
      </div>
      {items.map((it, i) => (
        <div key={i} style={{ position: 'absolute', left: 40, top: 90 + i * 88, width: 880, height: 78, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 20px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 15.5, fontWeight: 700, color: C.ink }}>{it.label}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.mid, fontVariantNumeric: 'tabular-nums' }}>{it.val.toFixed(0)} / 7</span>
          </div>
          <MiniBar val={it.val} max={7} />
        </div>
      ))}
      <div style={{ position: 'absolute', left: 980, top: 90, width: 540, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 26px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.light }}>CIWA-Ar score</div>
        <div style={{ fontFamily: SERIF, fontSize: 58, fontWeight: 700, color: C.ink, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{score}</div>
        <div style={{ display: 'inline-block', marginTop: 6, padding: '5px 16px', borderRadius: 999, fontSize: 14, fontWeight: 700, background: TONE[band.tone].bg, color: TONE[band.tone].text, border: `1px solid ${TONE[band.tone].border}` }}>{band.label}</div>
        <div style={{ position: 'relative', height: 14, borderRadius: 999, overflow: 'hidden', display: 'flex', marginTop: 22 }}>
          <div style={{ width: '45%', background: C.success }} />
          <div style={{ width: '30%', background: C.warning }} />
          <div style={{ width: '25%', background: C.danger }} />
          <div style={{ position: 'absolute', top: -5, left: `calc(${needlePct}% - 2px)`, width: 4, height: 24, background: C.ink, borderRadius: 2, boxShadow: `0 0 0 3px ${C.surface}` }} />
        </div>
        <div style={{ fontSize: 15, color: C.mid, lineHeight: 1.55, marginTop: 22 }}>Scheduled benzodiazepine dosing per protocol; reassess hourly while symptomatic.</div>
      </div>
    </div>
  );
}

// ═══════════════════════ 5 · Bush-Francis Catatonia Scale ════════════════════
function CatatoniaDemo() {
  const { localTime: lt } = useSprite();
  const item2 = animate({ from: 0, to: 2, start: 2.2, end: 2.6 })(lt);
  const item7 = animate({ from: 0, to: 1, start: 3.4, end: 3.8 })(lt);
  const severity = Math.round(item2 + item7);
  const positive = lt >= 3.9;
  const squares = Array.from({ length: 23 }, (_, i) => (i === 2 ? item2 : i === 7 ? item7 : 0));
  const sevColor = (v) => v <= 0 ? C.bgAlt : v === 1 ? C.warningLight : v === 2 ? '#e8c98a' : C.danger;
  return (
    <div style={{ position: 'relative', width: 1560, height: 716, fontFamily: SANS }}>
      <div style={{ position: 'absolute', left: 40, top: 40, fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: C.ink }}>23 items · Bush-Francis Catatonia Rating Scale</div>
      <div style={{ position: 'absolute', left: 40, top: 84, width: 760, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {squares.map((v, i) => (
          <div key={i} style={{ width: 54, height: 40, borderRadius: 7, background: Math.round(v) > 0 ? sevColor(Math.round(v)) : C.bgAlt, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: C.light, transform: (i === 2 || i === 7) ? `scale(${1 + 0.06 * bump(lt, i === 2 ? 2.2 : 3.4)})` : 'none' }}>{i + 1}</div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 40, top: 200, display: 'flex', gap: 16, fontSize: 13, color: C.light }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: C.bgAlt, border: `1px solid ${C.border}`, marginRight: 6 }} />0 none</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: C.warningLight, marginRight: 6 }} />1 mild</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#e8c98a', marginRight: 6 }} />2 moderate</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: C.danger, marginRight: 6 }} />3 marked</span>
      </div>
      <div style={{ position: 'absolute', left: 840, top: 40, width: 330, height: 190, background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', boxSizing: 'border-box', textAlign: 'center' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.light }}>Screen · items 1–14</div>
        <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 700, marginTop: 14, color: positive ? C.danger : C.accent, transform: `scale(${1 + 0.04 * bump(lt, 3.9)})` }}>{positive ? 'POSITIVE' : 'Negative'}</div>
        <div style={{ fontSize: 12.5, color: C.light, marginTop: 10 }}>≥2 items scored ≥1</div>
      </div>
      <div style={{ position: 'absolute', left: 1200, top: 40, width: 320, height: 190, background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', boxSizing: 'border-box', textAlign: 'center' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.light }}>Severity total</div>
        <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 700, marginTop: 14, color: C.warning }}>{severity} <span style={{ fontSize: 18, color: C.light, fontWeight: 400 }}>/ 69</span></div>
      </div>
      <div style={{ position: 'absolute', left: 840, top: 254, width: 680, background: C.accentLight, border: `1px solid ${C.accent}`, borderRadius: 12, padding: '18px 22px', boxSizing: 'border-box', opacity: Easing.easeOutQuad(clamp((lt - 4.3) / 0.5, 0, 1)), transform: `translateY(${(1 - Easing.easeOutCubic(clamp((lt - 4.3) / 0.5, 0, 1))) * 14}px)` }}>
        <div style={{ fontSize: 16, color: C.accentDark, fontWeight: 700 }}>Screen positive →</div>
        <div style={{ fontSize: 15.5, color: C.ink, lineHeight: 1.55, marginTop: 4 }}>Consider the lorazepam challenge: 1–2 mg IV/IM, reassess in 5–10 minutes.</div>
      </div>
    </div>
  );
}

// ═══════════════════════ 6 · Algorithms & Decision Aids ══════════════════════
function DecisionAidsDemo() {
  const { localTime: lt } = useSprite();
  const ruleOutChips = ['Delirium', 'NMS', 'Serotonin syndrome', 'Substance intox / withdrawal'];
  const thenChips = ['Primary psychiatric', 'Mood disorder', 'Psychotic disorder'];
  const rungs = ['Verbal de-escalation & environment', 'Offer oral medication', 'IM medication', 'Seclusion / restraint — last resort'];
  const rungAt = [2.6, 4.0, 5.2, 6.4];
  return (
    <div style={{ position: 'relative', width: 1560, height: 716, fontFamily: SANS }}>
      <div style={{ position: 'absolute', left: 40, top: 30, width: 740, minHeight: 150, background: C.dangerLight, border: `1px solid ${C.danger}`, borderRadius: 12, padding: '18px 22px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.danger }}>Rule out first</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {ruleOutChips.map((c, i) => <Chip key={i} text={c} tone="danger" style={{ ...introStyle(lt, 1.0 + i * 0.15, 0.4, 8) }} />)}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 40, top: 192, width: 740, textAlign: 'center', fontSize: 26, color: C.light }}>↓</div>
      <div style={{ position: 'absolute', left: 40, top: 224, width: 740, minHeight: 120, background: C.accentLight, border: `1px solid ${C.accent}`, borderRadius: 12, padding: '18px 22px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.accentDark }}>Then consider</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {thenChips.map((c, i) => <Chip key={i} text={c} tone="accent" style={{ ...introStyle(lt, 2.2 + i * 0.15, 0.4, 8) }} />)}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 820, top: 30, fontFamily: SERIF, fontSize: 21, fontWeight: 700, color: C.ink }}>Agitation — escalation ladder</div>
      {rungs.map((r, i) => {
        const active = lt >= rungAt[i];
        const isLast = i === 3;
        const tone = isLast && active ? 'danger' : active ? 'accent' : 'neutral';
        return (
          <div key={i} style={{ position: 'absolute', left: 820, top: 80 + i * 124, width: 700, minHeight: 108, background: TONE[tone].bg, border: `1.5px solid ${TONE[tone].border}`, borderRadius: 12, padding: '18px 22px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 16, transform: Math.abs(lt - rungAt[i]) < 0.4 ? `scale(${1 + 0.02 * bump(lt, rungAt[i])})` : 'none' }}>
            <span style={{ width: 38, height: 38, borderRadius: 19, background: active ? TONE[tone].border : C.surface, border: active ? 'none' : `1.5px solid ${C.border}`, color: active ? '#fff' : C.mid, fontFamily: SANS, fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{i + 1}</span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: active ? C.ink : C.mid }}>{r}</div>
              {isLast && active && <div style={{ fontSize: 12.5, fontWeight: 700, color: C.danger, marginTop: 3, letterSpacing: '0.05em', textTransform: 'uppercase' }}>last resort</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── spotlight wrapper (chrome + camera + captions) ────────────────────────────
function ToolSpotlight({ n, name, url, accentKey, insight, Comp }) {
  const { localTime: lt, duration } = useSprite();
  const a = ACCENTS[accentKey];
  const sceneO = Math.min(Easing.easeOutQuad(clamp(lt / 0.5, 0, 1)), clamp((duration - lt) / 0.6, 0, 1));
  const winP = clamp((lt - 0.5) / 0.8, 0, 1);
  const winIn = Easing.easeOutCubic(winP);
  const zoom = 1 + 0.03 * clamp(lt / Math.max(0.1, duration - 1), 0, 1);
  const insP = clamp((lt - (duration - 2.2)) / 0.5, 0, 1);

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: sceneO }}>
      <div style={{ position: 'absolute', inset: 0, background: INK }} />
      <div style={{ position: 'absolute', left: 960 - 520, top: 40, width: 1040, height: 960, borderRadius: '50%', background: `radial-gradient(circle, ${a.glow}, transparent 65%)` }} />
      <div style={{ position: 'absolute', left: 96, top: 54, fontFamily: SANS, fontSize: 14, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(246,243,238,0.5)' }}>Ψ&nbsp;&nbsp;Inpatient Psychiatry</div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 54, textAlign: 'center', fontFamily: SANS, fontSize: 15, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: a.text }}>Tool spotlight · {n} of 6</div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 86, textAlign: 'center', fontFamily: SERIF, fontSize: 42, fontWeight: 700, color: '#f6f3ee' }}>{name}</div>
      <div style={{ position: 'absolute', left: 180, top: 168, width: 1560, height: 800, opacity: winIn, transform: `translateY(${(1 - winIn) * 40}px) scale(${zoom})`, transformOrigin: 'center top' }}>
        <window.ChromeWindow width={1560} height={800} url={url}>
          <div style={{ position: 'relative', width: 1560, height: 716 }}><Comp /></div>
        </window.ChromeWindow>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1002, textAlign: 'center', opacity: insP, transform: `translateY(${(1 - insP) * 14}px)` }}>
        <span style={{ display: 'inline-block', background: 'rgba(246,243,238,0.96)', color: INK, fontFamily: SERIF, fontStyle: 'italic', fontWeight: 600, fontSize: 23, borderRadius: 999, padding: '13px 32px', boxShadow: '0 14px 34px rgba(0,0,0,0.3)' }}>{insight}</span>
      </div>
    </div>
  );
}

const TOOLS = [
  { name: 'The Interview Circle', url: 'psych-clerkship/tools/interview-circle', accentKey: 'teal', insight: 'Every domain gets covered — just not in a fixed order.', Comp: InterviewCircleDemo },
  { name: 'Decisional Capacity', url: 'psych-clerkship/tools/capacity', accentKey: 'terra', insight: 'One framework, four abilities, no guesswork.', Comp: CapacityDemo },
  { name: 'Violence Risk (FRST)', url: 'psych-clerkship/tools/violence', accentKey: 'gold', insight: 'History plus current state — never either alone.', Comp: ViolenceDemo },
  { name: 'Withdrawal: CIWA-Ar / COWS', url: 'psych-clerkship/tools/withdrawal', accentKey: 'teal', insight: 'A number you can trust at 3am.', Comp: WithdrawalDemo },
  { name: 'Bush-Francis Catatonia Scale', url: 'psych-clerkship/tools/bfcrs', accentKey: 'terra', insight: 'A positive screen shouldn\u2019t be a judgment call.', Comp: CatatoniaDemo },
  { name: 'Algorithms & Decision Aids', url: 'psych-clerkship/tools/decision-aids', accentKey: 'gold', insight: 'Red means rule it out first. Every time.', Comp: DecisionAidsDemo },
];

// ═══════════════════════ Open / Close ════════════════════════════════════════
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

function SceneOpen() {
  const { localTime: lt } = useSprite();
  const bgO = Math.min(1, lt / 0.6);
  const gx = 960 + Math.sin(lt * 0.45) * 120;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: bgO }}>
      <div style={{ position: 'absolute', inset: 0, background: INK }} />
      <div style={{ position: 'absolute', left: gx - 500, top: 140, width: 1000, height: 760, borderRadius: '50%', background: 'radial-gradient(circle, rgba(42,107,94,0.16), transparent 65%)' }} />
      <Item at={0.5} until={5.6} style={{ left: 0, right: 0, top: 396, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 23, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8fc9ba' }}>A closer look</div>
      </Item>
      <Item at={1.3} until={5.8} style={{ left: 0, right: 0, top: 462, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 84, fontWeight: 700, color: '#f6f3ee', letterSpacing: '-0.01em' }}>Six tools, one tap away.</div>
      </Item>
      <Item at={2.8} until={5.8} style={{ left: 0, right: 0, top: 600, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 25, color: '#cfc5b8' }}>The interactive tools built right into your rotation.</div>
      </Item>
    </div>
  );
}

function SceneClose() {
  const { localTime: lt } = useSprite();
  const gx = 960 + Math.sin(lt * 0.4) * 120;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: INK }} />
      <div style={{ position: 'absolute', left: gx - 500, top: 140, width: 1000, height: 760, borderRadius: '50%', background: 'radial-gradient(circle, rgba(194,90,60,0.14), transparent 65%)' }} />
      <Item at={0.6} style={{ left: 0, right: 0, top: 392, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 62, fontWeight: 700, color: '#f6f3ee', letterSpacing: '-0.01em' }}>Every tool lives in the hub.</div>
      </Item>
      <Item at={2.2} style={{ left: 0, right: 0, top: 494, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 26, color: '#a9c4bb' }}>No login, no app store — just the tool, when you need it.</div>
      </Item>
      <Item at={3.6} pop entry={0.55} style={{ left: 0, right: 0, top: 610, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 54, height: 54, borderRadius: 14, background: '#c25a3c', color: '#fff', fontFamily: SERIF, fontSize: 30, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>Ψ</span>
          <span style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 700, color: '#f6f3ee' }}>The MS3 Clerkship Hub</span>
        </div>
      </Item>
      <Item at={4.6} style={{ left: 0, right: 0, top: 690, textAlign: 'center' }}>
        <div style={{ fontFamily: SANS, fontSize: 17, color: '#a99c8d' }}>UNE COM · Maine Medical Center – Sanford · Joshua Moss, MD</div>
      </Item>
    </div>
  );
}

// ═════════════════════════════ ROOT ═════════════════════════════════════════
const OPEN_LEN = 6.5, TOOL_LEN = 12.5, OVERLAP = 0.6, CLOSE_LEN = 7.5;
const toolStart = (i) => OPEN_LEN - 0.5 + i * TOOL_LEN;
const toolEnd = (i) => i < TOOLS.length - 1 ? toolStart(i) + TOOL_LEN + OVERLAP : toolStart(i) + TOOL_LEN + 0.5;

function ToolSpotlightVideo(props) {
  // Single-tool embed: pass only={1..6} (or ?tool=N in the iframe's URL) to isolate
  // one spotlight — for dropping onto that tool's own page instead of the full reel.
  // 1 Interview Circle · 2 Decisional Capacity · 3 Violence Risk (FRST) ·
  // 4 Withdrawal CIWA-Ar/COWS · 5 Bush-Francis Catatonia · 6 Algorithms & Decision Aids
  const only = props.only ? Number(props.only) : null;
  const soloTool = only ? TOOLS[only - 1] : null;

  if (soloTool) {
    const dur = TOOL_LEN + 1;
    return (
      <Stage width={1920} height={1080} duration={dur} background="#2f2924" autoplay={props.autoplay} loop={props.loop} persistKey={'cw-tool-' + only}>
        <LabelSync />
        <Sprite start={0} end={dur}>
          <ToolSpotlight n={only} name={soloTool.name} url={soloTool.url} accentKey={soloTool.accentKey} insight={soloTool.insight} Comp={soloTool.Comp} />
        </Sprite>
      </Stage>
    );
  }

  const lastEnd = toolEnd(TOOLS.length - 1);
  const closeStart = lastEnd - 0.5;
  const total = closeStart + CLOSE_LEN;
  return (
    <Stage width={1920} height={1080} duration={total} background="#2f2924" autoplay={props.autoplay} loop={props.loop} persistKey="cw-tools">
      <LabelSync />
      <Sprite start={0} end={OPEN_LEN}><SceneOpen /></Sprite>
      {TOOLS.map((t, i) => (
        <Sprite key={i} start={toolStart(i)} end={toolEnd(i)}>
          <ToolSpotlight n={i + 1} name={t.name} url={t.url} accentKey={t.accentKey} insight={t.insight} Comp={t.Comp} />
        </Sprite>
      ))}
      <Sprite start={closeStart} end={total}><SceneClose /></Sprite>
    </Stage>
  );
}

window.ToolSpotlightVideo = ToolSpotlightVideo;
