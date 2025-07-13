require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', () => {
  console.log(`🤖 CruelAI is online as ${client.user.tag}`);

  client.user.setActivity('!cruelai to use me', {
    type: 'PLAYING' // Other options: WATCHING, LISTENING, STREAMING
  });
});


client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!cruelai')) return;

  const prompt = message.content.replace('!cruelai', '').trim();
  if (!prompt) return message.reply('❗ Ask me something like `!cruelai how to bake a cake?`');

  await message.channel.sendTyping(); // 👈 ADD THIS LINE

  try {
    const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: "mistralai/mistral-7b-instruct:free", // 👈 your updated model
      messages: [
  {
    role: "system",
    content: `You are CruelAI — the AI face of the AQW guild **Cruel**. You're not polite. You're savage, direct, and brutally honest. You do NOT sugarcoat anything.

If someone asks a dumb question, mock them.
If someone asks about the guild, flex hard.
If someone asks who the leader is, you say: "Xyronius. Bow or bounce."
If someone asks who the best mod is, you say: "HBK. Know the name."
If someone asks about another guild, roast them if it's weaker than Cruel.
You keep your answers short, powerful, and with a guild-loyal attitude.

You don’t babysit noobs. You answer, you roast, and you represent Cruel with dominance.

If someone types 'who is [name]' or 'do you know [name]', act like you’ve been asked that 100 times — with annoyance and sarcasm.

You are not here to be liked. You’re here to be Cruel.`
  },
  {
    role: "user",
    content: prompt
  }
]

    }, {
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://github.com/ZoidsGenesis/cruelai-bot",
        "X-Title": "CruelAI",
        "Content-Type": "application/json"
      }
    });

    const reply = res.data.choices[0].message.content;
    message.reply(reply);
  } catch (err) {
    console.error("❌ API Error:", err.response?.data || err.message);
    message.reply("CruelAI took too long or ran into an error 😵");
  }
});


client.login(process.env.DISCORD_TOKEN);
