#!/usr/bin/python3
# -*- coding: utf-8 -*-

import sys
import os

xlet_dir = os.path.normpath(os.path.dirname(os.path.abspath(__file__)))

xlet_slug = os.path.basename(xlet_dir)

repo_folder = os.path.normpath(os.path.join(xlet_dir, *([".."] * 2)))

app_folder = os.path.join(repo_folder, "__app__")

if app_folder not in sys.path:
    sys.path.insert(0, app_folder)


from python_modules.localized_help_creator import LocalizedHelpCreator, _, md


class Main(LocalizedHelpCreator):

    def __init__(self, xlet_dir, xlet_slug):
        super(Main, self).__init__(xlet_dir, xlet_slug)

    def get_content_base(self, for_readme):
        return "\n".join([
            "## %s" % _("Description"),
            "",
            _("The function of this applet is very simple, create a menu based on the files/folders found inside a main folder (specified on this applet settings window). The files will be used to create menu items and the sub folders will be used to create sub-menus."),
            "",
            # TO TRANSLATORS: MARKDOWN string. Respect formatting.
            _("I mainly created this applet to replicate the functionality of the XFCE plugin called **Directory Menu** and the KDE widget called **Quick access**."),
            "",
            ("<h2 style=\"color:red;\">%s</h2>\n<span style=\"font-weight:bold; color:red;\">%s</span>" if for_readme else "<div class=\"alert alert-warning\"><h2>%s</h2>\n<p>%s</p></div>") % (
                _("Warning"),
                _("This applet has to read every single file/folder inside a main folder to create its menu. So, do not try to use this applet to create a menu based on a folder that contains thousands of files!!! Your system may slow down, freeze or even crash!!!")
            ),
            "",
            "## %s" % _("Features"),
            "- %s" % _("More than one instance of this applet can be installed at the same time."),
            "- %s" % _("A hotkey can be assigned to open/close the menu."),
            "- %s" % _("Menu items to .desktop files will be displayed with the icon and name declared inside the .desktop files themselves."),
            # TO TRANSLATORS: MARKDOWN string. Respect formatting.
            "- %s" % ("The menu can be kept open while activating menu items by pressing <kbd>Ctrl</kbd> + **Left click** or with **Middle click**." if for_readme else _(
                "The menu can be kept open while activating menu items by pressing [[Ctrl]] + **Left click** or with **Middle click**.")),
            "- %s" % _("This applet can create menu and sub-menu items even from symbolic links found inside the main folder."),
            "",
            "## %s" % _("Settings window") if for_readme else "",
            "",
            "![Settings window](https://odyseus.github.io/CinnamonTools/lib/img/QuickMenu-001.png \"Settings window\")" if for_readme else "",
            "",
            "## %s" % _(
                "Image featuring different icons for each sub-menu and different icon sizes") if for_readme else "",
            "",
            "![Image featuring different icons for each sub-menu and different icon sizes](https://odyseus.github.io/CinnamonTools/lib/img/QuickMenu-002.png \"Image featuring different icons for each sub-menu and different icon sizes\")" if for_readme else "",
        ])

    def get_content_extra(self):
        return md("{}".format("\n".join([
            "## %s" % _("Applet usage"),
            "- " + _("Menu items to .desktop files will be displayed with the icon and name declared inside the .desktop files themselves."),
            # TO TRANSLATORS: MARKDOWN string. Respect formatting.
            "- %s" % _(
                "The menu can be kept open while activating menu items by pressing [[Ctrl]] + **Left click** or with **Middle click**."),
            "",
            "## %s" % _("How to set a different icon for each sub-menu"),
            "",
            "- %s" %
            _("Create a file at the same level as the folders that will be used to create the sub-menus."),
            # TO TRANSLATORS: MARKDOWN string. Respect formatting.
            "- %s" % _("The file name can be customized, doesn't need to have an extension name and can be a hidden file (a dot file). By default is called **0_icons_for_sub_menus.json**."),
            "- %s" %
            _("Whatever name is chosen for the file, it will be automatically ignored and will never be shown on the menu."),
            # TO TRANSLATORS: MARKDOWN string. Respect formatting.
            "- %s" % _("The path to the icon has to be a full path. A path starting with **~/** can be used and will be expanded to the user's home folder."),
            # TO TRANSLATORS: MARKDOWN string. Respect formatting.
            "- %s" % _("If any sub-folder has more folders that need to have custom icons, just create another **0_icons_for_sub_menus.json** file at the same level that those folders."),
            # TO TRANSLATORS: MARKDOWN string. Respect formatting.
            "- %s" % _("The content of the file is a *JSON object* and has to look as follows:"),
            "",
            """```
    {0}
    {1}
    {2}
    ```""".format("{",
                  "\n".join([
                      "    {0} #1\": \"{1} #1\"".format(_("Folder name"), _(
                          "Icon name or icon path for Folder name")),
                      "    {0} #2\": \"{1} #2\"".format(_("Folder name"), _(
                          "Icon name or icon path for Folder name")),
                      "    {0} #3\": \"{1} #3\"".format(_("Folder name"), _(
                          "Icon name or icon path for Folder name")),
                      "    {0} #n\": \"{1} #n\"".format(_("Folder name"), _(
                          "Icon name or icon path for Folder name"))
                  ]),
                  "}"),
            "",
            "**%s** %s" % (_("Warning!!!"),
                           # TO TRANSLATORS: MARKDOWN string. Respect formatting.
                           _("JSON *language* is very strict. Just be sure to ONLY use double quotes. And the last key/value combination DOESN'T have to end with a comma (**Folder name #n** in the previous example).")),
        ])
        ))

    def get_css_custom(self):
        return ""

    def get_js_custom(self):
        return ""


if __name__ == "__main__":
    m = Main(xlet_dir, xlet_slug)
    m.start()
