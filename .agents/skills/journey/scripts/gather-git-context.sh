#!/usr/bin/env bash
# Gathers git repository context for the /journey skill in Unix/macOS/WSL.

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
REMOTE_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")
WEB_URL=$(echo "$REMOTE_URL" | sed -E 's|^git@github\.com:|https://github.com/|' | sed -E 's|\.git$||')
LAST_HASH=$(git rev-parse HEAD 2>/dev/null || echo "")
LAST_SHORT=$(git rev-parse --short HEAD 2>/dev/null || echo "")
LAST_MSG=$(git log -1 --pretty=%s 2>/dev/null || echo "")
LAST_AUTHOR=$(git log -1 --pretty=%an 2>/dev/null || echo "")
LAST_DATE=$(git log -1 --pretty=%cd --date=iso-strict 2>/dev/null || echo "")
UNCOMMITTED_COUNT=$(git status --porcelain 2>/dev/null | grep -c '.' || echo "0")

echo "{"
echo "  \"branch\": \"$BRANCH\","
echo "  \"remoteUrl\": \"$REMOTE_URL\","
echo "  \"githubWebUrl\": \"$WEB_URL\","
echo "  \"lastCommit\": {"
echo "    \"hash\": \"$LAST_HASH\","
echo "    \"shortHash\": \"$LAST_SHORT\","
echo "    \"message\": \"$LAST_MSG\","
echo "    \"author\": \"$LAST_AUTHOR\","
echo "    \"date\": \"$LAST_DATE\","
echo "    \"githubUrl\": \"$WEB_URL/commit/$LAST_HASH\""
echo "  },"
echo "  \"uncommittedCount\": $UNCOMMITTED_COUNT"
echo "}"
