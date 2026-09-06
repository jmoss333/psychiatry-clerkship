/* Usage analytics emitter. Sends allowlisted event keys and nothing else.
 *
 * Never transmitted: any identifier, timestamp, URL, referrer, or free text.
 * The visit set below lives in memory only; it exists so a refresh does not
 * double-count a step, and it is never serialized or sent.
 *
 * Every failure path is silent. If this file throws, the page must not notice.
 *
 * On load, auto-records the current page as `page:<CW_PAGE>` — CW_PAGE is a
 * build-time literal injected alongside CW_SITE by the build (never derived
 * from location.pathname or any other client-side source), and the record
 * only fires when it is a non-empty string. This goes through the same
 * record() path as a manual call, so it honors opt-out, DNT/GPC, and dedup.
 */
(function (w) {
  var ENDPOINT = 'https://clerkship-metrics.netlify.app/api/ev';
  var seen = {};

  function optedOut() {
    try {
      return w.localStorage.getItem('cw_analytics_optout_v1') === '1';
    } catch (e) {
      return false;
    }
  }

  function signalsPrivacy() {
    var nav = w.navigator || {};
    return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
  }

  function enabled() {
    return !signalsPrivacy() && !optedOut();
  }

  function record(key) {
    try {
      if (typeof key !== 'string' || !key) return;
      if (!enabled()) return;
      if (seen[key]) return;
      seen[key] = true;
      var site = w.CW_SITE === 'res' ? 'res' : 'ms3';
      w.navigator.sendBeacon(ENDPOINT, JSON.stringify({ site: site, keys: [key] }));
    } catch (e) {
      // Silent by contract.
    }
  }

  function optOut() {
    try { w.localStorage.setItem('cw_analytics_optout_v1', '1'); } catch (e) { /* silent */ }
  }

  function optIn() {
    try { w.localStorage.removeItem('cw_analytics_optout_v1'); } catch (e) { /* silent */ }
  }

  function autoRecordPage() {
    try {
      var page = w.CW_PAGE;
      if (typeof page === 'string' && page) record('page:' + page);
    } catch (e) {
      // Silent by contract.
    }
  }

  w.cwAnalytics = { record: record, optOut: optOut, optIn: optIn, enabled: enabled };

  autoRecordPage();
}(typeof window !== 'undefined' ? window : this));
