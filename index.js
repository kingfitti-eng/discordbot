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

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const APPLICATION_ID = process.env.APPLICATION_ID;
const GUILD_ID = process.env.GUILD_ID;
const SOUND_CHANNEL_ID = process.env.SOUND_CHANNEL_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!DISCORD_TOKEN || !APPLICATION_ID || !GUILD_ID || !SOUND_CHANNEL_ID || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Fehlende ENV Variablen');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let isPlaying = false;

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('add')
      .setDescription('Fuegt ein neues Triggerwort mit Sound hinzu')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Wort das man im Soundboard schreibt')
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
      .setDescription('Loescht ein Triggerwort')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Wort das geloescht werden soll')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('addjoinrole')
      .setDescription('Fuegt einen Join Sound fuer eine Rolle hinzu')
      .addRoleOption(option =>
        option
          .setName('role')
          .setDescription('Die Rolle')
          .setRequired(true)
      )
      .addAttachmentOption(option =>
        option
          .setName('sound')
          .setDescription('Die MP3 Datei')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('deletejoinrole')
      .setDescription('Loescht den Join Sound einer Rolle')
      .addRoleOption(option =>
        option
          .setName('role')
          .setDescription('Die Rolle')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('list')
      .setDescription('Zeigt alle gespeicherten Sounds')
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(APPLICATION_ID, GUILD_ID),
    { body: commands }
  );

  console.log('Slash Commands registriert');
}

async function getConfigValue(key) {
  const { data, error } = await supabase
    .from('bot_config')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.error('Config lesen Fehler:', error);
    return null;
  }

  return data ? data.value : null;
}

async function setConfigValue(key, value) {
  const { error } = await supabase
    .from('bot_config')
    .upsert({
      key,
      value,
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error('Config speichern Fehler:', error);
  }
}

async function buildOverviewText() {
  const { data: sounds, error: soundsError } = await supabase
    .from('sounds')
    .select('trigger')
    .order('trigger', { ascending: true });

  const { data: joinSounds, error: joinError } = await supabase
    .from('join_sounds')
    .select('role_name')
    .order('role_name', { ascending: true });

  if (soundsError) console.error(soundsError);
  if (joinError) console.error(joinError);

  const soundLines = sounds && sounds.length
    ? sounds.map(x => `- ${x.trigger}`).join('\n')
    : 'Keine';

  const joinLines = joinSounds && joinSounds.length
    ? joinSounds.map(x => `- ${x.role_name}`).join('\n')
    : 'Keine';

  return [
    '## Soundboard Übersicht',
    '',
    '**Triggerwörter:**',
    soundLines,
    '',
    '**Join Rollen Sounds:**',
    joinLines
  ].join('\n');
}

async function updateOverviewMessage() {
  try {
    const channel = await client.channels.fetch(SOUND_CHANNEL_ID);
    if (!channel) return;

    const text = await buildOverviewText();
    const messageId = await getConfigValue('overview_message_id');

    if (messageId) {
      try {
        const oldMessage = await channel.messages.fetch(messageId);
        await oldMessage.edit(text);
        return;
      } catch (err) {
        console.log('Alte Übersicht nicht gefunden, erstelle neu');
      }
    }

    const newMessage = await channel.send(text);
    await setConfigValue('overview_message_id', newMessage.id);
  } catch (error) {
    console.error('updateOverviewMessage Fehler:', error);
  }
}

async function playRemoteSound(channel, url) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download fehlgeschlagen: ${response.status}`);
  }

  const stream = Readable.fromWeb(response.body);

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
    isPlaying = false;
  });

  player.on('error', (error) => {
    console.error('Player Fehler:', error);
    try { connection.destroy(); } catch {}
    isPlaying = false;
  });

  setTimeout(() => {
    try { connection.destroy(); } catch {}
    isPlaying = false;
  }, 30000);
}

async function playAnySound(channel, url) {
  if (isPlaying) return;
  isPlaying = true;

  try {
    await playRemoteSound(channel, url);
  } catch (error) {
    console.error('playAnySound Fehler:', error);
    isPlaying = false;
  }
}

client.once('ready', async () => {
  console.log(`Bot online als ${client.user.tag}`);
  await registerCommands();
  await updateOverviewMessage();
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const joined = !oldState.channelId && newState.channelId;
    if (!joined) return;
    if (newState.member?.user?.bot) return;

    const member = newState.member;

    const roleIds = member.roles.cache.map(role => role.id);

    const { data, error } = await supabase
      .from('join_sounds')
      .select('role_id, url')
      .in('role_id', roleIds);

    if (error) {
      console.error('Join Sound Fehler:', error);
      return;
    }

    if (!data || data.length === 0) return;

    const firstMatch = data[0];
    await playAnySound(newState.channel, firstMatch.url);
  } catch (error) {
    console.error('voiceStateUpdate Fehler:', error);
  }
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.channel.id !== SOUND_CHANNEL_ID) return;

    const text = message.content.toLowerCase().trim();
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) return;

    const { data, error } = await supabase
      .from('sounds')
      .select('url')
      .eq('trigger', text)
      .maybeSingle();

    if (error) {
      console.error('Sound Suche Fehler:', error);
      return;
    }

    if (!data) return;

    await message.delete().catch(() => {});
    await playAnySound(voiceChannel, data.url);
  } catch (error) {
    console.error('messageCreate Fehler:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'add') {
      const name = interaction.options.getString('name').toLowerCase().trim();
      const file = interaction.options.getAttachment('sound');

      if (!file || !file.name.toLowerCase().endsWith('.mp3')) {
        await interaction.reply({ content: 'Bitte eine MP3 hochladen.', ephemeral: true });
        return;
      }

      const { error } = await supabase
        .from('sounds')
        .upsert({
          trigger: name,
          url: file.url
        });

      if (error) {
        console.error(error);
        await interaction.reply({ content: 'Fehler beim Speichern.', ephemeral: true });
        return;
      }

      await updateOverviewMessage();
      await interaction.reply({ content: `Gespeichert: ${name}`, ephemeral: true });
      return;
    }

    if (interaction.commandName === 'delete') {
      const name = interaction.options.getString('name').toLowerCase().trim();

      const { error } = await supabase
        .from('sounds')
        .delete()
        .eq('trigger', name);

      if (error) {
        console.error(error);
        await interaction.reply({ content: 'Fehler beim Löschen.', ephemeral: true });
        return;
      }

      await updateOverviewMessage();
      await interaction.reply({ content: `Gelöscht: ${name}`, ephemeral: true });
      return;
    }

    if (interaction.commandName === 'addjoinrole') {
      const role = interaction.options.getRole('role');
      const file = interaction.options.getAttachment('sound');

      if (!file || !file.name.toLowerCase().endsWith('.mp3')) {
        await interaction.reply({ content: 'Bitte eine MP3 hochladen.', ephemeral: true });
        return;
      }

      const { error } = await supabase
        .from('join_sounds')
        .upsert({
          role_id: role.id,
          role_name: role.name,
          url: file.url
        });

      if (error) {
        console.error(error);
        await interaction.reply({ content: 'Fehler beim Speichern.', ephemeral: true });
        return;
      }

      await updateOverviewMessage();
      await interaction.reply({ content: `Join Sound gespeichert für Rolle: ${role.name}`, ephemeral: true });
      return;
    }

    if (interaction.commandName === 'deletejoinrole') {
      const role = interaction.options.getRole('role');

      const { error } = await supabase
        .from('join_sounds')
        .delete()
        .eq('role_id', role.id);

      if (error) {
        console.error(error);
        await interaction.reply({ content: 'Fehler beim Löschen.', ephemeral: true });
        return;
      }

      await updateOverviewMessage();
      await interaction.reply({ content: `Join Sound gelöscht für Rolle: ${role.name}`, ephemeral: true });
      return;
    }

    if (interaction.commandName === 'list') {
      const text = await buildOverviewText();
      await interaction.reply({ content: text, ephemeral: true });
    }
  } catch (error) {
    console.error('interactionCreate Fehler:', error);
    if (interaction.isRepliable()) {
      try {
        await interaction.reply({ content: 'Allgemeiner Fehler.', ephemeral: true });
      } catch {}
    }
  }
});

client.login(DISCORD_TOKEN);
