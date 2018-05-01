#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""Utils for the locallized_help_creator module.

Attributes
----------
BASE_CSS : TYPE
    Description
BOOTSTRAP_ALERT : TYPE
    Description
BOOTSTRAP_PANEL : TYPE
    Description
BOXED_CONTAINER : TYPE
    Description
HTML_DOC : TYPE
    Description
INTRODUCTION : TYPE
    Description
LOCALE_SECTION : TYPE
    Description
OPTION : TYPE
    Description
README_DOC : TYPE
    Description
README_POEDITOR_BLOCK : TYPE
    Description
"""

import os
import json
import gettext
import datetime
import time

from shutil import copy2

from . import app_utils

try:
    import polib
except (SystemError, ImportError):
    raise app_utils.MissingDependencyModule("polib Python module missing.")


HTML_DOC = """<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="content-type" content="text/html;charset=utf-8">
    <title>{title}</title>
    <link rel="shortcut icon" type="image/x-icon" href="./icon.png">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script type="text/javascript">
    {js_localizations_handler}
    </script>
    <style type="text/css">
    {css_bootstrap}
    {css_tweaks}
    {css_base}
    {css_custom}
    </style>
</head>
<body>
<noscript>
<div class="alert alert-warning">
<p><strong>Oh snap! This page needs JavaScript enabled to display correctly.</strong></p>
<p><strong>This page uses JavaScript only to switch between the available languages and/or display images.</strong></p>
<p><strong>There are no tracking services of any kind and never will be (at least, not from my side).</strong></p>
</div> <!-- .alert.alert-warning -->
</noscript>
<div id="mainarea">
<nav class="navbar navbar-default navbar-fixed-top" role="navigation">
    <div class="container-fluid">
    <div class="navbar-header">
        <ul class="nav navbar-nav navbar-left">
            <li><a id="nav-xlet-help" class="js_smoothScroll navbar-brand" href="#xlet-help">Help</a></li>
            <li><a id="nav-xlet-contributors" class="js_smoothScroll navbar-brand" href="#xlet-contributors">Contributors</a></li>
            <li><a id="nav-xlet-changelog" class="js_smoothScroll navbar-brand" href="#xlet-changelog">Changelog</a></li>
        </ul>
    </div>
    <form class="navbar-form navbar-right">
        <div class="form-group">
            <span class="standalone-glyphicon-globe-wrapper"><span class="standalone-glyphicon-globe"></span></span>
<!-- WARNING!!! -->
<!-- Using the Bootstrap classes "form-control" or "input-sm" and the like
     breaks the styling of the "select" elements!!! ¬¬ -->
            <select class="form-control-static" id="localization-switch" onchange="self.toggleLocalizationVisibility(value, this);">
{options}
            </select>
        </div>
    </form>
    </div>
</nav>
<span id="xlet-help" style="padding-top:70px;">
<div class="container boxed">
{sections}
</div> <!-- .container.boxed -->
<span id="xlet-contributors" style="padding-top:140px;">
{contributors}
<span id="xlet-changelog" style="padding-top:70px;">
{changelog}
</div> <!-- #mainarea -->
<script type="text/javascript">toggleLocalizationVisibility(null);
{js_custom}</script>
</body>
</html>
"""

BOXED_CONTAINER = """<div class="container boxed">
{0}
</div> <!-- .container.boxed -->
"""

# I have to add the custom CSS code separately and not include it directly in the
# HTML templates because the .format() function breaks when there is CSS code present
# in the string.
BASE_CSS = """
/* For fixed header */
body {
    padding-top: 70px;
}
/* For fixed header */

/* Tweak spacing of the compatibility badges inside a panel */
.panel-body.compatibility > .compatibility-disclaimer,
.panel-body.compatibility > .compatibility-badge {
    margin: 5px;
    line-height: 2.5em;
}
/* Tweak spacing of the compatibility badges inside a panel */

/* Tweak appearance of the compatibility badges inside a panel */
.panel-body.compatibility > .compatibility-disclaimer {
    font-weight: bold;
}
.panel-body.compatibility > .compatibility-badge > .label-primary {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
}
.panel-body.compatibility > .compatibility-badge > .label-warning,
.panel-body.compatibility > .compatibility-badge > .label-success,
.panel-body.compatibility > .compatibility-badge > .label-info {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
}
.panel-body.compatibility > .compatibility-badge > .label-warning {
    background-color: #dfb317;
}
.panel-body.compatibility > .compatibility-badge > .label-success {
    background-color: #97CA00;
}
.panel-body.compatibility > .compatibility-badge > .label-info {
    background-color: #439cf7;
}
/* Tweak appearance of the compatibility badges inside a panel */

.navbar-form {
    margin-top: 8px !important;
}

.navbar-form .form-group {
    display: block !important;
}

/* Override %100 width so it doesn't occupy the entire page width. */
#localization-switch {
    padding-top: 2px !important;
    padding-bottom: 2px !important;
    font-weight: bold !important;
}

/* Wrapper class for resizing and centering the language selector image
   on the navigation bar of the help files */
.standalone-glyphicon-globe-wrapper {
    vertical-align: middle;
    display: inline-block;
    width: 32px;
    height: 32px;
}

/* Replaces the glyphicon-globe class */
.standalone-glyphicon-globe:before {
    content: url('data:image/svg+xml;utf8,<svg enable-background="new 0 0 64 64" id="Layer_1" version="1.1" viewBox="0 0 64 64" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><path d="M32,7.173c-13.689,0-24.826,11.137-24.826,24.826c0,5.613,1.828,10.909,5.285,15.314c4.743,6.046,11.866,9.514,19.542,9.514  s14.799-3.468,19.543-9.515c3.456-4.406,5.283-9.702,5.283-15.313C56.826,18.31,45.689,7.173,32,7.173z M41.525,30.543  c-0.109-2.41-0.472-4.68-1.003-6.784c3.066-0.744,5.701-1.81,7.858-2.912c1.914,2.802,3.111,6.12,3.373,9.696H41.525z M31.83,51.822  c-0.07-0.001-0.139-0.005-0.208-0.006c-1.283-1.658-3.306-4.707-4.782-8.936c1.611-0.254,3.33-0.411,5.161-0.411  c1.614,0,3.143,0.121,4.592,0.322C35.089,46.914,33.082,50.079,31.83,51.822z M32,39.469c-2.15,0-4.151,0.204-6.022,0.521  c-0.488-1.96-0.833-4.112-0.94-6.448h13.494c-0.121,2.252-0.498,4.38-1.025,6.349C35.782,39.627,33.946,39.469,32,39.469z   M12.248,30.543c0.262-3.576,1.459-6.894,3.373-9.696c2.034,1.039,4.504,2.048,7.36,2.785c-0.499,2.106-0.834,4.414-0.932,6.912  H12.248z M25.037,30.543c0.099-2.267,0.423-4.363,0.887-6.281c1.89,0.321,3.917,0.511,6.076,0.511c1.97,0,3.826-0.162,5.572-0.433  c0.5,1.928,0.853,4.005,0.964,6.202H25.037z M31.837,12.181c1.277,1.773,3.334,5.021,4.844,9.258  c-1.476,0.209-3.035,0.334-4.682,0.334c-1.853,0-3.597-0.154-5.233-0.414c1.482-4.338,3.552-7.473,4.856-9.167  C31.695,12.191,31.765,12.182,31.837,12.181z M46.442,18.459c-1.896,0.923-4.16,1.796-6.761,2.415  c-1.168-3.427-2.681-6.264-3.985-8.343C39.899,13.328,43.626,15.457,46.442,18.459z M27.597,12.683  c-1.284,2.001-2.711,4.708-3.809,8.06c-2.382-0.609-4.466-1.426-6.23-2.284C20.215,15.627,23.683,13.575,27.597,12.683z   M12.237,33.543h9.814c0.107,2.564,0.465,4.925,0.99,7.073c-2.907,0.746-5.359,1.747-7.289,2.723  C13.71,40.426,12.506,37.086,12.237,33.543z M17.692,45.718c1.685-0.808,3.77-1.608,6.172-2.218c1.091,3.254,2.49,5.883,3.747,7.839  C23.837,50.491,20.401,48.552,17.692,45.718z M35.689,51.48c1.277-2.034,2.756-4.796,3.916-8.129  c2.589,0.61,4.833,1.471,6.702,2.369C43.431,48.726,39.736,50.722,35.689,51.48z M48.252,43.333  c-2.122-1.072-4.733-2.126-7.788-2.862c0.556-2.143,0.939-4.462,1.057-6.928h10.242C51.494,37.083,50.291,40.422,48.252,43.333z" style="fill:%23ffffff;fill-opacity:1;"/></svg>') !important;
}
"""


INTRODUCTION = """
{0}
<div style="font-weight:bold;" class="alert alert-warning">
{1}
{2}
{3}
</div>
"""


LOCALE_SECTION = """
<div id="{language_code}" class="localization-content{hidden}">
{introduction}
{compatibility}
{content_base}
{content_extra}
{localize_info}
{only_english_alert}
</div> <!-- .localization-content -->
"""

# {endonym} inside an HTML comment at the very begening of the string so I can sort all
# the "option" elements by endonym.
OPTION = """<!-- {endonym} --><option {selected}data-title="{title}" data-xlet-help="{xlet_help}" data-xlet-contributors="{xlet_contributors}" data-xlet-changelog="{xlet_changelog}" value="{language_code}">{endonym} ({language_name})</option>"""


README_POEDITOR_BLOCK = """<tr><td><img src="https://odyseus.github.io/CinnamonTools/lib/img/translate.svg"></td>
<td><a href="{poeditor_url}"><strong>
Help translate {xlet_name}
</strong></a></td></tr>
"""


README_DOC = """{readme_compatibility}
{readme_content}
"""

BOOTSTRAP_PANEL = """
<div class="panel panel-{context}">
    <div class="panel-heading">
        <h3 class="panel-title">{title}</h3>
    </div>
    <div class="panel-body {custom_class}">
        {content}
    </div>
</div>
"""

BOOTSTRAP_ALERT = """
<div class="alert alert-{context}">
{content}
</div>
"""


COMPATIBILITY_BADGE = '<span class="compatibility-badge"><span class="label label-primary">Cinnamon\
</span><span class="label label-{0}">{1}</span></span>\n'


class HTMLTemplates():
    """Summary

    Attributes
    ----------
    boxed_container : TYPE
        Description
    bt_alert : TYPE
        Description
    bt_panel : TYPE
        Description
    css_base : TYPE
        Description
    html_doc : TYPE
        Description
    introduction_base : TYPE
        Description
    locale_section_base : TYPE
        Description
    option_base : TYPE
        Description
    readme_doc : TYPE
        Description
    readme_poeditor_block : TYPE
        Description
    """

    def __init__(self):
        """Summary
        """
        self.html_doc = HTML_DOC
        self.css_base = BASE_CSS
        self.introduction_base = INTRODUCTION
        self.locale_section_base = LOCALE_SECTION
        self.option_base = OPTION
        self.boxed_container = BOXED_CONTAINER
        self.readme_doc = README_DOC
        self.readme_poeditor_block = README_POEDITOR_BLOCK
        self.bt_panel = BOOTSTRAP_PANEL
        self.bt_alert = BOOTSTRAP_ALERT


class XletMetadata():
    """Summary

    Attributes
    ----------
    xlet_meta : TYPE
        Description
    """

    def __init__(self, xlet_dir):
        """Summary

        Parameters
        ----------
        xlet_dir : TYPE
            Description
        """
        try:
            file = open(os.path.join(xlet_dir, "metadata.json"), "r")
            raw_meta = file.read()
            file.close()
            self.xlet_meta = json.loads(raw_meta)
        except Exception as detail:
            print("Failed to get metadata - missing, corrupt, or incomplete metadata.json file")
            print(detail)
            self.xlet_meta = None


class Translations(object):

    """Summary
    """

    def __init__(self):
        """Summary
        """
        self._translations = {}
        self._null = gettext.NullTranslations()

    def store(self, domain, localedir, languages):
        """Summary

        Parameters
        ----------
        domain : TYPE
            Description
        localedir : TYPE
            Description
        languages : TYPE
            Description
        """
        for lang in languages:
            try:
                translations = gettext.translation(domain,
                                                   localedir,
                                                   [lang])
            except IOError:
                print("No translations found for language code '{}'".format(lang))
                translations = None

            if translations is not None:
                self._translations[lang] = translations

    def get(self, languages):
        """Summary

        Parameters
        ----------
        languages : TYPE
            Description

        Returns
        -------
        TYPE
            Description
        """
        for lang in languages:
            if lang in self._translations:
                return self._translations[lang]
        return self._null


class HTMLInlineAssets(object):

    """Summary

    Attributes
    ----------
    css_bootstrap : TYPE
        Description
    css_tweaks : TYPE
        Description
    js_localizations_handler : TYPE
        Description
    path_css_bootstrap : TYPE
        Description
    path_css_tweaks : TYPE
        Description
    path_js_localizations_handler : TYPE
        Description
    """

    def __init__(self, repo_folder):
        """Summary

        Parameters
        ----------
        repo_folder : TYPE
            Description
        """
        super(HTMLInlineAssets, self).__init__()
        self.css_bootstrap = ""
        self.css_tweaks = ""
        self.js_localizations_handler = ""

        assets_folder_path = os.path.join(repo_folder, "__app__", "data", "html_assets")
        self.path_css_bootstrap = os.path.join(
            assets_folder_path, "css", "bootstrap-for-standalone.min.css")
        self.path_css_tweaks = os.path.join(assets_folder_path, "css", "tweaks.css")
        self.path_js_localizations_handler = os.path.join(
            assets_folder_path, "js", "localizations-handler.js")

        # Do the "heavy lifting" first.
        if os.path.exists(self.path_css_bootstrap):
            with open(self.path_css_bootstrap, "r", encoding="UTF-8") as bootstrap_css:
                self.css_bootstrap = bootstrap_css.read()

        if os.path.exists(self.path_css_tweaks):
            with open(self.path_css_tweaks, "r", encoding="UTF-8") as tweaks_css:
                self.css_tweaks = tweaks_css.read()

        if os.path.exists(self.path_js_localizations_handler):
            with open(self.path_js_localizations_handler, "r", encoding="UTF-8") as localizations_handler_js:
                self.js_localizations_handler = localizations_handler_js.read()


def get_parent_dir(fpath, go_up=0):
    """get_parent_dir

    Extract the path of the parent directory of a file path.

    Parameters
    ----------
    fpath : str
        The full path to a file.
    go_up : int, optional
        Description

    Keyword Arguments
    -----------------
    go_up : int
        How many directories to go up. (default: {0})

    Returns
    -------
    str
        The new path to a directory.
    """
    dir_path = os.path.dirname(fpath)

    if go_up >= 1:
        for x in range(0, int(go_up)):
            dir_path = os.path.dirname(dir_path)

    return dir_path


def get_time_zone():
    """Summary

    Returns
    -------
    TYPE
        Description
    """
    if time.localtime().tm_isdst and time.daylight:
        tzone = -time.altzone
    else:
        tzone = -time.timezone

    # Up to here, tzone is an integer.
    tzone = str(tzone / 60 / 60)

    # And the ugliness begins!!!
    [h, m] = tzone.split(".")

    isNegative = int(h) < 0
    hours = "{0:03d}".format(int(h)) if isNegative else "{0:02d}".format(int(h))
    minutes = "{0:02d}".format(int(m))

    try:
        return (hours if isNegative else "+" + hours) + minutes
    except Exception:
        return "+0000"


def get_timestamp():
    """Returns a time stamp in the same format used by xgettex.

    Returns
    -------
    TYPE
        Description
    """
    now = datetime.datetime.now()
    # Since the "padding" with zeroes of the rest of the values converts
    # them into strings, lets convert to string the year too.
    YEAR = str(now.year)
    # "Pad" all the following values with zeroes.
    MO = "{0:02d}".format(now.month)
    DA = "{0:02d}".format(now.day)
    HO = "{0:02d}".format(now.hour)
    MI = "{0:02d}".format(now.minute)
    ZONE = get_time_zone()

    return "%s-%s-%s %s:%s%s" % (YEAR, MO, DA, HO, MI, ZONE)


def validate_po_file(pofile_path, lang_name, xlet_meta, xlet_slug):
    """Summary

    Parameters
    ----------
    pofile_path : TYPE
        Description
    lang_name : TYPE
        Description
    xlet_meta : TYPE
        Description
    xlet_slug : TYPE
        Description
    """
    po_file = polib.pofile(pofile_path, wrapwidth=99999999)
    do_save = False

    # Add package information to the .po files headers.
    if xlet_meta:
        do_save = True
        po_file.metadata[
            "Project-Id-Version"] = "{0} {1}".format(xlet_slug, xlet_meta["version"])

    # Sanitize language code to be UNIX compliant
    if "-" in po_file.metadata["Language"]:
        do_save = True
        po_file.metadata["Language"] = po_file.metadata["Language"].replace("-", "_")

    # Add the Report-Msgid-Bugs- field to the header.
    if "Report-Msgid-Bugs-To" not in po_file.metadata or po_file.metadata["Report-Msgid-Bugs-To"] != "https://github.com/Odyseus/CinnamonTools":
        do_save = True
        po_file.metadata["Report-Msgid-Bugs-To"] = "https://github.com/Odyseus/CinnamonTools"

    # Add the Language-Team field to the header to STFU all msgfmt warnings.
    if "Language-Team" not in po_file.metadata or po_file.metadata["Language-Team"] == "":
        do_save = True
        po_file.metadata["Language-Team"] = lang_name

    # Add the PO-Revision-Date field to the header to STFU all msgfmt warnings.
    if "PO-Revision-Date" not in po_file.metadata:
        do_save = True
        po_file.metadata["PO-Revision-Date"] = get_timestamp()

    # Add the Last-Translator field to the header to STFU all msgfmt warnings.
    if "Last-Translator" not in po_file.metadata:
        do_save = True
        po_file.metadata["Last-Translator"] = ""

    if po_file.metadata["X-Generator"] == "POEditor.com":
        do_save = True
        po_file.metadata["X-Generator"] = ""

    # Save only if the PO file metadata/header has been changed.
    if do_save:
        po_file.save()


def save_file(path, data):
    """Summary

    Parameters
    ----------
    path : TYPE
        Description
    data : TYPE
        Description
    """
    try:
        with open(path, "w") as f:
            f.write(data)
    except Exception as err:
        print(app_utils.Ansi.ERROR(err))
        quit()
    else:
        # This copies the HELP.html files just created to
        # docs_sources/_static/xlets_help_pages for on-line hosting.
        if path.endswith("HELP.html"):
            repo_folder = get_parent_dir(path, 2)
            xlet_slug = os.path.basename(get_parent_dir(path))
            destination = os.path.join(repo_folder, "__app__", "docs_sources",
                                       "_static", "xlets_help_pages", xlet_slug + ".html")

            os.makedirs(os.path.dirname(destination), exist_ok=True)

            if os.path.exists(destination):
                os.remove(destination)

            copy2(path, destination)


def get_compatibility(xlet_meta=None, for_readme=False):
    """Summary

    Parameters
    ----------
    xlet_meta : None, optional
        Description
    for_readme : bool, optional
        Description

    Returns
    -------
    TYPE
        Description
    """
    data = ""

    if for_readme:
        data += "## Compatibility\n\n"

    for version in sorted(xlet_meta["cinnamon-version"]):
        if for_readme:
            # The README files uses SVG images hosted on-line for the compatibility badges.
            data += "![Cinnamon {0}](https://odyseus.github.io/CinnamonTools/lib/badges/cinn-{0}.svg)\n".format(version)
        else:
            # The help files uses a custom Bootstrap label for the compatibility badges.
            if version[0] in ["2", "5", "8"]:
                data += COMPATIBILITY_BADGE.format("warning", version)
            elif version[0] in ["3", "6", "9"]:
                data += COMPATIBILITY_BADGE.format("success", version)
            elif version[0] in ["4", "7"]:
                data += COMPATIBILITY_BADGE.format("info", version)
            else:
                data += COMPATIBILITY_BADGE.format("warning", version)

    if for_readme:
        data += "\n<span style=\"color:red;\"><strong>Do not install on any other version of Cinnamon.</strong></span>\n"

    return data


if __name__ == "__main__":
    pass
