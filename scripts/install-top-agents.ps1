param(
	[Parameter(Mandatory = $false)]
	[string]$AgencyRepoPath = "G:\AI Agents\agency-agents",

	[Parameter(Mandatory = $false)]
	[switch]$CleanFirst
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$topAgents = @(
	"engineering\engineering-backend-architect.md",
	"engineering\engineering-frontend-developer.md",
	"engineering\engineering-database-optimizer.md",
	"engineering\engineering-security-engineer.md",
	"engineering\engineering-devops-automator.md",
	"engineering\engineering-git-workflow-master.md",
	"testing\testing-api-tester.md",
	"testing\testing-test-results-analyzer.md",
	"testing\testing-reality-checker.md",
	"testing\testing-evidence-collector.md"
)

$destinations = @(
	(Join-Path $HOME ".github\agents"),
	(Join-Path $HOME ".copilot\agents")
)

if (-not (Test-Path $AgencyRepoPath)) {
	throw "Agency repo path not found: $AgencyRepoPath"
}

foreach ($dest in $destinations) {
	New-Item -ItemType Directory -Force -Path $dest | Out-Null

	if ($CleanFirst) {
		Get-ChildItem -Path $dest -File -ErrorAction SilentlyContinue | Remove-Item -Force
	}
}

$copied = 0
foreach ($relativePath in $topAgents) {
	$sourceFile = Join-Path $AgencyRepoPath $relativePath
	if (-not (Test-Path $sourceFile)) {
		throw "Agent file not found: $sourceFile"
	}

	foreach ($dest in $destinations) {
		Copy-Item -Path $sourceFile -Destination $dest -Force
	}

	$copied++
}

Write-Host "Installed $copied agents to:" -ForegroundColor Green
foreach ($dest in $destinations) {
	Write-Host "- $dest"
}

Write-Host "`nTip: Reload VS Code window to refresh Copilot agents list." -ForegroundColor Yellow
