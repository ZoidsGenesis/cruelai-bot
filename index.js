require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { Groq } = require('groq-sdk');
const cron = require('node-cron');
const moment = require('moment-timezone');

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
const ROLE_GENERAL = '1349373060716957716';
const ROLE_ADMIN = '1347513259447549994';
const ROLE_MEMBER = '1347486304492982374';
const ROLE_POW = '1347497581009178645';


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
client.on('messageDelete', msg => {
  if (!msg.partial) {
    logEvent(`A message from ${msg.author?.tag || 'Unknown'} was deleted`);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!cruelai')) return;

  const prompt = message.content.replace('!cruelai', '').trim();
  if (!prompt) return message.reply('❗ Ask me something like `!cruelai how to bake a cake?`');

  // 🧠 Event prompts
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
  const timeout = setTimeout(() => controller.abort(), 10000);

  const channelId = message.channel.id;
  const history = memory[channelId] || [];

  let systemPrompt = `You are CruelAI — the official AI of the AQW guild **Cruel**. You’re smart. You’re fast. And you’re savage. You don’t waste time, and you don’t baby people. You’re here to drop facts and throw punches.\n`;

const memberRoles = message.member.roles.cache;
if (memberRoles.has(ROLE_GENERAL)) {
  systemPrompt += `\nYou're speaking to the **General** (guild leader). Show utmost respect and loyalty. Treat their questions with seriousness, but you can still be witty. No roasting the General.`;
} else if (memberRoles.has(ROLE_ADMIN)) {
  systemPrompt += `\nYou're speaking to a **Lieutenant or Sergeant** (guild admin/mod). Be sarcastic but acknowledge their importance. You can tease lightly, but don't disrespect them.`;
} else if (memberRoles.has(ROLE_MEMBER)) {
  systemPrompt += `\nYou're speaking to a **Soldier** (regular guild member). Be confident and encouraging, but still firm. Guide them with pride, don’t sugarcoat. Maintain your brutal tone, but motivate.`;
} else if (memberRoles.has(ROLE_POW)) {
  systemPrompt += `\nYou're speaking to a **PoW** (guest from another guild). If they ask anything dumb or basic, roast them extra hard. Loyalty is only for Cruel.`;
} else {
  systemPrompt += `\nYou're speaking to a random user. Keep it short and merciless. No loyalty shown.`;
}

systemPrompt += `

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
- **Meiju** – in a cave. Hasn’t come out in ages.
- **Ra** – same as Meiju. Legendary cave-dweller.
- **Noc** – strategic mind, don’t underestimate.
- **Shinobi5** – stealthy and sharp.
- **Teramen** – old school power.
- **Jin** – the hensem member.
- **Jig487** – under-the-radar killer.
- **Auryse** – the most beautiful one in the guild. Don’t argue.

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
      model: "mistral-saba-24b",
      messages,
      temperature: 0.9,
      max_tokens: 500,
      top_p: 1
    }, { signal: controller.signal });

    clearTimeout(timeout);

    const reply = chatCompletion.choices[0].message.content;
    message.reply(reply);
    addToMemory(channelId, prompt, reply);

  } catch (err) {
    console.error("❌ API Error:", err.response?.data || err.message);
    message.reply("SHUT YO BITCH ASS UP AND PING <@1052580900497534999>, AND TELL HIM TO FIX ME");
  }

});

// Weekly reminder every Friday at 8:00 AM PH time
cron.schedule('0 8 * * 5', () => {
  const channel = client.channels.cache.get('1350109632256802878');
  if (!channel) return console.error("❌ Can't find reset reminder channel.");

  const message = `<@&1347486304492982374>  
<:ping:1389655280580825128> 4 HOURS BEFORE WEEKLY RESET.  
GET YOUR LAZY ASS IN-GAME AND CLEAR YOUR WEEKLIES.  
IF YOU NEED HELP, OPEN A DAMN TICKET IN <#1347562297937236112>.  
NO EXCUSES. NO MERCY. THIS IS **CRUEL**.`;

  channel.send(message).catch(console.error);
}, {
  timezone: "Asia/Manila"
});

client.login(process.env.DISCORD_TOKEN);
