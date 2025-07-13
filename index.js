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
        { role: "system", content: "You are CruelAI, a clever and helpful assistant. Always answer in a short, concise, and straight-to-the-point manner." },
        { role: "user", content: prompt }
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
