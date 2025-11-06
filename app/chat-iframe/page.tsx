export default function ChatIframePage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Chat Support</h1>
        
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <iframe
            src="/chatkit-iframe.html"
            width="100%"
            height="600"
            style={{ border: 'none' }}
            allow="clipboard-read; clipboard-write"
            title="Chat Widget"
            className="w-full"
          />
        </div>
        
        <div className="mt-6 text-sm text-slate-600">
          <p>Need help? Chat with our support team using the widget above.</p>
        </div>
      </div>
    </div>
  );
}

