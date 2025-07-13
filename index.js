require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', () => {
  console.log(`🤖 CruelAI is online as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!cruelai')) return;

  const prompt = message.content.replace('!cruelai', '').trim();
  if (!prompt) {
    return message.reply('❗ Ask me something like `!cruelai how to bake a cake?`');
  }

  try {
    const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: "deepseek/deepseek-r1-0528:free",  // ✅ Correct model name
      messages: [
        { role: "system", content: "You are CruelAI, a clever and helpful Discord assistant." },
        { role: "user", content: prompt }
      ]
    }, {
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://github.com/yourusername/cruelai-bot",  // ✅ Optional but good
        "X-Title": "CruelAI",  // ✅ Optional, for OpenRouter ranking
        "Content-Type": "application/json"
      }
    });

    const reply = res.data.choices[0].message.content;
    message.reply(reply);

  } catch (err) {
    console.error("❌ FULL ERROR:", err.response?.data || err.message || err);
    message.reply("Error connecting to CruelAI brain 😵");
  }
});

client.login(process.env.DISCORD_TOKEN);
