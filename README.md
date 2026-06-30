---
title: WhatsApp CRM API Service
emoji: 💬
colorFrom: green
colorTo: blue
sdk: docker
pinned: false
license: mit
short_description: Free WhatsApp API & CRM Dashboard
tags:
  - whatsapp-api
  - whatsapp-crm
  - whatsapp-automation
  - ai-bot
  - bulk-sender
  - nodejs
  - openrouter
  - huggingface-spaces
---

# Free Self-Hosted WhatsApp API Service & Web CRM Dashboard 🚀

[![Open Source](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://opensource.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Docker Platform](https://img.shields.io/badge/Docker-Supported-blue.svg)](https://www.docker.com/)

A powerful, **free, self-hosted WhatsApp API Service, Web CRM Dashboard, and AI Autoreply Bot** built on top of `whatsapp-web.js` (using Puppeteer headless Chrome). It provides a full-featured WhatsApp web client, developer-friendly REST endpoints, outbound webhook forwarders, a bulk broadcast manager with Excel upload, and free AI integration via OpenRouter (Meta Llama 3, Google Gemma 2, Qwen).

Developed and licensed under the MIT License by **Sarang**.

---

## 🌟 Why Choose This Free Self-Hosted Solution?

Unlike official WhatsApp Cloud APIs, Twilio, or commercial CRMs, this self-hosted service offers several unique advantages:
- **No Message Fees**: Send unlimited text, image, and document messages without paying per-template or per-session fees.
- **Privacy First**: Your WhatsApp sessions, login credentials, and message logs remain on your own server.
- **No Code Coding for AI**: Create your own custom AI chatbot rules using a built-in UI text editor (no coding required).
- **Client-Side Bulk Sending**: Import contact lists from `.xlsx` spreadsheets directly inside your browser and execute bulk campaigns with human-like randomized delays to avoid spam blocks.

---

## 📖 Table of Contents
1. [🚀 Free Hosting on Hugging Face Spaces](#-free-hosting-on-hugging-face-spaces)
2. [💻 Local Development & Installation](#-local-development--installation)
3. [⚙️ Environment Variables Configuration](#%EF%B8%8F-environment-variables-configuration)
4. [🤖 Setting Up Free AI Autoreplies (OpenRouter)](#-setting-up-free-ai-autoreplies-openrouter)
5. [🔗 Outbound Webhook Integration (BACKEND_URL)](#-outbound-webhook-integration-backend_url)
6. [📱 Pairing Your WhatsApp Account](#-pairing-your-whatsapp-account)
7. [🛠️ Developer REST API Reference](#%EF%B8%8F-developer-rest-api-reference)
8. [📢 Excel & CSV Message Broadcasting](#-excel--csv-message-broadcasting)
9. [❓ Troubleshooting & FAQ](#-troubleshooting--faq)

---

## 🚀 Free Hosting on Hugging Face Spaces

Deploy your private WhatsApp CRM in the cloud for free using Hugging Face Spaces Docker SDK.

### Step 1: Create a Space on Hugging Face
1. Create a free account at [huggingface.co](https://huggingface.co/).
2. Navigate to **New Space** (or `huggingface.co/new-space`).
3. Enter your space settings:
   - **Space Name**: (e.g., `whatsapp-crm-service`)
   - **License**: Choose `mit`
   - **Space SDK**: Select **Docker**
   - **Template**: Select **Blank** (our custom `Dockerfile` handles dependencies automatically)
   - **Space Hardware**: Select **Free CPU** (100% free, sufficient for standard usage)
   - **Visibility**: Set to **Protected** or **Private** (recommended to keep your login sessions secure).

### Step 2: Clone and Copy the Repository
Clone the new Hugging Face Space repository to your computer (replace `sarangg/mywha` with your username and space name):

```bash
# Clone the remote repository
git clone https://huggingface.co/spaces/sarangg/mywha

# Enter the cloned space directory
cd mywha
```

Download and copy the files from this `opensource` directory directly into the root folder of your cloned repository.

### Step 3: Deploy the Code
Commit and push the code to Hugging Face:

```bash
git add .
git commit -m "Deploy open source WhatsApp API and CRM"
git push
```
*Note: When Git asks you for a password, generate a Hugging Face **Access Token** with write permissions from your [Account Settings](https://huggingface.co/settings/tokens) and use it as the password.*

---

## 💻 Local Development & Installation

If you prefer to run the service locally on a private server or development machine:

### System Prerequisites
- **Node.js**: Version 18.0.0 or higher is required.
- **Git**: Installed and configured in the terminal.
- **Google Chrome / Chromium**: Make sure a browser is installed if running on Linux (Ubuntu/Debian) to allow Puppeteer to initialize.

### Installation Steps
1. Navigate to the `opensource` folder:
   ```bash
   cd opensource
   ```
2. Install Node packages:
   ```bash
   npm install
   ```
3. Copy `.env.example` to create `.env`:
   ```bash
   cp .env.example .env
   ```
4. Edit the `.env` file and customize your passwords (`AUTH_USER`, `AUTH_PASSWORD`, and `WA_SECRET`).
5. Run the server:
   ```bash
   npm start
   ```
6. Open your browser and go to `http://localhost:3001` to access the dashboard.

---

## ⚙️ Environment Variables Configuration

To protect your login sessions, do **not** push your `.env` file containing passwords. In Hugging Face, configure these keys under the **Settings** tab -> **Variables and secrets**.

| Environment Key | Description | Example / Default | Required |
| --- | --- | --- | --- |
| `AUTH_USER` | Dashboard portal username. Protects your dashboard UI. | `admin` | **Yes** |
| `AUTH_PASSWORD` | Dashboard portal password. | `your-secure-password` | **Yes** |
| `WA_SECRET` | Secret key used for signing session cookies and validating REST API requests. | `my-secure-key-123` | **Yes** |
| `PORT` | Listening port for the application. (Hugging Face maps `7860` automatically). | `3001` | No |
| `BACKEND_URL` | Outbound webhook URL. Sends received messages to this API in real-time. | `https://mycrm.com/api/whatsapp-webhook` | No |
| `ADMIN_PHONE` | Personal phone number (with country code, e.g. `919876543210`). Bypasses AI replies. | `919876543210` | No |
| `EXTERNAL_API_URL`| Custom endpoint placeholder for databases or CRM integrations. | `https://api.mywebsite.com` | No |
| `OPENROUTER_API_KEY`| Fallback API key for AI Auto-replies. (Can also be set in Web UI settings). | `sk-or-v1-your-key` | No |
| `SYSTEM_PROMPT` | Backend fallback context / prompt instructions for your AI chatbot replies. | `"You are a customer assistant..."`| No |

---

## 🤖 Setting Up Free AI Autoreplies (OpenRouter)

This application supports AI auto-responses using OpenRouter's API, which offers **completely free premium AI models** (like Meta Llama 3, Google Gemma 2, and Qwen 2.5). You don't have to worry about API usage costs.

### How to configure:
1. Go to [openrouter.ai](https://openrouter.ai/) and sign up for a free account.
2. Navigate to **Keys** settings page (`openrouter.ai/keys`) and click **Create Key**.
3. Copy the generated key (it starts with `sk-or-v1-`).
4. Set it in your environment:
   - **On Hugging Face Spaces**: Go to your Space settings, scroll to **Secrets**, click **Add Secret**, set the name as `OPENROUTER_API_KEY`, and paste the key.
   - **Locally**: Open your `.env` file and paste the key: `OPENROUTER_API_KEY=sk-or-v1-your-key-here`.
   - **On Dashboard**: Log in to the Web client dashboard, click the **Automation** tab, check the "Enable AI Autoreply" box, paste the key, select a model, and click **Save Configuration**.

### 📝 Generating & Setting your Business AI Prompt (System Instructions)
To configure how the AI handles customer queries (e.g. pricing, product questions, shipping/payment details, tone adjustments) without any custom coding:

1. Open the [context-template.md](file:///c:/Users/Asus/Downloads/Dont%20touch%20or%20dont%20delete%20this%20file%20oke/code%20file/Nof/whatsapp-service/whatsapp-service/opensource/context-template.md) file.
2. Copy the entire prompt architect block (starting with `Act as a professional AI System Prompt Architect...`).
3. Paste the copied text into any AI chat assistant (such as **ChatGPT**, **Claude**, **Gemini**, or **DeepSeek**).
4. Answer the 5 interactive questions one-by-one regarding your business rules, catalog details, order methods, payment rules, and preferred language tone.
5. Copy the final structured System Prompt generated for you by the AI.
6. Set the System Prompt:
   - **Locally**: Open your `.env` file and add the `SYSTEM_PROMPT` variable (ensure it is enclosed in quotation marks):
     ```env
     SYSTEM_PROMPT="Your generated system prompt text goes here..."
     ```
   - **On Hugging Face Spaces**: Go to your Space **Settings** -> **Variables and secrets**, add a new **Variable** (not secret) named `SYSTEM_PROMPT`, and paste your prompt text.
   - **Dashboard View**: Note that system prompt instructions are managed directly via server environment variables (`.env` or Space variables) for security and backend consistency.

---

## 🔗 Outbound Webhook Integration (BACKEND_URL)

Integrating the service with your CRM or external backend is simple. Set the `BACKEND_URL` variable, and the Node server will automatically send a POST request with the message JSON payload whenever a message is received.

### JSON Webhook Schema (POST)
```json
{
  "from": "919876543210",
  "cnumber": "919876543210",
  "body": "Hi, what is my order status?",
  "hasMedia": false,
  "type": "chat",
  "media": null
}
```

### Media Payload Schema
If the message contains an attachment (image, pdf, document), the `"media"` object will carry the data:
```json
{
  "from": "919876543210",
  "cnumber": "919876543210",
  "body": "Transaction receipt",
  "hasMedia": true,
  "type": "image",
  "media": {
    "mimetype": "image/jpeg",
    "data": "base64EncodedDataString...",
    "filename": "receipt.jpg"
  }
}
```

---

## 📱 Pairing Your WhatsApp Account

1. Deploy the app to Hugging Face or run it locally.
2. Confirm the status badge on Hugging Face is green (**Running**). If it is building or restarting, you can check the logs in the **Container logs** console.
3. Open your Space's direct URL in your browser (which follows the format: `https://<username>-<space-name>.hf.space` or can be found by clicking the three dots menu on the top-right -> **Embed this Space**) and log in with your `AUTH_USER` and `AUTH_PASSWORD`.
4. Click the **Phone icon** (📱) on the top-right of the dashboard to show the QR Code overlay modal.
5. On your mobile phone, open WhatsApp.
   - *Recommendation*: Use **WhatsApp Business** to avoid standard spam blocks.
6. Go to Menu/Settings -> **Linked Devices** -> **Link a Device** and scan the QR code.
7. The status indicator on the dashboard will turn green and read **Connected**. Your chat lists will load automatically.

---

## 🛠️ Developer REST API Reference

Authenticate all HTTP requests using either `x-wa-secret: <WA_SECRET>` or the header `Authorization: Bearer <WA_SECRET>`.

### ✉️ Send Plain Text or Media Message
- **Endpoint**: `POST /api/send-message`
- **Body parameters**:
  - `phone` (string, required): Phone number with country code.
  - `message` (string, optional if media is provided): Plain text.
  - `imageUrl` / `mediaUrl` (string, optional): Public URL to download the file.
  - `mediaBase64` (string, optional): Base64 encoded file string.
  - `mediaMimeType` (string, optional): MIME content-type (e.g. `application/pdf`, `image/png`).
  - `filename` (string, optional): Display name for the attachment.

#### cURL Example
```bash
curl -X POST -H "Content-Type: application/json" \
  -H "x-wa-secret: my-secret-key" \
  -d '{"phone": "919048186012", "message": "Automated CRM Alert"}' \
  https://<your-space-subdomain>.hf.space/api/send-message
```

---

## 📢 Excel & CSV Message Broadcasting

The broadcast manager runs entirely client-side:
1. Open the **Broadcast** tab.
2. Upload a contact spreadsheet (`.xlsx`, `.xls`, or `.csv`) containing a header row.
   - *Alternative*: Input phone numbers manually, one per line.
3. Write a template. Substitute spreadsheet column headers in braces:
   - *Example*: `Hello {Name}, your package was shipped to {Address}!`
4. Adjust the **Delay** (in seconds). A default delay of **8-12 seconds** is recommended. The broadcaster applies $\pm 20\%$ random time offsets to emulation human behavior.
5. Click **🚀 Start Broadcast**. Keep the browser tab open while sending.

---

## ❓ Troubleshooting & FAQ

### Q1: The QR code modal is blank or fails to load.
- **Cause**: Puppeteer's Chrome process was killed due to memory limits, or network timeouts occurred.
- **Fix**: Restart the container by clicking **Restart** in the Hugging Face Space Settings menu.

### Q2: I have to scan the QR code every time the server restarts.
- **Cause**: Cloud containers have ephemeral filesystems. When the Space restarts, the local session data folder (`.ww-session`) is wiped.
- **Fix**: Upgrade your Hugging Face Space to enable **Persistent Storage** under settings to keep files persistent across restarts.

### Q3: My WhatsApp number was blocked.
- **Cause**: Sending high volumes of promotional messages to non-opt-in contacts or utilizing rapid delays (less than 5 seconds).
- **Fix**: Use WhatsApp Business, maintain high delay spacing (10+ seconds), keep the `ADMIN_PHONE` setting configured to skip loops, and message only contacts who have consented to receive messages from you.

---

## ☕ Support the Project (Buy Me a Coffee)

If this project has saved you money on official API fees, helped you build your CRM, or automated your customer support bot, feel free to support my work!

- **UPI ID (India)**: `sarangwalle@oksbi`

# whatsapp-crm-api
