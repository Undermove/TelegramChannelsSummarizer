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
The post MUST end with a Russian standup-style joke about the day's news.

Format the summary as follows:

**ЕЖЕНЕДЕЛЬНЫЙ ДАЙДЖЕСТ ЗА ${formattedDate}**

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
- Add a link to the original message if available in the end of the message on the new line just message without markdown
- Message links should be in this format: https://t.me/channelname/announcement_id
- Focus on facts, avoid speculation
- Make new lines between each news item
- IMPORTANT: The total message length must not exceed 4000 characters
- IMPORTANT: JOKE MUST BE IN THE MESSAGE

Format example:
🚀 SpaceX launched new satellite
Brief description of the news
https://t.me/channelname/announcement_id

**🤡 ШУТКА ДНЯ**
After all news sections, you MUST add a joke that:
- Is in Russian standup style (like Standup Club number 1)
- Is short and punchy (1-5 lines max)
- Is relevant to one of the day's news
- Has a clear punchline
- Is slightly sarcastic but not offensive
- Is the very last thing in the message

Example joke:
"Говорят, ИИ заменит всех программистов. Ну наконец-то у меня появится время на личную жизнь!"

CRITICAL: The joke is a REQUIRED part of the message. If you need to sacrifice some news to fit the joke, do it. The joke must be present and must be the last thing in the message.`
      },
      { role: 'user', content: text }
    ],
    max_tokens: 1200,
    temperature: 0.6
  });
  const summary = resp.choices[0].message.content || 'No summary available';
  console.log(`Summary length: ${summary.length} characters`);
  return summary;
}

function fixTelegramLinks(text: string): string {
  const regex = /(?:https?:\/\/)?t\.me\/c\/([A-Za-z0-9_]+\/\d+)/g;
  return text.replace(regex, 'https://t.me/$1');
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
            const messageLink = `https://t.me/${chan.replace('@', '')}/${m.id}`;
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
    if (summary.length > 4096) {
      console.log(summary);
      console.error('Summary exceeds Telegram message limit');
      return;
    }
    
    const fixedSummary = fixTelegramLinks(summary);
    await client.sendMessage(process.env.TG_TARGET_CHAT_ID!, { 
      message: fixedSummary,
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