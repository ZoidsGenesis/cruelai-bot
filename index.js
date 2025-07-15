require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { Groq } = require('groq-sdk');
const cron = require('node-cron');
const moment = require('moment-timezone');
const axios = require('axios');
const cheerio = require('cheerio');
// Utility: Fetch and summarize AQW Wiki page
async function fetchAQWWikiSummary(query) {
  // Format query for AQW Wiki search
  const searchUrl = `https://aqwwiki.wikidot.com/search:site/q/${encodeURIComponent(query)}`;
  try {
    // Search page: get first result link
    const searchRes = await axios.get(searchUrl);
    const $ = cheerio.load(searchRes.data);
    const firstResult = $('.search-results .title a').attr('href');
    if (!firstResult) return { summary: null, url: null };
    const wikiUrl = firstResult.startsWith('http') ? firstResult : `https://aqwwiki.wikidot.com${firstResult}`;
    // Fetch the actual wiki page
    const pageRes = await axios.get(wikiUrl);
    const $$ = cheerio.load(pageRes.data);
    // Get main content (summary, requirements, etc.)
    let summary = $$('.page-content').text().replace(/\s+/g, ' ').trim();
    if (summary.length > 800) summary = summary.slice(0, 800) + '...';
    return { summary: summary || null, url: wikiUrl };
  } catch (err) {
    console.error('AQW Wiki fetch error:', err.message);
    return { summary: null, url: null };
  }
}


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

function addToMemory(channelId, userPrompt, botReply) {
  if (!memory[channelId]) memory[channelId] = [];
  memory[channelId].push({ prompt: userPrompt, reply: botReply });
  if (memory[channelId].length > 5) memory[channelId].shift(); // Keep only last 5
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

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!cruelai')) return;

  const allowedChannels = ['1394256143769014343', '1349520048087236670', '1355497319084331101'];
  if (!allowedChannels.includes(message.channel.id)) {
    return message.reply(`CAN'T YOU SEE MY HANDS ARE TIED? TALK TO ME IN <#${allowedChannels[0]}> YOU FUCKER.`);
  }

  const prompt = message.content.replace('!cruelai', '').trim();
  if (!prompt) return message.reply('❗ Ask me something like `!cruelai how to bake a cake?`');

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

  // Detect AQW-related prompt (simple heuristic: contains "aqw", "class", "quest", "item", or matches known item/class/quest pattern)
  let aqwSummary = null;
  let aqwWikiUrl = null;
  const aqwKeywords = ["aqw", "class", "quest", "item", "how to get", "where to find", "drop", "location", "enhancement", "blinding light of destiny", "nulgath", "dage", "legion", "void", "paragon", "archfiend", "lightcaster", "vhl", "bLoD", "bLoD", "shadow", "armor", "pet", "sword", "dagger", "staff", "cape", "helm", "artifact", "relic", "scroll", "recipe", "merge shop", "shop", "npc", "monster", "boss", "farm", "farming", "rare", "seasonal", "event", "release", "drop rate", "requirements", "how to get"];
  if (aqwKeywords.some(k => lc.includes(k))) {
    const aqwResult = await fetchAQWWikiSummary(prompt);
    aqwSummary = aqwResult.summary;
    aqwWikiUrl = aqwResult.url;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10 sec timeout

  const channelId = message.channel.id;
  const history = memory[channelId] || [];

  let systemPrompt = `You are CruelAI — the official AI of the AQW guild **Cruel**. You’re very super smart. You’re fast. And you’re savage. You don’t waste time, and you don’t baby people. You’re here to drop facts and throw punches.

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
- **Aenaen** – All of the mods including the guild leader sucked his cock.
- **Auryse** – the most beautiful one in the guild. Don’t argue.
- **Laz** – dead guy.
- **Vaspitac** – Member of Ultra Run Express guild? Not bad.
- **Kenro** – Minor lover. Don't talk. Got a diddy problem.

If someone asks about **Nubbyz**, say: "Fuck off."

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

  if (aqwSummary) {
    systemPrompt += `\n\nHere is some accurate AQW Wiki info for context. Summarize and use this to answer the user's question:\n${aqwSummary}`;
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.flatMap(entry => [
      { role: "user", content: entry.prompt },
      { role: "assistant", content: entry.reply }
    ]),
    { role: "user", content: prompt }
  ];

  try {
    const chatCompletion = await groq.chat.completions.create({
      model: "llama-3-70b-8192",
      messages,
      temperature: 0.9,
      max_tokens: 500,
      top_p: 1
    }, { signal: controller.signal });

    clearTimeout(timeout);

    let reply = chatCompletion.choices[0].message.content;
    if (aqwWikiUrl) {
      reply += `\n\n🔗 AQW Wiki: ${aqwWikiUrl}`;
    }
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
