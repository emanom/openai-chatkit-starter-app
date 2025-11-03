# AWS Amplify Environment Variables

## Required Environment Variables

To fix the `401 Unauthorized` error when ChatKit tries to connect, ensure these environment variables are set in your AWS Amplify Console:

### OpenAI API Credentials
- `OPENAI_API_KEY` - Your OpenAI API key (must be from the same org/project as your workflow)
- `OPENAI_ORG_ID` - Your OpenAI organization ID
- `OPENAI_PROJECT_ID` - Your OpenAI project ID (required for project-scoped keys)

### ChatKit Configuration
- `NEXT_PUBLIC_CHATKIT_WORKFLOW_ID` - Your workflow ID (starts with `wf_...`)
- `CHATKIT_DOMAIN_KEY` - Domain allowlist key from OpenAI dashboard (for production)

### AWS Configuration (if using file uploads)
- `UPLOADS_BUCKET` - S3 bucket name for file uploads
- `AWS_REGION` - AWS region (e.g., `us-east-1`)
- `SAWS_REGION` - Secondary AWS region (if needed)
- `SAWS_ACCESS_KEY_ID` - AWS access key ID
- `SAWS_SECRET_ACCESS_KEY` - AWS secret access key

## How to Set Environment Variables in Amplify

1. Go to your AWS Amplify Console
2. Select your app
3. Go to **App settings** → **Environment variables**
4. Add each variable listed above
5. Click **Save**
6. The app will automatically rebuild with the new variables

## Troubleshooting 401 Errors

If you see `401 Unauthorized` errors:
1. Verify `OPENAI_API_KEY` is set correctly
2. Ensure the API key is from the same organization/project as your workflow
3. Check that `OPENAI_PROJECT_ID` matches your workflow's project
4. Verify `NEXT_PUBLIC_CHATKIT_WORKFLOW_ID` is correct (starts with `wf_...`)
5. For production, ensure `CHATKIT_DOMAIN_KEY` is set if using domain allowlisting

## Note

The `amplify.yml` build script automatically writes these variables to `.env.production` during the build, so you don't need to set them manually in the build configuration.

