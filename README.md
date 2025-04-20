# Telegram Channels Summarizer

A tool that automatically summarizes messages from specified Telegram channels and sends the summary to a target chat. Uses OpenAI's GPT model for summarization.

## Features

- Fetches messages from multiple Telegram channels
- Summarizes content using OpenAI's GPT model
- Sends summaries to a specified chat
- Runs automatically via GitHub Actions
- Configurable time period for message collection

## Prerequisites

- Node.js 18 or later
- Telegram account
- OpenAI API key
- GitHub account (for automated runs)

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/TelegramChannelsSummarizer.git
   cd TelegramChannelsSummarizer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Get Telegram API credentials**
   - Go to https://my.telegram.org/auth
   - Log in with your phone number
   - Click on "API development tools"
   - Create a new application
   - Note down your `api_id` and `api_hash`

4. **Generate Telegram session string**
   ```bash
   npm run generate-session
   ```
   - Enter your phone number when prompted
   - Enter the verification code sent to your Telegram
   - If you have 2FA enabled, enter your password
   - Copy the generated session string

5. **Configure environment variables**
   Create a `.env` file with:
   ```
   TELEGRAM_API_ID=your_api_id
   TELEGRAM_API_HASH=your_api_hash
   TELEGRAM_STRING_SESSION=your_session_string
   TG_CHANNELS=channel1,channel2  # Comma-separated list of channel usernames
   TG_TARGET_CHAT_ID=your_chat_id # ID of the chat to receive summaries
   OPENAI_API_KEY=your_openai_api_key
   DAYS=3  # Number of days to look back for messages
   ```

6. **Find chat ID** (if needed)
   ```bash
   npm run find-chat-id -- "chat name"
   ```
   Or use Telegram Web:
   - Open https://web.telegram.org
   - Open the target chat
   - The URL will contain the chat ID after `p=u`

## GitHub Actions Setup

1. **Fork the repository**

2. **Add repository secrets**
   Go to Settings > Secrets and variables > Actions
   Add the following secrets:
   - `TELEGRAM_API_ID`
   - `TELEGRAM_API_HASH`
   - `TELEGRAM_STRING_SESSION`
   - `TG_CHANNELS`
   - `TG_TARGET_CHAT_ID`
   - `OPENAI_API_KEY`

3. **Configure schedule**
   Edit `.github/workflows/summary.yml` to change the schedule:
   ```yaml
   schedule:
     - cron: '0 9 */3 * *'  # Runs every 3 days at 09:00 UTC
   ```

## Usage

### Manual Run
```bash
npm run build
npm start
```

### Automated Run
The workflow runs automatically based on the schedule in `.github/workflows/summary.yml`.
You can also trigger it manually from the GitHub Actions tab.

## Customization

- **Change channels**: Update `TG_CHANNELS` in `.env` or repository secrets
- **Change schedule**: Edit the cron expression in `.github/workflows/summary.yml`
- **Change summary language**: Modify the system prompt in `src/telegram-summary.ts`
- **Change model**: Update the model name in `src/telegram-summary.ts`

## Troubleshooting

1. **Session expired**
   - Run `npm run generate-session` to get a new session string
   - Update the session string in `.env` and repository secrets

2. **API limits**
   - Check OpenAI API usage
   - Check Telegram API limits

3. **Authentication issues**
   - Verify API credentials
   - Regenerate session string if needed

## License

MIT License - feel free to modify and use as needed.
