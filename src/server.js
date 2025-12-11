/**
 * The core server that runs on a Cloudflare worker.
 */

import { AutoRouter, error as ittyError, json } from 'itty-router';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';

import { REACTION_CSV_COMMAND, INVITE_COMMAND } from './commands.js';
import {
  CsvBuilder,
  ReactionUserListFetcher,
  readableEmojiKey,
} from './util.js';

async function discordMiddleware(req, env) {
  const body = await req.bytes();
  body.toString = function (encoding) {
    if (encoding != 'utf-8') {
      return Uint8Array.prototype.toString.apply(this);
    }
    return (new TextDecoder('utf-8')).decode(this);
  }

  const expressReq = {
    body,
    header: (name) => req.headers.get(name),
  };

  const res = { headers: {} };
  const expressRes = {
    setHeader: (key, val) => (res.headers[key] = val),
    end: (val) => (res.body = val),
  };

  let isValid = false;
  const next = () => (isValid = true);

  const oldBuffer = globalThis.Buffer;
  try {
    globalThis.Buffer = {
      isBuffer: (o) => o === body,
    };

    await server.verifyKeyMiddleware(env.DISCORD_PUBLIC_KEY)(
      expressReq,
      expressRes,
      next,
    );
  } finally {
    globalThis.Buffer = oldBuffer;
  }

  if (!isValid) {
    res.status = expressRes.statusCode;
    return new Response(res.body, res);
  }

  req.interaction = expressReq.body;
}

const router = AutoRouter({
  catch: (e, req, ...args) => {
    console.error(e);
    return ittyError(e, req, ...args);
  },
});

/**
 * A simple :wave: hello page to verify the worker is working.
 */
router.get('/', (req, env) => {
  return new Response(`👋 ${env.DISCORD_APPLICATION_ID}`);
});

/**
 * Main route for all requests sent from Discord.  All incoming messages will
 * include a JSON payload described here:
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 */
router.post('/', discordMiddleware, async (req, env) => {
  const interaction = req.interaction;

  if (interaction?.type === InteractionType.APPLICATION_COMMAND) {
    // Most user commands will come as `APPLICATION_COMMAND`.
    const command = interaction.data.name.toLowerCase();
    switch (command) {
      case REACTION_CSV_COMMAND.name.toLowerCase(): {
        const data = interaction?.data;
        const message = data?.resolved?.messages?.[data?.target_id];

        if (!message?.reactions?.length) {
          return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'no reactions found',
              flags: InteractionResponseFlags.EPHEMERAL,
            },
          };
        }

        const fetcher = new server.ReactionUserListFetcher(message, env);
        const { reactions } = message;
        reactions.sort((a, b) => b.count - a.count); // higher count first
        if (reactions.length > 30) reactions.length = 30;
        const promises = reactions.map(async ({ emoji }) => [
          readableEmojiKey(emoji),
          await fetcher.fetch(emoji),
        ]);

        let content;
        try {
          const responses = await Promise.all(promises);

          const builder = new CsvBuilder([
            'emoji',
            'discordUserId',
            'discordUserName',
          ]);
          for (const [emojiKey, users] of responses) {
            for (const user of users) {
              builder.addLine([emojiKey, user.id, user.username]);
            }
          }
          content = builder.build();
        } catch (e) {
          console.error(e);
          content = 'something went wrong';
        }

        return {
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content,
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        };
      }
      case INVITE_COMMAND.name.toLowerCase(): {
        const applicationId = env.DISCORD_APPLICATION_ID;
        // Permissions for "View Channels" and "Read Message History"
        const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${applicationId}&permissions=66560&integration_type=0&scope=bot+applications.commands`;
        return {
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: INVITE_URL,
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        };
      }
      default:
        return json({ error: `Unknown Command: ${command}` }, { status: 400 });
    }
  }

  const error = `Unknown Interaction Type: ${interaction?.type}`;
  console.error(error);
  return json({ error }, { status: 400 });
});

const server = {
  verifyKeyMiddleware,
  ReactionUserListFetcher,
  fetch: router.fetch,
};

export default server;
