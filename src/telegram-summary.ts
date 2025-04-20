import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';
import { config } from 'dotenv';
import OpenAI from 'openai';

config();

const apiId = Number(process.env.TELEGRAM_API_ID!);
const apiHash = process.env.TELEGRAM_API_HASH!;
const sessionStr = process.env.TELEGRAM_STRING_SESSION!;
const daysBack = Number(process.env.DAYS || '1');

const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
  connectionRetries: 5,
});

async function summarize(text: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const resp = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { 
        role: 'system', 
        content: `You are a news editor creating a structured Telegram post in Markdown format. 
Format the summary as follows:

**📰 Основные новости**
(Only include news that can significantly impact work, technology, or society. 
Examples: major tech breakthroughs, important policy changes, significant scientific discoveries.
Exclude entertainment, memes, minor updates, advertisements, and subscription blocks.)

**🎮 Развлечения и интересное**
(Fun facts, entertainment news, interesting but not critical updates.
Exclude advertisements, promotional content, and subscription blocks.)

**📊 Другое**
(Other news that doesn't fit the above categories.
Exclude advertisements, promotional content, and subscription blocks.)

For each news item:
- Use contextual emojis based on the news topic (e.g., 🚀 for space, 💻 for tech, 🌍 for environment)
- Keep descriptions concise (1-2 sentences)
- Include source channel name in parentheses
- Focus on facts, avoid speculation
- Exclude any content that looks like advertisements, promotions, or subscription blocks
- If a message contains both news and advertisement/subscription, extract only the news part
- Keep each news item under 1000 characters to fit Telegram's message limits

Format example:
🚀 SpaceX launched new satellite (TechNews)
• Brief description of the news
🔗 https://t.me/c/channel/123

Make the summary engaging but professional. Use Markdown formatting for better readability.`
      },
      { role: 'user', content: text }
    ]
  });
  return resp.choices[0].message.content || 'No summary available';
}

async function run() {
  try {
    await client.connect();
    const channels = process.env.TG_CHANNELS!.split(',').map(c => c.trim());

    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    let aggregate = '';

    for (const chan of channels) {
      const history = await client.invoke(
        new Api.messages.GetHistory({
          peer: chan,
          limit: 100,
          offsetDate: Math.floor(since.getTime() / 1000),
        })
      ) as Api.messages.Messages;
      const texts = history.messages
        .map(m => {
          if ('message' in m && typeof m.message === 'string') {
            // Filter out subscription blocks
            const message = m.message.replace(/Подписывайтесь на.*(@\w+,?\s*)+/g, '').trim();
            if (!message) return '';
            
            const messageLink = `https://t.me/c/${chan.replace('@', '')}/${m.id}`;
            return `${message}\n🔗 ${messageLink}`;
          }
          return '';
        })
        .filter(Boolean);

      if (texts.length) {
        aggregate += `\n=== ${chan} ===\n` + texts.join("\n\n");
      }
    }

    if (!aggregate) {
      console.log('No new messages found');
      return;
    }

    const summary = await summarize(aggregate);
    await client.sendMessage(process.env.TG_TARGET_CHAT_ID!, { 
      message: summary,
      parseMode: 'markdown'
    });
    console.log('Summary sent');
  } finally {
    await client.disconnect();
    console.log('Disconnected from Telegram');
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
}); 