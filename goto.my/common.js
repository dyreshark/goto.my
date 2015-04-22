// Common variables shared by scripts. Also random constants.

// For jshint
/* global chrome */

// Default storage that we want to use.
var storage = chrome.storage.sync;

// ID used in storage for things that don't concern the user
var INTERNAL_STORAGE_ID = '__internal_use_only';
var INTERNAL_IDS = {
    search_engine: 'default-search'
};

// For the search functionality above, we replace '%s' with the user's query.
// So, if the user typed "<leader>abc123", and we couldn't match abc123 against
// a known key, we'd navigate to ${search_engine}.replace(SEARCH_REPLACE_STRING,
// 'abc123');
var SEARCH_REPLACE_STRING = '%s';

var callback = window.onCommonLoaded;
if (callback !== undefined) {
    callback();
}

// We want to hand the user sane default URLs that they can build upon.
// I've personally found all of the following useful to have on hotkeys.
function getDefaultStorageState() {
    // Search engine that's used if the user has shown no preference otherwise
    var DEFAULT_SEARCH_ENGINE = 'https://google.com#q=' + SEARCH_REPLACE_STRING;

    var res = {
        docs: 'https://docs.google.com',
        mail: 'https://mail.google.com',
        ide: 'https://ideone.com',
        reddit: 'https://reddit.com',
        facebook: 'https://facebook.com',
        programming: 'https://reddit.com/r/programming',
        talesfromtechsupport: 'https://reddit.com/r/talesfromtechsupport',
        settings: chrome.runtime.getURL('options.html')
    };

    var internals = {};
    internals[INTERNAL_IDS.search_engine] = DEFAULT_SEARCH_ENGINE;

    res[INTERNAL_STORAGE_ID] = internals;
    return res;
}

