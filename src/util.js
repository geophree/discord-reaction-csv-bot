export function encodedEmojiKey(emojiObj) {
  const { name, id, animated } = emojiObj;
  // based on https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/structures/Emoji.js
  const encodedKey =
    (animated ? 'a:' : '') + encodeURIComponent(name) + (id ? ':' + id : '');
  return encodedKey;
}

export function readableEmojiKey(emojiObj) {
  const { name, id } = emojiObj;
  return id ? encodedEmojiKey(emojiObj) : name;
}

export class ReactionUserListFetcher {
  constructor(message, env) {
    this.baseUrl = `https://discord.com/api/v10/channels/${message.channel_id}/messages/${message.id}/reactions`;
    this.headers = {
      // User-Agent? Others don't seem to...
      // "Content-Type": "application/json", // There's no request body.
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
    };
  }

  async fetch(emojiObj) {
    const { baseUrl, headers } = this;
    const url = `${baseUrl}/${encodedEmojiKey(emojiObj)}?limit=100`;
    const res = await fetch(url, { headers });
    if (!res.ok)
      throw new Error(`HTTP ${res.status} error: ` + (await res.text()));
    return await res.json();
  }
}

export function csvQuote(val) {
  const strVal = val.toString();
  if (/[",\n]/.test(strVal)) {
    return '"' + strVal.replaceAll('"', '""') + '"';
  }
  return strVal;
}

export class CsvBuilder {
  constructor(header) {
    this.csv = '';
    if (header) this.addLine(header);
  }

  addLine(line) {
    this.csv += line.map(csvQuote).join(',') + '\n';
  }

  build() {
    return this.csv;
  }
}
