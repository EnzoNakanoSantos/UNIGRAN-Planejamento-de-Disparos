param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,
  [Parameter(Mandatory = $true)]
  [string]$DestinationPath
)

$workflow = Get-Content -LiteralPath $SourcePath -Raw -Encoding UTF8 | ConvertFrom-Json

$getMany = $workflow.nodes | Where-Object { $_.name -eq 'Get many events' }
if (-not $getMany) {
  throw 'Nó "Get many events" não encontrado.'
}
$getMany.parameters.limit = 10
$getMany.parameters.PSObject.Properties.Remove('timeMin')
$getMany.parameters.PSObject.Properties.Remove('timeMax')

$updateNode = $workflow.nodes | Where-Object { $_.name -eq 'Update an event' }
if (-not $updateNode) {
  throw 'Nó "Update an event" não encontrado.'
}
$updateNode.parameters.eventId = '={{$json.id}}'
$updateNode.parameters.updateFields.summary = '={{ "[DISPARO:" + $node["Webhook"].json.body.dispatchId + "] " + $node["Webhook"].json.body.event.summary }}'
$updateNode.parameters.updateFields.description = '={{ $node["Webhook"].json.body.event.description + "\n\nID do disparo: " + $node["Webhook"].json.body.dispatchId }}'

$createNode = $workflow.nodes | Where-Object { $_.name -in @('Create an event', 'Create an event1') } | Select-Object -First 1
if (-not $createNode) {
  throw 'Nó de criação de evento não encontrado.'
}
$createNode.parameters.additionalFields.PSObject.Properties.Remove('id')
$createNode.parameters.additionalFields.summary = '={{ "[DISPARO:" + $node["Webhook"].json.body.dispatchId + "] " + $node["Webhook"].json.body.event.summary }}'
$createNode.parameters.additionalFields.description = '={{ $node["Webhook"].json.body.event.description + "\n\nID do disparo: " + $node["Webhook"].json.body.dispatchId }}'

$ifNode = $workflow.nodes | Where-Object { $_.name -eq 'If' }
if (-not $ifNode) {
  throw 'Nó "If" não encontrado.'
}
$ifCondition = $ifNode.parameters.conditions.conditions[0]
$ifCondition.leftValue = '={{$json.id}}'
$ifCondition.rightValue = ''
$ifCondition.operator = [pscustomobject]@{
  type = 'string'
  operation = 'notEmpty'
  singleValue = $true
}

$findDeleteNode = [pscustomobject]@{
  parameters = [pscustomobject]@{
    operation = 'getAll'
    calendar = [pscustomobject]@{
      __rl = $true
      value = 'c_511395219e86539d0f04480b58630bc61f45cff6defc6ba5bd329c3b633e983c@group.calendar.google.com'
      mode = 'id'
    }
    limit = 10
    options = [pscustomobject]@{
      query = '={{$node["Webhook"].json.body.dispatchId}}'
    }
  }
  type = 'n8n-nodes-base.googleCalendar'
  typeVersion = 1.3
  position = @(336, 176)
  id = 'e92bcfe0-6e64-4504-b273-57646ddb9e06'
  name = 'Find events to delete'
  credentials = [pscustomobject]@{
    googleCalendarOAuth2Api = [pscustomobject]@{
      id = 'o1SjjAy43bdrrKjr'
      name = 'Google Calendar account'
    }
  }
}

$deleteNode = [pscustomobject]@{
  parameters = [pscustomobject]@{
    operation = 'delete'
    calendar = [pscustomobject]@{
      __rl = $true
      value = 'c_511395219e86539d0f04480b58630bc61f45cff6defc6ba5bd329c3b633e983c@group.calendar.google.com'
      mode = 'id'
    }
    eventId = '={{$json.id}}'
    options = [pscustomobject]@{}
  }
  type = 'n8n-nodes-base.googleCalendar'
  typeVersion = 1.3
  position = @(592, 176)
  id = 'bd2ad09c-b4f1-4df8-a30a-bb2821175fb5'
  name = 'Delete an event'
  credentials = [pscustomobject]@{
    googleCalendarOAuth2Api = [pscustomobject]@{
      id = 'o1SjjAy43bdrrKjr'
      name = 'Google Calendar account'
    }
  }
}

$workflow.nodes = @($workflow.nodes | Where-Object { $_.name -notin @('Delete an event', 'Find events to delete') }) + @($findDeleteNode, $deleteNode)

$switchOutputs = @($workflow.connections.Switch.main)
while ($switchOutputs.Count -lt 2) {
  $switchOutputs += ,@()
}
$switchOutputs[1] = @(
  [pscustomobject]@{
    node = 'Find events to delete'
    type = 'main'
    index = 0
  }
)
$workflow.connections.Switch.main = $switchOutputs

$workflow.connections | Add-Member -NotePropertyName 'Find events to delete' -NotePropertyValue ([pscustomobject]@{
  main = @(
    @(
      [pscustomobject]@{
        node = 'Delete an event'
        type = 'main'
        index = 0
      }
    )
  )
}) -Force

if (-not $workflow.settings) {
  $workflow | Add-Member -NotePropertyName settings -NotePropertyValue ([pscustomobject]@{})
}
$workflow.settings | Add-Member -NotePropertyName timezone -NotePropertyValue 'America/Campo_Grande' -Force
$workflow.name = 'Enzo WorkFlow (corrigido)'
$workflow.active = $false

$workflow | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $DestinationPath -Encoding UTF8
