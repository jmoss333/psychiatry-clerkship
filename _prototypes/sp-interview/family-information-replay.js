/* Earlier conversation only. No case inventory, inference, storage, or scoring. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FamilyInformationReplay = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var viewers = ['learner', 'morgan', 'maya'];
  var channels = ['public', 'morgan-private', 'maya-private'];
  var eventKeys = ['id', 'kind', 'text', 'channel', 'audience', 'status', 'roleId', 'targetRoleId', 'turnId', 'groupId', 'segmentId'];
  var entryKeys = ['id', 'text', 'kind', 'roleId', 'targetRoleId', 'channel', 'turnId'];
  var own = function (value, key) { return Object.prototype.hasOwnProperty.call(value, key); };
  var role = function (value) { return value === 'morgan' || value === 'maya'; };
  var owner = function (channel) { return channel === 'public' ? null : channel.slice(0, -8); };
  var token = function (value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); };

  function record(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    // JSON records have data properties. Never invoke an accessor while deciding
    // which private conversation may be shown.
    return Object.getOwnPropertyNames(value).every(function (key) {
      return own(Object.getOwnPropertyDescriptor(value, key), 'value');
    });
  }
  function array(value) {
    if (!Array.isArray(value)) return false;
    var names = Object.getOwnPropertyNames(value);
    return names.length === value.length + 1 && names.every(function (key) {
      return (key === 'length' || /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < value.length)
        && own(Object.getOwnPropertyDescriptor(value, key), 'value');
    });
  }
  function text(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 1200
      && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
      && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
  }
  function audience(event) {
    var allowed = event.channel === 'public' ? viewers : ['learner', owner(event.channel)];
    return array(event.audience) && event.audience.length > 0
      && event.audience.every(function (id, index, all) { return allowed.indexOf(id) !== -1 && all.indexOf(id) === index; });
  }
  function eventShape(event, index) {
    if (!record(event) || !Object.getOwnPropertyNames(event).every(function (key) { return eventKeys.indexOf(key) !== -1; })
      || !['id', 'kind', 'text', 'channel', 'audience', 'status'].every(function (key) { return own(event, key); })
      || event.id !== 'e' + (index + 1) || channels.indexOf(event.channel) === -1 || !text(event.text) || !audience(event)) return false;
    if (event.kind === 'transition') {
      return event.status === 'completed' && !['roleId', 'targetRoleId', 'turnId', 'groupId', 'segmentId'].some(function (key) { return own(event, key); });
    }
    if (!own(event, 'turnId') || !Number.isInteger(event.turnId) || event.turnId < 1 || event.turnId > 10
      || !own(event, 'groupId') || !token(event.groupId) || event.audience.indexOf('learner') === -1) return false;
    if (event.kind === 'learner') {
      return event.status === 'completed' && event.text.trim() === event.text && !own(event, 'roleId') && !own(event, 'segmentId')
        && own(event, 'targetRoleId') && (role(event.targetRoleId) || event.targetRoleId === 'both')
        && (event.channel === 'public' || event.targetRoleId === owner(event.channel));
    }
    return event.kind === 'segment' && own(event, 'roleId') && role(event.roleId)
      && !own(event, 'targetRoleId') && own(event, 'segmentId') && token(event.segmentId)
      && ['completed', 'pending', 'interrupted'].indexOf(event.status) !== -1
      && (event.channel === 'public' || event.roleId === owner(event.channel));
  }
  function entry(event) {
    var result = {};
    entryKeys.forEach(function (key) { if (own(event, key)) result[key] = event[key]; });
    return result;
  }
  function eligible(event, id) {
    return event.audience.indexOf(id) !== -1 && (event.channel === 'public' || id === 'learner' || owner(event.channel) === id);
  }

  function buildReplay(room, turnId) {
    try {
      if (!record(room) || !own(room, 'status') || room.status !== 'finished' || !own(room, 'events') || !array(room.events)
        || own(room, 'finished') && room.finished !== true || own(room, 'activeGroup') && room.activeGroup !== null
        || own(room, 'sourceTurnId') && room.sourceTurnId !== null || own(room, 'maxTurns') && room.maxTurns !== 10
        || !Number.isInteger(turnId) || turnId < 1 || turnId > 10) return null;
      var selected = -1, latest = null, lastTurn = 0, currentChannel = 'public', groupIds = new Set(), segmentIds = new Set();
      // Validate the complete original record before returning any excerpt. The
      // prefix below is equivalent to beginTurn's snapshot, since earlier groups
      // have settled before the next learner question is accepted.
      for (var index = 0; index < room.events.length; index += 1) {
        var event = room.events[index];
        if (!eventShape(event, index)) return null;
        if (event.kind === 'transition') { currentChannel = event.channel; continue; }
        if (event.kind === 'learner') {
          if (event.turnId !== lastTurn + 1 || event.channel !== currentChannel || groupIds.has(event.groupId)) return null;
          latest = event; lastTurn = event.turnId; groupIds.add(event.groupId);
          if (event.turnId === turnId) selected = index;
        } else {
          if (!latest || event.turnId !== latest.turnId || event.groupId !== latest.groupId || event.channel !== latest.channel
            || event.channel !== currentChannel || latest.targetRoleId !== 'both' && event.roleId !== latest.targetRoleId
            || segmentIds.has(event.segmentId)) return null;
          segmentIds.add(event.segmentId);
        }
      }
      if (selected < 0 || own(room, 'turnCount') && room.turnCount !== lastTurn) return null;
      var question = room.events[selected];
      var views = viewers.map(function (id) { return {id: id, shared: [], private: [], unconfirmedCount: 0, excludedPrivateCount: 0}; });
      for (var before = 0; before < selected; before += 1) {
        var earlier = room.events[before];
        if (earlier.kind === 'transition') continue;
        views.forEach(function (view) {
          var permitted = eligible(earlier, view.id);
          if (earlier.kind === 'segment' && earlier.status !== 'completed') {
            if (permitted) view.unconfirmedCount += 1;
            return;
          }
          if (permitted) view[earlier.channel === 'public' ? 'shared' : 'private'].push(entry(earlier));
          else if (earlier.channel !== 'public') view.excludedPrivateCount += 1;
        });
      }
      return {turnId: turnId, question: {text: question.text, channel: question.channel, targetRoleId: question.targetRoleId}, views: views};
    } catch (_) {
      return null;
    }
  }

  return {buildReplay: buildReplay};
});
