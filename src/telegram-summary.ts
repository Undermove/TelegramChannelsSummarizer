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
        content: `You are a news editor creating a structured Telegram post. 
Format the summary as follows:

📰 ОСНОВНЫЕ НОВОСТИ
(Only include news that can significantly impact work, technology, or society. 
Examples: major tech breakthroughs, important policy changes, significant scientific discoveries.
Exclude entertainment, memes, or minor updates.)

🎮 РАЗВЛЕЧЕНИЯ И ИНТЕРЕСНОЕ
(Fun facts, entertainment news, interesting but not critical updates)

📊 ДРУГОЕ
(Other news that doesn't fit the above categories)

For each news item:
- Use bullet points (•)
- Keep descriptions concise (1-2 sentences)
- Include source channel name in parentheses
- Focus on facts, avoid speculation

Make the summary engaging but professional.`
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
        .map(m => ('message' in m ? m.message : ''))
        .filter((m): m is string => typeof m === 'string');

      if (texts.length) {
        aggregate += `\n=== ${chan} ===\n` + texts.join("\n\n");
      }
    }

    if (!aggregate) {
      console.log('No new messages found');
      return;
    }

    const summary = await summarize(aggregate);
    await client.sendMessage(process.env.TG_TARGET_CHAT_ID!, { message: summary });
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