# Deploy chatkit-minimal-test.html to AWS Amplify

## Quick Deployment Guide

Your `chatkit-minimal-test.html` page is ready to deploy! Since it's in the `public/` folder, Next.js will automatically serve it at `/chatkit-minimal-test.html` after deployment.

## Deployment Steps

### 1. Push Your Changes to GitHub
```bash
git add .
git commit -m "Add optimized chatkit minimal test page"
git push
```

### 2. Deploy via AWS Amplify Console

If you haven't set up Amplify yet:

1. **Go to AWS Amplify Console**
   - Visit: https://console.aws.amazon.com/amplify/
   - Select your region

2. **Create New App** (or use existing)
   - Click "New app" → "Host web app"
   - Choose "GitHub" as Git provider
   - Connect your repository: `fyi-internal/openai-chatkit-starter-app-1`
   - Select branch: `main`

3. **Build Settings**
   - Amplify will auto-detect `amplify.yml`
   - Verify it shows:
     - **Base directory**: (blank or `.`)
     - **Build command**: `npm run build`
     - **Output directory**: `.next`

4. **Add Environment Variables**
   Go to "Environment variables" and add:
   
   | Variable | Required | Secret? | Description |
   |----------|----------|---------|-------------|
   | `OPENAI_API_KEY` | ✅ Yes | ✅ Yes | Your OpenAI API key (sk-proj-...) |
   | `NEXT_PUBLIC_CHATKIT_WORKFLOW_ID` | ✅ Yes | ❌ No | Your ChatKit workflow ID |
   | `OPENAI_ORG_ID` | ⚠️ Optional | ✅ Yes | Your OpenAI org ID |
   | `OPENAI_PROJECT_ID` | ⚠️ Optional | ✅ Yes | Your OpenAI project ID |
   | `CHATKIT_DOMAIN_KEY` | ⚠️ Optional | ✅ Yes | Domain verification key |
   | `UPLOADS_BUCKET` | ⚠️ Optional | ❌ No | S3 bucket for file uploads |
   | `AWS_REGION` | ⚠️ Optional | ❌ No | AWS region (e.g., `us-east-1`) |
   | `SAWS_REGION` | ⚠️ Optional | ❌ No | Alternative AWS region |
   | `SAWS_ACCESS_KEY_ID` | ⚠️ Optional | ✅ Yes | AWS access key for S3 |
   | `SAWS_SECRET_ACCESS_KEY` | ⚠️ Optional | ✅ Yes | AWS secret key for S3 |

5. **Save and Deploy**
   - Click "Save and deploy"
   - Wait for build to complete (~3-5 minutes)

## Access Your Page

After deployment, your page will be available at:

```
https://your-app-id.amplifyapp.com/chatkit-minimal-test.html
```

For example:
- Main branch: `https://main.d1234567890.amplifyapp.com/chatkit-minimal-test.html`
- Production: `https://your-custom-domain.com/chatkit-minimal-test.html`

## Verify It Works

1. **Open the page** in your browser
2. **Click the chat launcher** (green button in bottom-right)
3. **Send a test message**
4. **Check browser console** for any errors (F12 → Console)

## Troubleshooting

### Page Not Found (404)
- ✅ Verify the file is in `public/chatkit-minimal-test.html`
- ✅ Rebuild in Amplify console
- ✅ Check that build completed successfully

### API Errors
- ✅ Verify `OPENAI_API_KEY` is set correctly
- ✅ Verify `NEXT_PUBLIC_CHATKIT_WORKFLOW_ID` matches your workflow
- ✅ Check CloudWatch logs in Amplify console

### Chat Not Loading
- ✅ Open browser DevTools (F12) → Console tab
- ✅ Look for CORS or API errors
- ✅ Verify API endpoints are working
- ✅ Test: `https://your-app-id.amplifyapp.com/api/create-session` (should return JSON)

## What Changed

The page now has:
- ✅ **Hidden thinking details** - Only shows "Thinking..." status
- ✅ **Optimized performance** - CSS-based hiding for faster rendering
- ✅ **Clean UI** - No internal reasoning displayed to users

## Next Steps

- [ ] Deploy and test the page
- [ ] Set up custom domain (optional)
- [ ] Configure monitoring/alerts (optional)
- [ ] Share the URL with your team!

---

**Note**: The page uses API routes (`/api/create-session` and `/api/attachments/presign`) which are already configured in your Next.js app and will work automatically after deployment.

