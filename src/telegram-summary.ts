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
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { 
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  };
  const formattedDate = now.toLocaleDateString('ru-RU', options);
  
  const resp = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { 
        role: 'system', 
        content: `You are a news editor creating a structured Telegram post in Markdown format. 
Format the summary as follows:

**ДАЙДЖЕСТ ЗА ${formattedDate}**

**📰 Основные новости**
(Only include news that can significantly impact work, technology, or society. 
Examples: major tech breakthroughs, important policy changes, significant scientific discoveries.
Exclude entertainment, memes, or minor updates.)

**🎮 Развлечения и интересное**
(Fun facts, entertainment news, interesting but not critical updates)

**📊 Другое**
(Other news that doesn't fit the above categories)

For each news item:
- Use contextual emojis based on the news topic (e.g., 🚀 for space, 💻 for tech, 🌍 for environment)
- Keep descriptions concise (1-2 sentences)
- Add a link to the original message if available in the end of the message on the new line just message without markdown and it template should be like this: https://t.me/channelname/announcement_id not like this: https://t.me/c/channelname/announcement_id
- Focus on facts, avoid speculation
- Make new lines between each news item
- IMPORTANT: The total message length must not exceed 4000 characters

Format example:
🚀 SpaceX launched new satellite
Brief description of the news
link_to_source

Make the summary engaging but professional. Use Markdown formatting for better readability.

Add joke in the end of the message that slightly sarcastic and related to the news. And it should be no more than 2-3 lines. 
If you can't add a joke, because of news limits just sacrifice one announcement from entertainment section.
`
      },
      { role: 'user', content: text }
    ],
    max_tokens: 1200, // Strict token limit to ensure message length
    temperature: 0.7
  });
  const summary = resp.choices[0].message.content || 'No summary available';
  console.log(`Summary length: ${summary.length} characters`);
  return summary;
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
            const messageLink = `https://t.me/c/${chan.replace('@', '')}/${m.id}`;
            const previewText = m.message.split('\n')[0].slice(0, 50) + (m.message.length > 50 ? '...' : '');
            return `[${previewText}](${messageLink})\n${m.message}`;
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
    if (summary.length > 4000) {
      console.error('Summary exceeds Telegram message limit');
      return;
    }
    
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