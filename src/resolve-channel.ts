import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { config } from 'dotenv';

config();

const apiId = Number(process.env.TELEGRAM_API_ID!);
const apiHash = process.env.TELEGRAM_API_HASH!;
const sessionStr = process.env.TELEGRAM_STRING_SESSION!;

const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
  connectionRetries: 5,
});

async function resolveChannel(channelName: string) {
  try {
    await client.connect();
    console.log('Connected to Telegram');

    // Try different formats
    const possibleFormats = [
      channelName,
      `@${channelName}`,
      `https://t.me/${channelName}`
    ];

    for (const format of possibleFormats) {
      try {
        console.log(`Trying to resolve: ${format}`);
        const entity = await client.getEntity(format);
        
        console.log('Found entity:', JSON.stringify(entity, null, 2));
        
        if ('id' in entity) {
          console.log(`\nChannel ID for ${channelName}: ${entity.id}`);
          
          // For channels, Telegram often uses a different format for the actual chat ID
          if (entity.className === 'Channel') {
            const chatId = `-100${entity.id}`;
            console.log(`Chat ID format (for use in TG_TARGET_CHAT_ID): ${chatId}`);
          }
          
          // Success, no need to try other formats
          break;
        }
      } catch (error: any) {
        console.log(`Could not resolve ${format}: ${error.message || 'Unknown error'}`);
      }
    }
  } finally {
    await client.disconnect();
    console.log('Disconnected from Telegram');
  }
}

// Get the channel name from command line arguments
const channelName = process.argv[2];
if (!channelName) {
  console.log('Please provide a channel name to resolve');
  console.log('Usage: npx ts-node src/resolve-channel.ts channelname');
  process.exit(1);
}

resolveChannel(channelName).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});