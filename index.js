const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} = require('@discordjs/voice');

const { createClient } = require('@supabase/supabase-js');
const { Readable } = require('stream');

const SOUND_CHANNEL = 'soundboard';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

client.once('ready', async () => {
  console.log(`Bot online als ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('add')
      .setDescription('Add sound')
      .addStringOption(o =>
        o.setName('name').setRequired(true))
      .addAttachmentOption(o =>
        o.setName('sound').setRequired(true)),

    new SlashCommandBuilder()
      .setName('delete')
      .setDescription('Delete sound')
      .addStringOption(o =>
        o.setName('name').setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.APPLICATION_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );

  console.log("Slash Commands geladen");
});

async function playSound(channel, url) {
  const res = await fetch(url);
  const stream = Readable.fromWeb(res.body);

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 15000);

  const player = createAudioPlayer();
  const resource = createAudioResource(stream);

  connection.subscribe(player);
  player.play(resource);

  player.on(AudioPlayerStatus.Idle, () => {
    try { connection.destroy(); } catch {}
  });
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.name !== SOUND_CHANNEL) return;

  const text = message.content.toLowerCase();
  const vc = message.member?.voice?.channel;
  if (!vc) return;

  const { data } = await supabase
    .from('sounds')
    .select('url')
    .eq('trigger', text)
    .maybeSingle();

  if (!data) return;

  await message.delete().catch(() => {});
  playSound(vc, data.url);
});

client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === 'add') {
    const name = i.options.getString('name');
    const file = i.options.getAttachment('sound');

    await supabase.from('sounds').upsert({
      trigger: name,
      url: file.url
    });

    i.reply({ content: "gespeichert", ephemeral: true });
  }

  if (i.commandName === 'delete') {
    const name = i.options.getString('name');

    await supabase.from('sounds')
      .delete()
      .eq('trigger', name);

    i.reply({ content: "gelöscht", ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
