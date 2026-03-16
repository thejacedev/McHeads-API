// MIT License
//
// Copyright (c) 2026 Jace Sleeman
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

const axios = require('axios');

function isBedrock(input) {
    return input.startsWith('0000') || input.startsWith('.');
}

function isUUID(input) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const shortUuidRegex = /^[0-9a-f]{32}$/i;
    return uuidRegex.test(input) || shortUuidRegex.test(input);
}

function formatUUID(uuid) {
    if (uuid.includes('-')) return uuid;
    return `${uuid.substr(0, 8)}-${uuid.substr(8, 4)}-${uuid.substr(12, 4)}-${uuid.substr(16, 4)}-${uuid.substr(20, 12)}`;
}

async function getJavaProfile(input) {
    try {
        let uuid = input;
        
        if (!isUUID(input)) {
            const response = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${input}`);
            uuid = response.data.id;
        }
        
        const profileResponse = await axios.get(
            `https://sessionserver.mojang.com/session/minecraft/profile/${uuid.replace(/-/g, '')}`
        );
        
        if (profileResponse.data.properties && profileResponse.data.properties.length > 0) {
            const texturesData = JSON.parse(
                Buffer.from(profileResponse.data.properties[0].value, 'base64').toString()
            );
            return texturesData;
        }
        
        throw new Error('No texture data found');
    } catch (error) {
        throw new Error(`Failed to get Java profile: ${error.message}`);
    }
}

async function getBedrockProfile(input) {
    try {
        let xuid = input;
        
        if (input.startsWith('.')) {
            const gamertag = input.substring(1);
            const xuidResponse = await axios.get(
                `https://api.geysermc.org/v2/xbox/xuid/${gamertag}`,
                { headers: { 'Accept': 'application/json' } }
            );
            xuid = xuidResponse.data.xuid;
        }
        
        const skinResponse = await axios.get(
            `https://api.geysermc.org/v2/skin/${xuid}`,
            { headers: { 'Accept': 'application/json' } }
        );
        
        if (Object.keys(skinResponse.data).length === 0) {
            return getJavaProfile('Steve');
        }
        
        return skinResponse.data;
    } catch (error) {
        return getJavaProfile('Steve');
    }
}

async function getProfile(input) {
    const edition = isBedrock(input) ? 'bedrock' : 'java';
    
    if (edition === 'bedrock') {
        return { profile: await getBedrockProfile(input), edition };
    } else {
        return { profile: await getJavaProfile(input), edition };
    }
}

module.exports = {
    isBedrock,
    isUUID,
    formatUUID,
    getJavaProfile,
    getBedrockProfile,
    getProfile
};
