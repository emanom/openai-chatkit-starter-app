# Global ChatKit Deployment

This infrastructure sets up CloudFront with Lambda@Edge for geographic routing between your two Amplify regions.

## Setup Steps

### 1. Get SSL Certificate
Create an ACM certificate in **us-east-1** for your domain:
```bash
aws acm request-certificate \
    --domain-name your-domain.com \
    --validation-method DNS \
    --region us-east-1
```

### 2. Deploy Infrastructure
```bash
cd infrastructure
chmod +x deploy.sh
./deploy.sh your-domain.com arn:aws:acm:us-east-1:123456789012:certificate/abc123
```

### 3. Update DNS
Point your domain to the CloudFront distribution:
- Get the CloudFront domain from the stack outputs
- Create a CNAME record: `your-domain.com` → `d123abc.cloudfront.net`

## Routing Logic

- **Australia/New Zealand**: Routes to `main.d1m1p4jeb6ymp7.amplifyapp.com` (ap-southeast-2)
- **All other countries**: Routes to `main.d2xcz3k9ugtvab.amplifyapp.com` (us-east-1)

## Testing

Test routing by spoofing country headers:
```bash
curl -H "CloudFront-Viewer-Country: AU" https://your-domain.com
curl -H "CloudFront-Viewer-Country: US" https://your-domain.com
```

## Monitoring

- CloudFront metrics in CloudWatch
- Lambda@Edge logs in CloudWatch Logs (in the region where executed)
- Real User Monitoring via CloudFront analytics