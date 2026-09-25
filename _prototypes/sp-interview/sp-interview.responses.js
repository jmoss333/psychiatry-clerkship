/* Local Dana prototype only. Selects existing recordings; never authors patient facts. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SPInterviewResponses = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var DANA = 'sp_depression_gated_si_001';

  // Match the entire question. Never strip an unrecognized clause, negation, or
  // risk phrase to turn a mixed utterance into a benign question.
  var aliases = [
    {intent:'sleep', patterns:[
      /^(?:have you (?:been able to|managed to)|are you able to|can you) get (?:any|some|enough|much) rest[?.!]*$/i,
      /^have you (?:had|been getting) (?:any|some|enough|much) rest(?: lately)?[?.!]*$/i
    ]},
    {intent:'appetite', patterns:[/^(?:have you been|are you|do you get) hungry(?: (?:at all|lately|these days|much))?[?.!]*$/i]},
    {intent:'work_stressor', patterns:[/^what (?:do you|did you(?: use to)?) do for a living[?.!]*$/i]},
    {intent:'family_social', patterns:[
      /^who (?:lives|stays) with you[?.!]*$/i,
      /^(?:is there|do you have) (?:anyone|someone) you can lean on[?.!]*$/i
    ]},
    {intent:'concentration', patterns:[/^are you having trouble remembering things[?.!]*$/i]},
    {intent:'anhedonia', patterns:[/^what kind(?:s)? of things do you like to do[?.!]*$/i]}
  ];

  function matchingText(text) { return String(text).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim(); }
  function extraIntent(session, text) {
    var normalized = matchingText(text);
    for (var i = 0; i < aliases.length; i++) {
      var alias = aliases[i];
      var definition = session.caseDef.intents.find(function (intent) { return intent.id === alias.intent && intent.category === 'data'; });
      if (definition && session.caseDef.responses[alias.intent] && alias.patterns.some(function (pattern) { return pattern.test(normalized); })) return alias.intent;
    }
    return null;
  }

  function socialReply(session, text, state) {
    var normalized = matchingText(text), hits = state.intents || [];
    if ((state.flags || []).length || state.critical || session.caseDef.intents.some(function (intent) {
      return hits.indexOf(intent.id) >= 0 && (intent.category === 'safety' || intent.category === 'flag');
    })) return null;
    // This is a presentation guard, not another clinical classifier: leave these
    // utterances entirely with the canonical responder even if its regex missed.
    if (/\b(?:suicid\w*|kill\w*|dying|die|dead|death|harm\w*|hurt\w*|pills?|overdos\w*|guns?|weapons?|violence|violent)\b/i.test(normalized)) return null;
    if (!hits.length) {
      if (/^(?:(?:hello|hi|hey)(?: dana)?|good (?:morning|afternoon|evening)(?: dana)?)[.!?]*$/i.test(normalized)) return {bank:'greeting_agenda',greeting:true};
      if (/^(?:my goal is|i(?:'m| am) here|i(?:'d| would) like) to (?:help )?(?:understand|hear)(?: more about)? (?:why you(?:'re| are) here|what brought you here|what(?:'s| is) been (?:going on|happening))[.!]*$/i.test(normalized) || /^i(?:'m| am) here to listen[.!]*$/i.test(normalized)) return {bank:'greeting_agenda',greeting:true,purpose:true};
      if (/^i(?:'m| am) sorry (?:that )?you had to[.!]*$/i.test(normalized)) return {bank:'reflection',neutral:true};
      if (/^i(?:'m| am) sorry(?: (?:that (?:happened|you had to)|you had to) (?:tell|explain|repeat) (?:everything|(?:the|that) (?:doctor|person|nurse) everything|your story)(?: (?:again|last night|so many times))?)?[.!]*$/i.test(normalized) || /^i(?:'m| am) sorry (?:that happened|to hear that)[.!]*$/i.test(normalized)) return {bank:'reflection'};
      if (/^that(?:'s| is) (?:really |very )?(?:hard|difficult|exhausting|heavy|painful|lonely)(?: (?:it seems|it sounds) like)?[.!]*$/i.test(normalized)) return {bank:'reflection'};
    }
    // A single reflective statement is an acknowledgement, not a new data
    // question. Retain the core's clinical state but play its reflection clip.
    // Questions and additional clauses are deliberately not handled here.
    if (hits.indexOf('reflection') >= 0 && /^(?:(?:it )?sounds (?:like|as if)|that (?:must|sounds|seems) (?:be )?(?:really |very )?(?:hard|difficult|exhausting|heavy|painful|lonely)|i can (?:hear|see) (?:that|how))\b[^?!.;]*[.!]?$/i.test(normalized) && !/\b(?:what|why|can you|could you|do you|did you|have you|are you|tell me)\b/i.test(normalized) && !/\bhow\b/i.test(normalized.replace(/^i can (?:hear|see) how\b/i, ''))) return {bank:'reflection'};
    return null;
  }

  function followupReply(session, text, state, turnIndex, tier) {
    if ((state.intents || []).length || !/^(?:can|could) you say (?:a little )?more about (?:that|it)[?.!]*$/i.test(matchingText(text))) return null;
    var previous = session.turns[turnIndex - 1];
    if (!previous || (previous.flags || []).length) return null;
    var definitions = session.caseDef.intents.filter(function (intent) { return (previous.intents || []).indexOf(intent.id) >= 0; });
    if (definitions.some(function (intent) { return intent.category === 'safety' || intent.category === 'flag'; })) return null;
    var topics = definitions.filter(function (intent) {
      return intent.category === 'data' && ['mood','anhedonia','sleep','appetite','energy','concentration','guilt','work_stressor','family_social'].indexOf(intent.id) >= 0;
    });
    if (topics.length !== 1) return null;
    var bank = session.caseDef.responses[topics[0].id], lines = bank && bank[tier];
    if (!lines || lines.indexOf(previous.pt) < 0) return null;
    var unused = lines.filter(function (line) { return !session.turns.slice(0, turnIndex).some(function (turn) { return turn.pt === line; }); });
    return unused.length ? {bank:topics[0].id,lines:unused,followup:true} : null;
  }

  function createProvider(core) {
    if (!core || typeof core.MockProvider !== 'function') throw new Error('The scripted case provider is unavailable.');
    var provider = new core.MockProvider();
    var canonicalMatch = provider._match, canonicalRespond = provider.respond;
    var selections = new WeakMap();
    provider._match = function (session, text) {
      var hits = canonicalMatch.call(this, session, text);
      if (session.caseDef.id !== DANA || hits.length) return hits;
      var alias = extraIntent(session, text);
      return alias ? [alias] : hits;
    };
    provider.respond = function (session, text) {
      var turnIndex = session.turns.length;
      return canonicalRespond.call(this, session, text).then(function (result) {
        if (session.caseDef.id !== DANA) return result;
        var tier = provider._tier(session);
        var selection = socialReply(session, text, result.state) || followupReply(session, text, result.state, turnIndex, tier);
        if (!selection) return result;
        var bank = session.caseDef.responses[selection.bank];
        var lines = selection.lines || (selection.neutral ? bank && bank.guarded && bank.guarded.slice(0, 1) : bank && bank[tier]);
        // The first open greeting thanks a self-introduction. Plain Hello and
        // purpose statements do not license that assertion; use the other clip.
        if (selection.greeting && bank) {
          if (tier === 'open') lines = bank.open && bank.open.slice(1, 2);
          else if (selection.purpose) lines = bank.guarded && bank.guarded.slice(1, 2);
        }
        if (!lines || !lines.length) return result;
        // Social playback has its own cursor so it cannot consume a canonical
        // response variation or change clinical state, rapport, or disclosure.
        var cursors = selections.get(session) || Object.create(null), key = selection.bank + ':' + (selection.followup ? 'followup' : selection.neutral ? 'neutral' : tier);
        var index = cursors[key] || 0;
        var previous = session.turns[turnIndex - 1];
        if (lines.length > 1 && previous && previous.pt === lines[index % lines.length]) index += 1;
        result.reply = lines[index % lines.length];
        cursors[key] = index + 1; selections.set(session, cursors);
        // Debrief sees the exact original learner words and exact played source
        // text. Stage directions remain for the recording lookup to resolve.
        session.turns[turnIndex].pt = result.reply;
        return result;
      });
    };
    return provider;
  }
  return {createProvider:createProvider};
});
