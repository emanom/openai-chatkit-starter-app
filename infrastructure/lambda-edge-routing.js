exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;
    
    // Get viewer country from CloudFront
    const country = headers['cloudfront-viewer-country'] 
        ? headers['cloudfront-viewer-country'][0].value 
        : 'US';
    
    // Countries that should use APAC region
    const apacCountries = ['AU', 'NZ'];
    const useApac = apacCountries.includes(country);
    
    // Route to appropriate Amplify app
    request.origin = {
        custom: {
            domainName: useApac 
                ? 'main.d1m1p4jeb6ymp7.amplifyapp.com'  // southeast-2
                : 'main.d2xcz3k9ugtvab.amplifyapp.com', // us-east-1
            port: 443,
            protocol: 'https',
            path: ''
        }
    };
    
    callback(null, request);
};