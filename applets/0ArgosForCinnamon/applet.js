const AppletUUID = "{{UUID}}";

let $;

// Mark for deletion on EOL. Cinnamon 3.6.x+
if (typeof require === "function") {
    $ = require("./utils.js");
} else {
    $ = imports.ui.appletManager.applets[AppletUUID].utils;
}

const _ = $._;

const Applet = imports.ui.applet;
const FileUtils = imports.misc.fileUtils;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const ModalDialog = imports.ui.modalDialog;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const St = imports.gi.St;
const Tooltips = imports.ui.tooltips;
const Util = imports.misc.util;

function ArgosForCinnamonApplet() {
    this._init.apply(this, arguments);
}

ArgosForCinnamonApplet.prototype = {
    __proto__: Applet.TextIconApplet.prototype,

    _init: function(aMetadata, aOrientation, aPanel_height, aInstance_id) {
        Applet.TextIconApplet.prototype._init.call(this, aOrientation, aPanel_height, aInstance_id);

        // Condition needed for retro-compatibility.
        // Mark for deletion on EOL. Cinnamon 3.2.x+
        if (Applet.hasOwnProperty("AllowedLayout")) {
            this.setAllowedLayout(Applet.AllowedLayout.BOTH);
        }

        this.metadata = aMetadata;
        this.instance_id = aInstance_id;
        this.orientation = aOrientation;
        this.menu_keybinding_name = this.metadata.uuid + "-" + this.instance_id;

        try {
            this._bindSettings();
            this._expandAppletContextMenu();
            Gtk.IconTheme.get_default().append_search_path(aMetadata.path + "/icons/");
        } catch (aErr) {
            global.logError(aErr);
        }

        Mainloop.idle_add(() => {
            try {
                this._lineView = new $.ArgosLineView(this);
                this.actor.add_actor(this._lineView.actor);

                this.menuManager = new PopupMenu.PopupMenuManager(this);
                this.menu = new Applet.AppletPopupMenu(this, aOrientation);
                this.menuManager.addMenu(this.menu);

                this._file = null;
                this._timeScriptExecutionStarted = null;
                this._timeScriptExecutionFinished = null;
                this._timeOutputProcessingStarted = null;
                this._timeOutputProcessingFinished = null;
                this._isDestroyed = false;
                this._setFileModeTimeout = 0;
                this._updateTimeout = 0;
                this._callToUpdateTimeout = 0;
                this._cycleTimeout = 0;
                this._initialLoadTimeout = 0;
                this._updateRunning = false;
                this._processingFile = false;
                this._sliderIsSliding = false;
                this._script_path = "";

                this._processFile();
                this._updateKeybindings();
                this._updateIconAndLabel();

                this.menu.connect("open-state-changed", Lang.bind(this, function(aMenu, aOpen) {
                    if (this.pref_update_on_menu_open && aOpen) {
                        this.update();
                        global.log("Menu opened.");
                    }
                }));

                if (!this.pref_initial_load_done) {
                    if (this._initialLoadTimeout > 0) {
                        Mainloop.source_remove(this._initialLoadTimeout);
                        this._initialLoadTimeout = 0;
                    }

                    this._initialLoadTimeout = Mainloop.timeout_add_seconds(1,
                        Lang.bind(this, function() {
                            this.pref_file_path = aMetadata.path + "/examples/python_examples.py";
                            this.pref_initial_load_done = true;
                            this._processFile();
                        }));
                }
            } catch (aErr) {
                global.logError(aErr);
            }
        });
    },

    _processFile: function() {
        if (this._processingFile) {
            return;
        }

        try {
            this._processingFile = true;
            this._timeScriptExecutionStarted = null;
            this._timeScriptExecutionFinished = null;
            this._timeOutputProcessingStarted = null;
            this._timeOutputProcessingFinished = null;

            this._setAppletTooltip();

            this._script_path = this.pref_file_path;

            if (/^file:\/\//.test(this._script_path)) {
                this._script_path = this._script_path.substr(7);
            }

            // Make all checks individually so I can make precise notifications.
            if (GLib.file_test(this._script_path, GLib.FileTest.EXISTS)) {
                if (!GLib.file_test(this._script_path, GLib.FileTest.IS_DIR)) {
                    if (GLib.file_test(this._script_path, GLib.FileTest.IS_EXECUTABLE)) {
                        this._file = Gio.file_new_for_path(this._script_path);
                    } else {
                        this._file = null;
                        Main.notify(
                            _(this.metadata.name),
                            _("Script file is not executable.") + "\n" +
                            this._script_path + "\n" +
                            _("The script file can be made executable from this applet context menu.")
                        );
                    }
                } else {
                    this._file = null;
                    Main.notify(
                        _(this.metadata.name),
                        _("Script file isn't a file, but a directory.") + "\n" +
                        this._script_path
                    );
                }
            } else {
                this._file = null;
                // Notify only if the path to the script is not set.
                // Otherwise, it would be ultra annoying. LOL
                if (this._script_path !== "") {
                    Main.notify(
                        _(this.metadata.name),
                        _("Script file doesn't exists.") + "\n" +
                        this._script_path
                    );
                }
            }

            if (GLib.file_test(this._script_path, GLib.FileTest.EXISTS) &&
                GLib.file_test(this._script_path, GLib.FileTest.IS_EXECUTABLE) &&
                !GLib.file_test(this._script_path, GLib.FileTest.IS_DIR)) {
                this._file = Gio.file_new_for_path(this._script_path);
            } else {
                this._file = null;
            }
        } finally {
            if (this._file !== null) {
                this.update();
            } else {
                // If this._file is null, it might be because the script assigned to the applet was
                // removed, so clean up all remaining data (menu elements, applet text, etc.).
                this._lineView.setLine("");
                this.menu.removeAll();
            }
            this._processingFile = false;
        }
    },

    update: function() {
        this._syncLabelsWithSlidersValue();

        if (this._updateTimeout > 0) {
            Mainloop.source_remove(this._updateTimeout);
            this._updateTimeout = 0;
        }

        if (this._callToUpdateTimeout > 0) {
            Mainloop.source_remove(this._callToUpdateTimeout);
            this._callToUpdateTimeout = 0;
        }

        // This is absolutelly needed because this.update could be triggered
        // hundreds of times by the sliders.
        this._callToUpdateTimeout = Mainloop.timeout_add_seconds(1,
            Lang.bind(this, function() {
                this._update();
                this._callToUpdateTimeout = 0;
            }));
    },

    _update: function() {
        if (this._updateRunning) {
            return;
        }

        this._updateRunning = true;

        try {
            let envp = GLib.get_environ();
            envp.push("ARGOS_VERSION=2");
            envp.push("ARGOS_MENU_OPEN=" + (this.menu.isOpen ? "true" : "false"));

            this._timeScriptExecutionStarted = new Date().getTime();
            $.spawnWithCallback(GLib.path_get_dirname(this._file.get_path()), [this._file.get_path()],
                envp, GLib.SpawnFlags.DEFAULT, null,
                Lang.bind(this, function(aStandardOutput) {
                    if (this._isDestroyed) {
                        return;
                    }

                    this._timeScriptExecutionFinished = new Date().getTime();
                    this._processOutput(aStandardOutput.split("\n"));

                    let updateInterval = this._getInterval("pref_update_interval");

                    if (updateInterval > 0) {
                        this._updateTimeout = Mainloop.timeout_add_seconds(updateInterval,
                            Lang.bind(this, function() {
                                this._updateTimeout = 0;
                                this._update();
                                return false;
                            }));
                    }

                    this._updateRunning = false;
                }));
        } catch (aErr) {
            // TO TRANSLATORS: Full sentence:
            // "Unable to execute file 'FileName':"
            let msg = _("Unable to execute file '%s':").format(this._file.get_basename());
            global.logError(msg + " " + aErr);
            Main.notify(
                _(this.metadata.name),
                msg + "\n" +
                _("Script file not set, cannot be found or it isn't an executable.")
            );
            this._updateRunning = false;
        }
    },

    _getInterval: function(aPref) {
        let updateInterval = 0;
        let number = this[aPref];
        let unit = this[aPref + "_units"];
        let factorIndex = "smhd".indexOf(unit);

        if (factorIndex >= 0 && /^\d+$/.test(number)) {
            let factors = [1, 60, 60 * 60, 24 * 60 * 60];
            updateInterval = parseInt(number, 10) * factors[factorIndex];
        }

        return updateInterval;
    },

    _processOutput: function(aOutput) {
        try {
            this._timeOutputProcessingStarted = new Date().getTime();
            let buttonLines = [];
            let dropdownLines = [];

            let dropdownMode = false;
            let i = 0,
                iLen = aOutput.length;
            for (; i < iLen; i++) {
                if (aOutput[i].length === 0) {
                    continue;
                }

                let line = $.parseLine(aOutput[i]);

                if (!dropdownMode && line.isSeparator) {
                    dropdownMode = true;
                } else if (dropdownMode) {
                    dropdownLines.push(line);
                } else {
                    buttonLines.push(line);
                }
            }

            this.menu.removeAll();

            if (this._cycleTimeout > 0) {
                Mainloop.source_remove(this._cycleTimeout);
                this._cycleTimeout = 0;
            }

            this._lineView.actor.set_style("spacing: " + this.pref_applet_spacing + "px;");

            if (buttonLines.length === 0) {
                if (this.pref_show_script_name) {
                    this._lineView.setMarkup(GLib.markup_escape_text(this._file.get_basename(), -1));
                } else {
                    this._lineView.setLine("");
                }
            } else if (buttonLines.length === 1) {
                this._lineView.setLine(buttonLines[0]);
            } else {
                this._lineView.setLine(buttonLines[0]);
                let i = 0;
                let rotationInterval = this._getInterval("pref_rotation_interval");

                if (rotationInterval > 0) {
                    this._cycleTimeout = Mainloop.timeout_add_seconds(rotationInterval, Lang.bind(this, function() {
                        i++;
                        this._lineView.setLine(buttonLines[i % buttonLines.length]);
                        return true;
                    }));
                }

                let j = 0,
                    jLen = buttonLines.length;
                for (; j < jLen; j++) {
                    if (!buttonLines[j].hasOwnProperty("dropdown") ||
                        (buttonLines[j].hasOwnProperty("dropdown") &&
                            buttonLines[j].dropdown !== "false")) {
                        this.menu.addMenuItem(new $.ArgosMenuItem(this, buttonLines[j]));
                    }
                }
            }

            if (this.menu.numMenuItems > 0) {
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }

            let menus = [];
            menus[0] = this.menu;
            let l = 0,
                lLen = dropdownLines.length;
            for (; l < lLen; l++) {
                let menu;

                if (dropdownLines[l].menuLevel in menus) {
                    menu = menus[dropdownLines[l].menuLevel];
                } else {
                    // TO TRANSLATORS: Full sentence:
                    // "Invalid menu level for line 'LineWithTheError'"
                    global.logError(_("Invalid menu level for line '%s'")).format(dropdownLines[l].text);
                    menu = this.menu;
                }

                let menuItem = null;

                if (dropdownLines[l].isSeparator) {
                    // Although not documented, BitBar appears to render additional "---" lines as separators
                    menuItem = new PopupMenu.PopupSeparatorMenuItem();
                } else if ((l + 1) < dropdownLines.length &&
                    dropdownLines[l + 1].menuLevel > dropdownLines[l].menuLevel) {
                    // GNOME Shell actually supports only a single submenu nesting level
                    // (deeper levels are rendered, but opening them closes the parent menu).
                    // Since adding PopupSubMenuMenuItems to submenus does not trigger
                    // an error or warning, this should be considered a bug in GNOME Shell.
                    // Once it is fixed, this code will work as expected for nested submenus.
                    //
                    // Note by Odyseus:
                    // The previous comment by the original author of the Argos extension
                    // is not true for Cinnamon submenus. The problem described is caused
                    // by the Gnome Shell feature that allows to auto close opened submenus
                    // when another one is being opened. Cinnamon doesn't have such feature.
                    //
                    // As I really like that feature, I add it to all my applets with menus,
                    // but without breaking the ability to open submenus inside other submenus.
                    let lineView = new $.ArgosLineView(this, dropdownLines[l]);
                    menuItem = new $.CustomSubMenuItem(this, lineView.actor, dropdownLines[l].menuLevel);
                    menus[dropdownLines[l + 1].menuLevel] = menuItem.menu;
                } else if ((l + 1) < dropdownLines.length &&
                    dropdownLines[l + 1].menuLevel === dropdownLines[l].menuLevel &&
                    (dropdownLines[l + 1].hasOwnProperty("alternate") &&
                        dropdownLines[l + 1].alternate === "true")) {
                    menuItem = new $.ArgosMenuItem(this, dropdownLines[l], dropdownLines[l + 1]);
                    // Skip alternate line
                    l++;
                } else {
                    menuItem = new $.ArgosMenuItem(this, dropdownLines[l]);
                }

                if (menuItem !== null) {
                    menu.addMenuItem(menuItem);
                }
            }
        } catch (aErr) {
            global.logError(aErr);
        } finally {
            this._timeOutputProcessingFinished = new Date().getTime();
            this._setAppletTooltip();
        }
    },

    _setAppletTooltip: function() {
        let boldSpan = function(aStr) {
            return '<span weight="bold">' + $.escapeHTML(aStr) + "</span>";
        };

        let tt = boldSpan(_(this.metadata.name)) + "\n\n";

        if (this._file) {
            tt += boldSpan(_("Script file name:")) + " " + $.escapeHTML(this._file.get_basename()) + "\n";
        } else {
            tt += boldSpan(_("Script file name:")) + " " + $.escapeHTML(_("No script set")) + "\n";
        }

        tt += boldSpan(_("Execution interval:")) + " " + this.pref_update_interval + " " +
            $.getUnitPluralForm(this.pref_update_interval_units, this.pref_update_interval) + "\n";

        tt += boldSpan(_("Rotation interval:")) + " " + this.pref_rotation_interval + " " +
            $.getUnitPluralForm(this.pref_rotation_interval_units, this.pref_rotation_interval) + "\n";

        if (typeof this._timeScriptExecutionStarted === "number" &&
            typeof this._timeScriptExecutionFinished === "number") {
            let executionTime = (this._timeScriptExecutionFinished -
                this._timeScriptExecutionStarted);
            tt += boldSpan(_("Script execution time:")) + " " + executionTime +
                " %s".format($.getUnitPluralForm("ms", executionTime)) + "\n";
        }

        if (typeof this._timeOutputProcessingStarted === "number" &&
            typeof this._timeOutputProcessingFinished === "number") {
            let processTime = (this._timeOutputProcessingFinished -
                this._timeOutputProcessingStarted);
            tt += boldSpan(_("Output process time:")) + " " + processTime +
                " %s".format($.getUnitPluralForm("ms", processTime)) + "\n";
        }

        if (!this.tooltip) {
            this.tooltip = new Tooltips.PanelItemTooltip(this, "", this.orientation);
        }

        try {
            this.tooltip._tooltip.set_style("text-align: left;");
            this.tooltip._tooltip.get_clutter_text().set_line_wrap(true);
            this.tooltip._tooltip.get_clutter_text().set_markup(tt);
        } catch (aErr) {
            global.logError("Error Tweaking Tooltip: " + aErr);
            /* If we couldn't tweak the tooltip format this is likely because
             * the underlying implementation has changed. Don't issue any
             * failure here */
        }
    },

    onSliderChanged: function(aSlider, aValue, aStopUpdate, aPref) {
        if (aStopUpdate || !aPref) {
            return;
        }

        let value = Math.max(0, Math.min(1, parseFloat(aValue)));

        let newValue = parseInt(Math.floor(value * 3600), 10);

        // This doesn't trigger the callback!!!!!
        this[aPref] = newValue;

        this._syncLabelsWithSlidersValue(aSlider);

        if (!this._sliderIsSliding) {
            this.update();
        }
    },

    onSliderGrabbed: function(aSlider) { // jshint ignore:line
        this._sliderIsSliding = true;
        this._syncLabelsWithSlidersValue(aSlider);
    },

    onSliderReleased: function(aSlider) {
        this._sliderIsSliding = false;
        aSlider.emit("value-changed", aSlider.value);
    },

    _syncLabelsWithSlidersValue: function(aSlider) {
        // If there is no slider specified, update all of them.
        if (!aSlider) {
            this.updateIntervalLabel.setLabel();
            this.updateIntervalLabel._setCheckedState();
            this.rotationIntervalLabel.setLabel();
            this.rotationIntervalLabel._setCheckedState();
        } else {
            if (aSlider._associatedLabel !== null) {
                this[aSlider._associatedLabel].setLabel();
                this[aSlider._associatedLabel]._setCheckedState();
            }
        }
    },

    _expandAppletContextMenu: function() {
        // Execution interval unit selector submenu.
        this.updateIntervalLabel = new $.UnitSelectorSubMenuMenuItem(
            this,
            "<b>%s</b>".format(_("Execution interval:")),
            "pref_update_interval_units",
            "pref_update_interval"
        );
        this.updateIntervalLabel.menu.connect("open-state-changed",
            Lang.bind(this, this._contextSubMenuOpenStateChanged));
        this.updateIntervalLabel.tooltip = new $.CustomTooltip(
            this.updateIntervalLabel.actor,
            _("Choose the time unit for the script execution interval.")
        );
        this._applet_context_menu.addMenuItem(this.updateIntervalLabel);

        // Execution interval slider
        this.updateIntervalSlider = new $.CustomPopupSliderMenuItem(parseFloat(this.pref_update_interval / 3600));
        this.updateIntervalSlider._associatedLabel = "updateIntervalLabel";
        this.updateIntervalSlider.connect("value-changed",
            Lang.bind(this, this.onSliderChanged, false, "pref_update_interval"));
        this.updateIntervalSlider.connect("drag-begin", Lang.bind(this, this.onSliderGrabbed));
        this.updateIntervalSlider.connect("drag-end", Lang.bind(this, this.onSliderReleased));
        this.updateIntervalSlider.tooltip = new $.CustomTooltip(
            this.updateIntervalSlider.actor,
            _("Set the script execution interval.")
        );
        this._applet_context_menu.addMenuItem(this.updateIntervalSlider);

        this._applet_context_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        let menuItem;

        // Choose script file
        menuItem = new PopupMenu.PopupIconMenuItem(
            _("Choose script"),
            "document-open",
            St.IconType.SYMBOLIC
        );
        menuItem.connect("activate", Lang.bind(this, function() {
            Util.spawn_async([this.metadata.path + "/appletHelper.py",
                    "open",
                    this.pref_last_selected_directory
                ],
                Lang.bind(this, function(aOutput) {
                    let path = aOutput.trim();

                    if (!Boolean(path)) {
                        return;
                    }

                    // I don't know why this doesn't trigger the callback attached to the preference.
                    // That's why I added the call to this._processFile in here too.
                    // Just in case, I also added the this._processingFile check in case in some
                    // other versions of Cinnamon the callback it's triggered.
                    this.pref_file_path = path;
                    this.pref_last_selected_directory = path;
                    this._processFile();
                }));
        }));
        menuItem.tooltip = new $.CustomTooltip(
            menuItem.actor,
            _("Choose a script file.")
        );
        this._applet_context_menu.addMenuItem(menuItem);

        // Edit script
        menuItem = new PopupMenu.PopupIconMenuItem(
            _("Edit script"),
            "text-editor",
            St.IconType.SYMBOLIC
        );
        menuItem.connect("activate", Lang.bind(this, function() {
            if (this._file === null) {
                Main.notify(
                    _(this.metadata.name),
                    _("Script file not set, cannot be found or it isn't an executable.")
                );
            } else {
                // The original Argos extension uses Gio.AppInfo.launch_default_for_uri
                // to open the script file. I prefer to stay away from non asynchronous functions.
                // Gio.AppInfo.launch_default_for_uri_async is still too new.
                Util.spawn_async(["xdg-open", this._file.get_path()], null);
            }
        }));
        menuItem.tooltip = new $.CustomTooltip(
            menuItem.actor,
            _("Edit the script file with your prefered text editor.") + "\n" +
            _("After saving the changes made, the applet will update its data automatically if there is an interval set.") + "\n" +
            _("Or the update could be done manually with the »Refresh« item on this applet context menu.")
        );
        this._applet_context_menu.addMenuItem(menuItem);

        // Refresh
        menuItem = new PopupMenu.PopupIconMenuItem(
            _("Refresh"),
            "view-refresh",
            St.IconType.SYMBOLIC
        );
        menuItem.connect("activate", Lang.bind(this, function() {
            if (this._file === null) {
                Main.notify(
                    _(this.metadata.name),
                    _("Script file not set, cannot be found or it isn't an executable.")
                );
            } else {
                this.update();
            }
        }));
        menuItem.tooltip = new $.CustomTooltip(
            menuItem.actor,
            _("This will re-run on demand the script assigned to this applet for the purpose of updating its output.") + "\n" +
            _("This is only needed when there is no update interval set (or the interval is too long), so the update needs to be done manually in case the script is edited.")
        );
        this._applet_context_menu.addMenuItem(menuItem);

        this._applet_context_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Extras submenu
        let subMenu = new PopupMenu.PopupSubMenuMenuItem(_("Extras"));
        subMenu.menu.connect("open-state-changed",
            Lang.bind(this, this._contextSubMenuOpenStateChanged));
        this._applet_context_menu.addMenuItem(subMenu);

        // Rotation interval unit selector submenu.
        this.rotationIntervalLabel = new $.UnitSelectorSubMenuMenuItem(
            this,
            "<b>%s</b>".format(_("Rotation interval:")),
            "pref_rotation_interval_units",
            "pref_rotation_interval"
        );
        this.rotationIntervalLabel.tooltip = new $.CustomTooltip(
            this.rotationIntervalLabel.actor,
            _("Choose the time unit for the applet text rotation interval.")
        );
        subMenu.menu.addMenuItem(this.rotationIntervalLabel);

        // Rotation interval slider
        this.rotationIntervalSlider = new $.CustomPopupSliderMenuItem(parseFloat(this.pref_rotation_interval / 3600));
        this.rotationIntervalSlider._associatedLabel = "rotationIntervalLabel";
        this.rotationIntervalSlider.connect("value-changed",
            Lang.bind(this, this.onSliderChanged, false, "pref_rotation_interval"));
        this.rotationIntervalSlider.connect("drag-begin", Lang.bind(this, this.onSliderGrabbed));
        this.rotationIntervalSlider.connect("drag-end", Lang.bind(this, this.onSliderReleased));
        this.rotationIntervalSlider.tooltip = new $.CustomTooltip(
            this.rotationIntervalSlider.actor,
            _("Set the applet text rotation interval.")
        );
        subMenu.menu.addMenuItem(this.rotationIntervalSlider);

        // Separator
        subMenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Clear script
        menuItem = new PopupMenu.PopupIconMenuItem(
            _("Clear script"),
            "edit-clear",
            St.IconType.SYMBOLIC
        );
        menuItem.connect("activate", Lang.bind(this, function() {
            new ModalDialog.ConfirmDialog(
                _('This operation will remove the current script from this applet leaving it "blank".') + "\n" +
                _("The current applet settings will be untouched and the actual script file will not be deleted.") + "\n" +
                _("Do you want to proceed?") + "\n",
                Lang.bind(this, function() {
                    // Clear the applet text. Otherwise, it will keep rotating.
                    if (this._cycleTimeout > 0) {
                        Mainloop.source_remove(this._cycleTimeout);
                        this._cycleTimeout = 0;
                    }

                    this.pref_file_path = "";
                    this._lineView.setLine("");
                    this._processFile();
                })
            ).open(global.get_current_time());
        }));
        menuItem.tooltip = new $.CustomTooltip(
            menuItem.actor,
            _('This operation will remove the current script from this applet leaving it "blank".')
        );
        subMenu.menu.addMenuItem(menuItem);

        // Use standard icon if exists. Otherwise, override it.
        // The lesser evil, so to speak.
        // Needed for LM 17 which doesn't support "application-x-executable" icon
        // (at least, is not available in some of the icon themes).
        let iconName = Gtk.IconTheme.get_default().has_icon("application-x-executable") ?
            "application-x-executable" :
            "argos-for-cinnamon-application-x-executable";

        // Make script executable
        menuItem = new PopupMenu.PopupIconMenuItem(
            _("Make script executable"),
            iconName,
            St.IconType.SYMBOLIC
        );
        menuItem.tooltip = new $.CustomTooltip(
            menuItem.actor,
            _("Make the script file executable so it can be used by this applet.")
        );
        menuItem.connect("activate", Lang.bind(this, function() {
            // Make all checks individually so I can make precise notifications.
            if (GLib.file_test(this._script_path, GLib.FileTest.EXISTS)) {
                if (!GLib.file_test(this._script_path, GLib.FileTest.IS_DIR)) {
                    if (!GLib.file_test(this._script_path, GLib.FileTest.IS_EXECUTABLE)) {
                        try {
                            if (FileUtils.hasOwnProperty("changeModeGFile")) {
                                let file = Gio.file_new_for_path(this._script_path);
                                FileUtils.changeModeGFile(file, 755);
                            } else {
                                Util.spawnCommandLine('chmod +x "' + this._script_path + '"');
                            }
                        } finally {
                            this._setFileModeTimeout = Mainloop.timeout_add_seconds(1,
                                Lang.bind(this, function() {
                                    this._processFile();
                                    this._setFileModeTimeout = 0;
                                }));
                        }
                    } else {
                        Main.notify(
                            _(this.metadata.name),
                            _("Script file is already executable.") + "\n" +
                            this._script_path
                        );
                    }
                } else {
                    Main.notify(
                        _(this.metadata.name),
                        _("Script file isn't a file, but a directory.") + "\n" +
                        this._script_path
                    );
                }
            } else {
                Main.notify(
                    _(this.metadata.name),
                    _("Script file doesn't exists.") + "\n" +
                    this._script_path
                );
            }
        }));
        subMenu.menu.addMenuItem(menuItem);

        // Help
        menuItem = new PopupMenu.PopupIconMenuItem(
            _("Help"),
            "dialog-information",
            St.IconType.SYMBOLIC
        );
        menuItem.tooltip = new $.CustomTooltip(menuItem.actor, _("Open this applet help file."));
        menuItem.connect("activate", Lang.bind(this, function() {
            Util.spawn_async(["xdg-open", this.metadata.path + "/HELP.html"], null);
        }));
        subMenu.menu.addMenuItem(menuItem);

        this._syncLabelsWithSlidersValue();
    },

    _bindSettings: function() {
        this.settings = new Settings.AppletSettings(this, this.metadata.uuid, this.instance_id);
        // Needed for retro-compatibility.
        // Mark for deletion on EOL. Cinnamon 3.2.x+
        let bD = {
            IN: 1,
            OUT: 2,
            BIDIRECTIONAL: 3
        };
        let prefKeysArray = [
            "pref_custom_icon_for_applet",
            "pref_custom_label_for_applet",
            "pref_show_script_name",
            "pref_overlay_key",
            "pref_animate_menu",
            "pref_keep_one_menu_open",
            "pref_file_path",
            "pref_default_icon_size",
            "pref_menu_spacing",
            "pref_applet_spacing",
            "pref_update_on_menu_open",
            "pref_update_interval",
            "pref_update_interval_units",
            "pref_rotation_interval",
            "pref_rotation_interval_units",
            "pref_terminal_emulator",
            "pref_last_selected_directory",
            "pref_initial_load_done"
        ];
        let newBinding = typeof this.settings.bind === "function";
        for (let pref_key of prefKeysArray) {
            // Condition needed for retro-compatibility.
            // Mark for deletion on EOL. Cinnamon 3.2.x+
            // Abandon this.settings.bindProperty and keep this.settings.bind.
            if (newBinding) {
                this.settings.bind(pref_key, pref_key, this._onSettingsChanged, pref_key);
            } else {
                this.settings.bindProperty(bD.BIDIRECTIONAL, pref_key, pref_key, this._onSettingsChanged, pref_key);
            }
        }
    },

    _setUpdateInterval: function() {
        global.logError("_setUpdateInterval");
        this.updateIntervalSlider.setValue(this.pref_update_interval / 3600);
        this._syncLabelsWithSlidersValue(this.updateIntervalSlider);

        if (!this._sliderIsSliding) {
            this.update();
        }
    },

    _setRotationInterval: function() {
        this.rotationIntervalSlider.setValue(this.pref_rotation_interval / 3600);
        this._syncLabelsWithSlidersValue(this.rotationIntervalSlider);

        if (!this._sliderIsSliding) {
            this.update();
        }
    },

    _contextSubMenuOpenStateChanged: function(aMenu, aOpen) {
        if (aOpen && this.pref_keep_one_menu_open) {
            let children = aMenu._getTopMenu()._getMenuItems();
            let i = 0,
                iLen = children.length;
            for (; i < iLen; i++) {
                let item = children[i];

                if (item instanceof PopupMenu.PopupSubMenuMenuItem ||
                    item instanceof $.UnitSelectorSubMenuMenuItem) {
                    if (aMenu !== item.menu) {
                        item.menu.close(true);
                    }
                }
            }
        }
    },

    _updateIconAndLabel: function() {
        try {
            if (this.pref_custom_icon_for_applet === "") {
                this.set_applet_icon_name("");
            } else if (GLib.path_is_absolute(this.pref_custom_icon_for_applet) &&
                GLib.file_test(this.pref_custom_icon_for_applet, GLib.FileTest.EXISTS)) {
                if (this.pref_custom_icon_for_applet.search("-symbolic") !== -1) {
                    this.set_applet_icon_symbolic_path(this.pref_custom_icon_for_applet);
                } else {
                    this.set_applet_icon_path(this.pref_custom_icon_for_applet);
                }
            } else if (Gtk.IconTheme.get_default().has_icon(this.pref_custom_icon_for_applet)) {
                if (this.pref_custom_icon_for_applet.search("-symbolic") !== -1) {
                    this.set_applet_icon_symbolic_name(this.pref_custom_icon_for_applet);
                } else {
                    this.set_applet_icon_name(this.pref_custom_icon_for_applet);
                }
                /**
                 * START mark Odyseus
                 * I added the last condition without checking Gtk.IconTheme.get_default.
                 * Otherwise, if there is a valid icon name added by
                 *  Gtk.IconTheme.get_default().append_search_path, it will not be recognized.
                 * With the following extra condition, the worst that can happen is that
                 *  the applet icon will not change/be set.
                 */
            } else {
                try {
                    if (this.pref_custom_icon_for_applet.search("-symbolic") !== -1) {
                        this.set_applet_icon_symbolic_name(this.pref_custom_icon_for_applet);
                    } else {
                        this.set_applet_icon_name(this.pref_custom_icon_for_applet);
                    }
                } catch (aErr) {
                    global.logError(aErr);
                }
            }
        } catch (aErr) {
            global.logWarning('Could not load icon file "' + this.pref_custom_icon_for_applet + '" for menu button');
        }

        if (this.pref_custom_icon_for_applet === "") {
            this._applet_icon_box.hide();
        } else {
            this._applet_icon_box.show();
        }

        if (this.orientation === St.Side.LEFT || this.orientation === St.Side.RIGHT) { // no menu label if in a vertical panel
            this.set_applet_label("");
        } else {
            if (this.pref_custom_label_for_applet !== "") {
                this.set_applet_label(_(this.pref_custom_label_for_applet));
            } else {
                this.set_applet_label("");
            }
        }

        this.updateLabelVisibility();
    },

    updateLabelVisibility: function() {
        // Condition needed for retro-compatibility.
        // Mark for deletion on EOL. Cinnamon 3.2.x+
        if (typeof this.hide_applet_label !== "function") {
            return;
        }

        if (this.orientation == St.Side.LEFT || this.orientation == St.Side.RIGHT) {
            this.hide_applet_label(true);
        } else {
            if (this.pref_custom_label_for_applet === "") {
                this.hide_applet_label(true);
            } else {
                this.hide_applet_label(false);
            }
        }
    },

    _toggleMenu: function() {
        if (!this.menu.isOpen && this.menu.numMenuItems > 0) {
            this.menu.open(this.pref_animate_menu);
        } else {
            this.menu.close(this.pref_animate_menu);
        }
    },

    on_applet_clicked: function() {
        this._toggleMenu();
    },

    on_applet_removed_from_panel: function() {
        this._isDestroyed = true;

        if (this._updateTimeout > 0) {
            Mainloop.source_remove(this._updateTimeout);
        }

        if (this._callToUpdateTimeout > 0) {
            Mainloop.source_remove(this._callToUpdateTimeout);
        }

        if (this._cycleTimeout > 0) {
            Mainloop.source_remove(this._cycleTimeout);
        }

        Main.keybindingManager.removeHotKey(this.menu_keybinding_name);

        this.menu.removeAll();
    },

    _updateKeybindings: function() {
        Main.keybindingManager.removeHotKey(this.menu_keybinding_name);

        if (this.pref_overlay_key !== "") {
            Main.keybindingManager.addHotKey(
                this.menu_keybinding_name,
                this.pref_overlay_key,
                Lang.bind(this, function() {
                    if (!Main.overview.visible && !Main.expo.visible) {
                        this._toggleMenu();
                    }
                })
            );
        }
    },

    _onSettingsChanged: function(aPrefValue, aPrefKey) {
        // Note: On Cinnamon versions greater than 3.2.x, two arguments are passed to the
        // settings callback instead of just one as in older versions. The first one is the
        // setting value and the second one is the user data. To workaround this nonsense,
        // check if the second argument is undefined to decide which
        // argument to use as the pref key depending on the Cinnamon version.
        // Mark for deletion on EOL. Cinnamon 3.2.x+
        // Remove the following variable and directly use the second argument.
        let pref_key = aPrefKey || aPrefValue;
        switch (pref_key) {
            case "pref_custom_icon_for_applet":
            case "pref_custom_label_for_applet":
                this._updateIconAndLabel();
                break;
            case "pref_show_script_name":
            case "pref_default_icon_size":
            case "pref_menu_spacing":
            case "pref_applet_spacing":
                this.update();
                break;
            case "pref_overlay_key":
                this._updateKeybindings();
                break;
            case "pref_file_path":
                this._processFile();
                break;
            case "pref_update_interval":
            case "pref_update_interval_units":
                this._setUpdateInterval();
                break;
            case "pref_rotation_interval":
            case "pref_rotation_interval_units":
                this._setRotationInterval();
                break;
        }
    }
};

function main(aMetadata, aOrientation, aPanel_height, aInstance_id) {
    return new ArgosForCinnamonApplet(aMetadata, aOrientation, aPanel_height, aInstance_id);
}
