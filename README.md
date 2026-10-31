# CodeMind AI

A personal, coding-focused AI workspace built with HTML, CSS, JavaScript, Node.js, and Groq.

## Features

- Clean chat workspace with coding-focused starter prompts
- Groq API calls happen on the Node.js server
- GPT-OSS 120B is the default model (configurable)
- Recent conversation history is stored in the current browser's localStorage
- Mobile-friendly layout
- No API key is included in frontend code

## Requirements

- Node.js 20 or newer
- A Groq API key, subject to Groq's account eligibility and usage limits

## Run locally

1. Clone this repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env`.
4. Put your Groq key in `.env` as `GROQ_API_KEY`.
5. Start the server:

   ```bash
   npm start
   ```

6. Open http://localhost:3000.

## Configuration

- `GROQ_API_KEY`: private server-side API key
- `GROQ_MODEL`: model ID (defaults to `openai/gpt-oss-120b`)
- `PORT`: local server port (defaults to `3000`)

## Important security notes

- Never commit `.env`, API keys, passwords, or private user data.
- The browser chat history is stored locally on the device using localStorage. It is not cloud-synced or encrypted.
- Do not deploy this starter as a public multi-user service without adding authentication, per-user data isolation, request limits, and abuse protection.
- GitHub Pages cannot run this Node.js backend. Deploy the frontend and backend to a host that supports Node.js, or keep the app running locally.

## License

BSD 3-Clause. See [LICENSE](LICENSE).
