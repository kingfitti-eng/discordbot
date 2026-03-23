const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require('@discordjs/voice');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

client.once('ready', () => {
  console.log(`Bot online als ${client.user.tag}`);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const joined = !oldState.channelId && newState.channelId;

  if (!joined) return;
  if (newState.member.user.bot) return;

  const member = newState.member;
  const roles = member.roles.cache;

  let soundFile = './sound.mp3'; // default

  // 👉 HIER deine Rollen + Sounds
  if (roles.some(r => r.name === "Ghoul Main")) {
    soundFile = './sound1.mp3';
  }
  else if (roles.some(r => r.name === "Profi college gay sex spieler")) {
    soundFile = './sound2.mp3';
  }
  else if (roles.some(r => r.name === "Schönster Mann")) {
    soundFile = './sound3.mp3';
  }

  const channel = newState.channel;

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
    connection.destroy();
  });

  setTimeout(() => {
    try { connection.destroy(); } catch {}
  }, 10000);
});

client.login(process.env.DISCORD_TOKEN);
