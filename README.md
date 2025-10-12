# ChatKit Starter Template

This repository is the simplest way to bootstrap a [ChatKit](http://openai.github.io/chatkit-js/) application. It ships with a minimal Next.js UI, the ChatKit web component, and a ready-to-use session endpoint so you can experiment with OpenAI-hosted workflows built using [Agent Builder](https://platform.openai.com/agent-builder).

## What You Get

- Next.js app with `<openai-chatkit>` web component and theming controls
- API endpoint for creating a session at [`app/api/create-session/route.ts`](app/api/create-session/route.ts)
- Quick examples for starter prompts, placeholder text, and greeting message

## Getting Started

Follow every step below to run the app locally and configure it for your preferred backend.

### 1. Install dependencies

```bash
npm install
```

### 2. Create your environment file

Copy the example file and fill in the required values:

```bash
cp .env.example .env.local
```

### 3. Configure ChatKit credentials

Update `.env.local` with the variables that match your setup.

- `OPENAI_API_KEY` — API key created **within the same org & project as your Agent Builder**
- `OPENAI_ORG_ID` — your org id (recommended for clarity)
- `OPENAI_PROJECT_ID` — your project id (required for project-scoped keys)
- `NEXT_PUBLIC_CHATKIT_WORKFLOW_ID` — the workflow you created in [Agent Builder](https://platform.openai.com/agent-builder)
- (optional) `CHATKIT_API_BASE` - customizable base URL for the ChatKit API endpoint
- (production) `CHATKIT_DOMAIN_KEY` — domain allowlist key from the OpenAI dashboard

### 4. Run the app

```bash
npm run dev
```

Visit `http://localhost:3000` and start chatting. Use the prompts on the start screen to verify your workflow connection, then customize the UI or prompt list in [`lib/config.ts`](lib/config.ts) and [`components/ChatKitPanel.tsx`](components/ChatKitPanel.tsx).

### 5. Build for production (optional)

```bash
npm run build
npm start
```

## Deploy to AWS 🚀

Ready to deploy? We've got you covered!

- 🚀 **[Quick Start Guide](QUICK_START.md)** - Deploy in 10 minutes (recommended)
- 📖 **[Full Deployment Guide](AWS_DEPLOYMENT_GUIDE.md)** - Detailed AWS Amplify setup
- ✅ **[Deployment Checklist](DEPLOYMENT_CHECKLIST.md)** - Step-by-step checklist

### Easy Setup (Windows)

Run the PowerShell setup script to create your `.env.local` file:

```powershell
.\setup-env.ps1
```

## Customization Tips

- Adjust starter prompts, greeting text, and placeholder copy in [`lib/config.ts`](lib/config.ts).
- Update the theme defaults or event handlers inside [`components/.tsx`](components/ChatKitPanel.tsx) to integrate with your product analytics or storage.

## References

- [ChatKit JavaScript Library](http://openai.github.io/chatkit-js/)
- [Advanced Self-Hosting Examples](https://github.com/openai/openai-chatkit-advanced-samples)
- [AWS Amplify Documentation](https://docs.amplify.aws/)

### Production notes

- In Amplify, add env vars: `OPENAI_API_KEY`, `OPENAI_ORG_ID`, `OPENAI_PROJECT_ID`, `NEXT_PUBLIC_CHATKIT_WORKFLOW_ID`, `CHATKIT_DOMAIN_KEY`.
- This repo writes env vars to `.env.production` in `amplify.yml` so Next.js can access them at build/runtime.
- Get the domain key from the OpenAI domain allowlist page and set it as `CHATKIT_DOMAIN_KEY`. The API layer forwards it via `ChatKit-Domain-Key` header.
