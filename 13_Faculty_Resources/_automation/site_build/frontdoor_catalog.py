"""Build verified, site-specific data for the dormant Front Door modules."""
import copy
import json


DATA_DEFAULTS = {
    "FD_CURRICULUM": "{}",
    "FD_TOPIC_META": "{}",
    "FD_TOOL_REGISTRY": "{}",
    "FD_SITE_MANIFEST": "{}",
    "FD_ROLES": "[]",
}


def _inline_json(value):
    """Serialize JSON safely for an inline HTML script without changing its value."""
    return (json.dumps(value, ensure_ascii=False)
            .replace("&", "\\u0026")
            .replace("<", "\\u003c")
            .replace(">", "\\u003e")
            .replace("\u2028", "\\u2028")
            .replace("\u2029", "\\u2029"))


def _catalog_entries(catalog):
    """Flatten final nav metadata into a slug -> title/kind map."""
    if not isinstance(catalog, list):
        raise ValueError("final catalog must be a navigation list")
    entries = {}
    for section in catalog:
        if not isinstance(section, dict):
            raise ValueError("final catalog section must be an object")
        for item in section.get("items", []):
            if not isinstance(item, dict):
                raise ValueError("final catalog item must be an object")
            ref, title, kind = item.get("f"), item.get("t"), item.get("k")
            if not isinstance(ref, str) or not isinstance(title, str):
                raise ValueError("final catalog item needs string f and t")
            if kind not in ("md", "tool"):
                raise ValueError("final catalog item '%s' needs md or tool kind" % ref)
            prior = entries.get(ref)
            current = (title, kind)
            if prior is not None and prior != current:
                raise ValueError("final catalog has conflicting metadata for '%s'" % ref)
            entries[ref] = current
    return entries


def build_frontdoor_payload(site, curriculum, catalog):
    """Return a normalized Front Door projection after a site's nav is final.

    curriculum.json owns only placement.  The final site navigation owns every
    displayed title and kind, so the emitted manifest is rebuilt from `catalog`
    rather than copied from a shared source manifest.
    """
    if site not in ("ms3", "resident"):
        raise ValueError("unsupported site '%s'" % site)
    if not isinstance(curriculum, dict):
        raise ValueError("curriculum must be an object")

    site_library = curriculum.get("siteLibrary", {})
    config = site_library.get(site) if isinstance(site_library, dict) else None
    if not isinstance(config, dict):
        raise ValueError("curriculum.siteLibrary.%s must be an object" % site)

    projected = copy.deepcopy(curriculum)
    projected.pop("roles", None)
    projected.pop("siteLibrary", None)
    columns = projected.get("libraryColumns")
    if not isinstance(columns, list):
        raise ValueError("curriculum.libraryColumns must be a list")
    by_name = {}
    for column in columns:
        if not isinstance(column, dict) or not isinstance(column.get("name"), str):
            raise ValueError("each library column needs a name")
        by_name[column["name"]] = column

    additions = config.get("additions", [])
    if not isinstance(additions, list):
        raise ValueError("curriculum.siteLibrary.%s.additions must be a list" % site)
    for addition in additions:
        if not isinstance(addition, dict):
            raise ValueError("site library addition must be an object")
        column = by_name.get(addition.get("column"))
        if column is None:
            raise ValueError("site library addition names unknown column '%s'" %
                             addition.get("column"))
        refs = addition.get("refs")
        if not isinstance(refs, list) or not all(isinstance(ref, str) for ref in refs):
            raise ValueError("site library addition refs must be strings")
        column.setdefault("refs", []).extend(refs)

    exclusions = config.get("exclusions", [])
    if not isinstance(exclusions, list) or not all(isinstance(ref, str) for ref in exclusions):
        raise ValueError("curriculum.siteLibrary.%s.exclusions must be string refs" % site)
    excluded = set(exclusions)
    for column in columns:
        refs = column.get("refs")
        if not isinstance(refs, list):
            raise ValueError("library column '%s' refs must be a list" % column["name"])
        column["refs"] = [ref for ref in refs if ref not in excluded]

    catalog_entries = _catalog_entries(catalog)
    placed = []
    for column in columns:
        for ref in column["refs"]:
            if ref in placed:
                raise ValueError("duplicate placed ref '%s'" % ref)
            placed.append(ref)
            if ref not in catalog_entries:
                raise ValueError("placed ref '%s' has no final catalog entry" % ref)

    library_exclude = projected.get("libraryExclude")
    if not isinstance(library_exclude, list):
        raise ValueError("curriculum.libraryExclude must be a list")
    projected["libraryExclude"] = [
        entry for entry in library_exclude
        if not isinstance(entry, dict) or entry.get("ref") not in placed
    ]
    excluded_refs = {
        entry.get("ref") for entry in projected["libraryExclude"]
        if isinstance(entry, dict) and isinstance(entry.get("ref"), str)
    }
    if not set(placed).isdisjoint(excluded_refs):
        raise ValueError("projected libraryExclude overlaps placed refs")

    manifest = {"tools": [], "md": []}
    for ref in placed:
        title, kind = catalog_entries[ref]
        manifest["tools" if kind == "tool" else "md"].append(["", ref, title])

    roles = curriculum.get("roles", {}).get(site)
    if not isinstance(roles, list):
        raise ValueError("curriculum.roles.%s must be a list" % site)
    return {"curriculum": projected, "roles": copy.deepcopy(roles), "manifest": manifest}


def inject_frontdoor_payload(path, payload, topic_meta, tool_registry):
    """Replace each unique source data needle or fail before a site can ship."""
    values = {
        "FD_CURRICULUM": payload["curriculum"],
        "FD_TOPIC_META": topic_meta,
        "FD_TOOL_REGISTRY": tool_registry,
        "FD_SITE_MANIFEST": payload["manifest"],
        "FD_ROLES": payload["roles"],
    }
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    for name in DATA_DEFAULTS:
        marker = "var %s=" % name
        if text.count(marker) != 1:
            raise ValueError("Front Door data needle missing or duplicated: %s" % name)
        value_start = text.index(marker) + len(marker)
        try:
            _, value_end = json.JSONDecoder().raw_decode(text[value_start:])
        except json.JSONDecodeError as error:
            raise ValueError("Front Door data needle is not JSON: %s" % name) from error
        value_end += value_start
        if value_end >= len(text) or text[value_end] != ";":
            raise ValueError("Front Door data needle lacks a terminating semicolon: %s" % name)
        text = (text[:value_start] + _inline_json(values[name])
                + text[value_end:])
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
