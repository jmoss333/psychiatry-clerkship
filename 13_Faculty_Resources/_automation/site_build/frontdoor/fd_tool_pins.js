/* Optional device-local tool shortcuts. The store contains only resource IDs; labels,
   clinical content, governance and audience availability always come from the current index.
   Pure selection helpers never mutate that index or its independent Safety kit. */
var FD_TOOL_PINS_STORE='cw_tool_pins_v1';
var FD_TOOL_PINS_LIMIT=5;

function fdToolPinItem(index,ref){
  if(typeof ref!=='string'||ref.length>160||!/^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(ref)) return null;
  var items=index&&index.byRef;
  if(!items||!Object.prototype.hasOwnProperty.call(items,ref)) return null;
  var item=items[ref];
  return item&&item.ref===ref&&item.kind==='tool'&&!item.rights&&!item.searchOnly&&!item.readerOnly?item:null;
}

/* Pins are offered only for actual Library rows, never a utility, a reference about an
   instrument, or a search-only resource. A tool may still have its own safety designation. */
function fdToolPinAllowed(index,ref){
  if(!fdToolPinItem(index,ref)) return false;
  var columns=index&&index.columns;
  if(!Array.isArray(columns)) return false;
  for(var i=0;i<columns.length;i++){
    var items=columns[i]&&columns[i].items;
    if(!Array.isArray(items)) continue;
    for(var j=0;j<items.length;j++) if(items[j]&&items[j].ref===ref) return true;
  }
  return false;
}

function fdToolPinsSanitize(refs,index){
  var out=[];
  if(!Array.isArray(refs)) return out;
  for(var i=0;i<refs.length&&out.length<FD_TOOL_PINS_LIMIT;i++){
    if(!Object.prototype.hasOwnProperty.call(refs,i)) continue;
    var ref=refs[i];
    if(fdToolPinAllowed(index,ref)&&out.indexOf(ref)===-1) out.push(ref);
  }
  return out;
}

/* A failed read differs from an empty or malformed store: a toggle must not overwrite
   unseen pins when storage access was refused. Reading never writes a cleanup. */
function fdToolPinsLoad(index){
  var raw,value;
  try{ raw=localStorage.getItem('cw_tool_pins_v1'); }
  catch(ignoreRead){ return {ok:false,pins:[]}; }
  try{ value=raw?JSON.parse(raw):[]; }
  catch(ignoreJSON){ value=[]; }
  return {ok:true,pins:fdToolPinsSanitize(value,index)};
}

function fdToolPinsRead(index){ return fdToolPinsLoad(index).pins; }

function fdToolPinsClear(){
  try{ localStorage.removeItem('cw_tool_pins_v1'); return true; }
  catch(ignoreClear){ return false; }
}

function fdToolPinsWrite(refs,index){
  var pins=fdToolPinsSanitize(refs,index);
  if(!pins.length) return fdToolPinsClear();
  try{ localStorage.setItem('cw_tool_pins_v1',JSON.stringify(pins)); return true; }
  catch(ignoreWrite){ return false; }
}

/* A sixth pin is rejected rather than silently evicting a learner's earlier choice.
   Failed writes return the prior visible pins, so callers cannot show a false success. */
function fdToolPinsToggle(ref,index){
  var loaded=fdToolPinsLoad(index), pins=loaded.pins;
  if(!loaded.ok) return {ok:false,pins:pins,reason:'unavailable'};
  if(!fdToolPinAllowed(index,ref)) return {ok:false,pins:pins,reason:'invalid'};
  var next=pins.slice(), at=next.indexOf(ref);
  if(at!==-1) next.splice(at,1);
  else{
    if(next.length>=FD_TOOL_PINS_LIMIT) return {ok:false,pins:pins,reason:'limit'};
    next.push(ref);
  }
  if(!fdToolPinsWrite(next,index)) return {ok:false,pins:pins,reason:'unavailable'};
  return {ok:true,pins:next,reason:null};
}

/* Existing Quick tools supply their week/preferred/fallback order. Pins lead, then the
   same suggestions fill the remaining slots. Resolve all objects from this audience's
   index; fallback week tools need not also be Library rows to retain existing behavior. */
function fdToolPinsSelect(index,refs,fallbackItems){
  var pins=fdToolPinsSanitize(refs,index), out=[], seen=Object.create(null), i,item;
  for(i=0;i<pins.length;i++){
    item=fdToolPinItem(index,pins[i]);
    if(item){ out.push(item); seen[item.ref]=true; }
  }
  var fallback=Array.isArray(fallbackItems)?fallbackItems:[];
  for(i=0;i<fallback.length&&out.length<FD_TOOL_PINS_LIMIT;i++){
    item=fallback[i]&&fdToolPinItem(index,fallback[i].ref);
    if(item&&!seen[item.ref]){ out.push(item); seen[item.ref]=true; }
  }
  return out;
}
