param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,
  [Parameter(Mandatory = $true)]
  [string]$DestinationPath
)

$workflow = Get-Content -LiteralPath $SourcePath -Raw -Encoding UTF8 | ConvertFrom-Json
$webhook = $workflow.nodes | Where-Object name -eq 'Webhook'
$switch = $workflow.nodes | Where-Object name -eq 'Switch'
$update = $workflow.nodes | Where-Object name -eq 'Update an event'
$create = $workflow.nodes | Where-Object { $_.name -in @('Create an event', 'Create an event1') } | Select-Object -First 1

if (-not $webhook -or -not $switch -or -not $update -or -not $create) {
  throw 'O workflow de origem não contém os nós básicos esperados.'
}

$webhook.parameters | Add-Member -NotePropertyName responseMode -NotePropertyValue 'responseNode' -Force
$update.parameters.eventId = '={{$node["Webhook"].json.body.calendarEventId}}'
$update.parameters.updateFields.summary = '={{$node["Webhook"].json.body.event.summary}}'
$update.parameters.updateFields.description = '={{$node["Webhook"].json.body.event.description}}'
$update.parameters.updateFields | Add-Member -NotePropertyName color -NotePropertyValue '={{$node["Webhook"].json.body.event.colorId}}' -Force
$update | Add-Member -NotePropertyName alwaysOutputData -NotePropertyValue $true -Force

$create.name = 'Create an event'
$create.parameters.additionalFields.PSObject.Properties.Remove('id')
$create.parameters.additionalFields.summary = '={{$node["Webhook"].json.body.event.summary}}'
$create.parameters.additionalFields.description = '={{$node["Webhook"].json.body.event.description}}'
$create.parameters.additionalFields | Add-Member -NotePropertyName color -NotePropertyValue '={{$node["Webhook"].json.body.event.colorId}}' -Force
$create | Add-Member -NotePropertyName alwaysOutputData -NotePropertyValue $true -Force

function New-IdConditionNode($name, $id, $position) {
  [pscustomobject]@{
    parameters = [pscustomobject]@{
      conditions = [pscustomobject]@{
        options = [pscustomobject]@{ caseSensitive = $true; leftValue = ''; typeValidation = 'strict'; version = 3 }
        conditions = @([pscustomobject]@{
          id = "$id-condition"
          leftValue = '={{$node["Webhook"].json.body.calendarEventId}}'
          rightValue = ''
          operator = [pscustomobject]@{ type = 'string'; operation = 'notEmpty'; singleValue = $true }
        })
        combinator = 'and'
      }
      options = [pscustomobject]@{}
    }
    type = 'n8n-nodes-base.if'
    typeVersion = 2.3
    position = $position
    id = $id
    name = $name
  }
}

function New-RespondNode($name, $id, $position, $bodyExpression) {
  [pscustomobject]@{
    parameters = [pscustomobject]@{
      respondWith = 'json'
      responseBody = $bodyExpression
      options = [pscustomobject]@{}
    }
    type = 'n8n-nodes-base.respondToWebhook'
    typeVersion = 1.4
    position = $position
    id = $id
    name = $name
  }
}

$hasUpsertId = New-IdConditionNode 'Has stored event ID' '89e12754-fc1c-41fa-81a3-0903fffb4397' @(336, -160)
$hasDeleteId = New-IdConditionNode 'Has event ID to delete' '287f11de-2dbf-49ec-82c3-d611b6f784eb' @(336, 176)

$delete = [pscustomobject]@{
  parameters = [pscustomobject]@{
    operation = 'delete'
    calendar = $create.parameters.calendar
    eventId = '={{$node["Webhook"].json.body.calendarEventId}}'
    options = [pscustomobject]@{}
  }
  type = 'n8n-nodes-base.googleCalendar'
  typeVersion = 1.3
  position = @(592, 112)
  id = 'bd2ad09c-b4f1-4df8-a30a-bb2821175fb5'
  name = 'Delete an event'
  credentials = $create.credentials
  alwaysOutputData = $true
}

$respondUpsert = New-RespondNode 'Respond upsert' 'f8d37fa0-76dc-4b53-9c14-b8ccff10c2fa' @(1168, -160) '={{ { "ok": true, "eventId": $json.id || $node["Webhook"].json.body.calendarEventId } }}'
$respondDelete = New-RespondNode 'Respond delete' '52a3e7fa-a2f7-4419-b2b2-2fbebd90fdfc' @(880, 176) '={{ { "ok": true, "deleted": true, "eventId": "" } }}'
$respondNoDelete = New-RespondNode 'Respond nothing to delete' '23827235-5fdd-48c2-b255-a9367b4ecdc0' @(592, 272) '={{ { "ok": true, "deleted": false, "eventId": "" } }}'

$update.position = @(880, -240)
$create.position = @(880, -80)
$workflow.nodes = @($webhook, $switch, $hasUpsertId, $update, $create, $respondUpsert, $hasDeleteId, $delete, $respondDelete, $respondNoDelete)

$workflow.connections = [pscustomobject]@{
  Webhook = [pscustomobject]@{ main = @(,@([pscustomobject]@{ node = 'Switch'; type = 'main'; index = 0 })) }
  Switch = [pscustomobject]@{ main = @(
    @([pscustomobject]@{ node = 'Has stored event ID'; type = 'main'; index = 0 }),
    @([pscustomobject]@{ node = 'Has event ID to delete'; type = 'main'; index = 0 })
  ) }
  'Has stored event ID' = [pscustomobject]@{ main = @(
    @([pscustomobject]@{ node = 'Update an event'; type = 'main'; index = 0 }),
    @([pscustomobject]@{ node = 'Create an event'; type = 'main'; index = 0 })
  ) }
  'Update an event' = [pscustomobject]@{ main = @(,@([pscustomobject]@{ node = 'Respond upsert'; type = 'main'; index = 0 })) }
  'Create an event' = [pscustomobject]@{ main = @(,@([pscustomobject]@{ node = 'Respond upsert'; type = 'main'; index = 0 })) }
  'Has event ID to delete' = [pscustomobject]@{ main = @(
    @([pscustomobject]@{ node = 'Delete an event'; type = 'main'; index = 0 }),
    @([pscustomobject]@{ node = 'Respond nothing to delete'; type = 'main'; index = 0 })
  ) }
  'Delete an event' = [pscustomobject]@{ main = @(,@([pscustomobject]@{ node = 'Respond delete'; type = 'main'; index = 0 })) }
}

$workflow.name = 'Enzo Workflow Google Calendar v4'
$workflow.active = $false
$workflow.settings | Add-Member -NotePropertyName timezone -NotePropertyValue 'America/Campo_Grande' -Force
$workflow | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $DestinationPath -Encoding UTF8
