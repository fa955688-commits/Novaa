const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, ApplicationCommandOptionType, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');

// Express App to bypass Render Port Binding Error
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Novaa Anti-Nuke Engine Operational.'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

// MongoDB Schema Setup with Punishment Option
const configSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    quarantineRoleId: { type: String, default: null },
    antinukeEnabled: { type: Boolean, default: false },
    antispamEnabled: { type: Boolean, default: false },
    antilinkEnabled: { type: Boolean, default: false },
    punishment: { type: String, default: 'ban' } // Default punishment is ban
});
const Config = mongoose.model('Config', configSchema);

const prefix = 'n!';

// Anti-Spam Cache
const messageCache = new Map();

// Helper Function to Execute Punishment
async function executePunishment(guild, member, db) {
    if (!member) return;
    const method = db.punishment || 'ban';
    const reason = 'Novaa Anti-Nuke: Unauthorized Server Modification Detected.';

    if (method === 'ban') {
        await member.ban({ reason }).catch(() => null);
    } else if (method === 'kick') {
        await member.kick(reason).catch(() => null);
    } else if (method === 'quarantine' && db.quarantineRoleId) {
        // Strip all current roles and add quarantine role
        await member.roles.set([db.quarantineRoleId], reason).catch(() => null);
    }
}

// Updated Slash Commands Registry (Strictly under Discord's 100 limit)
const safeSlashCommands = [
    { name: 'help', description: 'View Novaa’s Advanced Command Grid' },
    { name: 'ping', description: 'Check Novaa Matrix Latency Network' },
    { 
        name: 'setquarantine', 
        description: 'Link the quarantine target role', 
        options: [{ name: 'role', description: 'Select quarantine role', type: ApplicationCommandOptionType.Role, required: true }] 
    },
    { 
        name: 'antinuke', 
        description: 'Toggle server security matrix', 
        options: [{ name: 'status', description: 'Enable or disable antinuke', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: 'Enable', value: 'enable' }, { name: 'Disable', value: 'disable' }] }] 
    },
    {
        name: 'setpunishment',
        description: 'Set Anti-Nuke action (Ban, Kick, or Quarantine)',
        options: [{
            name: 'type',
            description: 'Choose the punishment type',
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: [
                { name: 'Direct Ban', value: 'ban' },
                { name: 'Direct Kick', value: 'kick' },
                { name: 'Quarantine Role', value: 'quarantine' }
            ]
        }]
    }
];

client.once('ready', async () => {
    console.log(`Novaa Engine Core Active. Logged in as ${client.user.tag}`);
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        console.log('Synchronizing safe core application commands...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: safeSlashCommands });
        console.log('Successfully stabilized and reloaded application commands.');
    } catch (err) { console.error(err); }
});

// ==================== ANTI-NUKE CORE WITH DYNAMIC PUNISHMENT ====================

// 1. Channel Delete Trigger
client.on('channelDelete', async (channel) => {
    const db = await Config.findOne({ guildId: channel.guild.id });
    if (!db || !db.antinukeEnabled) return;

    const auditLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: 12 });
    const logEntry = auditLogs.entries.first();
    if (!logEntry) return;

    const { executor } = logEntry;
    if (executor.id === client.user.id || executor.id === channel.guild.ownerId) return;

    const member = await channel.guild.members.fetch(executor.id).catch(() => null);
    if (member) {
        await executePunishment(channel.guild, member, db);
        
        // Restore channel backup
        await channel.guild.channels.create({
            name: channel.name,
            type: channel.type,
            parent: channel.parentId,
            permissionOverwrites: channel.permissionOverwrites.cache.map(p => p)
        }).catch(() => null);
    }
});

// 2. Role Delete Trigger
client.on('roleDelete', async (role) => {
    const db = await Config.findOne({ guildId: role.guild.id });
    if (!db || !db.antinukeEnabled) return;

    const auditLogs = await role.guild.fetchAuditLogs({ limit: 1, type: 32 });
    const logEntry = auditLogs.entries.first();
    if (!logEntry) return;

    const { executor } = logEntry;
    if (executor.id === client.user.id || executor.id === role.guild.ownerId) return;

    const member = await role.guild.members.fetch(executor.id).catch(() => null);
    if (member) {
        await executePunishment(role.guild, member, db);
    }
});

// ==================== CHAT GUARD AND PREFIX COMMANDS ====================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const db = await Config.findOne({ guildId: message.guild.id });
    if (!db) return;

    // Anti-Link Core Action
    if (db.antilinkEnabled && (message.content.includes('discord.gg/') || message.content.includes('http://') || message.content.includes('https://'))) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await message.delete().catch(() => null);
            return message.channel.send(`⚠️ **${message.author.username}**, এই সার্ভারে লিংক শেয়ার করা নিষেধ!`).then(m => setTimeout(() => m.delete(), 4000));
        }
    }

    // Anti-Spam Core Action
    if (db.antispamEnabled && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const now = Date.now();
        const userData = messageCache.get(message.author.id) || { timestamps: [], content: '' };
        
        if (userData.content === message.content) userData.timestamps.push(now);
        else { userData.timestamps = [now]; userData.content = message.content; }
        
        userData.timestamps = userData.timestamps.filter(ts => now - ts < 5000);
        messageCache.set(message.author.id, userData);

        if (userData.timestamps.length >= 4) {
            await message.delete().catch(() => null);
            if (db.quarantineRoleId) {
                await message.member.roles.add(db.quarantineRoleId).catch(() => null);
                return message.channel.send(`🚨 **${message.author.username}** কে স্প্যাম করার জন্য কোয়ারেন্টাইন করা হলো!`);
            }
        }
    }

    // Prefix Command Check
    if (!message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'setpunishment') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Admin required.');
        const type = args[0]?.toLowerCase();
        
        if (!['ban', 'kick', 'quarantine'].includes(type)) {
            return message.reply('❌ **ভুল মেথড!** ব্যবহার করুন: `n!setpunishment ban/kick/quarantine`');
        }

        if (type === 'quarantine' && !db.quarantineRoleId) {
            return message.reply('⚠️ पहले `n!setquarantine @role` সেট করুন!');
        }

        db.punishment = type;
        await db.save();
        return message.reply(`⚔️ **Novaa Config:** অ্যান্টি-নিউক পানিশমেন্ট সফলভাবে **${type.toUpperCase()}** সেট করা হয়েছে।`);
    }

    if (command === 'setquarantine') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Admin required.');
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ `n!setquarantine @RoleName`');
        await Config.findOneAndUpdate({ guildId: message.guild.id }, { quarantineRoleId: role.id }, { upsert: true });
        return message.reply(`✅ **Novaa Security:** কোয়ারেন্টাইন লক রোল সেভড: **${role.name}**.`);
    }

    if (command === 'antinuke') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Admin required.');
        const action = args[0]?.toLowerCase();
        if (action === 'enable') {
            db.antinukeEnabled = true; await db.save();
            return message.reply(`🛡️ **Novaa Anti-Nuke:** সিকিউরিটি গ্রিড **ACTIVE**। পানিশমেন্ট মোড: **${db.punishment.toUpperCase()}**।`);
        } else if (action === 'disable') {
            db.antinukeEnabled = false; await db.save();
            return message.reply('🛑 **Novaa Anti-Nuke:** অ্যান্টি-নিউক কোর নিষ্ক্রিয়।');
        }
    }

    if (command === 'antispam') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Admin required.');
        db.antispamEnabled = !db.antispamEnabled; await db.save();
        return message.reply(`🔒 **Anti-Spam:** এখন এটি **${db.antispamEnabled ? 'चालू (ENABLED)' : 'বন্ধ (DISABLED)'}**।`);
    }

    if (command === 'antilink') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Admin required.');
        db.antilinkEnabled = !db.antilinkEnabled; await db.save();
        return message.reply(`🔒 **Anti-Link:** এখন এটি **${db.antilinkEnabled ? 'চালু (ENABLED)' : 'বন্ধ (DISABLED)'}**।`);
    }

    if (command === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('🌌 Novaa Advanced Security Panel')
            .setColor('#2f3136')
            .addFields(
                { name: '🛡️ Anti-Nuke Settings', value: '`/setquarantine` - লক রোল সেট\n`/setpunishment` - শাস্তি নির্ধারণ (স্ল্যাশ কমান্ড)\n`n!antinuke enable/disable` - অ্যান্টি-নিউক অন/অফ' },
                { name: '🔒 Chat Guard', value: '`n!antispam` - স্প্যাম গার্ড\n`n!antilink` - লিংক প্রটেকশন' }
            );
        return message.reply({ embeds: [helpEmbed] });
    }
});

// ==================== SLASH ENGINE PROCESSING ====================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guildId, member } = interaction;

    if (commandName === 'setquarantine') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Admin required.', ephemeral: true });
        const targetRole = options.getRole('role');
        await Config.findOneAndUpdate({ guildId }, { quarantineRoleId: targetRole.id }, { upsert: true });
        return interaction.reply(`✅ **Novaa Security:** কোয়ারেন্টাইন রোল সেট করা হয়েছে: **${targetRole.name}**`);
    }

    if (commandName === 'antinuke') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Admin required.', ephemeral: true });
        const trigger = options.getString('status');
        const dbData = await Config.findOneAndUpdate({ guildId }, {}, { upsert: true, new: true });
        if (trigger === 'enable') {
            if (!dbData.quarantineRoleId) return interaction.reply({ content: '⚠️ আগে রোল সেট করুন।', ephemeral: true });
            dbData.antinukeEnabled = true; await dbData.save();
            return interaction.reply(`🛡️ **Novaa Anti-Nuke:** সিকিউরিটি গ্রিড সচল। অ্যাকশন মোড: **${dbData.punishment.toUpperCase()}**।`);
        } else {
            dbData.antinukeEnabled = false; await dbData.save();
            return interaction.reply('🛑 **Novaa Anti-Nuke:** কোর নিষ্ক্রিয় করা হয়েছে।');
        }
    }

    // NEW: Slash Command for Punishment Setup
    if (commandName === 'setpunishment') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Admin privileges required.', ephemeral: true });
        const type = options.getString('type');
        const dbData = await Config.findOneAndUpdate({ guildId }, {}, { upsert: true, new: true });

        if (type === 'quarantine' && !dbData.quarantineRoleId) {
            return interaction.reply({ content: '⚠️ **Routing Error:** কোয়ারেন্টাইন শাস্তি সেট করার আগে দয়া করে `/setquarantine` কমান্ড দিয়ে রোল সেট করে নিন!', ephemeral: true });
        }

        dbData.punishment = type;
        await dbData.save();
        
        let displayType = type === 'ban' ? 'Direct Ban 🔨' : type === 'kick' ? 'Direct Kick 🥾' : 'Quarantine Role 🔒';
        return interaction.reply(`⚔️ **Novaa Config:** অ্যান্টি-নিউক পানিশমেন্ট অ্যাকশন সফলভাবে **${displayType}** এ সেট করা হয়েছে।`);
    }
});

// Safe Boot Mongoose
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB core linked successfully.');
        client.login(process.env.DISCORD_TOKEN);
    })
    .catch(err => console.error(err));
