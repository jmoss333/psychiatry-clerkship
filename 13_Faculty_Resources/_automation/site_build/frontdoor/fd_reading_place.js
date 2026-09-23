var FD_READING_PLACE_LIMIT=50;
var FD_READING_OFFSET_MAX=100000;
var FD_READING_HEADING_SLUG_MAX=120;
var FD_READING_OWN=Object.prototype.hasOwnProperty;

function fdReadingRef(ref){
  return typeof ref==='string'&&/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(ref);
}

function fdReadingHeading(heading){
  return typeof heading==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(heading);
}

function fdReadingOffset(offset){
  if(typeof offset!=='number'||!isFinite(offset))return null;
  return Math.max(0,Math.min(FD_READING_OFFSET_MAX,offset));
}

function fdReadingTime(time){
  if(typeof time!=='number'||!isFinite(time)||time<0||Math.floor(time)!==time)return null;
  return time;
}

function fdReadingRecord(value){
  var offset,time;
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  if(!FD_READING_OWN.call(value,'heading')||!FD_READING_OWN.call(value,'offset')||!FD_READING_OWN.call(value,'updatedAt'))return null;
  offset=fdReadingOffset(value.offset);
  time=fdReadingTime(value.updatedAt);
  if(!fdReadingHeading(value.heading)||offset===null||time===null)return null;
  return {heading:value.heading,offset:offset,updatedAt:time};
}

function fdReadingDefine(target,key,value){
  Object.defineProperty(target,key,{value:value,enumerable:true,configurable:true,writable:true});
}

function fdReadingOldest(places,keys){
  var oldest=keys[0],i,key,record,oldRecord;
  for(i=1;i<keys.length;i++){
    key=keys[i];
    record=places[key];
    oldRecord=places[oldest];
    if(record.updatedAt<oldRecord.updatedAt||
      (record.updatedAt===oldRecord.updatedAt&&key<oldest))oldest=key;
  }
  return oldest;
}

function fdReadingBound(places){
  var keys=Object.keys(places),oldest;
  while(keys.length>FD_READING_PLACE_LIMIT){
    oldest=fdReadingOldest(places,keys);
    delete places[oldest];
    keys=Object.keys(places);
  }
  return places;
}

function fdReadingPlaces(value){
  var out={},keys,i,ref,record;
  if(!value||typeof value!=='object'||Array.isArray(value))return out;
  keys=Object.keys(value);
  for(i=0;i<keys.length;i++){
    ref=keys[i];
    if(!fdReadingRef(ref))continue;
    record=fdReadingRecord(value[ref]);
    if(record)fdReadingDefine(out,ref,record);
  }
  return fdReadingBound(out);
}

function fdReadingPlaceUpdate(places,ref,heading,offset,nowMs){
  var out=fdReadingPlaces(places),value,time;
  value=fdReadingOffset(offset);
  time=fdReadingTime(nowMs);
  if(!fdReadingRef(ref)||!fdReadingHeading(heading)||value===null||time===null)return out;
  fdReadingDefine(out,ref,{heading:heading,offset:value,updatedAt:time});
  return fdReadingBound(out);
}

function fdReadingPlaceDrop(places,ref){
  var out=fdReadingPlaces(places);
  if(fdReadingRef(ref)&&FD_READING_OWN.call(out,ref))delete out[ref];
  return out;
}

function fdReadingHeadingSource(label,index){
  if(typeof label==='string')return label;
  if(label===null)return 'null';
  if(typeof label==='number'||typeof label==='boolean')return typeof label+':'+String(label);
  return 'non-string:'+index;
}

function fdReadingHeadingFingerprint(value){
  var first=2166136261,second=5381,i,code,hex1,hex2;
  for(i=0;i<value.length;i++){
    code=value.charCodeAt(i);
    first^=code;
    first=(first+(first<<1)+(first<<4)+(first<<7)+(first<<8)+(first<<24))>>>0;
    second=(((second<<5)+second)^code)>>>0;
  }
  second=(second+(second<<3))>>>0;
  second^=second>>>11;
  second=(second+(second<<15))>>>0;
  hex1=(first>>>0).toString(16);
  hex2=(second>>>0).toString(16);
  while(hex1.length<8)hex1='0'+hex1;
  while(hex2.length<8)hex2='0'+hex2;
  return hex1+hex2;
}

function fdReadingHeadingIds(labels){
  var out=[],seen={},counts={},occurrences={},i,label,source,labelKey,slug,id,base,suffix,count,occurrence;
  if(!Array.isArray(labels))return out;
  for(i=0;i<labels.length;i++){
    label=FD_READING_OWN.call(labels,i)?labels[i]:undefined;
    source=fdReadingHeadingSource(label,i);
    labelKey='label:'+source;
    if(FD_READING_OWN.call(counts,labelKey))counts[labelKey]++;
    else counts[labelKey]=1;
  }
  for(i=0;i<labels.length;i++){
    label=FD_READING_OWN.call(labels,i)?labels[i]:undefined;
    source=fdReadingHeadingSource(label,i);
    labelKey='label:'+source;
    count=counts[labelKey];
    occurrence=(FD_READING_OWN.call(occurrences,labelKey)?occurrences[labelKey]:0)+1;
    occurrences[labelKey]=occurrence;
    label=typeof label==='string'?label.toLowerCase():'';
    slug=label.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    slug=slug||'section';
    slug=slug.slice(0,FD_READING_HEADING_SLUG_MAX).replace(/-+$/g,'');
    if(!slug)slug='section';
    base='fd-reading-'+slug+'--'+fdReadingHeadingFingerprint(source);
    if(count>1)base+='--'+occurrence+'of'+count;
    id=base;
    suffix=2;
    while(FD_READING_OWN.call(seen,id)){
      id=base+'-'+suffix;
      suffix++;
    }
    fdReadingDefine(seen,id,true);
    out.push(id);
  }
  return out;
}

function fdReadingResume(place,availableIds){
  var record=fdReadingRecord(place),i;
  if(!record||!Array.isArray(availableIds))return null;
  for(i=0;i<availableIds.length;i++){
    if(FD_READING_OWN.call(availableIds,i)&&availableIds[i]===record.heading)return record;
  }
  return null;
}
