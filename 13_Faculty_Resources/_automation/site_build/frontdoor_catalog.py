"""Build verified, site-specific data for the dormant Front Door modules."""
import copy
import json
import re


DATA_DEFAULTS = {
    "FD_CURRICULUM": "{}",
    "FD_TOPIC_META": "{}",
    "FD_TOOL_REGISTRY": "{}",
    "FD_SITE_MANIFEST": "{}",
    "FD_ROLES": "[]",
    "FD_AUDIENCE": "\"\"",
    "FD_CORE_REVISION": "\"\"",
    "FD_ROTATION_EDITION_CATALOG": "{}",
}

GOVERNANCE_KEYS = {"status", "riskKind", "riskLevel"}
GOVERNANCE_VALUES = {
    "status": {"pending", "reviewed"},
    "riskKind": {"general", "clinical", "legal", "formulary", "local-policy"},
    "riskLevel": {"low", "moderate", "high"},
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
    """Flatten final nav metadata into a slug -> title/kind/governance map."""
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
            governance = item.get("governance")
            if not isinstance(governance, dict) or set(governance) != GOVERNANCE_KEYS:
                raise ValueError("final catalog item '%s' needs an exact governance triplet" % ref)
            for field, allowed in GOVERNANCE_VALUES.items():
                if governance.get(field) not in allowed:
                    raise ValueError("final catalog item '%s' has malformed governance %s" %
                                     (ref, field))
            prior = entries.get(ref)
            current = (title, kind, copy.deepcopy(governance))
            if prior is not None and prior != current:
                raise ValueError("final catalog has conflicting metadata for '%s'" % ref)
            entries[ref] = current
    return entries


def build_frontdoor_payload(site, curriculum, catalog, revision, rotation_projection=None):
    """Return a normalized Front Door projection after a site's nav is final.

    curriculum.json owns only placement.  The final site navigation owns every
    displayed title and kind, so the emitted manifest is rebuilt from `catalog`
    rather than copied from a shared source manifest.
    """
    if site not in ("ms3", "resident"):
        raise ValueError("unsupported site '%s'" % site)
    if not isinstance(revision, str) or re.fullmatch(r"[0-9a-f]{40}", revision) is None:
        raise ValueError("revision must be a lowercase 40-character hexadecimal value")
    if not isinstance(curriculum, dict):
        raise ValueError("curriculum must be an object")
    if rotation_projection is None:
        rotation_projection = {
            "schemaVersion": 1, "audience": site, "revision": "", "projectionDigest": "",
            "rotationEditionV2": "disabled", "selectionKeys": [], "resolutionRecords": [], "blockedKeys": [],
        }
    if not isinstance(rotation_projection, dict) or rotation_projection.get("audience") != site:
        raise ValueError("rotation projection must be a matching audience object")

    expected_paths = {"ms3": ("ms3-six-week", 6), "resident": ("resident-four-week", 4)}
    learning_paths = curriculum.get("learningPaths")
    source_path = learning_paths.get(site) if isinstance(learning_paths, dict) else None
    expected_id, expected_count = expected_paths[site]
    if not isinstance(source_path, dict):
        raise ValueError("curriculum.learningPaths.%s must be an object" % site)
    if source_path.get("id") != expected_id:
        raise ValueError("curriculum.learningPaths.%s.id must be '%s'" % (site, expected_id))
    weeks = source_path.get("weeks")
    if not isinstance(weeks, list) or len(weeks) != expected_count:
        raise ValueError("curriculum.learningPaths.%s must contain %d weeks" %
                         (site, expected_count))

    site_library = curriculum.get("siteLibrary", {})
    config = site_library.get(site) if isinstance(site_library, dict) else None
    if not isinstance(config, dict):
        raise ValueError("curriculum.siteLibrary.%s must be an object" % site)

    projected = copy.deepcopy(curriculum)
    projected.pop("learningPaths", None)
    projected.pop("roles", None)
    projected.pop("siteLibrary", None)
    projected["path"] = {"id": expected_id, "weekCount": len(weeks)}
    projected["weeks"] = copy.deepcopy(weeks)
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

    path_refs = []
    for week in weeks:
        for item in week.get("items", []):
            ref, kind = item.get("ref"), item.get("kind")
            if ref not in catalog_entries:
                raise ValueError("path ref '%s' has no final %s catalog entry" % (ref, site))
            _title, nav_kind, _governance = catalog_entries[ref]
            expected_kind = "tool" if nav_kind == "tool" else "read"
            if kind != expected_kind:
                raise ValueError("path ref '%s' declares %s but final catalog is %s" %
                                 (ref, kind, expected_kind))
            if ref not in path_refs:
                path_refs.append(ref)

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
    manifest_refs = placed + [ref for ref in path_refs if ref not in placed]
    for ref in manifest_refs:
        title, kind, governance = catalog_entries[ref]
        manifest["tools" if kind == "tool" else "md"].append(["", ref, title, governance])

    roles = curriculum.get("roles", {}).get(site)
    if not isinstance(roles, list):
        raise ValueError("curriculum.roles.%s must be a list" % site)
    return {
        "curriculum": projected,
        "roles": copy.deepcopy(roles),
        "manifest": manifest,
        "audience": site,
        "coreRevision": revision,
        "rotationEditionCatalog": copy.deepcopy(rotation_projection),
    }


def inject_frontdoor_payload(path, payload, topic_meta, tool_registry):
    """Replace each unique source data needle or fail before a site can ship."""
    values = {
        "FD_CURRICULUM": payload["curriculum"],
        "FD_TOPIC_META": topic_meta,
        "FD_TOOL_REGISTRY": tool_registry,
        "FD_SITE_MANIFEST": payload["manifest"],
        "FD_ROLES": payload["roles"],
        "FD_AUDIENCE": payload["audience"],
        "FD_CORE_REVISION": payload["coreRevision"],
        "FD_ROTATION_EDITION_CATALOG": payload["rotationEditionCatalog"],
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
