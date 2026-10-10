/* Front Door icons (C1). fdIcon(name, opts) -> an <svg><use href="#ic-NAME"></use></svg> string.

   Glyphs: lucide-static@1.54.0 (ISC; MIT for the Feather-derived glyphs), vendored as data in
   site_build/vendor/lucide-static-1.54.0.icons.json with its LICENSE beside it, and drawn ONCE per
   page as a hidden <symbol> sprite that icon_sprite.py injects into the shell at build time. This
   helper only points at a symbol; it carries no path data, so there is one copy of each glyph.
   No runtime CDN, no icon font, no dependency on ReConnect (C0 D-set: each repo vendors its own).

   Pure: state in, string out. No DOM, no storage, no clock. ES5 only (build-injected snippet).
   Injected via the FD_ICONS marker, after the FD_DATA join layer whose fdEsc it reuses.

   Accessibility (C0 PROMPT, "The module"):
     - default: aria-hidden="true" focusable="false" -- decorative; the visible label beside the
       icon carries the meaning (D7: every icon is paired with a visible label);
     - opts.label: role="img" aria-label="<label>", still focusable="false", and NO <title> child.
   Colour: stroke="currentColor"; the caller's colour role (text-mid / teal-deep / danger) is CSS.
   Size: opts.size 'sm' | 'md' | 'lg' (default 'md') -> class fd-icon--<size> plus width/height
   fallbacks equal to clinical-warm.css --fd-glyph-sm/md/lg (16/18/22), so a page with no icon CSS
   yet still draws at the token size. No stylesheet rule ships in C1; W1 adds them.

   Names: the Lucide upstream name ('book-open') or a C0 registry name ('reading'; LUCIDE-PIN.md).
   Anything else returns '' -- a typo must not render a broken <use>. Nothing calls this in C1. */
var FD_ICON_SOURCE='lucide-static@1.54.0';

/* Sprite ids, one per vendored glyph. Pinned equal to the JSON keys by tests/fd-icons.test.mjs. */
var FD_ICON_NAMES={
  'arrow-right':1,'book-open':1,'brain':1,'calendar':1,'check':1,'chevron-down':1,
  'chevron-left':1,'chevron-right':1,'circle-alert':1,'clipboard-check':1,'clock':1,
  'external-link':1,'file-text':1,'flag':1,'footprints':1,'graduation-cap':1,'hand-heart':1,
  'headphones':1,'layers':1,'library':1,'library-big':1,'life-buoy':1,'list-filter':1,
  'message-circle-question':1,'messages-square':1,'network':1,'pen-line':1,'pill':1,'plus':1,
  'route':1,'settings-2':1,'sun':1,'user-round':1,'users':1,'wallet-cards':1,'wrench':1,'x':1
};

/* C0 registry names (LUCIDE-PIN.md "Site A subset") -> Lucide name. */
var FD_ICON_ALIASES={
  today:'sun',path:'route',library:'library',care:'hand-heart',ask:'message-circle-question',
  settings:'settings-2',chevronRight:'chevron-right',chevronLeft:'chevron-left',
  chevronDown:'chevron-down',arrowRight:'arrow-right',external:'external-link',plus:'plus',
  check:'check',close:'x',filter:'list-filter',thisWeek:'calendar',startHere:'flag',
  pocketCard:'wallet-cards',diagnoses:'brain',medication:'pill',family:'users',
  exam:'clipboard-check',tool:'wrench',systems:'network',scholarship:'pen-line',
  skills:'messages-square',evidence:'graduation-cap',reading:'book-open',deck:'layers',
  podcast:'headphones',bookList:'library-big',caseVignette:'user-round',journey:'footprints',
  reference:'file-text'
};

/* --fd-glyph-* in clinical-warm.css; pinned by tests/fd-icons.test.mjs. */
var FD_ICON_SIZES={sm:16,md:18,lg:22};

function fdIconHas(map,key){ return Object.prototype.hasOwnProperty.call(map,key); }

/* Resolve a name to its sprite id, or '' when it names no vendored glyph. */
function fdIconId(name){
  if(typeof name!=='string') return '';
  if(fdIconHas(FD_ICON_NAMES,name)) return name;
  if(fdIconHas(FD_ICON_ALIASES,name)&&fdIconHas(FD_ICON_NAMES,FD_ICON_ALIASES[name])) return FD_ICON_ALIASES[name];
  return '';
}

function fdIcon(name, opts){
  var id=fdIconId(name);
  if(!id) return '';
  opts=opts||{};
  var size=(typeof opts.size==='string'&&fdIconHas(FD_ICON_SIZES,opts.size))?opts.size:'md';
  var px=FD_ICON_SIZES[size];
  var cls='fd-icon fd-icon--'+size;
  var extra=typeof opts.className==='string'?opts.className.split(/\s+/):[];
  for(var i=0;i<extra.length;i++){
    if(/^[A-Za-z][A-Za-z0-9_-]*$/.test(extra[i])) cls+=' '+extra[i];
  }
  var label=typeof opts.label==='string'?opts.label.replace(/^\s+|\s+$/g,''):'';
  var a11y=label?' role="img" aria-label="'+fdEsc(label)+'"':' aria-hidden="true"';
  return '<svg class="'+fdEsc(cls)+'"'+a11y+' focusable="false" width="'+px+'" height="'+px+'"'+
    ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'+
    ' stroke-linecap="round" stroke-linejoin="round"><use href="#ic-'+fdEsc(id)+'"></use></svg>';
}
