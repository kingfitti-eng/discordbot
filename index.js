const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require('@discordjs/voice');

const SOUND_CHANNEL = "soundboard";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`Bot online als ${client.user.tag}`);
});

function playSound(channel, soundFile) {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false
  });

  const player = createAudioPlayer();
  const resource = createAudioResource(soundFile);

  connection.subscribe(player);
  player.play(resource);

  player.on(AudioPlayerStatus.Idle, () => {
    try { connection.destroy(); } catch {}
  });

  player.on('error', (error) => {
    console.error('Player Fehler:', error);
    try { connection.destroy(); } catch {}
  });

  setTimeout(() => {
    try { connection.destroy(); } catch {}
  }, 10000);
}

// Join Sound nach Rolle
client.on('voiceStateUpdate', (oldState, newState) => {
  const joined = !oldState.channelId && newState.channelId;
  if (!joined) return;
  if (newState.member.user.bot) return;

  const roles = newState.member.roles.cache;
  let soundFile = './sound.mp3';

  if (roles.some(r => r.name === "Ghoul Main")) {
    soundFile = './sound1.mp3';
  } else if (roles.some(r => r.name === "Profi college gay sex spieler")) {
    soundFile = './sound2.mp3';
  } else if (roles.some(r => r.name === "Schönster Mann")) {
    soundFile = './sound3.mp3';
  }

  playSound(newState.channel, soundFile);
});

// Soundboard im Textchannel
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.channel.name !== SOUND_CHANNEL) return;

    const text = message.content.toLowerCase().trim();
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) return;

    let soundFile = null;

    if (text === "bombo") soundFile = './sound4.mp3';
    else if (text === "fah") soundFile = './sound5.mp3';
    else if (text === "max") soundFile = './sound6.mp3';
    else if (text === "steve") soundFile = './sound7.mp3';
    else if (text === "tafreed") soundFile = './sound8.mp3';
    else if (text === "niga") soundFile = './sound9.mp3';
    else if (text === "geil") soundFile = './sound10.mp3';
    else if (text === "bullets") soundFile = './sound11.mp3';

    if (!soundFile) return;

    await message.delete().catch(() => {});
    playSound(voiceChannel, soundFile);
  } catch (error) {
    console.error('Message Fehler:', error);
  }
});

client.login(process.env.DISCORD_TOKEN);
