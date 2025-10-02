# Create-Everything.ps1 — Master + Offline + IDs/Clips
$ErrorActionPreference='Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function RelPath($f){ ($f.Replace($root,'').TrimStart('\','/') -replace '\\','/') }
function NiceCase([string]$s){
  if(-not $s){return ""}; $s=$s -replace '[_\-]+',' '; $s=$s.Trim()
  $s=$s -replace '([a-z])([A-Z])','$1 $2' -replace '([A-Za-z])(\d)','$1 $2' -replace '(\d)([A-Za-z])','$1 $2'
  $s=($s -replace '\s+',' ').Trim()
  $w=$s.Split(' ',[System.StringSplitOptions]::RemoveEmptyEntries)
  $small='and','or','of','the','a','an','in','on','to','for','at','by','from'
  for($i=0;$i -lt $w.Length;$i++){ if($i -gt 0 -and $small -contains $w[$i].ToLower()){ $w[$i]=$w[$i].ToLower() } else { $w[$i]=($w[$i].Substring(0,1).ToUpper()+$w[$i].Substring(1).ToLower()) } }
  ($w -join ' ')
}
function ParseAlbumTrack($rel){
  $p=($rel -replace '\\','/').Split('/')
  $file=$p[-1]; $stem=[IO.Path]::GetFileNameWithoutExtension($file)
  $album = if($p.Length -ge 3){ $p[1] } else { "Singles" }
  if($stem -match '^\s*([0-9]{1,3})[ ._)-]*(.+)$'){ $null=$matches[1]; $stem=$matches[2] }
  [pscustomobject]@{ Album=NiceCase($album); TrackName=NiceCase($stem) }
}

# --- folders ---
$music = Join-Path $root 'music'; if(!(Test-Path $music)){ throw "music/ folder not found" }
$img   = Join-Path $root 'img'  ; if(!(Test-Path $img  )){ New-Item -ItemType Directory -Path $img   | Out-Null }
$idDir = Join-Path $root 'id'   ; if(!(Test-Path $idDir)){ New-Item -ItemType Directory -Path $idDir | Out-Null }
$clDir = Join-Path $root 'clips'; if(!(Test-Path $clDir)){ New-Item -ItemType Directory -Path $clDir | Out-Null }
$offln = Join-Path $root 'offline'; if(!(Test-Path $offln)){ New-Item -ItemType Directory -Path $offln | Out-Null }

# --- scan music (mp3) ---
$files = Get-ChildItem -Path $music -Recurse -File -Include *.mp3
if(!$files -or $files.Count -eq 0){ throw "No .mp3 files found under music/" }
$tracks = foreach($f in $files){
  $rel=RelPath $f.FullName; $m=ParseAlbumTrack $rel
  [pscustomobject]@{ Rel=$rel; Album=$m.Album; TrackName=$m.TrackName }
}

# --- optional album order (kept from Master; if none, alphabetical) ---
$albumFile = Join-Path $root 'ALBUM_RELEASE_ORDER.txt'
$albums = ($tracks | Select-Object -Expand Album | Sort-Object -Unique)
if(Test-Path $albumFile){
  $userOrder = Get-Content $albumFile | Where-Object { $_ -and $_ -notmatch '^\s*#' } | ForEach-Object { $_.Trim() }
  $extra = $albums | Where-Object { $_ -notin $userOrder }
  $albumOrder = @($userOrder + $extra)
}else{
  $albumOrder = $albums
}
$ordered = foreach($alb in $albumOrder){
  $tracks | Where-Object Album -eq $alb | Sort-Object Rel
}

# --- playlist.json (unchanged behavior; nicer titles) ---
$playlistPath = Join-Path $root 'playlist.json'
$ordered | ForEach-Object {
  [pscustomobject]@{ src = $_.Rel; title = "$($_.Album) - $($_.TrackName)" }
} | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 $playlistPath

# --- ids.json (station IDs in /id) ---
$idList = Get-ChildItem -Path $idDir -Recurse -File -Include *.mp3,*.wav,*.m4a | Sort-Object FullName
$idJson = $idList | ForEach-Object {
  $rel = RelPath $_.FullName
  [pscustomobject]@{ src = $rel; title = "Station ID - " + (NiceCase([IO.Path]::GetFileNameWithoutExtension($_.Name))) }
}
$idJson | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 (Join-Path $root 'ids.json')

# --- clips.json (inspirational clips in /clips; star (*) in name marks “also insert an ID after”) ---
$clList = Get-ChildItem -Path $clDir -Recurse -File -Include *.mp3,*.wav,*.m4a | Sort-Object FullName
$clipsJson = $clList | ForEach-Object {
  $rel = RelPath $_.FullName
  $name = [IO.Path]::GetFileNameWithoutExtension($_.Name)
  $hasStar = $name -match '\*'
  [pscustomobject]@{ src = $rel; title = "Clip - " + (NiceCase(($name -replace '\*',''))); star=$hasStar }
}
$clipsJson | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 (Join-Path $root 'clips.json')

# --- backgrounds.json (skip logo.*) ---
$logo = Get-ChildItem -Path $img -File | Where-Object { $_.Name -match '^(?i)logo\.(png|jpe?g|webp)$' } | Select-Object -First 1
$imgsAll = Get-ChildItem -Path $img -File | Where-Object { $_.Name -match '(?i)\.(gif|png|jpe?g|webp)$' }
$bgList = @(); foreach($im in $imgsAll){ if($logo -and $im.FullName -eq $logo.FullName){ continue }; $bgList += "img/"+$im.Name }
($bgList | ConvertTo-Json) | Set-Content -Encoding UTF8 (Join-Path $root 'backgrounds.json')

# --- create 128 kbps offline copies (if ffmpeg available) & map ---
$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
$offlineMap = @{}
if ($ffmpeg) {
  foreach ($f in $files) {
    $rel = RelPath $f.FullName
    $dst = Join-Path $offln ($rel -replace '^music/','')  # mirror structure under /offline/
    $dstDir = Split-Path $dst -Parent
    if(!(Test-Path $dstDir)){ New-Item -ItemType Directory -Path $dstDir | Out-Null }
    if(!(Test-Path $dst)){
      & ffmpeg -hide_banner -loglevel error -y -i $f.FullName -b:a 128k $dst
    }
    $offlineMap[$rel] = ('offline/' + ($rel -replace '^music/',''))
  }
}
$offlineMap.GetEnumerator() | ForEach-Object {
  [pscustomobject]@{ online = $_.Key; offline = $_.Value }
} | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 (Join-Path $root 'offline-map.json')

Write-Host "DONE. Generated:"
Write-Host " - playlist.json (main music)"
Write-Host " - ids.json (station IDs)"
Write-Host " - clips.json (inspirational clips; star=* triggers ID next)"
Write-Host " - backgrounds.json"
Write-Host " - offline/ (128kbps copies if ffmpeg found) + offline-map.json"
