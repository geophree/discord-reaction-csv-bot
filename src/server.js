/**
 * The core server that runs on a Cloudflare worker.
 */

import { AutoRouter, error as ittyError, json, text } from 'itty-router';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  TextStyleTypes,
  MessageComponentTypes,
  verifyKey,
} from 'discord-interactions';

import { REACTION_CSV_COMMAND, INVITE_COMMAND } from './commands.js';
import {
  CsvBuilder,
  ReactionUserListFetcher,
  readableEmojiKey,
} from './util.js';

// adapted/simplified from discord-interactions verifyKeyMiddleware
async function discordMiddleware(req, env) {
  const clientPublicKey = env.DISCORD_PUBLIC_KEY;
  const rawBody = await req.bytes();

  const timestamp = req.headers.get('X-Signature-Timestamp') || '';
  const signature = req.headers.get('X-Signature-Ed25519') || '';

  if (
    !(await server.verifyKey(rawBody, signature, timestamp, clientPublicKey))
  ) {
    return text('[discordMiddleware] Invalid signature', { status: 401 });
  }

  const body = JSON.parse(new TextDecoder('utf-8').decode(rawBody)) || {};
  if (body.type === InteractionType.PING) {
    return { type: InteractionResponseType.PONG };
  }

  req.interaction = body;
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
          return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'something went wrong',
              flags: InteractionResponseFlags.EPHEMERAL,
            },
          };
        }

        // I'd prefer the following, but can't copy it in browser discord
        // the normal emojis don't get copied:
        //
        // return {
        //   type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        //   data: {
        //     content,
        //     flags: InteractionResponseFlags.EPHEMERAL,
        //   },
        // }

        const time_str = new Date().toISOString();
        const modal_id = time_str + '_modal';
        const input_id = time_str + '_input';

        return {
          type: InteractionResponseType.MODAL,
          data: {
            custom_id: modal_id,
            title: 'Reaction list in CSV format',
            components: [
              {
                type: MessageComponentTypes.LABEL,
                label: 'CSV',
                component: {
                  type: MessageComponentTypes.INPUT_TEXT,
                  custom_id: input_id,
                  style: TextStyleTypes.PARAGRAPH,
                  value: content,
                },
              },
            ],
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

  if (globalThis.testExplode) throw new Error(globalThis.testExplode);

  const error = `Unknown Interaction Type: ${interaction?.type}`;
  console.error(error);
  return json({ error }, { status: 400 });
});

const server = {
  verifyKey,
  ReactionUserListFetcher,
  fetch: router.fetch,
};

export default server;
