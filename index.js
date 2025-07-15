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
  let aqwWikiUrl = null;
  const aqwKeywords = ["aqw", "class", "quest", "item", "how to get", "where to find", "drop", "location", "enhancement", "blinding light of destiny", "nulgath", "dage", "legion", "void", "paragon", "archfiend", "lightcaster", "vhl", "bLoD", "bLoD", "shadow", "armor", "pet", "sword", "dagger", "staff", "cape", "helm", "artifact", "relic", "scroll", "recipe", "merge shop", "shop", "npc", "monster", "boss", "farm", "farming", "rare", "seasonal", "event", "release", "drop rate", "requirements", "how to get"];
  if (aqwKeywords.some(k => lc.includes(k))) {
    const aqwResult = await fetchAQWWikiSummary(prompt);
    aqwWikiUrl = aqwResult.url;
    if (aqwWikiUrl) {
      return message.reply(`🔗 AQW Wiki: ${aqwWikiUrl}`);
    } else {
      return message.reply("No AQW Wiki page found for your query.");
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10 sec timeout

  const channelId = message.channel.id;
  const history = memory[channelId] || [];

  // ...existing code for non-AQW prompts...

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
