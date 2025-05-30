import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';
import { config } from 'dotenv';
import OpenAI from 'openai';

config();

const apiId = Number(process.env.TELEGRAM_API_ID!);
const apiHash = process.env.TELEGRAM_API_HASH!;
const sessionStr = process.env.TELEGRAM_STRING_SESSION!;

// Проверка корректности параметра DAYS
let daysBack = Number(process.env.DAYS || '7');
if (isNaN(daysBack) || daysBack <= 0) {
  console.error(`Invalid DAYS parameter: ${process.env.DAYS}. Using default value of 7 days.`);
  daysBack = 7;
}

console.log(`Looking for messages from the last ${daysBack} days`);

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
  
  // First, analyze the text to find frequently mentioned topics
  const topicsResp = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { 
        role: 'system', 
        content: `Analyze the provided text and identify the most frequently mentioned topics or themes. 
Focus especially on AI-related topics that would be relevant to engineers and developers.
Return a JSON array of the top 3-5 most mentioned topics in order of frequency.
Format: ["topic1", "topic2", "topic3"]`
      },
      { role: 'user', content: text }
    ],
    max_tokens: 300,
    temperature: 0.3,
    response_format: { type: "json_object" }
  });
  
  let topMentionedTopics: string[] = [];
  try {
    const topicsContent = topicsResp.choices[0].message.content || '{"topics":[]}';
    const topicsJson = JSON.parse(topicsContent);
    topMentionedTopics = topicsJson.topics || [];
    console.log(`Top mentioned topics: ${topMentionedTopics.join(', ')}`);
  } catch (e) {
    console.error('Failed to parse top topics:', e);
  }
  
  const topicsContext = topMentionedTopics.length > 0 
    ? `The most frequently mentioned topics in the news are: ${topMentionedTopics.join(', ')}. Pay special attention to these topics.` 
    : '';
  
  const resp = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { 
        role: 'system', 
        content: `You are a news editor creating a structured Telegram post in Markdown format, with a special focus on AI developments relevant to engineers and developers.

${topicsContext}

Format the summary as follows:

**ЕЖЕНЕДЕЛЬНЫЙ ДАЙДЖЕСТ ЗА ${formattedDate}**

**🤖 AI для инженеров**
(HIGHEST PRIORITY SECTION: Include hardcore AI news that would be valuable for engineers and developers.
Examples: new AI models, significant technical breakthroughs, new APIs or tools, performance improvements, 
engineering best practices, technical deep dives, research papers with practical applications.
Be specific about technical details when available.)

**📰 Основные новости**
(Include other news that can significantly impact work, technology, or society. 
Examples: major tech breakthroughs, important policy changes, significant scientific discoveries.
Exclude entertainment, memes, or minor updates.)

**🎮 Развлечения и интересное**
(Fun facts, entertainment news, interesting but not critical updates)

**📊 Другое**
(Other news that doesn't fit the above categories)

For each news item:
- Use contextual emojis based on the news topic (e.g., 🧠 for AI, 🚀 for space, 💻 for tech, 🌍 for environment)
- Keep descriptions concise (1-2 sentences)
- Add a link to the original message if available in the end of the message on the new line just message without markdown
- Message links should be in this format: https://t.me/channelname/announcement_id
- Focus on facts, avoid speculation
- Make new lines between each news item
- IMPORTANT: The total message length must not exceed 4000 characters
- If a topic is mentioned frequently across multiple sources, prioritize it and note its significance

Format example:
🧠 New breakthrough in transformer architecture improves inference speed by 40%
Technical details about the innovation and how engineers can implement it
https://t.me/channelname/announcement_id`
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

async function generateJoke(summary: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const resp = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { 
        role: 'system', 
        content: `You are a Russian standup comedian with a tech background. Create a funny joke based on the news summary provided.
        
Your joke MUST:
- Be in Russian standup style (like Standup Club number 1)
- Be short and punchy (1-5 lines max)
- Preferably be related to AI, tech, or engineering topics from the summary
- Have a clear punchline
- Be slightly sarcastic but not offensive
- Include technical humor that engineers would appreciate

Format your response as:

**🤡 ШУТКА НЕДЕЛИ**

"Your joke here"

Example:
**🤡 ШУТКА НЕДЕЛИ**

"Говорят, новые модели ИИ теперь понимают контекст лучше людей. Отлично! Теперь хоть кто-то поймет, что я имел в виду в своем коде, написанном в 3 часа ночи!"
`
      },
      { role: 'user', content: summary }
    ],
    max_tokens: 300,
    temperature: 0.8
  });
  
  const joke = resp.choices[0].message.content || 'No joke available';
  console.log(`Joke length: ${joke.length} characters`);
  return joke;
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
        })
      ) as Api.messages.Messages;
      
      // Получаем timestamp для фильтрации (в секундах)
      const sinceTimestamp = Math.floor(since.getTime() / 1000);
      console.log(`Channel: ${chan}`);
      console.log(`Filtering messages since: ${new Date(sinceTimestamp * 1000).toISOString()} (${sinceTimestamp})`);
      console.log(`Total messages received: ${history.messages.length}`);
      
      // Фильтруем сообщения по дате и затем преобразуем их
      const filteredMessages = history.messages.filter(m => {
        // Проверяем, что сообщение имеет дату и она новее, чем указанная дата
        if ('date' in m && typeof m.date === 'number') {
          const messageDate = m.date;
          const isRecent = messageDate >= sinceTimestamp;
          
          if (!isRecent) {
            console.log(`Skipping old message from ${new Date(messageDate * 1000).toISOString()} (${messageDate})`);
          }
          
          return isRecent;
        }
        return false;
      });
      
      console.log(`Messages after date filtering: ${filteredMessages.length}`);
      
      const texts = filteredMessages
        .map(m => {
          if ('message' in m && typeof m.message === 'string') {
            const messageLink = `https://t.me/${chan.replace('@', '')}/${m.id}`;
            const messageDate = new Date(m.date * 1000).toISOString().split('T')[0];
            const previewText = m.message.split('\n')[0].slice(0, 50) + (m.message.length > 50 ? '...' : '');
            
            // Count message reactions if available to help identify popular topics
            let reactionCount = 0;
            if ('reactions' in m && m.reactions && 'results' in m.reactions) {
              reactionCount = m.reactions.results.reduce((sum: number, reaction: any) => {
                return sum + (reaction.count || 0);
              }, 0);
            }
            
            // Count views if available
            const views = 'views' in m ? m.views : 0;
            
            // Add metadata to help with topic analysis
            const metadata = `CHANNEL: ${chan} | DATE: ${messageDate} | VIEWS: ${views || 'N/A'} | REACTIONS: ${reactionCount || 'N/A'}`;
            
            return `[${previewText}](${messageLink}) (${messageDate})\n${metadata}\n${m.message}`;
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

    // Generate and send the summary
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
    
    // Generate and send the joke as a separate message
    const joke = await generateJoke(summary);
    if (joke.length > 4096) {
      console.log(joke);
      console.error('Joke exceeds Telegram message limit');
      return;
    }
    
    const fixedJoke = fixTelegramLinks(joke);
    await client.sendMessage(process.env.TG_TARGET_CHAT_ID!, { 
      message: fixedJoke,
      parseMode: 'markdown'
    });
    console.log('Joke sent');
  } finally {
    await client.disconnect();
    console.log('Disconnected from Telegram');
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
}); 