#!/usr/bin/env bash
# builds the release title and body for a tag, see .github/releases/README.md
#
# usage: TAG=v1.4.0 [NOTES_SOURCE=auto|file|changelog|commits] [PRERELEASE=auto|true|false] \
#        bash .github/releases/generate-notes.sh
set -uo pipefail

TAG="${TAG:?TAG is required}"
VERSION="${TAG#v}"
BASE_VERSION="${VERSION%%-*}"
SOURCE="${NOTES_SOURCE:-auto}"
PRERELEASE_MODE="${PRERELEASE:-auto}"
REPOSITORY="${GITHUB_REPOSITORY:-zpt0/Questcord}"

NOTES_DIR=".github/releases"
INSTALL_FILE="${NOTES_DIR}/install.md"

NOTES_FILE=""
for candidate in "${NOTES_DIR}/${TAG}.md" "${NOTES_DIR}/v${BASE_VERSION}.md"; do
    if [ -f "$candidate" ]; then
        NOTES_FILE="$candidate"
        break
    fi
done

if [ "$SOURCE" = "auto" ]; then
    if [ -n "$NOTES_FILE" ]; then SOURCE="file"; else SOURCE="commits"; fi
fi

PREV_TAG="$(git describe --tags --abbrev=0 --match 'v*' "${TAG}^" 2>/dev/null || true)"
if [ -n "$PREV_TAG" ]; then
    RANGE="${PREV_TAG}..${TAG}"
    CHANGELOG_URL="https://github.com/${REPOSITORY}/compare/${PREV_TAG}...${TAG}"
else
    RANGE="${TAG}"
    CHANGELOG_URL="https://github.com/${REPOSITORY}/releases/tag/${TAG}"
fi

# drop leading/trailing blank lines
trim() {
    awk '{
        line[NR] = $0
    } END {
        first = 1
        while (first <= NR && line[first] ~ /^[[:space:]]*$/) first++
        last = NR
        while (last >= first && line[last] ~ /^[[:space:]]*$/) last--
        for (i = first; i <= last; i++) print line[i]
    }'
}

TITLE="$TAG"
BODY=""

case "$SOURCE" in
file)
    if [ -z "$NOTES_FILE" ]; then
        echo "::error::no release notes for ${TAG} (expected ${NOTES_DIR}/${TAG}.md or ${NOTES_DIR}/v${BASE_VERSION}.md)" >&2
        exit 1
    fi
    echo "release notes: ${NOTES_FILE}"
    # the first "# " heading is the release title, everything below is the body
    if head -n 1 "$NOTES_FILE" | grep -q '^# '; then
        TITLE="$(head -n 1 "$NOTES_FILE" | sed -E 's/^# +//')"
        BODY="$(tail -n +2 "$NOTES_FILE")"
    else
        BODY="$(cat "$NOTES_FILE")"
    fi
    ;;

changelog)
    BODY="$(awk -v "version=${BASE_VERSION}" '
        $0 ~ "^## \\[" version "\\]" { inside = 1; next }
        inside && /^## \[/ { exit }
        inside { print }
    ' CHANGELOG.md)"
    if [ -z "$(printf '%s' "$BODY" | tr -d '[:space:]')" ]; then
        echo "::error::CHANGELOG.md has no section for ${BASE_VERSION}" >&2
        exit 1
    fi
    echo "release notes: CHANGELOG.md [${BASE_VERSION}]"
    BODY="### What's Changed"$'\n\n'"$(printf '%s\n' "$BODY" | trim)"
    ;;

commits)
    echo "release notes: commit list (${RANGE})"
    SUBJECTS="$(git log "$RANGE" --pretty=format:'%s' --no-merges)"

    group() {
        printf '%s\n' "$SUBJECTS" |
            grep -E "$1" |
            sed -E 's/^[a-z]+(\([^)]*\))?!?: //' |
            sed 's/^/- /' || true
    }

    FEATURES="$(group '^feat(\([^)]*\))?:')"
    FIXES="$(group '^fix(\([^)]*\))?:')"
    OTHERS="$(group '^(chore|docs|build|ci|refactor|perf|test|style)(\([^)]*\))?:|^[A-Z]')"

    BODY="### What's Changed"
    if [ -n "$FEATURES" ]; then BODY="${BODY}"$'\n\n''**Features**'$'\n'"${FEATURES}"; fi
    if [ -n "$FIXES" ]; then BODY="${BODY}"$'\n\n''**Fixes**'$'\n'"${FIXES}"; fi
    if [ -n "$OTHERS" ]; then BODY="${BODY}"$'\n\n''**Other changes**'$'\n'"${OTHERS}"; fi

    CONTRIBUTORS="$(git log "$RANGE" --format='%an|%ae' --no-merges |
        grep -viE '^(zpt0|zpt0\.dev|sayrox|ghost)\|' |
        grep -vi 'claude' |
        grep -viE 'dependabot|\[bot\]|github-actions' |
        sort -u || true)"

    THANKS=""
    while IFS='|' read -r name _email; do
        [ -z "$name" ] && continue
        if [ -z "$THANKS" ]; then
            THANKS="[${name}](https://github.com/${name})"
        else
            THANKS="${THANKS}, [${name}](https://github.com/${name})"
        fi
    done <<<"$CONTRIBUTORS"
    if [ -n "$THANKS" ]; then BODY="${BODY}"$'\n\n'"**Thanks to** ${THANKS} for contributing!"; fi
    ;;

*)
    echo "::error::unknown notes source '${SOURCE}' (expected auto, file, changelog or commits)" >&2
    exit 1
    ;;
esac

# the footer is generated, so the compare link is always right
BODY="$(printf '%s\n' "$BODY" | grep -v '^\*\*Full Changelog\*\*:' || true)"
BODY="$(printf '%s\n' "$BODY" | trim)"

# install instructions, unless the notes already carry a section for them
if [ -f "$INSTALL_FILE" ] && ! printf '%s\n' "$BODY" | grep -qiE '^###[[:space:]]+install'; then
    BODY="${BODY}"$'\n\n'"$(trim <"$INSTALL_FILE")"
fi

BODY="${BODY}"$'\n\n'"**Full Changelog**: ${CHANGELOG_URL}"

if [ "$PRERELEASE_MODE" = "auto" ]; then
    case "$VERSION" in
    *-*) IS_PRERELEASE="true" ;;
    *) IS_PRERELEASE="false" ;;
    esac
else
    IS_PRERELEASE="$PRERELEASE_MODE"
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
    {
        echo "title=${TITLE}"
        echo "prerelease=${IS_PRERELEASE}"
        echo "body<<__NOTES_EOF__"
        printf '%s\n' "$BODY"
        echo "__NOTES_EOF__"
    } >>"$GITHUB_OUTPUT"
else
    echo "title: ${TITLE}"
    echo "prerelease: ${IS_PRERELEASE}"
    echo "body:"
    printf '%s\n' "$BODY"
fi

exit 0
