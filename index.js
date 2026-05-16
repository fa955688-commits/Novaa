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
    punishment: { type: String, default: 'ban' }
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
        await member.roles.set([db.quarantineRoleId], reason).catch(() => null);
    }
}

// Global Core Slash Commands Registry
const safeSlashCommands = [
    { name: 'help', description: 'View Novaa’s Advanced Security Matrix Grid' },
    { name: 'ping', description: 'Check Novaa Matrix Latency Network' },
    { 
        name: 'setquarantine', 
        description: 'Link the quarantine target lock role', 
        options: [{ name: 'role', description: 'Select quarantine role', type: ApplicationCommandOptionType.Role, required: true }] 
    },
    { 
        name: 'antinuke', 
        description: 'Toggle server security matrix firewall', 
        options: [{ name: 'status', description: 'Enable or disable antinuke', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: 'Enable', value: 'enable' }, { name: 'Disable', value: 'disable' }] }] 
    },
    {
        name: 'setpunishment',
        description: 'Configure Anti-Nuke action threshold',
        options: [{
            name: 'type',
            description: 'Choose the restriction level',
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
        await rest.put(Routes.applicationCommands(client.user.id), { body: safeSlashCommands });
        console.log('Successfully stabilized and reloaded application commands.');
    } catch (err) { console.error(err); }
});

// ==================== ANTI-NUKE CORE OPERATIONS ====================

// 1. Channel Protection Grid
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
        
        // Restore Deleted Infrastructure
        await channel.guild.channels.create({
            name: channel.name,
            type: channel.type,
            parent: channel.parentId,
            permissionOverwrites: channel.permissionOverwrites.cache.map(p => p)
        }).catch(() => null);
    }
});

// 2. Role Protection Grid
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

// ==================== TEXT CHAT INTEGRITY SECURITY ====================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const db = await Config.findOne({ guildId: message.guild.id });
    if (!db) return;

    // Anti-Link Engine
    if (db.antilinkEnabled && (message.content.includes('discord.gg/') || message.content.includes('http://') || message.content.includes('https://'))) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await message.delete().catch(() => null);
            return message.channel.send(`⚠️ **${message.author.username}**, external links are strictly prohibited in this sector!`).then(m => setTimeout(() => m.delete(), 4000));
        }
    }

    // Anti-Spam Engine
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
                return message.channel.send(`🚨 **${message.author.username}** has been quarantined for continuous chat flooding.`);
            } else {
                return message.channel.send(`⚠️ **${message.author.username}**, please stop spamming immediately.`);
            }
        }
    }

    // Prefix Core Router Verification
    if (!message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'setpunishment') {
        if (!message.member.permissions.has(Permission
