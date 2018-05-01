#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""Summary

Attributes
----------
CHANGELOG_TITLE : TYPE
    Description
"""

# This module is used to "sanitize" all changelogs generated by the git log command.

import re

CHANGELOG_TITLE = """## {xlet_name} changelog

#### This change log is only valid for the version of the xlet hosted on [its original repository](https://github.com/Odyseus/CinnamonTools)

***

"""


class ChangelogSanitizer(object):
    """Summary

    Attributes
    ----------
    changelog_title : TYPE
        Description
    source_path : TYPE
        Description
    target_path : TYPE
        Description
    """
    def __init__(self, xlet_name, source_path, target_path):
        """Summary

        Parameters
        ----------
        xlet_name : TYPE
            Description
        source_path : TYPE
            Description
        target_path : TYPE
            Description
        """
        super(ChangelogSanitizer, self).__init__()
        # Temporary location of the changelog.
        self.source_path = source_path
        # Final destination of the changelog.
        self.target_path = target_path

        self.changelog_title = CHANGELOG_TITLE.format(xlet_name=xlet_name)

    def sanitize(self):
        """Summary
        """
        strings = None

        try:
            with open(self.source_path, "r") as log_file_r:
                # The split-join is to somewhat sanitize my first commit messages
                # back when I started the repository.
                # I lazily wrote hundred of commits on one line at the beginning.
                # Re-writing history isn't an option. I already did enough damage doing that. LOL
                strings = "\n- ".join(log_file_r.read().split(". - "))
                # strings = log_file_r.read()
        except Exception as error:
            print(error)
            quit()
        finally:
            # Wrap long lines to 100 characters. As long as an horizontal scrollbar
            # doesn't show up on 1024 width resolutions, I'm golden.
            if strings is not None:
                wrapped_strings = ""
                # StackOverflow to the rescue!!! http://stackoverflow.com/a/16430216/4147432
                # strings = "\n".join(line.strip() for line in re.findall(r'.{1,100}(?:\s+|$)', strings))

                # I had to handle each freaking line independently because handling them
                # in bulk completely destroys absolutelly all new lines.
                for s in strings.splitlines():
                    if len(s) < 100:
                        wrapped_strings += s + "\n"
                    else:
                        wrapped_strings += "\n".join(line.strip()
                                                     for line in re.findall(r".{1,100}(?:\s+|$)", s)) + "\n"

                with open(self.target_path, "w") as log_file_w:
                    log_file_w.write(self.changelog_title + wrapped_strings)


if __name__ == "__main__":
    pass
