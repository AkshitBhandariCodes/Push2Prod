<#
.SYNOPSIS
    Gathers git repository context for the /journey skill.
.DESCRIPTION
    Extracts current branch, remote URL, commit hashes, commit messages,
    recent log history, uncommitted changes, and formats GitHub commit URLs.
.OUTPUTS
    JSON object with all git metadata.
#>

$ErrorActionPreference = "SilentlyContinue"

$branch = git rev-parse --abbrev-ref HEAD
$remoteUrl = git config --get remote.origin.url
if ($remoteUrl) {
    # Normalize git@github.com:user/repo.git or https://github.com/user/repo.git to web url
    $webUrl = $remoteUrl -replace '^git@github\.com:', 'https://github.com/'
    $webUrl = $webUrl -replace '\.git$', ''
} else {
    $webUrl = ""
}

$lastCommitHash = git rev-parse HEAD
$lastCommitShort = git rev-parse --short HEAD
$lastCommitMsg = git log -1 --pretty=%B
$lastCommitAuthor = git log -1 --pretty=%an
$lastCommitDate = git log -1 --pretty=%cd --date=iso-strict

$recentCommits = @()
$gitLogRaw = git log -n 5 --pretty=format:"%h|%s|%an|%cr"
if ($gitLogRaw) {
    foreach ($line in ($gitLogRaw -split "`n")) {
        $parts = $line.Trim() -split '\|'
        if ($parts.Count -ge 2) {
            $cHash = $parts[0]
            $cMsg = $parts[1]
            $cAuthor = if ($parts.Count -ge 3) { $parts[2] } else { "" }
            $cTime = if ($parts.Count -ge 4) { $parts[3] } else { "" }
            $cLink = if ($webUrl) { "$webUrl/commit/$cHash" } else { "" }
            $recentCommits += [PSCustomObject]@{
                hash = $cHash
                message = $cMsg
                author = $cAuthor
                relativeTime = $cTime
                url = $cLink
            }
        }
    }
}

$uncommittedFiles = git status --porcelain
$uncommittedCount = 0
$statusSummary = @()
if ($uncommittedFiles) {
    $uncommittedList = ($uncommittedFiles -split "`n") | Where-Object { $_.Trim() -ne "" }
    $uncommittedCount = $uncommittedList.Count
    foreach ($item in ($uncommittedList | Select-Object -First 10)) {
        $statusSummary += $item.Trim()
    }
}

$latestCommitUrl = if ($webUrl -and $lastCommitHash) { "$webUrl/commit/$lastCommitHash" } else { "" }

$result = [PSCustomObject]@{
    branch = $branch
    remoteUrl = $remoteUrl
    githubWebUrl = $webUrl
    lastCommit = [PSCustomObject]@{
        hash = $lastCommitHash
        shortHash = $lastCommitShort
        message = ($lastCommitMsg.Trim() -split "`n")[0]
        fullMessage = $lastCommitMsg.Trim()
        author = $lastCommitAuthor
        date = $lastCommitDate
        githubUrl = $latestCommitUrl
    }
    recentCommits = $recentCommits
    uncommitted = [PSCustomObject]@{
        count = $uncommittedCount
        sample = $statusSummary
    }
}

$result | ConvertTo-Json -Depth 4
