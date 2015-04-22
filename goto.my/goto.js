// Main script in goto.my
//
// High-level idea:
//   Keep a mapping of key->value, where if the user types in key, we go to
//   value.
//
//   If no value can possibly be matched for the given key, default to searching
//   (useful for defaulting to a second search engine, or as a shortcut for
//    internal DNS, if your system magically routes foo/${place} to the correct
//    destination for ${place}).

// Ensure that common gets loaded after this script
var script = document.createElement('script');
script.type = 'text/javascript';
script.src = 'common.js';
document.head.appendChild(script);

// For jshint
/* global INTERNAL_STORAGE_ID */
/* global SEARCH_REPLACE_STRING */
/* global DEFAULT_SEARCH_ENGINE */
/* global INTERNAL_IDS */
/* global chrome */

// From common.js
/* global storage */
/* global getDefaultStorageState */

// Both maps.
var internalStorage, mappings;

// Creates a URL for the given query, given the user's search preferences.
function makeSearchURLFor(query) {
    var base = internalStorage[INTERNAL_IDS.search_engine];
    if (base === '' || base === undefined) {
        return null;
    }
    return base.replace(SEARCH_REPLACE_STRING, query);
}

// Resets our storage.
function setupLikeNew(onUpdate) {
    if (onUpdate === undefined) {
        onUpdate = function() {};
    }

    storage.clear(function() {
        storage.set(getDefaultStorageState(), onUpdate);
    });
}

function noteInternalStorageUpdated(newValue) {
    if (newValue === undefined) {
        newValue = {};
    }
    internalStorage = newValue;
}

// Expects a StorageChange
function noteStorageUpdated(changes) {
    for (var key in changes) {
        if (!changes.hasOwnProperty(key)) {
            continue;
        }

        var newValue = changes[key].newValue;
        if (key === INTERNAL_STORAGE_ID) {
            // Yes, it's possible to set internalStorage to undefined.
            noteInternalStorageUpdated(newValue);
            continue;
        }

        if (newValue === undefined) {
            delete mappings[key];
            continue;
        }

        mappings[key] = newValue;
    }
}

function fuzzyHasSubstring(mainStr, subStr) {
    var chars = {};
    var str = mainStr.split('');
    var subs = subStr.split('');

    subs.forEach(function(c) { chars[c] = chars[c]+1 || 1; });
    str.forEach(function(c) { chars[c] = chars[c]-1 || -1; });

    // For any char, c, if chars[c] >= 1, subStr has chars not in mainStr
    return subs.every(function(c) { return chars[c] <= 0; });
}

function getKeywords() {
    var keywords = [];
    for (var key in mappings) {
        if (mappings.hasOwnProperty(key)) {
            keywords.push(key);
        }
    }
    return keywords;
}

function scoreStringMatch(base, maybeMatch) {
    if (base === maybeMatch) {
        return Infinity; // :)
    }

    if (!fuzzyHasSubstring(base, maybeMatch)) {
        return 0;
    }

    var score = 0;
    var weights = {
        isPrefix: 0.5,
        isCompleteSubstring: 0.5,
        lengthDifference: 0.1,
    };

    var stringIndex = base.indexOf(maybeMatch);
    if (stringIndex === 0) {
        score += weights.isPrefix;
    }

    if (stringIndex !== -1) {
        score += weights.isCompleteSubstring;
    }

    var lengthPct = maybeMatch.length / base.length;
    if (lengthPct > 1) {
        lengthPct = 0;
    }
    score += lengthPct * weights.lengthDifference;
    return score;
}

function findAllCompletions(prefix) {
    var prefixLower = prefix.toLowerCase();
    var scores = {};
    var keywords = getKeywords();
    keywords.forEach(function(c) {
        var score = scoreStringMatch(c, prefixLower);
        scores[c] = score;
    });

    var candidates = keywords.filter(function(c) { return scores[c] !== 0; });
    return candidates.sort(function(a, b) {
        var scoreA = scores[a];
        var scoreB = scores[b];
        if (scoreA === scoreB) {
            return 0;
        }
        // Sort in descending order
        return (scoreA < scoreB) ? 1 : -1;
    });
}

function escapeMapping(mapping) {
    // "You must escape all of {"'<>&}"
    return mapping.replace('&', '&amp;')
                  .replace('"', '&quot;')
                  .replace('\'', '&apos;')
                  .replace('<', '&lt;')
                  .replace('>', '&gt;');
}

function updateSuggestions(prefix, suggest) {
    var completions = findAllCompletions(prefix);
    var searchURL = makeSearchURLFor(prefix);
    if (searchURL !== null) {
        completions.push(searchURL);
    }

    var suggestions = completions.map(function(c) {
        var m = mappings[c];
        var desc;
        if (m === undefined) {
            desc = '<url>' + escapeMapping(c) + '</url>';
        } else {
            desc = escapeMapping(c) + ' => <url>' + escapeMapping(m) + '</url>';
        }
        return {
            content: c,
            description: desc
        };
    });

    suggest(suggestions);

    var best = completions.length === 0 ? prefix : suggestions[0].description;
    chrome.omnibox.setDefaultSuggestion({description: best});
}

function openSelectedSuggestion(text, where) {
    var completions = findAllCompletions(text);
    var completion = completions[0];
    var addr = (completion === undefined) ?
        makeSearchURLFor(text) :
        mappings[completion];

    if (addr === null) {
        return;
    }

    if (where === 'currentTab') {
        var queryCurrent = {active: true, currentWindow: true};
        chrome.tabs.query(queryCurrent, function(tabs) {
            chrome.tabs.update(tabs[0].id, {url: addr});
        });
        return;
    }

    // as opposed to where === 'newBackgroundTab'
    var inForeground = where === 'newForegroundTab';
    var createAttrs = {
        url: addr,
        active: inForeground,
    };

    chrome.tabs.create(createAttrs);
}

function onFirstRun() {
    var firstUsePage = 'firstrun.html';
    var createAttrs = {
        url: chrome.runtime.getURL(firstUsePage),
        active: true
    };

    chrome.tabs.create(createAttrs);
}

function onCommonLoaded() {
    storage.get(null, function(items) {
        mappings = {};

        chrome.omnibox.onInputEntered.addListener(openSelectedSuggestion);
        chrome.omnibox.onInputChanged.addListener(updateSuggestions);
        chrome.storage.onChanged.addListener(noteStorageUpdated);

        var initialized = INTERNAL_STORAGE_ID in items;
        if (!initialized) {
            // We assume that noteStorageUpdated is set at this point.
            setupLikeNew(onFirstRun);
            return;
        }

        internalStorage = items[INTERNAL_STORAGE_ID];
        for (var key in items) {
            if (items.hasOwnProperty(key) && key !== INTERNAL_STORAGE_ID) {
                mappings[key] = items[key];
            }
        }
    });
}

