// JS to go with options.html
// Supports magic.

// For jshint
/* global INTERNAL_STORAGE_ID */
/* global SEARCH_REPLACE_STRING */
/* global DEFAULT_SEARCH_ENGINE */
/* global chrome */
/* global confirm */
/* global alert */

// From common.js
/* global storage */
/* global getDefaultStorageState */

(function() {
    var changesHappened = false;
    var isModifying = false;
    /* global noteChangedFields */
    window.noteChangedFields = function() { changesHappened = true; };
    /* global noteAllFieldsSaved */
    window.noteAllFieldsSaved = function() { changesHappened = false; };

    /* global hasUserChangedFields */
    window.hasUserChangedFields = function() {
        return changesHappened || isModifying;
    };

    // Field modifying logic is necessary because chrome tracks whether a field
    // was *actually* changed or not for us. The issue is that we only get these
    // change notifications when the user has put focus away from the textbox,
    // meaning the user can forget to save && we forget to remind the user to
    // save if they only modify a textbox, then attempt to exit the webpage
    // immediately.

    /* global noteModifyingField */
    window.noteModifyingField = function() {
        isModifying = true;
    };

    /* global noteNoLongerModifyingField */
    window.noteNoLongerModifyingField = function() {
        isModifying = false;
    };
}());

function trackChangesOfTextbox(box) {
    box.onchange = noteChangedFields;
}

// Page settings are stored as
// <div>
//   <input type="text">Name goes here</input>
//   <input type="text">Value goes here</input>
// </div>
function wrapPageSettingWithPrettyAPI(elem) {
    var children = elem.childNodes;
    var nameInput = children[0].childNodes[0];
    var valInput = children[1].childNodes[0];
    return {
        getName: function() { return nameInput.value; },
        setName: function(n) { nameInput.value = n; },
        getValue: function() { return valInput.value; },
        setValue: function(n) { valInput.value = n; }
    };
}

function addUserFacingSetting(name, value) {
    var row = document.createElement('tr');

    [name, value].forEach(function(val) {
        var cell = document.createElement('td');
        var input = document.createElement('input');
        input.type = 'text';
        input.value = val;
        trackChangesOfTextbox(input);
        cell.appendChild(input);
        cell.onkeypress = noteModifyingField;
        cell.onblur = noteNoLongerModifyingField;
        row.appendChild(cell);
    });

    var removeCell = document.createElement('td');
    var removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.onclick = function() {
        noteChangedFields();
        row.remove();
    };
    removeButton.innerHTML = 'X';

    var buttonClasses = ['btn-danger', 'btn', 'btn-xs'];
    buttonClasses.forEach(function(c) { removeButton.classList.add(c); });

    removeCell.appendChild(removeButton);
    row.appendChild(removeCell);

    var entries = document.getElementById('mapping-entries');
    entries.appendChild(row);

    return wrapPageSettingWithPrettyAPI(row);
}

function clearUserFacingSettings() {
    var entries = document.getElementById('mapping-entries');
    while (entries.firstChild !== null) {
        entries.removeChild(entries.firstChild);
    }
}

// I'm too lazy to do some crazy diffing scheme.

(function() {
    var idInputMap = {
        'default-search': null,
    };

    for (var key in idInputMap) {
        if (idInputMap.hasOwnProperty(key)) {
            var elem = document.getElementById(key);
            if (elem === null) {
                throw new Error("Expected to find an element with ID: " + key);
            }
            trackChangesOfTextbox(elem);
            idInputMap[key] = elem;
        }
    }

    /* global getInternalSettings */
    window.getInternalSettings = function() {
        var settings = {};
        for (var key in idInputMap) {
            if (idInputMap.hasOwnProperty(key)) {
                settings[key] = idInputMap[key].value;
            }
        }
        return settings;
    };

    /* global setInternalSettings */
    window.setInternalSettings = function(internals) {
        for (var key in internals) {
            if (internals.hasOwnProperty(key)) {
                idInputMap[key].value = internals[key];
            }
        }
    };
}());

function getUserFacingSettings() {
    var result = {};
    var nodes = document.getElementById('mapping-entries').childNodes;
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.tagName.toUpperCase() !== 'TR') {
            console.log("Got tag name with ", node.tagName);
            continue;
        }

        var wrapped = wrapPageSettingWithPrettyAPI(node);

        // It's not a *requirement* that name/value are trimmed, but it makes
        // life nicer when whitespace isn't a thing IMO
        var name = wrapped.getName().trim();
        var value = wrapped.getValue().trim();
        wrapped.setName(name);
        wrapped.setValue(value);
        if (name === '' || value === '') {
            continue;
        }

        if (name === INTERNAL_STORAGE_ID) {
            alert("Sorry, the name " + INTERNAL_STORAGE_ID +
                  " is reserved for internal use.");
            name = 'nope_' + name;
            wrapped.setName(name);
        }

        result[name] = value;
    }

    // This is intentionally last so it overwrites whatever the user decided to
    // pop in their textboxes.
    result[INTERNAL_STORAGE_ID] = getInternalSettings();
    return result;
}

function setURLMappings(settingsMap) {
    clearUserFacingSettings();
    var keys = [];
    for (var key in settingsMap) {
        if (settingsMap.hasOwnProperty(key)) {
            keys.push(key);
        }
    }

    keys.sort();
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        addUserFacingSetting(k, settingsMap[k]);
    }
}

function persistCurrentSettings(onComplete) {
    var settings = getUserFacingSettings();
    storage.clear(function() { storage.set(settings, onComplete); });
}

function setUserFacingSettings(settingsMap) {
    var internal = settingsMap[INTERNAL_STORAGE_ID];
    delete settingsMap[INTERNAL_STORAGE_ID];
    setInternalSettings(internal);
    setURLMappings(settingsMap);
}

(function() {
    var STATUS_OKAY_CLASS = 'alert-success';

    var StatusElement = function(elem) {
        this.elem = elem;
        this.elem.classList.add(STATUS_OKAY_CLASS);
        this.totalUpdates = 0;
    };

    StatusElement.prototype.show = function(status) {
        this.totalUpdates++;
        this.elem.innerHTML = status;
        this.elem.hidden = false;
    };

    // showDelayed exists because a lot of the time, our messages will only
    // appear for a fraction of a second, then swap to another one. I don't like
    // "flashy" UXes like that, so we delay displaying the message by a bit and
    // let any other message we'd print "override" this display.
    StatusElement.prototype.showDelayed = function(status, msec) {
        var initialUpdate = this.totalUpdates;
        var thiz = this;
        var onTimeout = function() {
            if (thiz.totalUpdates === initialUpdate) {
                thiz.show(status);
            }
        };

        // Most of the time, Chrome responds within 200ms without a problem.
        if (msec === undefined) {
            msec = 200;
        }
        setTimeout(onTimeout, msec || 200);
    };

    StatusElement.prototype.hide = function() {
        this.totalUpdates++;
        this.elem.hidden = true;
    };

    StatusElement.prototype.showTemporarily = function(message, msec) {
        this.show(message);
        var updateNumber = this.totalUpdates;
        var thiz = this;
        var onTimeout = function() {
            if (updateNumber === thiz.totalUpdates) {
                thiz.hide();
            }
        };

        // I think 3s is a reasonable global default for temporarily showing
        // something
        if (msec === undefined) {
            msec = 3000;
        }
        setTimeout(onTimeout, msec);
    };

    var statusElementIDs = {
        saveStatus: 'save-status',
        resetStatus: 'reset-status'
    };

    var statusElements = {};
    for (var key in statusElementIDs) {
        if (!statusElementIDs.hasOwnProperty(key)) {
            continue;
        }
        var id = statusElementIDs[key];
        var elem = document.getElementById(id);
        if (elem === null) {
            throw new Error("Expected a status element by ID: " + id);
        }
        statusElements[key] = new StatusElement(elem);
    }

    /* global statusElements */
    window.statusElements = statusElements;
}());

document.getElementById('add-button').onclick = function() {
    addUserFacingSetting('', '');
};

document.getElementById('save-button').onclick = function() {
    var saveButton = this;
    statusElements.saveStatus.showDelayed('Saving...');

    // "But author! You can still call save-button.onclick manually while a save
    // is in progress!"
    // If you want to screw your own settings up, that's on you.
    saveButton.disabled = true;
    persistCurrentSettings(function() {
        noteAllFieldsSaved();
        statusElements.saveStatus.showTemporarily('Ok!');
        saveButton.disabled = false;
    });
};

document.getElementById('reset-button').onclick = function() {
    var resetButton = document.getElementById('reset-button');
    var really = confirm("Are you sure you want to reset everything?");
    if (!really) {
        return;
    }

    resetButton.disabled = true;
    statusElements.resetStatus.showDelayed('Resetting everything...');

    var defaults = getDefaultStorageState();
    storage.clear(function() {
        noteAllFieldsSaved();
        storage.set(defaults, function() {
            setUserFacingSettings(defaults);
            resetButton.disabled = false;
            statusElements.resetStatus.showTemporarily('Ok!');
        });
    });
};

window.onbeforeunload = function() {
    if (!hasUserChangedFields()) {
        return;
    }
    return 'You may have unsaved changes.';
};

storage.get(null, setUserFacingSettings);
