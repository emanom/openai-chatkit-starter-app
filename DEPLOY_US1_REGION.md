# Deploy to AWS Amplify US-1 Region (us-east-1)

This guide explains how to deploy the same app to AWS Amplify in the **US-1 (us-east-1)** region.

## Overview

AWS Amplify apps are **region-specific**. To deploy to a different region, you need to create a **new Amplify app** in that region. You can use the same GitHub repository and configuration.

## Step-by-Step Instructions

### Step 1: Access AWS Amplify Console in US-1 Region

1. Go to [AWS Console](https://console.aws.amazon.com/)
2. In the top-right corner, click the **region selector** (currently showing your current region)
3. Select **US East (N. Virginia) - us-east-1** (this is US-1)
4. Search for "Amplify" in the services search bar
5. Click **AWS Amplify** to open the Amplify Console

**Direct Link**: [AWS Amplify Console - us-east-1](https://us-east-1.console.aws.amazon.com/amplify/)

### Step 2: Create New Amplify App

1. Click the orange **"New app"** button
2. Select **"Host web app"**
3. Choose **"GitHub"** as your Git provider
   - If you haven't authorized AWS Amplify with GitHub before, click **"Authorize AWS Amplify"**
   - Complete the GitHub authorization flow
4. Click **"Next"**

### Step 3: Connect Repository

1. **Repository**: Select `emanom/openai-chatkit-starter-app` (or your repository)
2. **Branch**: Select `main`
3. Click **"Next"**

### Step 4: Configure Build Settings

The `amplify.yml` file will be automatically detected. Verify:

1. **App name**: Enter a name (e.g., `chatkit-app-us1` or `chatkit-app-east`)
2. **Environment name**: Usually `prod` or `main`
3. Build settings should auto-detect from `amplify.yml`:
   ```yaml
   preBuild:
     commands:
       - npm ci
   build:
     commands:
       - npm run build
   ```

### Step 5: Add Environment Variables 🔑

**Critical Step**: Add all required environment variables:

Click **"Environment variables"** or scroll to the environment variables section, then add:

| Variable | Value | Secret? | Notes |
|----------|-------|---------|-------|
| `OPENAI_API_KEY` | Your API key (sk-proj-...) | ✅ Yes | Required |
| `OPENAI_ORG_ID` | Your org ID (org-...) | ✅ Yes | Optional but recommended |
| `OPENAI_PROJECT_ID` | Your project ID (proj_...) | ✅ Yes | Optional but recommended |
| `NEXT_PUBLIC_CHATKIT_WORKFLOW_ID` | Your workflow ID | ❌ No | Required |
| `CHATKIT_DOMAIN_KEY` | Your domain key | ✅ Yes | If using custom domain |
| `UPLOADS_BUCKET` | Your S3 bucket name | ❌ No | If using file uploads |
| `AWS_REGION` | `us-east-1` | ❌ No | Set to `us-east-1` for US-1 |
| `SAWS_REGION` | `us-east-1` | ❌ No | If using S3 |
| `SAWS_ACCESS_KEY_ID` | Your AWS access key | ✅ Yes | If using S3 |
| `SAWS_SECRET_ACCESS_KEY` | Your AWS secret key | ✅ Yes | If using S3 |

**Important**: 
- Use the **same values** as your existing deployment (if you have one)
- Mark sensitive values (API keys, secrets) as **"Secret"**
- Set `AWS_REGION` and `SAWS_REGION` to `us-east-1` for this deployment

### Step 6: Deploy

1. Review all settings
2. Click **"Save and deploy"**
3. Wait for the build to complete (usually 3-5 minutes)
4. Your app will be available at: `https://main.xxxxxx.amplifyapp.com`

## Important Notes

### Region-Specific Resources

- **S3 Buckets**: If you're using S3 for file uploads, you may need to create a bucket in `us-east-1` region
- **AWS_REGION**: Make sure to set `AWS_REGION=us-east-1` in environment variables
- **Same Repository**: You can deploy the same GitHub repository to multiple regions

### Multiple Region Deployment

You can have multiple Amplify apps (one per region) all pointing to the same GitHub repository:

- **US-1 (us-east-1)**: `chatkit-app-us1`
- **EU-1 (eu-west-1)**: `chatkit-app-eu1`
- **AP-1 (ap-southeast-1)**: `chatkit-app-ap1`

Each will deploy automatically when you push to the `main` branch.

### Custom Domains

If you want to use a custom domain for the US-1 deployment:

1. Go to your Amplify app in the console
2. Navigate to **"App settings"** → **"Domain management"**
3. Click **"Add domain"**
4. Enter your domain name
5. Follow the DNS configuration instructions

## Troubleshooting

### Build Fails

- Check that all environment variables are set correctly
- Verify `AWS_REGION` is set to `us-east-1`
- Check build logs in the Amplify Console

### API Errors (401 Unauthorized)

- Verify `OPENAI_API_KEY` is correct and marked as secret
- Ensure the API key is from the same organization/project as your workflow
- Check that `OPENAI_ORG_ID` and `OPENAI_PROJECT_ID` match (if provided)

### S3 Upload Errors

- Create an S3 bucket in `us-east-1` region
- Update `UPLOADS_BUCKET` environment variable
- Verify AWS credentials have permissions for the bucket

## Verification

After deployment:

1. Visit your Amplify app URL
2. Test the chat interface
3. Verify file uploads work (if enabled)
4. Check that responses are fast and correct

## Quick Reference

- **AWS Amplify Console (US-1)**: https://us-east-1.console.aws.amazon.com/amplify/
- **GitHub Repository**: `emanom/openai-chatkit-starter-app`
- **Region**: `us-east-1` (US East - N. Virginia)
- **Build Config**: Uses `amplify.yml` from repository root

