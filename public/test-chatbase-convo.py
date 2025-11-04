import requests

url = "https://www.chatbase.co/api/v1/get-conversations"

querystring = {"chatbotId":"pHo9w64NCxL9BwyyTbpXY","filteredSources":"Widget or Iframe","startDate":"2025-11-04","endDate":"2025-11-04"}

headers = {"Authorization": "Bearer f81af249-a72a-4f81-a35e-5ff238d7f18f"}

response = requests.get(url, headers=headers, params=querystring)

print(response.json())