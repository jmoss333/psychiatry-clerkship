"""Allow only the observed leading cookie-policy hostname swap on AACAP's index."""
SOURCE_URL = ('https://www.aacap.org/AACAP/Resources_for_Primary_Care/'
              'Practice_Parameters_and_Resource_Centers/Practice-Parameters/Home.aspx')


def banner(host):
    return ('Cookie Preferences This website uses cookies to ensure you get the best experience on our website. '
            f'[Learn more](https://{host}/AACAP/About_AACAP/Cookie_Policy.aspx) CustomizeReject AllAccept All '
            f'[Skip to main content]({SOURCE_URL}#mainContentWrapper) ## Guidelines, Updates, and Parameters ')


def cookie_hostname_only(prior, row):
    if any(r.get('source_id') != 'aacap-parameters' or r.get('source_url') != SOURCE_URL
           or r.get('extractor') != 'firecrawl-markdown-main-v1' for r in (prior, row)):
        return False
    before, after = prior.get('text'), row.get('text')
    if not isinstance(before, str) or not isinstance(after, str):
        return False
    www, bare = banner('www.aacap.org'), banner('aacap.org')
    for old, new in ((www, bare), (bare, www)):
        if before.startswith(old) and after.startswith(new):
            # Compare the untouched remainder, not globally normalized URLs.
            rest = before[len(old):]
            return bool(rest.strip()) and rest == after[len(new):]
    return False
