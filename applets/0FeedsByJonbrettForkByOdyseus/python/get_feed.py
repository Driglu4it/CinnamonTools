#!/usr/bin/python3
# -*- coding: utf-8 -*-


""" feedparser documentation:
 https://pypi.python.org/pypi/feedparser
 https://pythonhosted.org/feedparser/
"""
import sys
import json
import time

try:
    import feedparser
except (SystemError, ImportError):
    print("feedparser_error")
    raise SystemExit()


if __name__ == "__main__":
    rss = sys.argv[1]

    info = {}

    try:
        parser = feedparser.parse(rss)
        # check for permanent redirect
        if parser.status == 301:
            info["redirected_url"] = parser.href
        elif parser.status == 401:
            raise Exception("Feed is password protected and not supported at this time.")
        elif parser.status == 410:
            raise Exception("Feed marked Gone, please remove and stop trying.")

        feed = parser.feed

        if "title" in feed:
            info["title"] = feed["title"]
        else:
            info["title"] = rss

        if "description" in feed:
            info["description"] = feed["description"]
        else:
            info["description"] = feed.get("subtitle", info["title"])

        info["link"] = feed.get("link", rss)
        info["lastcheck"] = int(time.time() * 1000)

        # image is optional in the rss spec
        if "image" in feed:
            image_info = {}
            try:
                image_info["url"] = feed["image"]["url"]
                image_info["width"] = feed["image"]["width"]
                image_info["height"] = feed["image"]["height"]
                info["image"] = image_info
            except Exception as e:
                sys.stderr.write(str(e.args))

        info["entries"] = []
        for item in parser["entries"]:
            item_info = {}
            # Invalid feeds will be excluded
            try:
                # guid is optional, so use link if it's not given
                if "guid" in item:
                    item_info["id"] = item["guid"]
                else:
                    item_info["id"] = item["link"]

                item_info["title"] = item["title"]
                item_info["link"] = item["link"]
                item_info["description"] = item.get("description", item_info["title"])

                if "pubDate" in item:
                    item_info["pubDate"] = item["pubDate"]
                elif "published" in item:
                    item_info["pubDate"] = item["published"]
                else:
                    item_info["pubDate"] = None

                info["entries"].append(item_info)
            except Exception as e:
                sys.stderr.write(str(e))
    except Exception as e:
        info["exception"] = e

    # This print statement is the return value to the javascript.
    print(json.dumps(info))
