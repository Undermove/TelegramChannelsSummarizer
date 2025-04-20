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

async function findChatId(searchName: string) {
  await client.connect();
  
  // Get all dialogs
  const dialogs = await client.getDialogs();
  
  console.log(`\nSearching for chats containing "${searchName}"...`);
  const matchingDialogs = dialogs.filter(dialog => 
    dialog.name?.toLowerCase().includes(searchName.toLowerCase())
  );
  
  if (matchingDialogs.length > 0) {
    console.log('\nFound matching chats:');
    matchingDialogs.forEach((dialog) => {
      console.log(`Name: ${dialog.name}`);
      console.log(`ID: ${dialog.id}`);
      console.log(`Type: ${dialog.isUser ? 'User' : dialog.isGroup ? 'Group' : 'Channel'}`);
      console.log('---');
    });
  } else {
    console.log('\nNo matching chats found');
  }
  
  await client.disconnect();
}

// Get the search name from command line arguments
const searchName = process.argv[2];
if (!searchName) {
  console.log('Please provide a name to search for');
  console.log('Usage: npm run find-chat-id -- "name to search"');
  process.exit(1);
}

findChatId(searchName).catch(console.error); 