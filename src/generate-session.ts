import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { config } from 'dotenv';
import readline from 'readline';

config();

const apiId = Number(process.env.TELEGRAM_API_ID!);
const apiHash = process.env.TELEGRAM_API_HASH!;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function generateSession() {
  console.log('Generating session string...');
  
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => {
      return new Promise((resolve) => {
        rl.question('Please enter your phone number (with country code, e.g., +1234567890): ', (answer) => {
          resolve(answer);
        });
      });
    },
    password: async () => {
      return new Promise((resolve) => {
        rl.question('Please enter your password (if 2FA is enabled): ', (answer) => {
          resolve(answer);
        });
      });
    },
    phoneCode: async () => {
      return new Promise((resolve) => {
        rl.question('Please enter the code you received: ', (answer) => {
          resolve(answer);
        });
      });
    },
    onError: (err) => console.log(err),
  });

  const sessionString = client.session.save();
  console.log('\nYour session string is:');
  console.log(sessionString);
  console.log('\nSave this string in your .env file as TELEGRAM_STRING_SESSION');
  
  await client.disconnect();
  rl.close();
}

generateSession().catch(console.error); 