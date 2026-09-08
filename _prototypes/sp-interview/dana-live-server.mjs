// Explicit local audition server. Never imported by a learner build or Netlify route.
import http from 'node:http';
import {readFile, lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createContext, validateReply} from './dana-live-context.mjs';
import localCases from './sp-interview.local-cases.js';
import localDana from './sp-interview.local-dana.js';
import {normalizeDiagnostic} from './dana-openai-provider.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '../..');
const PACK = JSON.parse(await readFile(path.join(HERE, 'sp-interview.pack.json'), 'utf8'));
const DANA = PACK.cases.find(item => item.id === 'sp_depression_gated_si_001');
const TTL = 30 * 60 * 1000;
const BODY_LIMIT = 8192;
const AUDIO_LIMIT = 4_000_000;
const STATIC = new Set([
  '_prototypes/sp-interview/sp-encounter-profiles.js',
  '_prototypes/sp-interview/sp-encounter-rhythm.js',
  '_prototypes/sp-interview/sp-encounter-ui.js',
  '_prototypes/sp-interview/sp-interview.preview.html',
  '_prototypes/sp-interview/sp-interview.voice.js',
  '_prototypes/sp-interview/sp-interview.turns.js',
  '_prototypes/sp-interview/sp-interview.conversation.js',
  '_prototypes/sp-interview/sp-interview.recordings.js',
  '_prototypes/sp-interview/sp-interview.responses.js',
  '_prototypes/sp-interview/sp-interview.live.js',
  '_prototypes/sp-interview/sp-interview.retry.js',
  '_prototypes/sp-interview/sp-interview.bookmarks.js',
  '_prototypes/sp-interview/sp-interview.local-cases.js',
  '_prototypes/sp-interview/sp-interview.local-dana.js',
  '_prototypes/sp-interview/vendor/react.min.js',
  '_prototypes/sp-interview/vendor/react-dom.min.js',
  'favicon.svg',
]);
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.mp3':'audio/mpeg','.svg':'image/svg+xml'};
const id = () => randomBytes(24).toString('base64url');
const problem = (status, code) => Object.assign(new Error(code), {status, code});
function keys(value, required, optional = []) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
function validTurnId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)
    || Number.isInteger(value) && value > 0 && value <= 10;
}
function validText(text) {
  return typeof text === 'string' && text.trim().length > 0 && text.length <= 1200
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
    && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);
}
// A warning heuristic only; speech may already have reached browser recognition.
function possiblePhi(text) {
  return /\b(?:mrn|medical record|date of birth|dob)\s*[:#]?\s*[\d/.-]{3,}|\b\d{3}-\d{2}-\d{4}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}
async function jsonBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw problem(415,'json_required');
  if (Number(req.headers['content-length']) > BODY_LIMIT) throw problem(413,'body_too_large');
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw problem(413,'body_too_large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw problem(400,'invalid_json'); }
}

export function createDanaServer({provider, rootDir = DEFAULT_ROOT, caseDef = localDana.applyCase(DANA), now = Date.now, maxProviderTurns = 60, maxSpeechOperations = 60, turnTimeoutMs = 65000} = {}) {
  if (!provider || typeof provider.reply !== 'function' || typeof provider.speak !== 'function' && typeof provider.speakStream !== 'function') throw new Error('A local Dana provider is required.');
  if (!caseDef?.persona?.opening || !Number.isInteger(maxProviderTurns) || maxProviderTurns < 1 || !Number.isInteger(maxSpeechOperations) || maxSpeechOperations < 1 || !Number.isInteger(turnTimeoutMs) || turnTimeoutMs < 1 || turnTimeoutMs > 65000) throw new Error('Invalid local server configuration.');
  const root = path.resolve(rootDir), sessions = new Map(), audio = new Map();
  const availableCases = new Map(PACK.cases.filter(item => item.facultyReview?.status === 'reviewed').map(item => [item.id,item]));
  // This loopback-only server explicitly auditions authored local drafts. It
  // does not change the reviewed pack or the governed learner case filter.
  for (const item of localCases.cases) availableCases.set(item.id,item);
  if (availableCases.has(caseDef.id)) availableCases.set(caseDef.id,localDana.applyCase(caseDef));
  let active = 0, providerTurns = 0, speechOperations = 0, shuttingDown = false;
  const serverDiagnostics=[];
  function recordFailure(error,kind,stage,started){
    serverDiagnostics.push(normalizeDiagnostic(error,{kind,stage,elapsedMs:Date.now()-started}));
    if(serverDiagnostics.length>12)serverDiagnostics.shift();
  }
  function releaseAudio(session) {
    session.pending?.controller.abort();
    session.audio.forEach(token => { const item = audio.get(token); if (item) finishAudio(item,'cancelled'); audio.delete(token); });
    session.audio.clear();
  }
  function newSession(history, extra = {}) {
    return {id:id(),created:now(),closed:false,finished:false,turns:0,lastReplyTurnId:null,transcript:history,operations:new Map(),pending:null,audio:new Set(),snapshots:new Map(),caseId:caseDef.id,...extra};
  }
  function drop(session) {
    if (session.closed) return;
    session.closed = true;
    if (session.retryChildId) { const child = sessions.get(session.retryChildId); if (child) drop(child); }
    releaseAudio(session);
    session.transcript.length = 0; session.operations.clear(); session.snapshots.clear();
    sessions.delete(session.id);
  }
  function prune() {
    for (const session of sessions.values()) if (now() - session.created >= TTL) drop(session);
  }
  function responseHeaders(type) {
    return {'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer'};
  }
  function send(res, status, value, type = 'application/json') {
    if (res.destroyed || res.writableEnded) return;
    const body = Buffer.isBuffer(value) ? value : JSON.stringify(value);
    res.writeHead(status,responseHeaders(type));
    res.end(body);
  }
  function localRequest(req, mutating) {
    const host = req.headers.host || '';
    const port = server.address()?.port;
    if (!['127.0.0.1','localhost','[::1]'].some(name => host === `${name}:${port}`)) throw problem(403,'local_host_required');
    // A link from another page may open this public preview document. This
    // exception never applies to embeds, scripts, audio or provider endpoints.
    const previewNavigation = req.method === 'GET'
      && (req.url || '').split('?')[0] === '/_prototypes/sp-interview/sp-interview.preview.html'
      && req.headers['sec-fetch-mode'] === 'navigate'
      && req.headers['sec-fetch-dest'] === 'document';
    if (previewNavigation) return;
    const origin = req.headers.origin;
    if ((mutating && origin !== `http://${host}`) || (origin && origin !== `http://${host}`) || req.headers['sec-fetch-site'] === 'cross-site') throw problem(403,'same_origin_required');
  }
  function sessionFor(sessionId) {
    const session = typeof sessionId === 'string' && sessions.get(sessionId);
    if (!session || session.closed) throw problem(404,'session_not_found');
    return session;
  }
  async function staticFile(req, res) {
    let raw;
    try { raw = decodeURIComponent((req.url || '').split('?')[0]); }
    catch { throw problem(400,'invalid_path'); }
    if (!raw.startsWith('/') || raw.includes('\\') || raw.includes('\0') || raw.split('/').some(part => part.startsWith('.'))) throw problem(404,'not_found');
    const relative = raw.slice(1);
    const recording = /^output\/speech\/dana-marin-v1\/(?:manifest\.json|[A-Za-z0-9_-]+\.mp3)$/.test(relative)
      || /^output\/speech\/voice-cases-v1\/(?:marcus|ray|morgan)\/(?:manifest\.json|[a-f0-9]{64}\.mp3)$/.test(relative);
    if (!STATIC.has(relative) && !recording) throw problem(404,'not_found');
    let current = root;
    try {
      for (const part of relative.split('/')) {
        current = path.join(current, part);
        if ((await lstat(current)).isSymbolicLink()) throw problem(404,'not_found');
      }
      const stat = await lstat(current);
      if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw problem(404,'not_found');
      send(res,200,await readFile(current),MIME[path.extname(current)] || 'application/octet-stream');
    } catch { throw problem(404,'not_found'); }
  }
  function writeAudio(res, chunk) {
    if (res.destroyed || res.writableEnded) return;
    if (!res.headersSent) res.writeHead(200,{...responseHeaders('audio/mpeg'),'Accept-Ranges':'none'});
    res.write(chunk);
  }
  function finishAudio(item, state) {
    if (['failed','cancelled'].includes(item.state) || item.state === 'complete' && state !== 'cancelled') return;
    item.state = state;
    if (state === 'complete') item.completedSuccessfully = true;
    for (const res of item.subscribers) {
      if (state === 'complete') res.end();
      else if (res.headersSent) res.destroy();
      else send(res,state === 'cancelled' ? 409 : 502,{error:{code:state === 'cancelled' ? 'audio_cancelled' : 'audio_failed'}});
    }
    item.subscribers.clear();
    if (state !== 'complete') { item.chunks.length = 0; item.size = 0; }
  }
  function streamAudio(item,res) {
    if (item.state === 'failed' || item.state === 'cancelled') throw problem(item.state === 'failed' ? 502 : 409,'audio_'+item.state);
    if (item.state === 'complete') return send(res,200,Buffer.concat(item.chunks,item.size),'audio/mpeg');
    item.subscribers.add(res);
    res.once('close',() => item.subscribers.delete(res));
    for (const chunk of item.chunks) writeAudio(res,chunk);
  }
  async function synthesize(item,reply,operation) {
    const started=Date.now();
    const onChunk = value => {
      if (item.controller.signal.aborted || !['pending','streaming'].includes(item.state)) return;
      if (!(value instanceof Uint8Array) || !value.byteLength) {
        finishAudio(item,'failed'); item.controller.abort(); throw problem(502,'invalid_audio');
      }
      if (operation.audioBytes + value.byteLength > AUDIO_LIMIT) {
        finishAudio(item,'failed'); item.controller.abort(); throw problem(502,'invalid_audio');
      }
      const chunk = Buffer.from(value); item.chunks.push(chunk); item.size += chunk.length; operation.audioBytes += chunk.length;
      item.state = 'streaming';
      for (const res of item.subscribers) writeAudio(res,chunk);
    };
    try {
      if (typeof provider.speakStream === 'function') await provider.speakStream({text:reply,caseId:item.caseId,signal:item.controller.signal,onChunk});
      else onChunk(await provider.speak({text:reply,caseId:item.caseId,signal:item.controller.signal}));
      if (item.controller.signal.aborted || ['cancelled','failed'].includes(item.state)) throw problem(409,'turn_cancelled');
      if (!item.size) throw problem(502,'invalid_audio');
      finishAudio(item,'complete');
    } catch (error) {
      recordFailure(error,'speech','server_speech',started);
      finishAudio(item,item.controller.signal.aborted ? 'cancelled' : 'failed');
      throw error;
    }
  }
  function beginSpeech(session,input,operation,text) {
    if (operation.controller.signal.aborted || session.closed) throw problem(409,'turn_cancelled');
    if (speechOperations >= maxSpeechOperations) throw problem(429,'speech_audition_limit');
    speechOperations += 1;
    const item = {text,caseId:session.caseId,sessionId:session.id,turnId:input.turnId,controller:operation.controller,state:'pending',chunks:[],size:0,subscribers:new Set()};
    operation.audioItems.push(item);
    const pending = synthesize(item,text,operation);
    operation.speechPromises.push(pending);
    // A speculative lead may fail before actor completion. Stop all work and
    // attach rejection handling now, before metadata can expose any segment.
    pending.catch(() => { operation.controller.abort(); });
    return item;
  }
  function cancelOperationAudio(operation) {
    for (const item of operation.audioItems || []) finishAudio(item,'cancelled');
  }
  async function prepareTurn(session, input, operation) {
    const controller = operation.controller;
    const history = session.transcript.map(entry => ({...entry}));
    const previous = history.at(-1);
    const previousId = input.previousTurnId === null ? null : String(input.previousTurnId);
    const matchingPlayback = Object.hasOwn(input,'previousTurnId') && previousId === session.lastReplyTurnId;
    const generationComplete = session.lastReplyTurnId === null || session.lastAudioItems?.length > 0 && session.lastAudioItems.every(item => item.completedSuccessfully === true);
    const claimsWholeReply = session.lastReplyTurnId === null || !Object.hasOwn(input,'previousCompletedSegments') || input.previousCompletedSegments >= (session.lastAudioItems?.length || 0);
    // A retry's opening context is an immutable historical prefix, not a newly
    // played opening. Its first request cannot revise those delivery facts.
    if (!(session.parentId && session.turns === 0) && previous?.who === 'pt') {
      previous.playbackStatus = matchingPlayback && generationComplete && claimsWholeReply && input.previousPlayback === 'played' ? 'played' : 'interrupted';
      if (previous.playbackStatus !== 'played' && matchingPlayback && session.lastAudioItems?.length) {
        const claimed = input.previousCompletedSegments || 0;
        const heard = [];
        for (const item of session.lastAudioItems.slice(0,claimed)) {
          if (item.completedSuccessfully !== true) break;
          heard.push(item.text);
        }
        if (heard.length) {
          previous.text = heard.join(''); previous.playbackStatus = 'played';
          if (heard.length < session.lastAudioItems.length) previous.omittedTail = true;
        }
      }
    }
    const originalPrefix = Object.freeze(history.map(entry => Object.freeze({...entry})));
    history.push({who:'me',text:input.text});
    const learnerTexts = history.filter(entry => entry.who === 'me').map(entry => entry.text);
    const context = createContext(availableCases.get(session.caseId), learnerTexts, history);
    let lead = null, leadItem = null, acceptingLead = true;
    const segmented = typeof provider.replyStream === 'function';
    const onLead = text => {
      if (!acceptingLead || controller.signal.aborted || session.closed) return;
      if (lead !== null || typeof text !== 'string' || validateReply(text,{fragment:true}) !== text) throw problem(502,'invalid_reply_prefix');
      lead = text;
      // No token exists yet: speculative audio is private until final checks.
      // A wholly quoted opening is ambiguous until the rest arrives. Keep it
      // as an identity check, then deliver the validated full reply once.
      if(!/^(?:"[\s\S]*"|“[\s\S]*”)$/.test(text))leadItem = beginSpeech(session,input,operation,text);
    };
    let reply;
    try {
      reply = await (segmented ? provider.replyStream({system:context.system,messages:context.messages,signal:controller.signal,onLead}) : provider.reply({system:context.system,messages:context.messages,signal:controller.signal}));
    } finally { acceptingLead = false; }
    if (controller.signal.aborted || session.closed) throw problem(409,'turn_cancelled');
    reply = validateReply(reply);
    if (lead !== null && !reply.startsWith(lead)) throw problem(502,'invalid_reply_prefix');
    const segments = [];
    if (leadItem) {
      segments.push({text:lead,item:leadItem});
      const remainder = reply.slice(lead.length);
      if (remainder.trim()) segments.push({text:remainder,item:beginSpeech(session,input,operation,remainder)});
      else if (remainder.length) throw problem(502,'invalid_reply_prefix');
    } else segments.push({text:reply,item:beginSpeech(session,input,operation,reply)});
    if (controller.signal.aborted || session.closed) throw problem(409,'turn_cancelled');
    const audioSegments = segments.map(({text,item}) => {
      const token = id(); audio.set(token,item); session.audio.add(token);
      return {text,audioUrl:`/api/dana/audio/${token}`};
    });
    const result = segmented ? {reply,audioSegments,turnId:input.turnId} : {reply,audioUrl:audioSegments[0].audioUrl,turnId:input.turnId};
    history.push({who:'pt',text:reply,playbackStatus:'pending'});
    session.snapshots.set(String(input.turnId),{turnId:input.turnId,history:originalPrefix});
    session.transcript = history; session.turns += 1; session.lastReplyTurnId = String(input.turnId); session.lastAudioItems = segments.map(segment => segment.item);
    // Start once immediately. HTTP subscribers only consume this operation.
    operation.synthesis = Promise.all(operation.speechPromises);
    // Completion accounting below awaits this promise; attach immediately so a
    // synchronous provider failure cannot become an unhandled rejection.
    operation.synthesis.catch(() => {});
    return result;
  }
  const server = http.createServer(async (req,res) => {
    try {
      if (shuttingDown) throw problem(503,'server_stopping');
      prune();
      const mutating = req.method === 'POST' || req.method === 'DELETE';
      localRequest(req,mutating);
      const pathname = (req.url || '').split('?')[0];
      if (req.method === 'GET' && pathname === '/api/dana/health') return send(res,200,{configured:provider.configured !== false,localOnly:true,mode:'live',voice:'marin',cases:[...availableCases.keys()],operations:{scope:'server-process',actorUsed:providerTurns,speechUsed:speechOperations,activeCalls:active,actorLimit:maxProviderTurns,speechLimit:maxSpeechOperations},usage:typeof provider.getUsage==='function'?provider.getUsage():null,providerDiagnostics:typeof provider.getDiagnostics==='function'?provider.getDiagnostics():null,serverDiagnostics});
      if (req.method === 'POST' && pathname === '/api/dana/session') {
        const input = await jsonBody(req);
        if (provider.configured === false) throw problem(503,'provider_not_configured');
        if (!keys(input,[],['caseId']) || Object.hasOwn(input,'caseId') && !availableCases.has(input.caseId)) throw problem(400,'invalid_request');
        const selected = availableCases.get(input.caseId || caseDef.id);
        if (sessions.size >= 8) throw problem(429,'session_limit');
        const session = newSession([{who:'pt',text:selected.persona.opening,playbackStatus:'pending'}],{caseId:selected.id});
        sessions.set(session.id,session);
        return send(res,201,{sessionId:session.id,caseId:session.caseId,opening:selected.persona.opening});
      }
      if (req.method === 'DELETE' && /^\/api\/dana\/session\/[A-Za-z0-9_-]{32}$/.test(pathname)) {
        const session = sessionFor(pathname.split('/').at(-1)); drop(session); return send(res,200,{ended:true});
      }
      const practiceRoute = pathname.match(/^\/api\/dana\/session\/([A-Za-z0-9_-]{32})\/(finish|retry)$/);
      if (req.method === 'POST' && practiceRoute) {
        const input = await jsonBody(req);
        const session = sessionFor(practiceRoute[1]);
        if (practiceRoute[2] === 'finish') {
          if (!keys(input,[])) throw problem(400,'invalid_request');
          session.finished = true; releaseAudio(session);
          if (session.pending) await session.pending.completion;
          return send(res,200,{finished:true,retryTurnIds:session.parentId ? [] : [...session.snapshots.values()].map(value => value.turnId)});
        }
        if (!keys(input,['turnId']) || !validTurnId(input.turnId)) throw problem(400,'invalid_request');
        if (!session.finished || session.parentId) throw problem(409,'retry_unavailable');
        const key = String(input.turnId), snapshot = session.snapshots.get(key);
        if (!snapshot) throw problem(404,'retry_turn_not_found');
        if (session.retryChildId) {
          if (session.retrySourceId !== key) throw problem(409,'retry_already_selected');
          const child = sessionFor(session.retryChildId);
          return send(res,200,{sessionId:child.id,sourceTurnId:snapshot.turnId,caseId:child.caseId});
        }
        if (sessions.size >= 8) throw problem(429,'session_limit');
        const child = newSession(snapshot.history.map(entry => ({...entry})),{parentId:session.id,caseId:session.caseId});
        sessions.set(child.id,child); session.retryChildId = child.id; session.retrySourceId = key;
        return send(res,200,{sessionId:child.id,sourceTurnId:snapshot.turnId,caseId:child.caseId});
      }
      const cancelTurnRoute = pathname.match(/^\/api\/dana\/session\/([A-Za-z0-9_-]{32})\/turn\/([A-Za-z0-9_-]{1,64})$/);
      if (req.method === 'DELETE' && cancelTurnRoute) {
        const session = sessionFor(cancelTurnRoute[1]), key = cancelTurnRoute[2];
        const operation = session.operations.get(key);
        if (!operation) {
          // An abort can beat the POST to this process. Remember that identity
          // so a late request cannot create provider work after cancellation.
          if (session.operations.size >= 64) throw problem(429,'operation_limit');
          session.operations.set(key,{cancelled:true});
        } else if (!operation.cancelled) {
          cancelOperationAudio(operation);
          operation.controller.abort();
          await operation.completion;
          operation.cancelled = true;
        }
        return send(res,200,{state:'cancelled',turnId:key});
      }
      const audioRoute = pathname.match(/^\/api\/dana\/audio\/([A-Za-z0-9_-]{32})(\/status)?$/);
      if (audioRoute && (req.method === 'GET' || req.method === 'DELETE' && !audioRoute[2])) {
        const item = audio.get(audioRoute[1]);
        if (!item) throw problem(404,'audio_not_found');
        if (req.method === 'DELETE') {
          item.controller.abort();
          const pending = sessions.get(item.sessionId)?.pending;
          if (pending?.controller === item.controller) await pending.completion;
          return send(res,200,{state:item.state,turnId:item.turnId});
        }
        if (audioRoute[2]) return send(res,200,{state:item.state,turnId:item.turnId});
        return streamAudio(item,res);
      }
      if (req.method === 'POST' && pathname === '/api/dana/turn') {
        const input = await jsonBody(req);
        if (!keys(input,['sessionId','turnId','text'],['previousPlayback','previousTurnId','previousCompletedSegments']) || !validText(input.text)
          || !validTurnId(input.turnId)
          || Object.hasOwn(input,'previousTurnId') && input.previousTurnId !== null && !validTurnId(input.previousTurnId)
          || Object.hasOwn(input,'previousCompletedSegments') && (!Number.isInteger(input.previousCompletedSegments) || input.previousCompletedSegments < 0 || input.previousCompletedSegments > 2)
          || input.previousPlayback !== undefined && !['played','interrupted'].includes(input.previousPlayback)) throw problem(400,'invalid_request');
        if (possiblePhi(input.text)) throw problem(400,'fictional_practice_only');
        if (req.aborted || res.destroyed) throw problem(409,'turn_cancelled');
        const session = sessionFor(input.sessionId), key = String(input.turnId);
        if (session.finished) throw problem(409,'session_finished');
        const fingerprint = JSON.stringify([input.text,input.previousPlayback || 'interrupted',Object.hasOwn(input,'previousTurnId'),input.previousTurnId ?? null,input.previousCompletedSegments ?? 0]);
        let operation = session.operations.get(key);
        if (operation?.cancelled) throw problem(409,'turn_cancelled');
        if (operation && operation.fingerprint !== fingerprint) throw problem(409,'turn_id_conflict');
        if (!operation) {
          if (session.pending) throw problem(409,'turn_in_progress');
          if (session.turns >= (session.parentId ? 1 : 10)) throw problem(429,'turn_limit');
          if (active >= 2) throw problem(429,'concurrency_limit');
          if (providerTurns >= maxProviderTurns) throw problem(429,'audition_limit');
          if (speechOperations >= maxSpeechOperations) throw problem(429,'speech_audition_limit');
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(),turnTimeoutMs); timer.unref?.();
          operation = {fingerprint,controller,promise:null,audioItems:[],speechPromises:[],audioBytes:0};
          controller.signal.addEventListener('abort',() => cancelOperationAudio(operation),{once:true});
          session.pending = operation; session.operations.set(key,operation); active += 1; providerTurns += 1;
          const cancelled = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(problem(409,'turn_cancelled')), {once:true}));
          const started=Date.now();
          operation.promise = Promise.race([prepareTurn(session,input,operation),cancelled]).catch(error => {
            recordFailure(error,'actor','server_actor',started);
            if (controller.signal.aborted || session.closed) throw problem(409,'turn_cancelled');
            controller.abort();
            if (error?.status && ['invalid_audio'].includes(error.code)) throw error;
            if (error?.code === 'speech_audition_limit') throw error;
            throw problem(502,'provider_failed');
          });
          operation.completion = Promise.race([operation.promise.then(() => operation.synthesis),cancelled]).catch(() => {
            for (const item of operation.audioItems) finishAudio(item,controller.signal.aborted ? 'cancelled' : 'failed');
          }).finally(() => { clearTimeout(timer); active -= 1; if (session.pending === operation) session.pending = null; });
        }
        const cancel = () => { if (!res.writableEnded) operation.controller.abort(); };
        req.once('aborted',cancel); res.once('close',cancel);
        try { const result = await operation.promise; return send(res,200,result); }
        finally { req.removeListener('aborted',cancel); res.removeListener('close',cancel); }
      }
      if (pathname.startsWith('/api/')) throw problem(404,'not_found');
      if (req.method !== 'GET') throw problem(405,'method_not_allowed');
      await staticFile(req,res);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      send(res,status,{error:{code:Number.isInteger(error?.status) ? error.code : 'server_error',message:'Dana could not complete this local request.'}});
    }
  });
  server.requestTimeout = 100000; server.headersTimeout = 10000;
  const interval = setInterval(prune,30000); interval.unref();
  const close = server.close.bind(server);
  server.close = (...args) => { shuttingDown = true; clearInterval(interval); [...sessions.values()].forEach(drop); return close(...args); };
  server.on('close',() => { clearInterval(interval); [...sessions.values()].forEach(drop); });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--port')) throw new Error('Usage: node dana-live-server.mjs [--port 4319]');
  const port = args.length ? Number(args[1]) : 4319;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port.');
  const {createOpenAIProvider} = await import('./dana-openai-provider.mjs');
  const server = createDanaServer({provider:createOpenAIProvider()});
  server.listen(port,'127.0.0.1',() => console.info(`Local Dana ready at http://127.0.0.1:${port}/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1&danaLive=1`));
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal,() => server.close());
}
