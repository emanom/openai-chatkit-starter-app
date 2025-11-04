# Region Comparison Checklist

Since the issue only occurs in US-1 but not in the other region, compare these settings between your two Amplify deployments:

## Step 1: Compare Environment Variables

Go to both Amplify Console apps and compare **App settings** → **Environment variables**:

### Critical Variables to Check:

| Variable | US-1 Region | Other Region | Match? |
|----------|-------------|--------------|--------|
| `OPENAI_API_KEY` | ✅ Set? | ✅ Set? | ⚠️ Must match |
| `OPENAI_ORG_ID` | ✅ Set? | ✅ Set? | ⚠️ Must match |
| `OPENAI_PROJECT_ID` | ✅ Set? | ✅ Set? | ⚠️ Must match |
| `NEXT_PUBLIC_CHATKIT_WORKFLOW_ID` | ✅ Set? | ✅ Set? | ⚠️ Must match |
| `CHATKIT_DOMAIN_KEY` | ✅ Set? | ✅ Set? | ⚠️ **Critical** - Must match domain |
| `AWS_REGION` | `us-east-1` | ? | ⚠️ Should differ |

### Most Likely Issue: `CHATKIT_DOMAIN_KEY`

The `CHATKIT_DOMAIN_KEY` is **domain-specific** and might need to be configured for the US-1 domain specifically. 

**Check:**
1. In your US-1 Amplify app, what is the domain URL? (e.g., `https://main.xxxxxx.amplifyapp.com`)
2. Go to [OpenAI Platform Dashboard](https://platform.openai.com)
3. Check if the US-1 domain is registered/allowlisted
4. Verify the `CHATKIT_DOMAIN_KEY` matches the domain configuration

## Step 2: Check API Endpoint

The code uses `CHATKIT_API_BASE` (defaults to `https://api.openai.com`). Verify both regions have the same value (or both use default).

## Step 3: Check Build Logs

Compare the build logs between regions:

**US-1 Region:**
- Check for any warnings or errors during build
- Verify all environment variables are being written to `.env.production`
- Look for any region-specific build issues

**Working Region:**
- Compare the successful build logs
- Note any differences in the build process

## Step 4: Check Session Creation

In the browser console on the US-1 deployment, check:

1. **Session Creation Logs:**
   - Look for `[Session] Session created successfully`
   - Check if `client_secret` is being returned
   - Verify no errors in the session creation

2. **Network Tab:**
   - Check the `/api/create-session` request
   - Verify it returns `200 OK`
   - Check the response body has `client_secret`

3. **ChatKit Initialization:**
   - Look for `[ChatKit] Init check:` logs
   - Check if ChatKit becomes ready or stays stuck

## Step 5: Domain-Specific Issues

If `CHATKIT_DOMAIN_KEY` is set, it might be blocking the US-1 domain:

**Solution 1: Remove Domain Key (for testing)**
- Temporarily remove `CHATKIT_DOMAIN_KEY` from US-1 environment variables
- Redeploy and test
- If it works, the domain key is the issue

**Solution 2: Update Domain Key**
- Ensure the US-1 Amplify domain is registered in OpenAI dashboard
- Update `CHATKIT_DOMAIN_KEY` to match the correct domain configuration

## Step 6: Quick Fix - Copy Working Configuration

If you want to quickly fix US-1:

1. Go to your **working region** Amplify Console
2. **App settings** → **Environment variables**
3. Copy all environment variables
4. Go to **US-1 region** Amplify Console
5. **App settings** → **Environment variables**
6. Paste and update `AWS_REGION` to `us-east-1`
7. Redeploy

## Common Issues

### Issue: Session Created But ChatKit Not Initializing

**Symptoms:**
- `[Session] Session created successfully` appears
- But ChatKit shadow DOM only has 4-6 elements
- No `[data-kind]` attributes

**Possible Causes:**
1. **Domain Key Mismatch**: `CHATKIT_DOMAIN_KEY` doesn't match the domain
2. **CORS Issues**: Domain not properly configured
3. **API Key Issues**: API key might be restricted or invalid for that region
4. **Network Issues**: CDN or regional network blocking

### Issue: Different Domains, Same Domain Key

If your US-1 domain is different from the other region, you might need:
- A separate `CHATKIT_DOMAIN_KEY` for each domain, OR
- Remove `CHATKIT_DOMAIN_KEY` if domain allowlisting isn't required

## Verification Steps

After making changes:

1. **Redeploy** the US-1 app
2. **Open browser console** on the US-1 deployment
3. **Check logs:**
   - `[Session]` logs show successful session creation
   - `[ChatKit] Init check:` shows ChatKit initializing
   - `[ChatKit] Ready!` appears when ChatKit is ready
4. **Test chat** - should work like the other region

## Need Help?

If the issue persists after checking all of the above:

1. Share the browser console logs from US-1
2. Share the build logs from US-1
3. Compare the environment variables (without revealing secrets)
4. Check if there are any CORS or network errors in the Network tab

