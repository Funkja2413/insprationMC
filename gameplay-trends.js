(function(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.InspoGameplayTrends = factory();
})(typeof window !== "undefined" ? window : this, function() {
  "use strict";

  var DEFAULT_KEY = "inspo-gameplay-stats-v1";
  var DEFAULT_VERSION = "taxonomy-v1";

  function validValue(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function validCount(count) {
    return Number.isSafeInteger(count) && count >= 0;
  }

  // Reject incomplete/malformed input instead of recording an artificial drop.
  function countsFromStats(stats) {
    if (!Array.isArray(stats)) return null;
    var counts = Object.create(null);
    for (var i = 0; i < stats.length; i++) {
      var entry = stats[i];
      if (!entry || !validValue(entry.value) || !validCount(entry.count)
        || Object.prototype.hasOwnProperty.call(counts, entry.value)) return null;
      counts[entry.value] = entry.count;
    }
    return counts;
  }

  function signature(counts) {
    return JSON.stringify(Object.keys(counts).sort().map(function(value) {
      return [value, counts[value]];
    }));
  }

  function readSnapshot(storage, key, version) {
    try {
      if (!storage || typeof storage.getItem !== "function") return null;
      var snapshot = JSON.parse(storage.getItem(key));
      if (!snapshot || snapshot.version !== version || typeof snapshot.at !== "string"
        || new Date(snapshot.at).toISOString() !== snapshot.at
        || !snapshot.counts || typeof snapshot.counts !== "object"
        || Array.isArray(snapshot.counts)) return null;

      var counts = Object.create(null);
      var values = Object.keys(snapshot.counts);
      for (var i = 0; i < values.length; i++) {
        var value = values[i];
        if (!validValue(value) || !validCount(snapshot.counts[value])) return null;
        counts[value] = snapshot.counts[value];
      }
      return { at: snapshot.at, counts: counts };
    } catch (_) {
      return null;
    }
  }

  /**
   * Compare a complete set of gameplay counts against this visit's initial record.
   * No global storage access, networking, event listeners or timers are created.
   * `previousAt` is the time counts were recorded, not the last visit time.
   */
  function createTracker(options) {
    options = options || {};
    var storage = options.storage;
    var key = validValue(options.key) ? options.key : DEFAULT_KEY;
    var version = validValue(options.version) || Number.isSafeInteger(options.version)
      ? options.version : DEFAULT_VERSION;
    var now = typeof options.now === "function" ? options.now : Date.now;
    var previous = readSnapshot(storage, key, version);
    var savedSignature = previous ? signature(previous.counts) : null;

    function compare(stats) {
      var result = {
        previousAt: previous ? previous.at : null,
        deltas: {},
        hasBaseline: previous !== null
      };
      if (!previous) return result;
      try {
        var current = countsFromStats(stats);
        if (!current) return result;
        var values = new Set(Object.keys(previous.counts).concat(Object.keys(current)));
        values.forEach(function(value) {
          // Define own properties so arbitrary category IDs cannot affect prototypes.
          Object.defineProperty(result.deltas, value, {
            value: (current[value] || 0) - (previous.counts[value] || 0),
            enumerable: true,
            configurable: true,
            writable: true
          });
        });
      } catch (_) {
        result.deltas = {};
      }
      return result;
    }

    // True also covers an already-persisted, unchanged record; false means no save.
    function save(stats) {
      try {
        var counts = countsFromStats(stats);
        if (!counts) return false;
        var nextSignature = signature(counts);
        if (nextSignature === savedSignature) return true;
        if (!storage || typeof storage.setItem !== "function") return false;

        var snapshot = {
          version: version,
          at: new Date(now()).toISOString(),
          counts: counts
        };
        storage.setItem(key, JSON.stringify(snapshot));
        savedSignature = nextSignature;
        // Deliberately keep `previous` frozen until a new tracker is constructed.
        return true;
      } catch (_) {
        return false;
      }
    }

    return { compare: compare, save: save };
  }

  return { createTracker: createTracker };
});
