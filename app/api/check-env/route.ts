export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY || '';
  const orgId = process.env.OPENAI_ORG_ID || '';
  const projectId = process.env.OPENAI_PROJECT_ID || '';
  const workflowId = process.env.NEXT_PUBLIC_CHATKIT_WORKFLOW_ID || '';

  return Response.json({
    apiKeyPrefix: apiKey.substring(0, 15) + '...',
    apiKeyLength: apiKey.length,
    orgIdPrefix: orgId.substring(0, 10) + '...',
    orgIdLength: orgId.length,
    projectIdPrefix: projectId.substring(0, 15) + '...',
    projectIdLength: projectId.length,
    workflowIdPrefix: workflowId.substring(0, 15) + '...',
    workflowIdLength: workflowId.length,
    allEnvVars: Object.keys(process.env).filter(k => 
      k.includes('OPENAI') || k.includes('CHATKIT')
    )
  });
}

