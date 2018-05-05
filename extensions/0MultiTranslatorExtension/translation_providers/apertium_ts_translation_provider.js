let $;
// Mark for deletion on EOL. Cinnamon 3.6.x+
if (typeof require === "function") {
    $ = require("./utils.js");
} else {
    $ = imports.ui.extensionSystem.extensions["{{UUID}}"].utils;
}

var NEEDS_EXTENSION_OBJECT = false;

function Translator() {
    this._init.apply(this, arguments);
}

Translator.prototype = {
    __proto__: $.TranslateShellBaseTranslator.prototype,

    _init: function(aExtension) {
        this.engine_name = "apertium";
        this.provider_name = "Apertium.TS";
        this.extra_options = [
            "--show-original", "n",
            // If using these arguments with apertium, it gives blank translations.
            // "--show-prompt-message", "n",
            // "--no-bidi",
        ];
        $.TranslateShellBaseTranslator.prototype._init.call(this, aExtension);
    }
};

/* exported NEEDS_EXTENSION_OBJECT
 */
