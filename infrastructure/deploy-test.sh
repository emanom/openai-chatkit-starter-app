#!/bin/bash

# Deploy test CloudFront distribution (no custom domain needed)

echo "Deploying test CloudFront distribution..."

aws cloudformation deploy \
    --template-file cloudfront-template-test.yaml \
    --stack-name chatkit-global-distribution-test \
    --capabilities CAPABILITY_IAM \
    --region us-east-1

echo ""
echo "Getting CloudFront URL..."
aws cloudformation describe-stacks \
    --stack-name chatkit-global-distribution-test \
    --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
    --output text

echo ""
echo "Test deployment complete! Use the URL above to test geographic routing."