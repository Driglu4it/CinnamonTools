let $;

// Mark for deletion on EOL. Cinnamon 3.6.x+
if (typeof require === "function") {
    $ = require("./utils.js");
} else {
    $ = imports.ui.appletManager.applets["{{UUID}}"].utils;
}

const _ = $._;

const Applet = imports.ui.applet;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const MessageTray = imports.ui.messageTray;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const St = imports.gi.St;
const Util = imports.misc.util;

const FEED_CONFIG_FILE = $.DataStorage + "/feeds.json";

function FeedsReaderForkByOdyseus() {
    this._init.apply(this, arguments);
}

FeedsReaderForkByOdyseus.prototype = {
    __proto__: Applet.IconApplet.prototype,

    _init: function(aMetadata, aOrientation, aPanel_height, aInstance_id) {
        Applet.IconApplet.prototype._init.call(this, aOrientation, aPanel_height, aInstance_id);

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

            this.logger = new $.Logger("FeedsReader", this.pref_enable_verbose_logging);

            this._expandAppletContextMenu();
            Gtk.IconTheme.get_default().append_search_path(this.metadata.path + "/icons/");
        } catch (aErr) {
            this.logger.error(aErr);
        }

        Mainloop.idle_add(() => {
            try {
                this.open_menu = null;
                this.feed_queue = [];
                this.force_download = false;

                this.logger.debug("Applet Instance ID: " + this.instance_id);
                this.logger.debug("Selected Instance Name: " + this.pref_profile_name);

                this.feeds = [];

                this.set_applet_icon_symbolic_name("rss");
                this.set_applet_tooltip(_("Feed reader"));

                this.logger.debug("Creating menus");
                this.menuManager = new PopupMenu.PopupMenuManager(this);
                this.menu = new Applet.AppletPopupMenu(this, this.orientation);
                this.menuManager.addMenu(this.menu);

                this.feed_file_error = false;
                this._read_json_config();
                this._updateKeybindings();

                this.timeout = this.pref_refresh_interval_mins * 60 * 1000;
                this.logger.debug("Initial timeout set in: " + this.timeout + " ms");
                /* Set the next timeout */
                this.timer_id = Mainloop.timeout_add(this.timeout,
                    Lang.bind(this, this._process_feeds));

                this.logger.debug("timer_id: " + this.timer_id);
            } catch (aErr) {
                this.logger.error(aErr);
            }
        });
    },

    /* private function that connects to the settings-schema and initializes the variables */
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
            "pref_last_checked_storage",
            "pref_description_max_length",
            "pref_tooltip_max_width",
            "pref_refresh_interval_mins",
            "pref_max_items",
            "pref_notifications_enabled",
            "pref_enable_verbose_logging",
            "pref_profile_name",
            "pref_overlay_key"
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

    _informMissingDependency: function() {
        this.set_applet_icon_symbolic_name("dialog-error");
        let msg = [_("Missing dependency!!!"),
            _("This applet needs the feedparser Python 3 module installed on your system for it to work."),
            _("Read this applet help for more details (Applet context menu > Help item).")
        ];

        let tt = _(this.metadata.name) + "\n\n" + msg.join("\n");

        if (this._applet_tooltip) {
            try {
                this._applet_tooltip._tooltip.get_clutter_text().set_markup(
                    '<span color="red"><b>' + $.escapeHTML(tt) + "</b></span>");
            } catch (aErr) {
                this.set_applet_tooltip(tt);
                this.logger.error(aErr);
            }
        } else {
            this.set_applet_tooltip(tt);
        }

        let icon = new St.Icon({
            icon_name: "dialog-error",
            icon_type: St.IconType.SYMBOLIC,
            icon_size: 24
        });

        Main.criticalNotify(_(this.metadata.name), msg.join("\n"), icon);
    },

    /* Public method for adding a feed to be processed (downloaded) */
    enqueue_feed: function(item) {
        this.logger.debug("Checking to add feed_id " + item.feed_id + " to the process queue.");
        // Only add items once to the queue.

        let found = this.feed_queue.find(feed => (feed.feed_id == item.feed_id));

        if (!found) {
            // push the item on the queue
            this.feed_queue.push(item);
            this.logger.debug("Added feed to the process queue.");
        }
    },

    /* Public method to dequeue the next feed and process it (downloading and parsing). */
    process_next_feed: function() {
        // Need to limit this to a single execution
        this.logger.debug("Processing the process queue, length: " + this.feed_queue.length);
        if (this.feed_queue.length > 0) {
            let item = this.feed_queue.shift();
            this.is_feed_downloading = true;
            // start the download of the feed
            item.reader.download_feed();
        } else {
            this.force_download = false;
        }
    },

    /* Private method to create the sub menu items for a feed. */
    _expandAppletContextMenu: function() {
        this.logger.debug("");

        let menuItem = new Applet.MenuItem(
            _("Mark all read"),
            "object-select-symbolic",
            Lang.bind(this, function() {
                for (let i = this.feeds.length - 1; i >= 0; i--) {
                    this.feeds[i].reader.mark_all_items_read();
                    this.feeds[i].update();
                }
            })
        );
        this._applet_context_menu.addMenuItem(menuItem);

        menuItem = new Applet.MenuItem(
            _("Reload"),
            "view-refresh-symbolic",
            Lang.bind(this, function() {
                this.logger.debug("Calling reload from context menu.");
                this.force_download = true;
                this._process_feeds();
            })
        );
        this._applet_context_menu.addMenuItem(menuItem);

        menuItem = new Applet.MenuItem(
            _("Manage feeds"),
            "document-properties-symbolic",
            Lang.bind(this, function() {
                this.manage_feeds();
            })
        );
        this._applet_context_menu.addMenuItem(menuItem);

        menuItem = new Applet.MenuItem(
            _("Help"),
            "dialog-information",
            Lang.bind(this, function() {
                Util.spawn_async(["xdg-open", this.metadata.path + "/HELP.html"], null);
            })
        );
        this._applet_context_menu.addMenuItem(menuItem);
    },

    _read_json_config: function(profile_name = null) {
        if (profile_name != null && profile_name.trim() != "") {
            this.pref_profile_name = profile_name.trim();
        }
        // Read the json config file.
        let argv = [this.metadata.path + "/python/config_file_manager.py", FEED_CONFIG_FILE];
        Util.spawn_async(argv, Lang.bind(this, this._load_feeds));
    },

    /* Private method used to load / reload all the feeds. */
    _load_feeds: function(aFeedsConfigFileData) {
        this.logger.debug("");
        this.feeds = [];
        this.menu.removeAll();
        let data = JSON.parse(aFeedsConfigFileData);

        // Find the feeds for the selected profile_name and populate those feeds.
        let i = 0,
            iLen = data["profiles"].length;
        for (; i < iLen; i++) {
            let profiles = data["profiles"];

            if (profiles[i]["name"].trim() === this.pref_profile_name) {
                try {
                    let f = 0,
                        fLen = profiles[i]["feeds"].length;
                    for (; f < fLen; f++) {
                        let feed = profiles[i]["feeds"][f];

                        try {
                            if (feed["enabled"]) {
                                this.feeds[f] = new $.FeedSubMenuItem(
                                    feed["url"],
                                    this, {
                                        feed_id: feed["id"],
                                        logger: this.logger,
                                        max_items: this.pref_max_items,
                                        description_max_length: this.pref_description_max_length,
                                        tooltip_max_width: this.pref_tooltip_max_width,
                                        show_read_items: feed["showreaditems"],
                                        show_feed_image: feed["showimage"], // Not implemented.
                                        custom_title: feed["title"],
                                        notify: feed["notify"],
                                        interval: feed["interval"] // Not implemented.
                                    });
                                this.menu.addMenuItem(this.feeds[f]);
                            }
                        } catch (aErr) {
                            this.logger.error("Error Parsing feeds.json file: " + aErr);
                        }
                    }
                } catch (aErr) {
                    global.logError(aErr);
                }
            }
        }
    },

    /* public method to notify of changes to
     * feed info (e.g. unread count, title).  Updates the
     * applet icon and tooltip */
    update_title: function() {
        this.logger.debug("");
        let unread_count = 0;
        let tooltip = "";
        let first = true;

        // Application tooltip will only list unread feeds.
        for (let i = this.feeds.length - 1; i >= 0; i--) {
            let count = this.feeds[i].get_unread_count();

            if (count > 0) {
                unread_count += count;
                // ensure the last feed added does not get a newline character.
                if (!first) {
                    tooltip += "\n";
                }
                tooltip += this.feeds[i].get_title();
                first = false;
            }
        }

        if (unread_count > 0) {
            this.set_applet_icon_symbolic_name("feed-new");
            this.set_applet_tooltip(tooltip);
        } else {
            this.set_applet_icon_symbolic_name("feed");
            this.set_applet_tooltip(_("No unread feeds"));
        }
    },

    /* Private method to initiate the downloading and refreshing of all feeds. */
    _process_feeds: function() {
        this.logger.debug("Removing previous timer: " + this.timer_id);

        /* Remove any previous timeout */
        if (this.timer_id) {
            Mainloop.source_remove(this.timer_id);
            this.timer_id = 0;
        }
        this.logger.debug("Number of feeds to queue: " + this.feeds.length);
        for (let i = this.feeds.length - 1; i >= 0; i--) {
            this.enqueue_feed(this.feeds[i]);
        }

        // Process the queue items.
        this.process_next_feed();

        /* Convert refresh interval from mins -> ms */
        this.timeout = this.pref_refresh_interval_mins * 60 * 1000;

        this.logger.debug("Setting next timeout to: " + this.timeout + " ms");
        /* Set the next timeout */
        this.timer_id = Mainloop.timeout_add(this.timeout,
            Lang.bind(this, this._process_feeds));

        this.logger.debug("timer_id: " + this.timer_id);
    },

    on_applet_clicked: function(event) { // jshint ignore:line
        this.logger.debug("");
        this.menu.toggle();
        this.toggle_feeds(null);
    },

    new_item_notification: function(feed, feedtitle, itemtitle) {
        this.logger.debug("");
        /* Displays a popup notification using notify-send */

        // if notifications are disabled don't do anything
        if (!this.pref_notifications_enabled) {
            this.logger.debug("Notifications Disabled");
            return;
        }

        this._notifyMessage(feed, feedtitle, itemtitle);
    },

    item_read_notification: function(feed) {
        this.logger.debug("");
        if (this.pref_notifications_enabled) {
            this._destroyMessage(feed);
        }
    },

    toggle_feeds: function(feed_to_show, auto_next = false) {
        this.logger.debug("auto_next = " + auto_next);

        // Check if a menu is already open
        if (this.open_menu) {
            // if matches requested feed and is not empty then exit, otherwise close the feed
            if (feed_to_show && this.open_menu.feed_id == feed_to_show.feed_id && this.open_menu.unread_count > 0) {
                return;
            }

            // Close the last menu since we will be opening a new menu.
            this.open_menu.close_menu();
            this.open_menu = null;
        }

        if (auto_next && feed_to_show && feed_to_show.unread_count == 0) {
            feed_to_show = null;
        }

        if (feed_to_show) {
            // We know the feed to show, just open it.
            this.feed_to_show = feed_to_show;
            this.feed_to_show.open_menu();
        } else {
            for (let i = this.feeds.length - 1; i >= 0; i--) {
                if (this.feeds[i].unread_count > 0) {
                    this.logger.debug("Opening Menu: " + this.feeds[i]);
                    this.feeds[i].open_menu();
                    return;
                }
            }
            // If we get here then no feeds are available, if this was the result of opening or marking the
            // last feed read then close the menu.
            if (auto_next) { // Close the menu since this is the last feed
                this.menu.close(false);
            }
        }
    },

    /* Feed manager functions */
    manage_feeds: function() {
        this.logger.debug("");
        try {
            let argv = [
                this.metadata.path + "/python/manage_feeds.py",
                FEED_CONFIG_FILE,
                this.pref_profile_name
            ];
            Util.spawn_async(argv, Lang.bind(this, this._read_json_config));
        } catch (aErr) {
            this.logger.error(aErr);
        }
    },

    redirect_feed: function(current_url, redirected_url) {
        this.logger.debug("");

        try {
            let argv = [this.metadata.path + "/python/config_file_manager.py", FEED_CONFIG_FILE];
            argv.push("--profile", this.pref_profile_name);
            argv.push("--oldurl", current_url);
            argv.push("--newurl", redirected_url);
            Util.spawn_async(argv, Lang.bind(this, this._read_json_config));
        } catch (aErr) {
            this.logger.error(aErr);
        }
    },

    on_applet_removed_from_panel: function() {
        /* Clean up the timer so if the feed applet is removed it stops firing requests.  */
        this.logger.debug("");
        if (this.timer_id) {
            this.logger.debug("Removing Timer with ID: " + this.timer_id);
            Mainloop.source_remove(this.timer_id);
            this.timer_id = 0;
        }

        // Remove all notifications since they no longer apply
        for (let i = this.feeds.length - 1; i >= 0; i--) {
            this._destroyMessage(this.feeds[i].reader);
        }

        Main.keybindingManager.removeHotKey(this.menu_keybinding_name);
    },

    _ensureSource: function() {
        this.logger.debug("");
        if (!this._source) {
            let gicon = Gio.icon_new_for_string(this.metadata.path + "/icon.png");
            let icon = new St.Icon({
                gicon: gicon
            });

            this._source = new $.FeedMessageTraySource("RSS Feed Notification", icon);
            this._source.connect("destroy", Lang.bind(this, function() {
                this._source = null;
            }));
            if (Main.messageTray) {
                Main.messageTray.add(this._source);
            }
        }
    },

    _notifyMessage: function(reader, title, text) {
        this.logger.debug("");
        if (reader._notification) {
            reader._notification.destroy();
        }

        this._ensureSource();

        let gicon = Gio.icon_new_for_string(this.metadata.path + "/icon.png");
        let icon = new St.Icon({
            gicon: gicon
        });
        reader._notification = new MessageTray.Notification(this._source, title, text, {
            icon: icon
        });
        reader._notification.setTransient(false);
        reader._notification.connect("destroy", function() {
            reader._notification = null;
        });

        this._source.notify(reader._notification);
    },

    _destroyMessage: function(reader) {
        this.logger.debug("");
        if (reader._notification) {
            reader._notification.destroy();
        }
    },

    _updateKeybindings: function() {
        Main.keybindingManager.removeHotKey(this.menu_keybinding_name);

        if (this.pref_overlay_key !== "") {
            Main.keybindingManager.addHotKey(
                this.menu_keybinding_name,
                this.pref_overlay_key,
                Lang.bind(this, function() {
                    if (!Main.overview.visible && !Main.expo.visible) {
                        this.on_applet_clicked();
                    }
                })
            );
        }
    },

    _onSettingsChanged: function(aPrefValue, aPrefKey) {
        this.logger.debug("");

        // Note: On Cinnamon versions greater than 3.2.x, two arguments are passed to the
        // settings callback instead of just one as in older versions. The first one is the
        // setting value and the second one is the user data. To workaround this nonsense,
        // check if the second argument is undefined to decide which
        // argument to use as the pref key depending on the Cinnamon version.
        // Mark for deletion on EOL. Cinnamon 3.2.x+
        // Remove the following variable and directly use the second argument.
        let pref_key = aPrefKey || aPrefValue;
        switch (pref_key) {
            case "pref_refresh_interval_mins":
            case "pref_description_max_length":
            case "pref_tooltip_max_width":
            case "pref_notifications_enabled":
            case "pref_max_items":
                for (let i = this.feeds.length - 1; i >= 0; i--) {
                    this.feeds[i].on_settings_changed({
                        max_items: this.pref_max_items,
                        description_max_length: this.pref_description_max_length,
                        tooltip_max_width: this.pref_tooltip_max_width
                    });
                }

                this._process_feeds();
                break;
            case "pref_profile_name":
                this._read_json_config();
                break;
            case "pref_enable_verbose_logging":
                global.log("Logging changed to " + (this.pref_enable_verbose_logging ? "debug" : "info"));
                this.logger.verbose = this.pref_enable_verbose_logging;
                break;
            case "pref_overlay_key":
                this._updateKeybindings();
                break;
        }
    }
};

function main(aMetadata, aOrientation, aPanel_height, aInstance_id) {
    return new FeedsReaderForkByOdyseus(aMetadata, aOrientation, aPanel_height, aInstance_id);
}
