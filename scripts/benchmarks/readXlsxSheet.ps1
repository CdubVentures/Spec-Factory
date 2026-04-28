param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath,

  [Parameter(Mandatory = $true)]
  [string]$SheetName,

  [Parameter(Mandatory = $true)]
  [string]$OutPath
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-ZipEntryText {
  param(
    [System.IO.Compression.ZipArchive]$Zip,
    [string]$EntryName
  )

  $entry = $Zip.GetEntry($EntryName)
  if ($null -eq $entry) { return '' }

  $stream = $entry.Open()
  try {
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)
    try { return $reader.ReadToEnd() }
    finally { $reader.Dispose() }
  }
  finally { $stream.Dispose() }
}

function Get-CellPosition {
  param([string]$Reference)

  $match = [regex]::Match($Reference, '^([A-Z]+)(\d+)$')
  if (-not $match.Success) { return $null }

  $col = 0
  foreach ($char in $match.Groups[1].Value.ToCharArray()) {
    $col = ($col * 26) + ([int][char]$char - [int][char]'A' + 1)
  }

  return @{
    Row = [int]$match.Groups[2].Value
    Column = $col
  }
}

function Convert-SharedString {
  param([System.Xml.XmlElement]$Item)

  if ($null -eq $Item) { return '' }
  $texts = $Item.GetElementsByTagName('t')
  $parts = @()
  foreach ($text in $texts) {
    $parts += $text.InnerText
  }
  return ($parts -join '')
}

function Get-DateStyleIndexes {
  param([System.Xml.XmlDocument]$StylesXml)

  $dateNumFmtIds = [System.Collections.Generic.HashSet[int]]::new()
  foreach ($id in @(14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57)) {
    [void]$dateNumFmtIds.Add($id)
  }

  $numFmts = $StylesXml.GetElementsByTagName('numFmt')
  foreach ($numFmt in $numFmts) {
    $id = 0
    if (-not [int]::TryParse($numFmt.numFmtId, [ref]$id)) { continue }
    $format = [string]$numFmt.formatCode
    if ($format -match '(?i)(^|[^\\])([ymd]{1,4}|h{1,2}:mm|ss)') {
      [void]$dateNumFmtIds.Add($id)
    }
  }

  $styleIndexes = [System.Collections.Generic.HashSet[int]]::new()
  $cellXfsNodes = $StylesXml.GetElementsByTagName('cellXfs')
  if ($cellXfsNodes.Count -eq 0) { return $styleIndexes }

  $index = 0
  foreach ($xf in $cellXfsNodes[0].GetElementsByTagName('xf')) {
    $id = 0
    if ([int]::TryParse($xf.numFmtId, [ref]$id) -and $dateNumFmtIds.Contains($id)) {
      [void]$styleIndexes.Add($index)
    }
    $index += 1
  }

  return $styleIndexes
}

function Convert-CellValue {
  param(
    [System.Xml.XmlElement]$Cell,
    [object[]]$SharedStrings,
    [System.Collections.Generic.HashSet[int]]$DateStyleIndexes
  )

  $type = [string]$Cell.GetAttribute('t')
  $styleText = [string]$Cell.GetAttribute('s')
  $raw = ''

  $valueNodes = $Cell.GetElementsByTagName('v')
  if ($valueNodes.Count -gt 0) {
    $raw = [string]$valueNodes[0].InnerText
  }

  if ($type -eq 's') {
    $index = 0
    if ([int]::TryParse($raw, [ref]$index) -and $index -ge 0 -and $index -lt $SharedStrings.Count) {
      return [string]$SharedStrings[$index]
    }
    return ''
  }

  if ($type -eq 'inlineStr') {
    $texts = $Cell.GetElementsByTagName('t')
    $parts = @()
    foreach ($text in $texts) { $parts += $text.InnerText }
    return ($parts -join '')
  }

  if ($type -eq 'b') {
    if ($raw -eq '1') { return 'TRUE' }
    if ($raw -eq '0') { return 'FALSE' }
  }

  $styleIndex = -1
  $isDateStyle = [int]::TryParse($styleText, [ref]$styleIndex) -and $DateStyleIndexes.Contains($styleIndex)
  if ($isDateStyle) {
    $number = 0.0
    if ([double]::TryParse($raw, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
      $date = [DateTime]::FromOADate($number)
      if ($date.TimeOfDay.TotalSeconds -eq 0) {
        return $date.ToString('yyyy-MM-dd')
      }
      return $date.ToString('yyyy-MM-dd HH:mm:ss')
    }
  }

  return $raw
}

$resolvedWorkbook = [System.IO.Path]::GetFullPath($WorkbookPath)
$resolvedOut = [System.IO.Path]::GetFullPath($OutPath)
$outDir = [System.IO.Path]::GetDirectoryName($resolvedOut)
if (-not [System.IO.Directory]::Exists($outDir)) {
  [System.IO.Directory]::CreateDirectory($outDir) | Out-Null
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($resolvedWorkbook)
try {
  [xml]$workbookXml = Read-ZipEntryText -Zip $zip -EntryName 'xl/workbook.xml'
  [xml]$relsXml = Read-ZipEntryText -Zip $zip -EntryName 'xl/_rels/workbook.xml.rels'
  [xml]$sharedXml = Read-ZipEntryText -Zip $zip -EntryName 'xl/sharedStrings.xml'
  [xml]$stylesXml = Read-ZipEntryText -Zip $zip -EntryName 'xl/styles.xml'

  $sheetNode = $null
  foreach ($sheet in $workbookXml.GetElementsByTagName('sheet')) {
    if ([string]$sheet.name -eq $SheetName) {
      $sheetNode = $sheet
      break
    }
  }
  if ($null -eq $sheetNode) {
    throw "Worksheet '$SheetName' was not found in $resolvedWorkbook"
  }

  $relationshipId = $sheetNode.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
  $target = ''
  foreach ($rel in $relsXml.GetElementsByTagName('Relationship')) {
    if ([string]$rel.Id -eq $relationshipId) {
      $target = [string]$rel.Target
      break
    }
  }
  if (-not $target) { throw "Worksheet relationship '$relationshipId' was not found." }
  $sheetEntry = if ($target.StartsWith('/')) { $target.TrimStart('/') } else { "xl/$target" }
  $sheetEntry = $sheetEntry.Replace('\', '/')

  $sharedStrings = @()
  foreach ($si in $sharedXml.GetElementsByTagName('si')) {
    $sharedStrings += Convert-SharedString -Item $si
  }
  $dateStyleIndexes = Get-DateStyleIndexes -StylesXml $stylesXml

  [xml]$sheetXml = Read-ZipEntryText -Zip $zip -EntryName $sheetEntry
  $cells = @{}
  $maxRow = 0
  $maxCol = 0

  foreach ($cell in $sheetXml.GetElementsByTagName('c')) {
    $position = Get-CellPosition -Reference ([string]$cell.r)
    if ($null -eq $position) { continue }
    $value = Convert-CellValue -Cell $cell -SharedStrings $sharedStrings -DateStyleIndexes $dateStyleIndexes
    $cells["$($position.Row):$($position.Column)"] = $value
    if ($position.Row -gt $maxRow) { $maxRow = $position.Row }
    if ($position.Column -gt $maxCol) { $maxCol = $position.Column }
  }

  $rows = @()
  for ($row = 1; $row -le $maxRow; $row += 1) {
    $outRow = @()
    for ($col = 1; $col -le $maxCol; $col += 1) {
      $key = "$row`:$col"
      if ($cells.ContainsKey($key)) { $outRow += $cells[$key] }
      else { $outRow += '' }
    }
    $rows += ,$outRow
  }

  $json = $rows | ConvertTo-Json -Depth 100
  [System.IO.File]::WriteAllText($resolvedOut, $json, [System.Text.Encoding]::UTF8)
  Write-Host "Wrote $SheetName worksheet JSON to $resolvedOut"
}
finally {
  $zip.Dispose()
}
