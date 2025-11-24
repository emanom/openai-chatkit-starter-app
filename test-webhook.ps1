# PowerShell script to test the Zapier webhook locally

Write-Host "Testing Zapier Webhook..." -ForegroundColor Cyan
Write-Host ""

# Test data for conversation-based support request
$testData = @{
    videoLink = "https://example.com/video.mp4"
    otherDetails = "This is a test submission from local development"
    files = @()
    chatSessionId = "test-session-123"
    threadId = "test-thread-456"
    conversationId = "test-conv-789"
    conversationLink = "http://localhost:3000/assistant-with-form"
    isConversationRequest = $true
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/submit-support-request" `
        -Method POST `
        -ContentType "application/json" `
        -Body $testData
    
    Write-Host "✅ Success!" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Check your Zapier webhook to see if the data was received." -ForegroundColor Yellow
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Make sure:" -ForegroundColor Yellow
    Write-Host "  1. Your dev server is running (npm run dev)" -ForegroundColor White
    Write-Host "  2. ZAPIER_WEBHOOK_URL is set in .env.local" -ForegroundColor White
    Write-Host "  3. You've restarted the dev server after adding the env variable" -ForegroundColor White
}

