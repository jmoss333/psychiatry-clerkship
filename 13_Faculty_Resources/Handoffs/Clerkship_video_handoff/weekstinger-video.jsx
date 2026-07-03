// weekstinger-video.jsx — Six week-intro stingers (bumpers), back to back.
// Each ~6s, crossfades into the next. 1920×1080. Uses Stage/Sprite from animations.jsx.

const { Stage, Sprite, useTime, useSprite, Easing, clamp } = window;

const SERIF = '"Source Serif 4", Georgia, serif';
const SANS = '"Source Sans 3", "Segoe UI", system-ui, sans-serif';
const INK = '#2f2924';

const ACCENTS = {
  teal:  { text: '#8fc9ba', tint: 'rgba(42,107,94,0.20)',  glow: 'rgba(42,107,94,0.32)' },
  terra: { text: '#e2a68e', tint: 'rgba(194,90,60,0.20)',  glow: 'rgba(194,90,60,0.32)' },
  gold:  { text: '#d9b45c', tint: 'rgba(217,160,60,0.20)', glow: 'rgba(217,160,60,0.28)' },
};

const WEEKS = [
  { n: 1, title: 'Foundations', subtitle: 'The psychiatric interview, the mental status exam, capacity, and writing an admission note.', chips: ['Interview', 'MSE', 'Capacity', 'Admission note'], accent: 'teal' },
  { n: 2, title: 'Mood, Psychosis & Pharmacology', subtitle: 'The major diagnoses on the unit — and how we choose medications.', chips: ['Mood', 'Psychosis', 'Pharmacology'], accent: 'terra' },
  { n: 3, title: 'Psychotherapy & Personality', subtitle: 'The therapeutic relationship, DBT-informed care, and safety planning.', chips: ['Therapeutic alliance', 'DBT', 'Safety planning'], accent: 'gold' },
  { n: 4, title: 'Family & Systems', subtitle: 'Family meetings and expressed emotion — a signature focus of this rotation.', chips: ['Family meetings', 'Expressed emotion'], accent: 'terra', badge: 'Signature focus' },
  { n: 5, title: 'Acute & Emergency', subtitle: 'Agitation, delirium, catatonia, withdrawal, and risk assessment.', chips: ['Agitation', 'Delirium', 'Catatonia', 'Withdrawal'], accent: 'teal' },
  { n: 6, title: 'Integration & Exam', subtitle: 'Disposition planning, shelf review, and OSCE prep.', chips: ['Disposition', 'Shelf', 'OSCE'], accent: 'gold' },
];

// ── layout constants (1920×1080) ────────────────────────────────────────────
const LABEL_TOP = 300, NUM_TOP = 332, NUM_SIZE = 290;
const BADGE_TOP = 622, TITLE_TOP = 672, SUBTITLE_TOP = 758, CHIPS_TOP = 848, DOTS_TOP = 940;
const GLOW_CX = 960, GLOW_CY = NUM_TOP + NUM_SIZE * 1.05 / 2;

function LabelSync() {
  const s = Math.floor(useTime());
  React.useEffect(() => {
    const el = document.getElementById('cw-stinger-root');
    if (el) el.setAttribute('data-screen-label', 't=' + s + 's');
  }, [s]);
  return null;
}

function Bumper({ data }) {
  const { localTime: lt, duration } = useSprite();
  const a = ACCENTS[data.accent];
  const sceneO = Math.min(Easing.easeOutQuad(clamp(lt / 0.5, 0, 1)), clamp((duration - lt) / 0.6, 0, 1));

  const reveal = (delay, dur = 0.55, rise = 24, pop = false) => {
    const p = clamp((lt - delay) / dur, 0, 1);
    const e = pop ? Easing.easeOutBack(p) : Easing.easeOutCubic(p);
    return {
      opacity: Easing.easeOutQuad(p),
      transform: pop ? `scale(${0.8 + 0.2 * e})` : `translateY(${(1 - e) * rise}px)`,
    };
  };

  const glowScale = 1 + 0.04 * Math.sin(lt * 1.1);

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: sceneO }}>
      <div style={{ position: 'absolute', inset: 0, background: INK }} />
      <div style={{
        position: 'absolute', left: GLOW_CX - 450, top: GLOW_CY - 450, width: 900, height: 900,
        borderRadius: '50%', background: `radial-gradient(circle, ${a.glow}, transparent 65%)`,
        transform: `scale(${glowScale})`,
      }} />

      {/* brand mark */}
      <div style={{ position: 'absolute', left: 96, top: 76, fontFamily: SANS, fontSize: 15, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(246,243,238,0.5)', ...reveal(0.1, 0.5, 10) }}>
        Ψ&nbsp;&nbsp;Inpatient Psychiatry
      </div>
      {/* week indicator */}
      <div style={{ position: 'absolute', right: 96, top: 78, fontFamily: SANS, fontSize: 14, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: a.text, ...reveal(0.1, 0.5, 10) }}>
        Week {data.n} of 6
      </div>

      {/* WEEK label */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: LABEL_TOP, textAlign: 'center', fontFamily: SANS, fontSize: 24, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: a.text, ...reveal(0.2, 0.5, 16) }}>
        Week
      </div>
      {/* numeral */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: NUM_TOP, textAlign: 'center', fontFamily: SERIF, fontSize: NUM_SIZE, fontWeight: 700, lineHeight: 1, color: a.text, ...reveal(0.32, 0.7, 0, true) }}>
        {data.n}
      </div>

      {data.badge && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: BADGE_TOP, textAlign: 'center', ...reveal(0.8, 0.5, 0, true) }}>
          <span style={{ display: 'inline-block', background: '#d9b45c', color: INK, fontFamily: SANS, fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 999, padding: '7px 18px' }}>{data.badge}</span>
        </div>
      )}

      {/* title */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: TITLE_TOP, textAlign: 'center', ...reveal(0.55, 0.6, 22) }}>
        <div style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 700, color: '#f6f3ee', letterSpacing: '-0.01em', maxWidth: 1500, margin: '0 auto', lineHeight: 1.15 }}>{data.title}</div>
      </div>

      {/* subtitle */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: SUBTITLE_TOP, textAlign: 'center', ...reveal(0.85, 0.55, 18) }}>
        <div style={{ fontFamily: SANS, fontSize: 24, fontWeight: 400, color: '#cfc5b8', maxWidth: 1080, margin: '0 auto', lineHeight: 1.5 }}>{data.subtitle}</div>
      </div>

      {/* chips */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: CHIPS_TOP, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 14, padding: '0 220px' }}>
        {data.chips.map((c, i) => (
          <span key={i} style={{
            fontFamily: SANS, fontSize: 19, fontWeight: 600, color: a.text,
            background: a.tint, border: `1.5px solid ${a.text}`, borderRadius: 999, padding: '10px 22px',
            whiteSpace: 'nowrap', ...reveal(1.05 + i * 0.1, 0.45, 12, true),
          }}>{c}</span>
        ))}
      </div>

      {/* progress dots */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: DOTS_TOP, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, ...reveal(0.15, 0.5, 8) }}>
        {WEEKS.map((w, i) => {
          const on = w.n === data.n;
          return <span key={i} style={{ width: on ? 30 : 9, height: 9, borderRadius: 5, background: on ? a.text : 'rgba(246,243,238,0.22)', transition: 'width 0.2s' }} />;
        })}
      </div>
    </div>
  );
}

const STINGER_LEN = 6, OVERLAP = 0.4;
const N = WEEKS.length;
const TOTAL = N * STINGER_LEN + 0.01;

function WeekStingersVideo(props) {
  // Single-week embed: pass week={1..6} (or ?week=N in the iframe's URL) to isolate
  // one bumper — for dropping into that week's own page instead of the full reel.
  const only = props.week ? Number(props.week) : null;
  const soloWeek = only ? WEEKS.find(w => w.n === only) : null;

  if (soloWeek) {
    return (
      <Stage width={1920} height={1080} duration={STINGER_LEN + 0.01} background="#2f2924" autoplay={props.autoplay} loop={props.loop} persistKey={'cw-stinger-w' + only}>
        <LabelSync />
        <Sprite start={0} end={STINGER_LEN + 0.01}><Bumper data={soloWeek} /></Sprite>
      </Stage>
    );
  }

  return (
    <Stage width={1920} height={1080} duration={TOTAL} background="#2f2924" autoplay={props.autoplay} loop={props.loop} persistKey="cw-stingers">
      <LabelSync />
      {WEEKS.map((w, i) => {
        const start = i * STINGER_LEN;
        const end = start + STINGER_LEN + (i < N - 1 ? OVERLAP : 0.01);
        return <Sprite key={w.n} start={start} end={end}><Bumper data={w} /></Sprite>;
      })}
    </Stage>
  );
}

window.WeekStingersVideo = WeekStingersVideo;
