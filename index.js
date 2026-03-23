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
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.once('ready', () => {
  console.log(`Bot online als ${client.user.tag}`);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const joined = !oldState.channelId && newState.channelId;

  if (!joined) return;
  if (newState.member?.user?.bot) return;

  const channel = newState.channel;
  if (!channel) return;

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false
  });

  const player = createAudioPlayer();
  const resource = createAudioResource('./sound.mp3');

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