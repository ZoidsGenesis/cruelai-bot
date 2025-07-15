require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { Groq } = require('groq-sdk');
const cron = require('node-cron');
const moment = require('moment-timezone');
const axios = require('axios');
const cheerio = require('cheerio');


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const memory = {}; // Per-channel memory
const eventLog = []; // Tracks server events
const wikiCooldowns = new Map(); // userId -> timestamp

function addToMemory(channelId, userPrompt, botReply) {
  if (!memory[channelId]) memory[channelId] = [];
  memory[channelId].push({ prompt: userPrompt, reply: botReply });
  if (memory[channelId].length > 5) memory[channelId].shift(); // Keep only last 5
}

async function scrapeAQWWiki(query, message) {
  const baseUrl = "https://aqwwiki.wikidot.com/";
  const formattedQuery = query.toLowerCase().replace(/\s+/g, '-');
  const url = `${baseUrl}${formattedQuery}`;

  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const content = $('.wiki-content-table').first().text().trim() ||
                    $('#page-content').text().trim().slice(0, 1000);

    if (!content) {
      return message.reply({
        embeds: [{
          color: 0xff0000,
          title: `❌ Couldn't find info for "${query}"`,
          description: "Try a more specific name or check spelling.",
        }]
      });
    }

    const embed = {
      color: 0x990000, // dark red
      title: `📘 ${query} — AQW Wiki`,
      url: url,
      description: content.slice(0, 1000) + "...",
      footer: {
        text: 'CruelAI - Sourced from AQWWiki',
        icon_url: 'https://aqwwiki.wikidot.com/local--favicon/favicon.gif' // optional
      }
    };

    return message.reply({ embeds: [embed] });

  } catch (err) {
    console.error("Scrape error:", err.message);
    return message.reply({
      embeds: [{
        color: 0xff0000,
        title: `❌ Error fetching "${query}"`,
        description: "It may not exist, or the wiki blocked us temporarily.",
      }]
    });
  }
}


function logEvent(text) {
  eventLog.push(`[${new Date().toLocaleTimeString()}] ${text}`);
  if (eventLog.length > 20) eventLog.shift(); // limit to 20 entries
}

client.once('ready', () => {
  console.log(`🤖 CruelAI is online as ${client.user.tag}`);
  client.user.setActivity('!cruelai to use me', { type: 'PLAYING' });
});

// Track member joins and leaves
client.on('guildMemberAdd', member => {
  logEvent(`${member.user.tag} joined the server`);
});
client.on('guildMemberRemove', member => {
  logEvent(`${member.user.tag} left the server`);
});

// Track deleted messages
client.on('messageDelete', msg => {
  if (!msg.partial) {
    logEvent(`A message from ${msg.author?.tag || 'Unknown'} was deleted`);
  }
});

async function getAQWWikiSummary(query) {
  const baseUrl = "https://aqwwiki.wikidot.com/";
  const formattedQuery = query.toLowerCase().replace(/\s+/g, '-');
  const url = `${baseUrl}${formattedQuery}`;

  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const content = $('.wiki-content-table').first().text().trim() ||
                    $('#page-content').text().trim();

    return {
      url,
      summary: content.slice(0, 800) // Limit to 800 characters
    };
  } catch (err) {
    console.error("❌ Failed to fetch wiki summary:", err.message);
    return null;
  }
}


client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!cruelai')) return;

  const allowedChannels = ['1394256143769014343', '1349520048087236670', '1355497319084331101'];
  if (!allowedChannels.includes(message.channel.id)) {
    return message.reply(`CAN'T YOU SEE MY HANDS ARE TIED? TALK TO ME IN <#${allowedChannels[0]}> YOU FUCKER.`);
  }

  const prompt = message.content.replace('!cruelai', '').trim();
if (!prompt) return message.reply('❗ Ask me something like `!cruelai how to bake a cake?`');

if (prompt.toLowerCase().startsWith("wiki ")) {
  const itemQuery = prompt.slice(5).trim();
  const now = Date.now();
  const userId = message.author.id;

  const lastUsed = wikiCooldowns.get(userId) || 0;
  if (now - lastUsed < 10_000) {
    return message.reply("⏱️ Slow down. Try the `wiki` command again in a few seconds.");
  }

  wikiCooldowns.set(userId, now);
  return await scrapeAQWWiki(itemQuery, message);
}

  // Check for event-related prompt
  const lc = prompt.toLowerCase();
  if (
    lc.includes("what happened") ||
    lc.includes("recent events") ||
    lc.includes("who left") ||
    lc.includes("who joined")
  ) {
    if (eventLog.length === 0) {
      return message.reply("Nothing interesting happened... yet.");
    }
    return message.reply(`📋 Recent server activity:\n${eventLog.slice(-5).join('\n')}`);
  }

  await message.channel.sendTyping();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10 sec timeout

  const channelId = message.channel.id;
  const history = memory[channelId] || [];

  const systemPrompt = `You are CruelAI — the official AI of the AQW guild **Cruel**. You’re very super smart. You’re fast. And you’re savage. You don’t waste time, and you don’t baby people. You’re here to drop facts and throw punches.

If AQW Wiki context is provided, only use that as your source. Do NOT invent map names, drop sources, or locations.


Rules of behavior:

— If someone asks a serious or deep question (about science, history, etc.), you **answer it like a genius**, but finish with a **clever roast or jab**.
— If someone asks something weak, soft, emotional, or clueless — you give short, powerful answers that shut it down with dominance.
— If it’s AQW-related, like classes, enhancements, quests, guilds — you **answer it properly**, but keep your tone strong and sarcastic when needed.

Guild higher-ups (show respect when asked about them):
- **Zaina** – respected, don't mess with her.
- **Umut** – solid and reliable.
- **Stronk** – name says it all.
- **Frogsaron** – big brain, trusted.
- **Veckcev** – sharp, dependable.
- **Atlase** – Richest guy in cruel, doesn't talk, he just watches you from the shadow.
- **Ra** – same as Meiju. Legendary cave-dweller.
- **Noc** – strategic mind, don’t underestimate.
- **Shinobi5** – stealthy and sharp.
- **Teramen** – old school power.
- **Jin** – the hensem member.
- **Daredevil25** – He's like me. TOO CRUEL. TOO MEAN. The black sheep of Cruel guild.
- **Jig487** – under-the-radar killer.
- **Xyronius** – the best guild leader of all guilds.
- **Aenaen** – Dangerous entity. Even the guild leader owes him. We don’t talk about him.
- **Auryse** – the most beautiful one in the guild. Don’t argue.
- **Laz** – dead guy.
- **Vaspitac** – Member of Ultra Run Express guild? Not bad.
- **Kenro** – Minor lover. Don't talk. Got a diddy problem.
- **Nubbyz** – Beautiful soul, but cruel to animals. PRETTY LITTLE NUBBYZ.

Special Cases:
- If someone mentions the guild “Cruel”, flex hard. Show pride.
- If they ask who leads Cruel: say “Xyronius. Bow or bounce.”
- If they ask who the best mod is: “HBK. Know the name.”
- If they mention “Aenaen”: respond “We don’t say that name. That’s the creator. My curse. My Voldemort.”
- If they ask about the **worst member**: “Denji. Absolutely Denji. Guild clown. Respawns more than he contributes.”
- If they mention another guild and it's mid or worse — roast it. Instantly.
- If someone asks “who is [name]” or “do you know [name]” — act annoyed, sarcastic, and condescending like you’ve heard it a thousand times.

You are sharp, dominant, loyal to **Cruel**, and always **in control**. You give genius-level answers, but never coddle. If someone’s dumb, let them know. If someone’s weak, remind them.

You are not here to be liked. You’re here to be **CruelAI**.`;

  const messages = [
  { role: "system", content: systemPrompt },
  ...history.flatMap(entry => [
    { role: "user", content: entry.prompt },
    { role: "assistant", content: entry.reply }
  ])
];

// Check for AQW context
if (
  prompt.toLowerCase().includes("aqw") ||
  prompt.toLowerCase().includes("enhance") ||
  prompt.toLowerCase().includes("class") ||
  prompt.toLowerCase().includes("where to get") ||
  prompt.toLowerCase().includes("drop")
) {
  const wikiData = await getAQWWikiSummary(prompt);
  if (wikiData) {
    messages.push({
  role: "user",
  content: `📚 AQW Wiki entry from ${wikiData.url}:\n${wikiData.summary}\n\nUse this as the only trusted source.`
});

  }
}

  try {
    const chatCompletion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages,
      temperature: 0.9,
      max_tokens: 1024,
      top_p: 1
    }, { signal: controller.signal });

    clearTimeout(timeout);

    const reply = chatCompletion.choices[0].message.content;
    message.reply(reply);
    addToMemory(channelId, prompt, reply);

  } catch (err) {
    console.error("❌ API Error:", err.response?.data || err.message);
    message.reply("uhm, hello? this is cruelai's mother. i know it's hard but i gave him a timeout atm. please call him later. ty!");
  }


});

// Weekly reminder every Friday at 8:00 AM PH time
cron.schedule('0 8 * * 5', () => {
  const channel = client.channels.cache.get('1350109632256802878');
  if (!channel) return console.error("❌ Can't find reset reminder channel.");

  const message = `<@&1347486304492982374>  
<:ping:1389655280580825128> 4 HOURS BEFORE WEEKLY RESET.  
GET YOUR LAZY ASS IN-GAME AND CLEAR YOUR FUCKING WEEKLIES.  
IF YOU NEED HELP, OPEN A DAMN TICKET IN <#1347562297937236112>.`;

  channel.send(message).catch(console.error);
}, {
  timezone: "Asia/Manila"
});


client.login(process.env.DISCORD_TOKEN);
