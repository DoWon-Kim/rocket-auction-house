$token = "a7c1c7a8-8b93-486d-ad19-28855a192109"
$envId = "59fefe7f-4930-46c6-9711-833efad04fbd"
$services = @(
    @{ id = "87443138-46b0-4158-aa86-742f1c5cb4dc"; name = "backend" },
    @{ id = "faa676ea-2122-4115-8e05-3f45bbac9f2c"; name = "frontend" }
)
foreach ($svc in $services) {
    $body = '{"query":"mutation { serviceInstanceUpdate(serviceId: \"' + $svc.id + '\", environmentId: \"' + $envId + '\", input: { numReplicas: 1 }) }"}'
    Invoke-RestMethod -Uri "https://backboard.railway.app/graphql/v2" -Method POST -Headers @{ "Authorization" = "Bearer $token"; "Content-Type" = "application/json" } -Body $body | Out-Null
    Write-Host "$($svc.name) 시작됨"
}
Write-Host "`n사이트가 켜졌습니다." -ForegroundColor Green
Start-Sleep -Seconds 2
