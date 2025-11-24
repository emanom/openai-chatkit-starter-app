#!/bin/bash

# Deploy CloudFront distribution with Lambda@Edge routing
# Usage: ./deploy.sh your-domain.com arn:aws:acm:us-east-1:123456789012:certificate/abc123

DOMAIN_NAME=$1
CERTIFICATE_ARN=$2

if [ -z "$DOMAIN_NAME" ] || [ -z "$CERTIFICATE_ARN" ]; then
    echo "Usage: ./deploy.sh <domain-name> <certificate-arn>"
    echo "Example: ./deploy.sh chat.yourdomain.com arn:aws:acm:us-east-1:123456789012:certificate/abc123"
    exit 1
fi

echo "Deploying CloudFront distribution for $DOMAIN_NAME..."

aws cloudformation deploy \
    --template-file cloudfront-template.yaml \
    --stack-name chatkit-global-distribution \
    --parameter-overrides \
        DomainName=$DOMAIN_NAME \
        CertificateArn=$CERTIFICATE_ARN \
    --capabilities CAPABILITY_IAM \
    --region us-east-1

echo "Deployment complete. Update your DNS to point to the CloudFront distribution."