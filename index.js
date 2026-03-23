const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
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
      .setDescription('Fuegt einen neuen Sound hinzu')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Das Wort fuer den Sound')
          .setRequired(true)
      )
      .addAttachmentOption(option =>
        option
          .setName('sound')
          .setDescription('Die MP3 Datei')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('delete')
      .setDescription('Loescht einen Sound')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Das Wort das geloescht werden soll')
          .setRequired(true)
      )
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.APPLICATION_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );

  console.log('Slash Commands geladen');
});

async function playSound(channel, url) {
  const res = await fetch(url);
  if (!res.ok || !res.body) return;

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

  player.on('error', () => {
    try { connection.destroy(); } catch {}
  });
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (message.channel.name !== SOUND_CHANNEL) return;

  const text = message.content.toLowerCase().trim();
  const vc = message.member?.voice?.channel;
  if (!vc) return;

  const { data } = await supabase
    .from('sounds')
    .select('url')
    .eq('trigger', text)
    .maybeSingle();

  if (!data) return;

  await message.delete().catch(() => {});
  await playSound(vc, data.url);
});

client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === 'add') {
    const name = i.options.getString('name').toLowerCase().trim();
    const file = i.options.getAttachment('sound');

    if (!file) {
      await i.reply({ content: 'Keine Datei gefunden.', ephemeral: true });
      return;
    }

    await supabase.from('sounds').upsert({
      trigger: name,
      url: file.url
    });

    await i.reply({ content: 'gespeichert', ephemeral: true });
  }

  if (i.commandName === 'delete') {
    const name = i.options.getString('name').toLowerCase().trim();

    await supabase
      .from('sounds')
      .delete()
      .eq('trigger', name);

    await i.reply({ content: 'geloescht', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
